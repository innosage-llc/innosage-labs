"""Authorized adapter to the existing Mac-native Edge Speech REST service.

Never installs or changes Qwen/MLX. Submits one audio job, reads canonical
artifacts and requests deletion of private Edge staging after successful use.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

import httpx


class SpeechError(RuntimeError):
    pass


def configured() -> bool:
    return bool(os.getenv("EDGE_SPEECH_SERVICE_TOKEN"))


def _job_id(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", value):
        raise SpeechError("Invalid Edge Speech job ID")
    return value


def _artifact_routes(job: dict, job_id: str) -> dict[str, str]:
    artifacts = job.get("artifacts", [])
    if not isinstance(artifacts, list):
        raise SpeechError("Malformed Edge Speech artifact list")
    routes: dict[str,str] = {}
    prefix = "/v1/transcriptions/" + job_id + "/artifacts/"
    for asset in artifacts:
        if not isinstance(asset, dict):
            raise SpeechError("Malformed Edge Speech artifact")
        name, url = asset.get("name"), asset.get("url")
        if not isinstance(name, str) or not isinstance(url, str):
            raise SpeechError("Malformed Edge Speech artifact identity")
        parsed = urlsplit(url)
        if (parsed.scheme or parsed.netloc or parsed.query or parsed.fragment
                or parsed.path != prefix+name or name in routes or url != parsed.path):
            raise SpeechError("Unsafe Edge Speech artifact URL")
        routes[name] = url
    if "result.json" not in routes or "transcript.md" not in routes:
        raise SpeechError("Missing required Qwen result artifacts")
    return routes


async def _delete_and_check(client: httpx.AsyncClient, root: str, job_id: str,
                            headers: dict[str,str]) -> str:
    route = root + "/v1/transcriptions/" + job_id
    try:
        res = await client.delete(route, headers=headers)
        if res.status_code not in (202,204):
            return "DELETE_NOT_ACCEPTED"
        for _ in range(3):
            check = await client.get(route,headers=headers)
            if check.status_code == 404:
                return "DELETED"
            await asyncio.sleep(0.2)
        return "DELETE_NOT_VERIFIED"
    except (httpx.HTTPError, ValueError):
        return "DELETE_UNCERTAIN"


async def transcribe(source: Path, extension: str, request_id: str) -> tuple[dict, str]:
    """On success result dict includes internal adapter cleanup status."""
    base = os.getenv("EDGE_SPEECH_BASE_URL","http://host.docker.internal:8765").rstrip("/")
    credential = os.getenv("EDGE_SPEECH_SERVICE_TOKEN")
    if not credential:
        raise SpeechError("Edge Speech service authorization not configured")
    if extension.lower() not in (".m4a",".wav",".mp3"):
        raise SpeechError("Unsupported audio format for local Edge Speech")
    if not source.is_file():
        raise SpeechError("Audio source not found")
    headers = {"X-Edge-Speech-Service-Token":credential,
               "Idempotency-Key":request_id}
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0,connect=5)) as client:
        try:
            with source.open("rb") as fh:
                media_type = {".m4a":"audio/mp4",".mp3":"audio/mpeg",".wav":"audio/wav"}[extension.lower()]
                response = await client.post(
                    base+"/v1/transcriptions",
                    files={"audio":(source.name,fh,media_type)},headers=headers)
            if response.status_code != 202:
                raise SpeechError("Edge Speech admission HTTP "+str(response.status_code))
            try:
                job_id = _job_id(response.json()["id"])
            except (KeyError,ValueError) as exc:
                raise SpeechError("Unrecognized Edge Speech acceptance response") from exc
            for _ in range(120):
                await asyncio.sleep(3)
                state = await client.get(base+"/v1/transcriptions/"+job_id,headers=headers)
                if state.status_code != 200:
                    raise SpeechError("Edge Speech status HTTP "+str(state.status_code))
                job = state.json()
                if job.get("id") != job_id:
                    raise SpeechError("Edge Speech returned wrong job identity")
                if job.get("status") == "failed":
                    raise SpeechError("Local Qwen job failed")
                if job.get("status") != "completed":
                    continue
                routes = _artifact_routes(job,job_id)
                result = await client.get(base+routes["result.json"],headers=headers)
                transcript = await client.get(base+routes["transcript.md"],headers=headers)
                if result.status_code != 200 or transcript.status_code != 200:
                    raise SpeechError("Unable to retrieve authorized Qwen result")
                payload = result.json()
                if (not isinstance(payload,dict)
                        or payload.get("schema_version") != "edge-speech-service-result/v1"
                        or not transcript.text.strip()):
                    raise SpeechError("Invalid real Qwen result structure")
                cleanup = await _delete_and_check(client,base,job_id,headers)
                payload["_adapter_cleanup"] = cleanup
                return payload,transcript.text
            raise SpeechError("Qwen job exceeded demo timebox; reconcile existing job")
        except (httpx.TimeoutException,httpx.TransportError) as exc:
            raise SpeechError("Edge Speech transport result unknown; do not blindly resend") from exc
