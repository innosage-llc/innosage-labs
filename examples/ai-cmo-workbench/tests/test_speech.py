"""Edge Speech adapter contract tests — mocked transport, no Qwen writes."""
import asyncio
import os
from pathlib import Path
import tempfile
from unittest import TestCase
from unittest.mock import patch

import httpx

from server.speech import SpeechError, _artifact_routes, transcribe


class AdapterTests(TestCase):
    def test_refuse_url_with_untrusted_host_query_or_traversal(self):
        job = {"artifacts":[
            {"name":"result.json","url":"https://attacker.invalid/result.json"},
            {"name":"transcript.md","url":"/v1/transcriptions/testq1/artifacts/transcript.md"}
        ]}
        with self.assertRaises(SpeechError):
            _artifact_routes(job,"testq1")

    def test_retrieve_real_service_shape_and_cleanup(self):
        root="/v1/transcriptions/testq1"
        artifacts=[
            {"name":"result.json","url":root+"/artifacts/result.json"},
            {"name":"transcript.md","url":root+"/artifacts/transcript.md"},
        ]
        events = []
        deleted = False
        def response(request:httpx.Request):
            nonlocal deleted
            self.assertEqual(request.headers.get("X-Edge-Speech-Service-Token"),"fixture-credential")
            events.append(request.method+" "+request.url.path)
            if request.method == "POST" and request.url.path == "/v1/transcriptions":
                return httpx.Response(202,json={"id":"testq1"})
            if request.method == "DELETE" and request.url.path == root:
                deleted=True
                return httpx.Response(204)
            if request.method == "GET" and request.url.path == root:
                return httpx.Response(404 if deleted else 200,
                    json={"id":"testq1","status":"completed","artifacts":artifacts})
            if request.method == "GET" and request.url.path == root+"/artifacts/result.json":
                return httpx.Response(200,json={
                    "schema_version":"edge-speech-service-result/v1",
                    "transcription":{"segments":[{"start_ms":0,"end_ms":1000,"text":"synthetic"}]}
                })
            if request.method == "GET" and request.url.path == root+"/artifacts/transcript.md":
                return httpx.Response(200,text="[00:00.000 - 00:01.000] synthetic")
            return httpx.Response(400)
        orig = httpx.AsyncClient
        def factory(*args,**kwargs):
            return orig(*args,transport=httpx.MockTransport(response),**kwargs)
        with tempfile.TemporaryDirectory() as temp:
            file=Path(temp)/"synthetic.m4a"
            file.write_bytes(b"synth" * 120)
            with patch.dict(os.environ,{
                "EDGE_SPEECH_SERVICE_TOKEN":"fixture-credential",
                "EDGE_SPEECH_BASE_URL":"http://host.docker.internal:8765"
            }),patch("server.speech.httpx.AsyncClient",side_effect=factory):
                report,transcript=asyncio.run(transcribe(file,".m4a","fixture-123"))
        self.assertEqual(report["_adapter_cleanup"],"DELETED")
        self.assertIn("synthetic",transcript)
        self.assertIn("DELETE "+root,events)
        self.assertEqual(sum(x.startswith("POST") for x in events),1)
