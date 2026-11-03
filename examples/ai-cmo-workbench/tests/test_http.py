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

    def test_private_mock_demo_allows_no_token_but_refuses_unsafe_modes(self):
        from unittest.mock import patch
        from server.main import validate_execution_modes
        base={
            "WORKSPACE_AUTH_MODE":"lan_demo",
            "AI_CMO_EXECUTION_MODE":"mock",
            "ASR_EXECUTION_MODE":"mock",
            "BIND_IP":"192.168.1.42",
            "TLS_CERT_PATH":"/data/tls/server.crt",
            "TLS_KEY_PATH":"/data/tls/server.key",
            "WORKSPACE_TOKEN":"",
        }
        with patch.dict(os.environ,base):
            validate_execution_modes()
            self.assertEqual(self.client.get("/health").json()["auth_mode"],"lan_demo")
            self.assertEqual(self.client.get("/api/status").status_code,200)
            self.assertEqual(self.client.get("/api/workspace").status_code,200)
        for extra in (
            {"AI_CMO_EXECUTION_MODE":"live"},
            {"ASR_EXECUTION_MODE":"local_qwen"},
            {"BIND_IP":"0.0.0.0"},
            {"BIND_IP":"8.8.8.8"},
            {"TLS_CERT_PATH":""},
        ):
            with self.subTest(extra=extra),patch.dict(os.environ,{**base,**extra}):
                with self.assertRaises(RuntimeError):
                    validate_execution_modes()
        with patch.dict(os.environ,{"WORKSPACE_AUTH_MODE":"token",
                                  "WORKSPACE_TOKEN":""}):
            self.assertEqual(self.client.get("/api/recordings").status_code,503)

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

    def test_mock_only_full_flow_never_calls_paid_apis_or_qwen(self):
        import time
        from unittest.mock import AsyncMock, patch
        from server.main import store
        conf={
            "AI_CMO_EXECUTION_MODE":"mock",
            "ASR_EXECUTION_MODE":"mock",
            "OPENAI_API_KEY":"sk-FIXTURE-NOT-A-REAL-TOKEN",
        }
        payload=b"Test-only bytes, not a real speech sample." * 6
        with patch.dict(os.environ,conf),patch(
             "server.main.transcribe",new=AsyncMock(side_effect=AssertionError("Qwen must not run"))) as qwen,patch(
             "server.main.analyze_transcript",new=AsyncMock(side_effect=AssertionError("OpenAI Intake must not run"))) as analyze,patch(
             "server.main.decide_next_action",new=AsyncMock(side_effect=AssertionError("OpenAI CMO must not run"))) as decide:
            status=self.client.get("/api/status",headers=self.auth)
            self.assertEqual(status.status_code,200)
            self.assertEqual(status.json()["execution_mode"],"mock")
            self.assertEqual(status.json()["transcription_mode"],"mock")
            submitted=self.client.post("/api/recordings",
                data={
                    "client_id":"fixture_mock_full","recipe":"cmo_business_intake",
                    "consent":"true","llm_consent":"false"
                },
                files={"audio":("fixture.webm",payload,"audio/webm")},
                headers=self.auth
            )
            self.assertEqual(submitted.status_code,200,submitted.text)
            started=self.client.post("/api/recordings/fixture_mock_full/process",headers=self.auth)
            self.assertEqual(started.status_code,200,started.text)
            jobid=started.json()["id"]
            for _ in range(100):
                job=self.client.get("/api/jobs/"+jobid,headers=self.auth).json()
                if job["status"] in ("COMPLETED","BLOCKED"): break
                time.sleep(0.02)
            self.assertEqual(job["status"],"COMPLETED",job)
            recording=self.client.get("/api/recordings/fixture_mock_full",headers=self.auth).json()
            self.assertEqual(recording["transcript_origin"],"MOCK_FIXTURE_NOT_AUDIO")
            transcript=self.client.get("/api/recordings/fixture_mock_full/transcript",headers=self.auth).json()["text"]
            self.assertIn("与用户录音内容无关",transcript)
            self.assertNotIn("Test-only bytes",transcript)
            intakeid=job["intake_id"]
            intake=store().get("intakes",intakeid)
            self.assertEqual(intake["execution_mode"],"mock")
            self.assertEqual(intake["model_usage"]["requests"],0)
            self.assertEqual(intake["model_usage"]["provider"],"MOCK_NO_API")
            self.assertIn("MOCK",intake["summary"])
            approve=self.client.post("/api/intakes/"+intakeid+"/approve",
                json={"reviewed_source":True,"public_claims":["Some fake claim to approve."]},
                headers=self.auth)
            self.assertEqual(approve.status_code,409)
            cmo=self.client.post("/api/cmo/run",headers=self.auth)
            self.assertEqual(cmo.status_code,200,cmo.text)
            cmojid=cmo.json()["id"]
            for _ in range(100):
                result=self.client.get("/api/jobs/"+cmojid,headers=self.auth).json()
                if result["status"] in ("COMPLETED","BLOCKED"): break
                time.sleep(0.02)
            self.assertEqual(result["status"],"COMPLETED",result)
            decision=store().get("decisions",result["decision_id"])
            self.assertEqual(decision["execution_mode"],"mock")
            self.assertEqual(decision["status"],"MOCK_ONLY")
            self.assertIn(intakeid,decision["source_intake_ids"])
            package=store().get("packages",decision["package_id"])
            self.assertEqual(package["status"],"MOCK_REVIEW_ONLY")
            self.assertEqual(package["execution_mode"],"mock")
            self.assertFalse(package["is_public_claims_verified"])
            cover=self.client.get("/api/packages/"+package["id"]+"/cover",headers=self.auth)
            self.assertEqual(cover.status_code,200)
            self.assertEqual(cover.content[:8],bytes([137,80,78,71,13,10,26,10]))
            pub=self.client.post("/api/packages/"+package["id"]+"/approve",
                json={"verified_sources":True,"expected_version":1},headers=self.auth)
            self.assertEqual(pub.status_code,409)
            receipt=self.client.post("/api/packages/"+package["id"]+"/receipt",
                json={"url":"https://www.xiaohongshu.com/explore/test-fake"},
                headers=self.auth)
            self.assertEqual(receipt.status_code,409)
            edited=self.client.post("/api/packages/"+package["id"]+"/edit",
                json={"title":"Edited mock heading","caption":"Still mock content"},
                headers=self.auth)
            self.assertEqual(edited.status_code,200,edited.text)
            self.assertEqual(edited.json()["status"],"MOCK_REVIEW_ONLY")
            qwen.assert_not_awaited()
            analyze.assert_not_awaited()
            decide.assert_not_awaited()

    def test_cmo_does_not_send_revoked_private_summary_to_llm(self):
        import time
        from unittest.mock import patch
        from server.main import store
        rid="revoked_source"
        store().write("recordings",rid,{
            "id":rid,"status":"ANALYZED_CANDIDATE",
            "llm_consent":False,"recipe":"cmo_business_intake",
            "sha256":"b"*64,"blob":"fixture.m4a"
        })
        iid="i_revoked_source"
        store().write("intakes",iid,{
            "id":iid,"source_id":rid,"status":"ANALYZED_CANDIDATE",
            "visibility":"private_candidate",
            "summary":"PRIVATE_INTERNAL_COST_DATA_DO_NOT_TRANSMIT",
            "created":"2026-11-02T18:00:00+00:00"
        })
        async def safe_decision(objective,sources):
            one=next(x for x in sources if x["id"]==iid)
            self.assertEqual(one["summary"],"")
            self.assertFalse(one["source_llm_consent"])
            return {
                "outcome":"SKIP","next_action":"No approved evidence to publish",
                "rationale":"Current consent missing","falsifier":"New authorized source",
                "considered":[{"intake_id":x["id"],"disposition":"blocked",
                               "reason":"No release permission"} for x in sources],
                "publishable":False,"title":"","caption":"",
                "tags":[],"poster_lines":[],"_model_usage":{"dollar_cost":"MOCK"}
            }
        with patch("server.main.ready",return_value=True),patch(
             "server.main.decide_next_action",side_effect=safe_decision):
            queued=self.client.post("/api/cmo/run",headers=self.auth)
            self.assertEqual(queued.status_code,200,queued.text)
            jid=queued.json()["id"]
            for _ in range(80):
                result=self.client.get("/api/jobs/"+jid,headers=self.auth).json()
                if result["status"] in ("COMPLETED","BLOCKED"): break
                time.sleep(0.025)
            self.assertEqual(result["status"],"COMPLETED",result)

    def test_uncertain_prior_external_side_effect_blocks_replay(self):
        from server.main import store
        base={"id":"fixture_unknown","workspace_id":"innosage-client-zero",
              "created":"2026-11-02T00:00:00+00:00","recipe":"meeting_summary",
              "bytes":300,"sha256":"a"*64,"blob":"synthetic.m4a",
              "llm_consent":True,"status":"CAPTURED"}
        store().write("recordings","fixture_unknown",base)
        store().write("jobs","j_uncertain_qwen",{
            "id":"j_uncertain_qwen","source_id":"fixture_unknown",
            "kind":"intake","status":"BLOCKED","stage":"QWEN_MAY_HAVE_ACCEPTED"
        })
        result=self.client.post("/api/recordings/fixture_unknown/process",headers=self.auth)
        self.assertEqual(result.status_code,409)
        self.assertIn("Qwen_result_unknown",result.json()["detail"])
        store().write("recordings","fixture_unknown",{**base,"status":"TRANSCRIBED"})
        store().write("jobs","j_uncertain_openai",{
            "id":"j_uncertain_openai","source_id":"fixture_unknown",
            "kind":"intake","status":"BLOCKED","stage":"OPENAI_DISPATCHED"
        })
        again=self.client.post("/api/recordings/fixture_unknown/process",headers=self.auth)
        self.assertEqual(again.status_code,409)
        self.assertIn("OpenAI_result_unknown",again.json()["detail"])

    def test_cmo_creates_real_png_media_and_export_route(self):
        import time
        from unittest.mock import patch
        from server.main import store
        approved={
            "id":"i_approved_fixture","status":"APPROVED_FOR_USE",
            "visibility":"public_approved","created":"2026-11-02T18:00:00+00:00",
            "summary":"Internal candidate summary, not itself a public claim",
            "approved_public_claims":["InnoSage Draft is a local-first Markdown editor."]
        }
        store().write("intakes",approved["id"],approved)
        async def fake_public_decision(objective,sources):
            self.assertTrue(any(x["id"]=="i_approved_fixture" and
                x.get("approved_public_claims") for x in sources))
            return {
                "outcome":"ADJUST","next_action":"Prepare one authentic tutorial post",
                "rationale":"One approved public fact available",
                "falsifier":"No qualified reader follow-up",
                "considered":[{"intake_id":x["id"],
                  "disposition":"considered_and_used" if x["id"]=="i_approved_fixture"
                  else "considered_irrelevant","reason":"Synthetic evaluation"} for x in sources],
                "publishable":True,"title":"来自一个真实产品的教程",
                "caption":"InnoSage Draft 是一个本地优先 Markdown 编辑器。",
                "tags":["AI"],"poster_lines":["合成测试，不是实贴"],
                "_model_usage":{"input_tokens":21,"output_tokens":14,"dollar_cost":"MOCK_ONLY"}
            }
        with patch("server.main.ready",return_value=True), patch(
              "server.main.decide_next_action",side_effect=fake_public_decision):
            response=self.client.post("/api/cmo/run",headers=self.auth)
            self.assertEqual(response.status_code,200,response.text)
            job_id=response.json()["id"]
            for _ in range(100):
                job=self.client.get("/api/jobs/"+job_id,headers=self.auth).json()
                if job["status"] in ("COMPLETED","BLOCKED"): break
                time.sleep(0.02)
            self.assertEqual(job["status"],"COMPLETED",job)
            packages=self.client.get("/api/packages",headers=self.auth).json()
            package=next(x for x in packages if x["decision_id"]==job["decision_id"])
            self.assertTrue(package["title"])
            self.assertEqual(package["status"],"DRAFT")
            image=self.client.get("/api/packages/"+package["id"]+"/cover",headers=self.auth)
            self.assertEqual(image.status_code,200)
            self.assertEqual(image.content[:8],bytes([137,80,78,71,13,10,26,10]))
            self.assertGreater(len(image.content),900)
            denied=self.client.get("/api/packages/"+package["id"]+"/cover")
            self.assertEqual(denied.status_code,401)

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
