"""Private, single-worker Android milestone gateway."""
from contextlib import closing
import hashlib
import hmac
import os
import sqlite3
import time
from pathlib import Path
from tempfile import TemporaryFile
from threading import Lock
from uuid import UUID
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool

MAX_BYTES = 50_000_000
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
operations = Lock()


def identity(request):
    token = os.environ["RECORDER_PILOT_TOKEN"]
    if len(token) < 32:
        raise RuntimeError("Configure a random pilot token of at least 32 characters")
    supplied = request.headers.get("authorization", "").encode()
    if not hmac.compare_digest(supplied, f"Bearer {token}".encode()):
        raise HTTPException(401, "Unauthorized")
    return "recorder_free_v1_" + hashlib.sha256(token.encode()).hexdigest()


def router_client():
    address = os.environ["RECORDER_ROUTER_URL"]
    url = urlsplit(address)
    if url.scheme != "https" and not (
        url.scheme == "http" and url.hostname in {"127.0.0.1", "::1", "localhost"}
    ):
        raise RuntimeError("Speech Router requires HTTPS or a loopback transport")
    return httpx.Client(base_url=address, timeout=45, trust_env=False)


def checked(response):
    if response.is_error:
        raise HTTPException(
            response.status_code if response.status_code in {409, 413, 422, 503} else 502,
            "Speech service could not process the request",
        )
    return response


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def job(account, operation, source=None, length=0, digest=None):
    with operations, closing(sqlite3.connect(Path(os.environ["RECORDER_DB"]))) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS transcripts (
            account TEXT, operation TEXT, text TEXT, PRIMARY KEY(account, operation)
        )""")
        saved = db.execute(
            "SELECT text FROM transcripts WHERE account=? AND operation=?", (account, operation)
        ).fetchone()
        if saved:
            return {"state": "COMPLETED", "provider": "edge-speech", "transcript": saved[0]}

        db.execute("""CREATE TABLE IF NOT EXISTS operations (
            account TEXT, operation TEXT, deadline INTEGER, PRIMARY KEY(account, operation)
        )""")
        deadline = int(time.time()) + 3600
        db.execute("INSERT OR IGNORE INTO operations VALUES (?, ?, ?)", (account, operation, deadline))
        db.commit()
        deadline = db.execute(
            "SELECT deadline FROM operations WHERE account=? AND operation=?", (account, operation)
        ).fetchone()[0]
        if time.time() >= deadline:
            return {"state": "EXPIRED", "provider": "edge-speech"}
        router_key = f"recorder-transcription-v2-{deadline}-{operation}"
        try:
            with router_client() as router:
                response = router.post(
                    "/internal/v1/sessions/reserve",
                    headers=bearer(os.environ["RECORDER_ROUTER_TOKEN"]),
                    json={"accountId": account, "idempotencyKey": router_key, "profile": "free_guest_v1"},
                )
                if response.status_code in {400, 409} and response.json().get("error") in {
                    "free_expired", "recovery_missing", "invalid_idempotency_key"
                }:
                    return {"state": "EXPIRED", "provider": "edge-speech"}
                reservation = checked(response).json()
                path = f"/v1/sessions/{reservation['sessionId']}"
                headers = bearer(reservation["controlCapability"])
                status = checked(router.get(path, headers=headers)).json()
                if status["state"] == "RESERVED" and source is not None:
                    upload = {
                        **bearer(reservation["uploadCapability"]),
                        "Content-Type": "audio/mp4",
                        "Content-Length": str(length),
                        "X-Content-SHA256": digest,
                    }
                    checked(router.post(
                        path + "/upload", headers=upload,
                        content=iter(lambda: source.read(256 * 1024), b""),
                    ))
                    status = checked(router.get(path, headers=headers)).json()
                if status["state"] != "COMPLETED":
                    return {"state": status["state"], "provider": "edge-speech"}
                transcript = checked(router.get(path + "/transcript", headers=headers)).text
                if not transcript.strip():
                    raise HTTPException(502, "Speech service returned an empty transcript")
                db.execute("INSERT INTO transcripts VALUES (?, ?, ?)", (account, operation, transcript))
                db.commit()
                try:
                    router.post(path + "/cleanup", headers=headers).raise_for_status()
                except httpx.HTTPError:
                    # Router lease expiry can retire the upstream artifact.
                    pass
                return {"state": "COMPLETED", "provider": "edge-speech", "transcript": transcript}
        except httpx.RequestError:
            raise HTTPException(503, "Speech service temporarily unavailable") from None




@app.get("/v1/jobs/{operation}")
def status(operation: UUID, request: Request):
    return job(identity(request), str(operation))


@app.put("/v1/jobs/{operation}")
async def submit(operation: UUID, request: Request):
    account = identity(request)
    if request.headers.get("content-type") != "audio/mp4":
        raise HTTPException(415, "Expected M4A audio")
    with TemporaryFile() as source:
        digest = hashlib.sha256()
        length = 0
        async for chunk in request.stream():
            length += len(chunk)
            if length > MAX_BYTES:
                raise HTTPException(413, "M4A exceeds the Free size limit")
            digest.update(chunk)
            source.write(chunk)
        if not length:
            raise HTTPException(400, "Empty recording")
        source.seek(0)
        return await run_in_threadpool(job, account, str(operation), source, length, digest.hexdigest())
