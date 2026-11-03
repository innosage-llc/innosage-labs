#!/usr/bin/env python3
"""Live service restart check; scoped to #27 private SQLite, never stops #11."""
import subprocess
from pathlib import Path

import httpx

ROOT=Path(__file__).resolve().parents[1]
URL="http://127.0.0.1:8434"
TOKEN=(ROOT/".local-run/access.token").read_text(encoding="utf-8").strip()
HEADERS={"Authorization":"Bearer "+TOKEN}

def call(method,path,body=None):
    with httpx.Client(base_url=URL,headers=HEADERS,trust_env=False,timeout=12) as c:
        response=c.request(method,path,json=body)
        response.raise_for_status()
        return response.json()

def step(script):
    result=subprocess.run(["bash",str(ROOT/"scripts"/script)],cwd=str(ROOT),
                          capture_output=True,text=True,timeout=30,check=True)
    print(result.stdout.strip())

def run():
    call("POST","/api/scenario/reset",{"confirmation":"RESET_SYNTHETIC"})
    call("POST","/api/scenario/load")
    first=call("POST","/api/rounds")
    assert first["id"]=="run-01"
    call("POST","/api/approvals/approval-run-01/review",{"approve":True})
    call("POST","/api/publications/run-01/simulate")
    call("POST","/api/feedback/import",{"run_id":"run-01","fixture":"weak"})
    second=call("POST","/api/rounds")
    assert second["id"]=="run-02" and second["decision"]["outcome"]=="ADJUST"
    call("POST","/api/revisions/proposal-run-02/review",{"approve":True})
    before=call("GET","/api/dashboard")
    assert len(before["rounds"])==2
    assert before["strategy"]["version"]==2
    assert before["approvals"][0]["status"]=="APPROVED_INTERNAL"
    assert before["feedback"][0]["linked_run_id"]=="run-01"
    print("PASS: Pre-restart approved strategy, feedback and decisions recorded")
    try:
        step("stop-local.sh")
        step("start-local.sh")
        after=call("GET","/api/dashboard")
        assert after["strategy"]==before["strategy"]
        assert after["rounds"]==before["rounds"]
        assert after["approvals"]==before["approvals"]
        assert after["feedback"]==before["feedback"]
        assert after["tasks"]==before["tasks"]
        print("PASS: Exact structured state recovery after actual #27 process restart")
    finally:
        # Only the synthetic #27 database is reset for a fresh Founder walkthrough.
        try:
            call("POST","/api/scenario/reset",{"confirmation":"RESET_SYNTHETIC"})
            call("POST","/api/scenario/load")
            print("PASS: Fresh synthetic scenario restored for Founder")
        except Exception:
            print("WARNING: Could not reset demo; inspect only the #27 service")
            raise

if __name__=="__main__":
    run()
