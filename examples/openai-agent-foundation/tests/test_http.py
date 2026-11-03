"""Integration tests use FastAPI TestClient and isolated SQLite, not any real network."""
import importlib
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def http(tmp_path,monkeypatch):
    monkeypatch.setenv("FOUNDATION_DATA_DIR",str(tmp_path/"only-27"))
    monkeypatch.setenv("FOUNDATION_AUTH_TOKEN","test-27-secret")
    monkeypatch.delenv("FOUNDATION_ALLOW_BILLABLE",raising=False)
    monkeypatch.delenv("OPENAI_API_KEY",raising=False)
    import backend.app as service
    service=importlib.reload(service)
    with TestClient(service.app) as client:
        yield client,{"Authorization":"Bearer test-27-secret"}


def test_health_and_browser_assets(http):
    c,h=http
    assert c.get("/health").json()["scope"]=="isolated-issue-27"
    page=c.get("/")
    assert page.status_code==200
    assert "<title>InnoSage · Agent Foundation</title>" in page.text
    assert c.get("/static/style.css").status_code==200
    js=c.get("/static/app.js")
    assert js.status_code==200
    assert "Start Growth Loop" in js.text
    assert page.headers.get("Content-Security-Policy")
    assert page.headers.get("X-Frame-Options")=="DENY"


def test_remote_requests_require_explicit_auth(http):
    c,h=http
    assert c.get("/api/dashboard").status_code==401
    assert c.get("/api/dashboard",headers={"Authorization":"Bearer invalid"}).status_code==401
    assert c.get("/api/dashboard",headers=h).status_code==200
    assert "Bearer" in c.get("/api/dashboard").headers.get("WWW-Authenticate","")


def test_browser_journey_cmo_editor_feedback_strategy(http):
    c,h=http
    def post(p,body=None):
        res=c.post(p,headers=h,json=body)
        assert res.status_code==200, (p,res.text)
        return res.json()

    assert post("/api/scenario/load")["loaded"]
    assert post("/api/scenario/load")["already_exists"]
    first=post("/api/rounds")
    assert first["decision"]["outcome"]=="CONTINUE"
    assert len(c.get("/api/dashboard",headers=h).json()["bots"])==2
    assert c.post("/api/publications/run-01/simulate",headers=h).status_code==409
    post("/api/approvals/approval-run-01/review",{"approve":True})
    assert post("/api/publications/run-01/simulate")["created"]
    assert post("/api/publications/run-01/simulate")["created"] is False
    assert post("/api/feedback/import",{"run_id":"run-01","fixture":"weak"})["created"]
    assert post("/api/feedback/import",{"run_id":"run-01","fixture":"weak"})["created"] is False
    second=post("/api/rounds")
    assert second["decision"]["outcome"]=="ADJUST"
    assert second["feedback_id"]=="feedback-run-01"
    cf=c.get("/api/counterfactual",headers=h).json()
    assert cf["changes_with_evidence"]
    assert cf["changes_with_counterfactual"]
    projection=c.get("/api/context/projection",headers=h).json()
    assert projection["round_ids"]==["run-01","run-02"]
    assert projection["sdk_compaction_executed"] is False
    assert post("/api/revisions/proposal-run-02/review",{"approve":True})["status"]=="APPROVED"
    third=post("/api/rounds")
    assert third["decision"]["strategy_version"]==2
    dashboard=c.get("/api/dashboard",headers=h).json()
    assert len(dashboard["tasks"])==6
    assert dashboard["safety"]["real_llm_test_passed"] is False


def test_billable_harness_probe_refuses_without_operator_gate(http):
    c,h=http
    status=c.get("/api/status",headers=h).json()
    assert status["sdk"]["model_key_configured"] is False
    assert status["sdk"]["real_sdk_reasoning_verified"] is False
    result=c.post("/api/harness/probe",headers=h)
    assert result.status_code==409
    assert "not authorized" in result.json()["detail"]
    assert c.get("/api/dashboard",headers=h).json()["events"]==[]


def test_reset_only_synthetic_with_explicit_confirmation(http):
    c,h=http
    c.post("/api/scenario/load",headers=h)
    assert c.post("/api/scenario/reset",headers=h,json={}).status_code==422
    assert c.get("/api/dashboard",headers=h).json()["scenario"]
    assert c.post("/api/scenario/reset",headers=h,json={"confirmation":"RESET_SYNTHETIC"}).status_code==200
    assert c.get("/api/dashboard",headers=h).json()["scenario"] is None
