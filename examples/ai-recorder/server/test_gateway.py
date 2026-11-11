import os
import json
import sqlite3
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

import gateway


class GatewayTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {
            "RECORDER_DB": str(Path(self.temp.name) / "state.sqlite3"),
            "RECORDER_PILOT_TOKEN": "synthetic-pilot-token-" + "x" * 32,
            "RECORDER_ROUTER_TOKEN": "synthetic-service-token",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(gateway.app)
        self.headers = {
            "Authorization": "Bearer " + os.environ["RECORDER_PILOT_TOKEN"],
            "Content-Type": "audio/mp4",
        }
        self.uploads = 0
        self.reserved_modes = []
        self.speaker_status = None
        self.speaker_unavailable = False
        self.state = "RESERVED"
        self.fail_reserve = False
        self.lose_upload_response = False

        def route(request):
            path = request.url.path
            if self.fail_reserve:
                raise httpx.ConnectError("synthetic disconnect")
            if path.endswith("/reserve"):
                self.assertEqual(request.headers["Authorization"], "Bearer synthetic-service-token")
                mode = json.loads(request.content)["diarization"]["enabled"]
                self.reserved_modes.append(mode)
                if mode and self.speaker_unavailable:
                    return httpx.Response(422, json={"error": "speaker_unavailable"})
                return httpx.Response(200, json={
                    "sessionId": "synthetic", "controlCapability": "control",
                    "uploadCapability": "upload",
                })
            if path.endswith("/upload"):
                self.assertEqual(request.headers["Authorization"], "Bearer upload")
                self.assertEqual(request.read(), b"synthetic-audio")
                self.uploads += 1
                self.state = "PROCESSING"
                if self.lose_upload_response:
                    raise httpx.ReadTimeout("synthetic lost response")
                return httpx.Response(200, json={"state": self.state})
            if path.endswith("/speakers"):
                return httpx.Response(200, json={
                    "segments": [{"start_ms": 0, "text": "First voice"}, {"start_ms": 1500, "text": "Second voice"}],
                    "annotations": [{"speaker": "SPEAKER_01"}, {"speaker": "SPEAKER_UNKNOWN"}],
                })
            if path.endswith("/transcript"):
                return httpx.Response(200, text="Synthetic original transcript")
            if path.endswith("/cleanup"):
                return httpx.Response(200, json={"state": "CLEANED"})
            result = {"state": self.state}
            if self.speaker_status:
                result["speakerLabeling"] = {"requested": True, "status": self.speaker_status, "warning": None}
            return httpx.Response(200, json=result)

        self.router = patch.object(gateway, "router_client", lambda: httpx.Client(
            transport=httpx.MockTransport(route), base_url="http://router.test"
        ))
        self.router.start()
        self.addCleanup(self.router.stop)

