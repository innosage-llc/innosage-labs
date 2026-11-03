"""Independent #27 browser application. No imports or service access from #11."""
from __future__ import annotations

import os
import secrets
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from .store import Store
from .workflow import Workflow, Problem

ROOT=Path(__file__).resolve().parents[1]
RUN_DIR=Path(os.environ.get("FOUNDATION_DATA_DIR",str(ROOT/".local-run"))).resolve()
RUN_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
DB_PATH=RUN_DIR/"foundation.sqlite"
STORE=Store(DB_PATH)
FLOW=Workflow(STORE)
AUTH_TOKEN=os.environ.get("FOUNDATION_AUTH_TOKEN","")

app=FastAPI(title="InnoSage Agent Foundation #27",version="0.1.0",
            docs_url=None,redoc_url=None,openapi_url=None)

@app.middleware("http")
async def security_headers(request: Request,call_next):
    response=await call_next(request)
    response.headers["X-Content-Type-Options"]="nosniff"
    response.headers["X-Frame-Options"]="DENY"
    response.headers["Referrer-Policy"]="no-referrer"
    response.headers["Cache-Control"]="no-store"
    response.headers["Content-Security-Policy"]=(
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "connect-src 'self'; img-src 'self' data:; object-src 'none'; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    return response

def require_auth(request: Request):
    if not AUTH_TOKEN:
        if request.client and request.client.host in {"127.0.0.1","::1","testclient"}:
            return "loopback-operator"
        raise HTTPException(503,"Remote access requires FOUNDATION_AUTH_TOKEN")
    value=request.headers.get("Authorization","")
    if not value.startswith("Bearer ") or not secrets.compare_digest(value[7:],AUTH_TOKEN):
        raise HTTPException(401,"Valid workbench access token required",
                            headers={"WWW-Authenticate":"Bearer"})
    return "founder"

@app.exception_handler(Problem)
def workflow_problem(_request,exc:Problem):
    return JSONResponse({"detail":str(exc)},status_code=exc.code)

@app.get("/")
def index():
    return FileResponse(ROOT/"frontend/index.html",media_type="text/html")

@app.get("/static/style.css")
def style():
    return FileResponse(ROOT/"frontend/style.css",media_type="text/css")

@app.get("/static/app.js")
def script():
    return FileResponse(ROOT/"frontend/app.js",media_type="text/javascript")

@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)

@app.get("/health")
def health():
    return {"service":"agent-foundation","ok":True,"scope":"isolated-issue-27"}

@app.get("/api/status")
def status(_=Depends(require_auth)):
    from .agent_sdk import status as agent_status
    sdk=agent_status()
    probe=STORE.get("sdk_probes","sdk-probe-001")
    sdk["probe_status"]=probe["status"] if probe else "NOT_RUN"
    sdk["real_sdk_reasoning_verified"]=bool(probe and probe.get("status")=="COMPLETED"
                                              and probe.get("resume_usage"))
    return {
        "service":"InnoSage Agent Foundation","issue":27,
        "simulation_only":True,"sdk":sdk,
        "state_file":"local SQLite owned by this example",
        "production_connections":False,
    }

@app.get("/api/dashboard")
def dashboard(_=Depends(require_auth)):
    return FLOW.dashboard()

@app.post("/api/scenario/load")
def load(_=Depends(require_auth)):
    return FLOW.load()

@app.post("/api/rounds")
def start_round(_=Depends(require_auth)):
    return FLOW.start()

class ReviewInput(BaseModel):
    approve:bool

@app.post("/api/approvals/{approval_id}/review")
def review(approval_id:str,body:ReviewInput,_=Depends(require_auth)):
    return FLOW.review_draft(approval_id,body.approve)

@app.post("/api/publications/{run_id}/simulate")
def simulate(run_id:str,_=Depends(require_auth)):
    return FLOW.simulate_publication(run_id)

class ImportInput(BaseModel):
    run_id:str="run-01"
    fixture:Literal["weak","strong"]="weak"

@app.post("/api/feedback/import")
def feedback(body:ImportInput,_=Depends(require_auth)):
    return FLOW.import_feedback(body.run_id,body.fixture)

class RevisionInput(BaseModel):
    approve:bool

@app.post("/api/revisions/{revision_id}/review")
def revision(revision_id:str,body:RevisionInput,_=Depends(require_auth)):
    return FLOW.review_strategy(revision_id,body.approve)

@app.get("/api/counterfactual")
def counterfactual(_=Depends(require_auth)):
    return FLOW.counterfactual()

@app.get("/api/context/projection")
def projection(_=Depends(require_auth)):
    return FLOW.context_projection()

class ResetInput(BaseModel):
    confirmation:Literal["RESET_SYNTHETIC"]

@app.post("/api/scenario/reset")
def reset(body:ResetInput,_=Depends(require_auth)):
    if body.confirmation!="RESET_SYNTHETIC":
        raise HTTPException(400,"confirmation required")
    return FLOW.reset()

@app.post("/api/harness/probe")
async def probe(_=Depends(require_auth)):
    """No model calls unless specifically enabled by operator AND configured with a key."""
    from .agent_sdk import run_probe, ProbeBlocked
    try:
        return await run_probe(STORE,RUN_DIR)
    except ProbeBlocked as exc:
        raise HTTPException(409,str(exc)) from exc

class ProbeReviewInput(BaseModel):
    approve:bool

@app.post("/api/harness/probe/{probe_id}/review")
async def probe_review(probe_id:str,body:ProbeReviewInput,_=Depends(require_auth)):
    from .agent_sdk import resume_probe, ProbeBlocked
    try:
        return await resume_probe(STORE,RUN_DIR,probe_id,body.approve)
    except ProbeBlocked as exc:
        raise HTTPException(409,str(exc)) from exc
