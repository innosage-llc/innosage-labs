import os
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
        self.state = "RESERVED"
        self.fail_reserve = False
        self.lose_upload_response = False

        def route(request):
            path = request.url.path
            if self.fail_reserve:
                raise httpx.ConnectError("synthetic disconnect")
            if path.endswith("/reserve"):
                self.assertEqual(request.headers["Authorization"], "Bearer synthetic-service-token")
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
            if path.endswith("/transcript"):
                return httpx.Response(200, text="Synthetic original transcript")
            if path.endswith("/cleanup"):
                return httpx.Response(200, json={"state": "CLEANED"})
            return httpx.Response(200, json={"state": self.state})

        self.router = patch.object(gateway, "router_client", lambda: httpx.Client(
            transport=httpx.MockTransport(route), base_url="http://router.test"
        ))
        self.router.start()
        self.addCleanup(self.router.stop)

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