    def test_speaker_choice_survives_status_reads_and_conflicting_retries_reject(self):
        path = "/v1/jobs/" + str(uuid4())
        self.client.get(path, headers=self.headers)
        self.assertEqual(self.reserved_modes, [])
        headers = {**self.headers, "X-Identify-Speakers": "true"}
        self.client.put(path, headers=headers, content=b"synthetic-audio")
        self.client.get(path, headers=self.headers)
        self.assertEqual(self.reserved_modes, [True, True])
        response = self.client.put(path, headers=self.headers, content=b"synthetic-audio")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.uploads, 1)

    def test_attribution_is_cached_with_plain_original_and_explicit_unknown(self):
        path = "/v1/jobs/" + str(uuid4())
        headers = {**self.headers, "X-Identify-Speakers": "true"}
        self.client.put(path, headers=headers, content=b"synthetic-audio")
        self.state, self.speaker_status = "COMPLETED", "completed"
        completed = self.client.get(path, headers=self.headers).json()
        self.assertEqual(completed["transcript"], "Synthetic original transcript")
        self.assertIn("Speaker 1: First voice", completed["speakerLabeling"]["transcript"])
        self.assertIn("Unknown speaker: Second voice", completed["speakerLabeling"]["transcript"])
        self.fail_reserve = True
        self.assertEqual(self.client.get(path, headers=self.headers).json(), completed)

    def test_unavailable_speakers_allow_explicit_new_plain_operation(self):
        self.speaker_unavailable = True
        path = "/v1/jobs/" + str(uuid4())
        response = self.client.put(path, headers={**self.headers, "X-Identify-Speakers": "true"}, content=b"synthetic-audio")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["code"], "SPEAKER_UNAVAILABLE")
        self.assertEqual(self.uploads, 0)
        new_path = "/v1/jobs/" + str(uuid4())
        self.assertEqual(self.client.put(new_path, headers=self.headers, content=b"synthetic-audio").status_code, 200)
        self.assertEqual(self.reserved_modes, [True, False])
        self.assertEqual(self.uploads, 1)

    def test_previous_database_preserves_existing_plain_transcript(self):
        operation = str(uuid4())
        token = os.environ["RECORDER_PILOT_TOKEN"]
        account = "recorder_free_v1_" + hashlib.sha256(token.encode()).hexdigest()
        with gateway.closing(sqlite3.connect(os.environ["RECORDER_DB"])) as db:
            db.execute("CREATE TABLE operations (account TEXT, operation TEXT, deadline INTEGER, PRIMARY KEY(account, operation))")
            db.execute("CREATE TABLE transcripts (account TEXT, operation TEXT, text TEXT, PRIMARY KEY(account, operation))")
            db.execute("INSERT INTO operations VALUES (?, ?, ?)", (account, operation, 9_999_999_999))
            db.execute("INSERT INTO transcripts VALUES (?, ?, ?)", (account, operation, "Earlier original"))
            db.commit()
        path = "/v1/jobs/" + operation
        self.fail_reserve = True
        self.assertEqual(self.client.get(path, headers=self.headers).json()["transcript"], "Earlier original")
        self.assertEqual(self.client.get(path, headers=self.headers).status_code, 200)
        self.assertEqual(self.reserved_modes, [])

    def test_guest_tokens_are_registered_and_isolated(self):
        first = self.client.post("/v1/guests").json()["token"]
        second = self.client.post("/v1/guests").json()["token"]
        self.assertNotEqual(first, second)
        path = "/v1/jobs/" + str(uuid4())
        self.client.put(path, headers={**self.headers, "Authorization": "Bearer " + first}, content=b"synthetic-audio")
        self.state = "COMPLETED"
        self.client.get(path, headers={"Authorization": "Bearer " + first})
        self.state = "RESERVED"
        result = self.client.get(path, headers={"Authorization": "Bearer " + second})
        self.assertEqual(result.json()["state"], "RESERVED")
        self.assertNotIn("transcript", result.json())
        self.assertEqual(self.client.get(path, headers={"Authorization": "Bearer " + "unknown" * 10}).status_code, 401)

    def test_auth_and_invalid_source_reject_before_provider(self):
        path = "/v1/jobs/" + str(uuid4())
        self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.put(path, headers=self.headers, content=b"").status_code, 400)
        self.assertEqual(self.uploads, 0)

    def test_resume_does_not_resubmit_and_persists_original(self):
        path = "/v1/jobs/" + str(uuid4())
        first = self.client.put(path, headers=self.headers, content=b"synthetic-audio")
        self.assertEqual(first.json()["state"], "PROCESSING")
        self.client.put(path, headers=self.headers, content=b"synthetic-audio")
        self.assertEqual(self.uploads, 1)
        self.state = "COMPLETED"
        completed = self.client.get(path, headers=self.headers)
        self.assertEqual(completed.json()["transcript"], "Synthetic original transcript")
        self.fail_reserve = True
        self.assertEqual(self.client.get(path, headers=self.headers).json(), completed.json())

    def test_lost_upload_response_recovers_without_resubmission(self):
        path = "/v1/jobs/" + str(uuid4())
        self.lose_upload_response = True
        self.assertEqual(self.client.put(path, headers=self.headers, content=b"synthetic-audio").status_code, 503)
        self.lose_upload_response = False
        self.assertEqual(self.client.put(path, headers=self.headers, content=b"synthetic-audio").json()["state"], "PROCESSING")
        self.assertEqual(self.uploads, 1)

    def test_expired_operation_requires_explicit_new_id(self):
        path = "/v1/jobs/" + str(uuid4())
        self.client.put(path, headers=self.headers, content=b"synthetic-audio")
        with patch.object(gateway.time, "time", return_value=9_999_999_999):
            result = self.client.put(path, headers=self.headers, content=b"synthetic-audio")
        self.assertEqual(result.json()["state"], "EXPIRED")
        self.assertEqual(self.uploads, 1)

    def test_failed_upstream_upload_is_visible(self):
        path = "/v1/jobs/" + str(uuid4())
        self.client.put(path, headers=self.headers, content=b"synthetic-audio")
        self.state = "FAILED"
        self.assertEqual(self.client.get(path, headers=self.headers).json()["state"], "FAILED")
        self.assertEqual(self.uploads, 1)

    def test_disconnect_is_retryable_with_same_operation(self):
        path = "/v1/jobs/" + str(uuid4())
        self.fail_reserve = True
        self.assertEqual(self.client.put(path, headers=self.headers, content=b"synthetic-audio").status_code, 503)
        self.fail_reserve = False
        self.assertEqual(self.client.put(path, headers=self.headers, content=b"synthetic-audio").status_code, 200)
        self.assertEqual(self.uploads, 1)


if __name__ == "__main__":
    unittest.main()
