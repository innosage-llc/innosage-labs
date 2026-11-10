"""Private, single-worker Android milestone gateway."""
from contextlib import closing
import hashlib
import hmac
import json
import os
import secrets
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
    supplied = request.headers.get("authorization", "")
    if not supplied.startswith("Bearer ") or len(supplied) > 256:
        raise HTTPException(401, "Unauthorized")
    token = supplied[7:]
    digest = hashlib.sha256(token.encode()).hexdigest()
    with closing(sqlite3.connect(Path(os.environ["RECORDER_DB"]))) as db:
        db.execute("CREATE TABLE IF NOT EXISTS guests (digest TEXT PRIMARY KEY)")
        registered = db.execute("SELECT 1 FROM guests WHERE digest=?", (digest,)).fetchone()
    if registered is None:
        pilot = os.environ.get("RECORDER_PILOT_TOKEN", "")
        if len(pilot) < 32 or not hmac.compare_digest(token, pilot):
            raise HTTPException(401, "Unauthorized")
    return "recorder_free_v1_" + digest


@app.post("/v1/guests")
def create_guest():
    token = secrets.token_urlsafe(32)
    with closing(sqlite3.connect(Path(os.environ["RECORDER_DB"]))) as db:
        db.execute("CREATE TABLE IF NOT EXISTS guests (digest TEXT PRIMARY KEY)")
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT COUNT(*) FROM guests").fetchone()[0] >= 1000:
            raise HTTPException(503, "Guest registration capacity reached")
        db.execute("INSERT INTO guests VALUES (?)", (hashlib.sha256(token.encode()).hexdigest(),))
        db.commit()
    return {"token": token}


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


def speaker_result(router, path, headers, status):
    result = status.get("speakerLabeling")
    if result is None:
        return None
    result = dict(result)
    if result["status"] == "completed":
        payload = checked(router.get(path + "/speakers", headers=headers)).json()
        lines = []
        for segment, annotation in zip(payload["segments"], payload["annotations"], strict=True):
            label = annotation["speaker"]
            speaker = "Unknown speaker" if label == "SPEAKER_UNKNOWN" else "Speaker " + str(int(label.removeprefix("SPEAKER_")))
            start = segment["start_ms"] / 1000
            lines.append(f"[{int(start // 60):02d}:{start % 60:06.3f}] {speaker}: {segment['text']}")
        result["transcript"] = "\n".join(lines)
    return result


def job(account, operation, source=None, length=0, digest=None, identify_speakers=None):
    with operations, closing(sqlite3.connect(Path(os.environ["RECORDER_DB"]))) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS transcripts (
            account TEXT, operation TEXT, text TEXT, PRIMARY KEY(account, operation)
        )""")
        if "speaker_result" not in {row[1] for row in db.execute("PRAGMA table_info(transcripts)")}:
            db.execute("ALTER TABLE transcripts ADD COLUMN speaker_result TEXT")
        db.execute("""CREATE TABLE IF NOT EXISTS operations (
            account TEXT, operation TEXT, deadline INTEGER,
            identify_speakers INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(account, operation)
        )""")
        if "identify_speakers" not in {row[1] for row in db.execute("PRAGMA table_info(operations)")}:
            db.execute("ALTER TABLE operations ADD COLUMN identify_speakers INTEGER NOT NULL DEFAULT 0")
        existing = db.execute(
            "SELECT deadline, identify_speakers FROM operations WHERE account=? AND operation=?", (account, operation)
        ).fetchone()
        if existing and identify_speakers is not None and bool(existing[1]) != identify_speakers:
            raise HTTPException(409, "This transcription already uses a different speaker setting")
        saved = db.execute(
            "SELECT text, speaker_result FROM transcripts WHERE account=? AND operation=?", (account, operation)
        ).fetchone()
        if saved:
            return {"state": "COMPLETED", "provider": "edge-speech", "transcript": saved[0],
                    "speakerLabeling": json.loads(saved[1]) if saved[1] else None}
        # A status read must not reserve a default-mode job before its upload arrives.
        if existing is None and source is None:
            db.commit()
            return {"state": "RESERVED", "provider": "edge-speech"}
        if existing is None:
            deadline = int(time.time()) + 3600
            db.execute("INSERT INTO operations (account, operation, deadline, identify_speakers) VALUES (?, ?, ?, ?)",
                       (account, operation, deadline, int(bool(identify_speakers))))
            db.commit()
            existing = (deadline, bool(identify_speakers))
        deadline, identify_speakers = existing[0], bool(existing[1])
        if time.time() >= deadline:
            return {"state": "EXPIRED", "provider": "edge-speech"}
        router_key = f"recorder-transcription-v2-{deadline}-{operation}"
        try:
            with router_client() as router:
                response = router.post(
                    "/internal/v1/sessions/reserve",
                    headers=bearer(os.environ["RECORDER_ROUTER_TOKEN"]),
                    json={"accountId": account, "idempotencyKey": router_key, "profile": "free_guest_v1",
                          "diarization": {"enabled": identify_speakers}},
                )
                if response.status_code in {400, 409} and response.json().get("error") in {
                    "free_expired", "recovery_missing", "invalid_idempotency_key"
                }:
                    return {"state": "EXPIRED", "provider": "edge-speech"}
                if response.status_code == 422 and response.json().get("error") == "speaker_unavailable":
                    raise HTTPException(422, {"code": "SPEAKER_UNAVAILABLE",
                        "message": "Speaker identification is unavailable. You can turn it off and start a new transcription."})
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
                    return {"state": status["state"], "provider": "edge-speech", "speakerLabeling": status.get("speakerLabeling")}
                transcript = checked(router.get(path + "/transcript", headers=headers)).text
                if not transcript.strip():
                    raise HTTPException(502, "Speech service returned an empty transcript")
                speakers = speaker_result(router, path, headers, status)
                db.execute("INSERT INTO transcripts (account, operation, text, speaker_result) VALUES (?, ?, ?, ?)",
                           (account, operation, transcript, json.dumps(speakers) if speakers else None))
                db.commit()
                try:
                    router.post(path + "/cleanup", headers=headers).raise_for_status()
                except httpx.HTTPError:
                    # Router lease expiry can retire the upstream artifact.
                    pass
                return {"state": "COMPLETED", "provider": "edge-speech", "transcript": transcript, "speakerLabeling": speakers}
        except httpx.RequestError:
            raise HTTPException(503, "Speech service temporarily unavailable") from None




@app.get("/v1/jobs/{operation}")
def status(operation: UUID, request: Request):
    return job(identity(request), str(operation))


@app.put("/v1/jobs/{operation}")
async def submit(operation: UUID, request: Request):
    account = identity(request)
    speaker_values = request.headers.getlist("x-identify-speakers")
    if len(speaker_values) > 1 or (speaker_values and speaker_values[0] not in {"true", "false"}):
        raise HTTPException(400, "Invalid speaker setting")
    identify_speakers = speaker_values == ["true"]
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
        return await run_in_threadpool(job, account, str(operation), source, length, digest.hexdigest(), identify_speakers)
