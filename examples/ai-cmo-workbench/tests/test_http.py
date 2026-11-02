"""HTTP contract tests with synthetic bytes only: no OpenAI/GPU/platform writes."""
import os
from pathlib import Path
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
except ImportError:
    TestClient = None

@unittest.skipIf(TestClient is None, "FastAPI runtime not installed locally")
class HttpContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        os.environ["DATA_ROOT"] = cls.tmp.name
        os.environ["WORKSPACE_TOKEN"] = "test_" + "x" * 52
        os.environ.pop("OPENAI_API_KEY", None)
        os.environ.pop("EDGE_SPEECH_SERVICE_TOKEN", None)
        from server.main import app, store
        cls.client = TestClient(app)
        cls.client.__enter__()
        cls.auth = {"X-Workspace-Key":os.environ["WORKSPACE_TOKEN"]}

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None,None,None)
        cls.tmp.cleanup()

    def test_health_auth_and_upload_conflict(self):
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.client.get("/api/recordings").status_code, 401)
        fields = {"client_id":"fixture_a1","recipe":"meeting_summary",
                  "consent":"true","llm_consent":"false"}
        payload = b"x" * 300
        def post(data):
            return self.client.post("/api/recordings",data=fields,
                files={"audio":("fixture.m4a",data,"audio/mp4")},headers=self.auth)
        a=post(payload)
        self.assertEqual(a.status_code,200,a.text)
        self.assertEqual(a.json()["bytes"],300)
        self.assertEqual(post(payload).json()["id"],"fixture_a1")
        self.assertEqual(post(payload+b"bad").status_code,409)
        self.assertEqual(self.client.get("/api/recordings/fixture_a1/audio",
                                        headers=self.auth).content,payload)
        self.assertEqual(self.client.get("/api/recordings/fixture_a1/audio").status_code,401)

    def test_approval_promotes_only_reviewed_claims(self):
        from server.main import store
        item={
            "id":"i_source_approval","source_id":"source_approval",
            "recipe":"cmo_business_intake","status":"ANALYZED_CANDIDATE",
            "visibility":"private_candidate","summary":"Internal confidential estimates",
            "analysis":{"unverified_claims":["not for public use"]},
            "created":"2026-11-02T01:00:00+00:00"
        }
        store().write("intakes",item["id"],item)
        url="/api/intakes/i_source_approval/approve"
        bad=self.client.post(url,json={
            "reviewed_source":False,"public_claims":["Reviewed fact from public source"]},
            headers=self.auth)
        self.assertEqual(bad.status_code,400)
        invalid=self.client.post(url,json={
            "reviewed_source":True,"public_claims":[]},headers=self.auth)
        self.assertEqual(invalid.status_code,422)
        good=self.client.post(url,json={
            "reviewed_source":True,
            "public_claims":["InnoSage Draft is a local-first Markdown editor."]
        },headers=self.auth)
        self.assertEqual(good.status_code,200,good.text)
        data=good.json()
        self.assertEqual(data["visibility"],"public_approved")
        self.assertEqual(data["summary"],"Internal confidential estimates")
        self.assertEqual(data["approved_public_claims"],[
            "InnoSage Draft is a local-first Markdown editor."
        ])
        self.assertNotIn("not for public use",data["approved_public_claims"])

    def test_revocation_during_asr_does_not_send_transcript_to_openai(self):
        import asyncio
        import hashlib
        from unittest.mock import AsyncMock, patch
        from server.main import ROOT, store, _process
        raw = b"x" * 300
        (ROOT / "blobs" / "race_test.m4a").write_bytes(raw)
        rid = "race_test"
        store().write("recordings", rid, {
            "id":rid, "recipe":"meeting_summary", "workspace_id":"innosage-client-zero",
            "status":"CAPTURED", "blob":"race_test.m4a",
            "sha256":hashlib.sha256(raw).hexdigest(), "llm_consent":True,
            "bytes":len(raw)
        })
        jid="j_revocation_test"
        store().write("jobs", jid, {
            "id":jid, "kind":"intake", "source_id":rid, "status":"QUEUED"
        })
        async def asr_with_revocation(source, ext, request_id):
            with store().guard:
                current=store().get("recordings",rid)
                store().write("recordings",rid,{
                    **current,"llm_consent":False,
                    "llm_consent_updated_at":"revoked_while_asr_was_running"
                })
            return ({"transcription":{"segments":[]}}, "[00:00 - 00:01] safe synthetic\n")
        llm = AsyncMock()
        with patch("server.main.transcribe",side_effect=asr_with_revocation), patch(
             "server.main.speech_configured",return_value=True), patch(
             "server.main.ready",return_value=True), patch(
             "server.main.analyze_transcript",llm):
            asyncio.run(_process(rid,jid,"meeting_summary"))
        llm.assert_not_awaited()
        record=store().get("recordings",rid)
        self.assertFalse(record["llm_consent"])
        self.assertEqual(record["status"],"TRANSCRIBED")
        self.assertEqual(store().get("jobs",jid)["status"],"BLOCKED")
        self.assertIsNone(store().get("intakes","i_"+rid))

    def test_intake_consent_update_and_model_budget(self):
        from unittest.mock import patch
        from server.main import store
        store().write("recordings","model_budget_fixture",{
            "id":"model_budget_fixture","workspace_id":"innosage-client-zero",
            "created":"2026-11-02T00:00:00+00:00","recipe":"meeting_summary",
            "bytes":300,"sha256":"a"*64,"blob":"fixture.m4a",
            "llm_consent":False,"status":"CAPTURED"
        })
        updated=self.client.post("/api/recordings/model_budget_fixture/consent",
            json={"allow_openai_analysis":True},headers=self.auth)
        self.assertEqual(updated.status_code,200)
        self.assertTrue(updated.json()["llm_consent"])
        with patch.dict(os.environ, {"MAX_AGENT_RUNS_PER_DAY":"0"}):
            blocked=self.client.post("/api/recordings/model_budget_fixture/process",
                                     headers=self.auth)
        self.assertEqual(blocked.status_code,429)
        self.assertEqual(
            len([j for j in store().items("jobs") if j.get("source_id")=="model_budget_fixture"]),0)

    def test_cmo_starts_from_new_intakes_without_paths(self):
        import time
        from unittest.mock import patch, AsyncMock
        from server.main import store
        store().write("intakes","i_new_synthetic",{
            "id":"i_new_synthetic","status":"ANALYZED_CANDIDATE",
            "visibility":"private_candidate","summary":"Synthetic testing evidence, not marketing truth.",
            "created":"2026-11-02T12:00:00+00:00"
        })
        async def fake_decision(objective, sources):
            self.assertTrue(any(s["id"]=="i_new_synthetic" for s in sources))
            return {"outcome":"SKIP","next_action":"Verify a public product fact",
                    "rationale":"No approved public claims yet","falsifier":"Approved public proof",
                    "considered":[{"intake_id":s["id"],"disposition":"blocked",
                                  "reason":"Candidate/private"} for s in sources],
                    "publishable":False,"title":"","caption":"","tags":[],"poster_lines":[],
                    "_model_usage":{"input_tokens":0,"output_tokens":0,"dollar_cost":"TEST_FIXTURE"}}
        with patch("server.main.ready", return_value=True), patch(
             "server.main.decide_next_action", side_effect=fake_decision):
            queued=self.client.post("/api/cmo/run",headers=self.auth)
            self.assertEqual(queued.status_code,200,queued.text)
            job_id=queued.json()["id"]
            result=None
            for _ in range(60):
                result=self.client.get("/api/jobs/"+job_id,headers=self.auth).json()
                if result["status"] in ("COMPLETED","BLOCKED"): break
                time.sleep(0.03)
            self.assertEqual(result["status"],"COMPLETED",result)
            decisions=self.client.get("/api/decisions",headers=self.auth).json()
            record=next(d for d in decisions if d["id"]==result["decision_id"])
            self.assertEqual(record["decision"]["outcome"],"SKIP")
            self.assertIn("i_new_synthetic",record["source_intake_ids"])
            self.assertEqual(record["model_usage"]["dollar_cost"],"TEST_FIXTURE")

    def test_consent_and_approval_version(self):
        r=self.client.post("/api/recordings",
            data={"client_id":"fixture_no_consent","recipe":"meeting_summary",
                  "consent":"false"},
            files={"audio":("fixture.m4a",b"x"*300,"audio/mp4")},
            headers=self.auth)
        self.assertEqual(r.status_code,400)
        from server.main import ROOT,store
        from server.poster import render_cover
        img=ROOT/"covers"/"p_sample.png"
        render_cover(img,"Test content",["human review required"])
        store().write("packages","p_sample",{
          "id":"p_sample","version":1,"title":"Test","caption":"Synthetic example",
          "tags":[],"image":"p_sample.png","status":"DRAFT"
        })
        approved=self.client.post("/api/packages/p_sample/approve",
            json={"verified_sources":True,"expected_version":1},headers=self.auth)
        self.assertEqual(approved.status_code,200,approved.text)
        self.assertEqual(approved.json()["approved_version"],1)
        edited=self.client.post("/api/packages/p_sample/edit",
            json={"title":"Revised","caption":"An edited synthetic test"},
            headers=self.auth)
        self.assertEqual(edited.status_code,200)
        self.assertEqual(edited.json()["version"],2)
        stale=self.client.post("/api/packages/p_sample/approve",
            json={"verified_sources":True,"expected_version":1},headers=self.auth)
        self.assertEqual(stale.status_code,409)
        receipt=self.client.post("/api/packages/p_sample/receipt",
            json={"url":"https://www.xiaohongshu.com/explore/test-only"},
            headers=self.auth)
        self.assertEqual(receipt.status_code,409)

if __name__=="__main__":
    unittest.main()
