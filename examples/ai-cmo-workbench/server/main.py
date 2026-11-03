"""Private-LAN InnoSage AI CMO Workbench. One FastAPI worker owns state."""
from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .agent_runtime import MissingAgentConfig, analyze_transcript, decide_next_action, ready
from .poster import render_cover
from .mock_runtime import analyze_fixture, decide_fixture, transcribe_fixture
from .speech import SpeechError, configured as speech_configured, transcribe
from .store import StateStore

ROOT = Path(os.getenv("DATA_ROOT", "/data")).resolve()
STATE: StateStore | None = None
WORKSPACE = "innosage-client-zero"
MAX_UPLOAD = 90 * 1024 * 1024
SUPPORTED = {".m4a", ".mp3", ".wav", ".webm"}
RECIPE_CONTRACT = json.loads((Path(__file__).resolve().parents[1] / "contracts/recipes.json").read_text(encoding="utf-8"))
RECIPES = {x["id"]: x["label"] for x in RECIPE_CONTRACT["recipes"]}
ACTIVE_TASKS: set[asyncio.Task] = set()
UPLOAD_LOCK = asyncio.Lock()  # One client-zero upload admission owner

def execution_mode() -> str:
    return os.getenv("AI_CMO_EXECUTION_MODE", "live").strip().lower()

def asr_mode() -> str:
    return os.getenv("ASR_EXECUTION_MODE", "local_qwen").strip().lower()

def workspace_auth_mode() -> str:
    return os.getenv("WORKSPACE_AUTH_MODE", "token").strip().lower()

def validate_execution_modes() -> None:
    auth = workspace_auth_mode()
    if auth not in ("token", "lan_demo"):
        raise RuntimeError("Invalid WORKSPACE_AUTH_MODE")
    if auth == "lan_demo":
        if execution_mode() != "mock" or asr_mode() != "mock":
            raise RuntimeError("Token-free LAN demo requires fully mocked ASR and CMO")
        try:
            bind = ipaddress.ip_address(os.getenv("BIND_IP", ""))
        except ValueError as exc:
            raise RuntimeError("Token-free demo requires an explicit private bind IP") from exc
        if (bind.version != 4 or not (bind.is_private or bind.is_loopback)
                or bind.is_unspecified or bind.is_multicast):
            raise RuntimeError("Token-free demo cannot bind publicly")
        if not bind.is_loopback and not (
            os.getenv("TLS_CERT_PATH") and os.getenv("TLS_KEY_PATH")
        ):
            raise RuntimeError("Token-free LAN demo requires HTTPS")
    if execution_mode() not in ("mock", "live"):
        raise RuntimeError("Invalid AI_CMO_EXECUTION_MODE; expected mock or live")
    if asr_mode() not in ("mock", "local_qwen"):
        raise RuntimeError("Invalid ASR_EXECUTION_MODE; expected mock or local_qwen")
    if execution_mode() == "live" and asr_mode() == "mock":
        raise RuntimeError("Live model cannot consume a mock transcription")
    if execution_mode() == "mock" and ROOT in (Path("/data"), Path("/data/live")):
        raise RuntimeError("Mock mode requires dedicated, isolated PRODUCT_DATA_ROOT (e.g. /data/mock)")

def now():
    return datetime.now(timezone.utc).isoformat()

def store() -> StateStore:
    if STATE is None:
        raise HTTPException(503, "state_not_ready")
    return STATE

def access(x_workspace_key: str | None = Header(default=None)):
    if workspace_auth_mode() == "lan_demo":
        return WORKSPACE
    secret = os.getenv("WORKSPACE_TOKEN", "")
    if len(secret) < 32:
        raise HTTPException(503, "server_auth_unconfigured")
    if not x_workspace_key or not hmac.compare_digest(x_workspace_key, secret):
        raise HTTPException(401, "workspace_auth_required")
    return WORKSPACE

@asynccontextmanager
async def lifespan(app):
    global STATE
    validate_execution_modes()
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ("blobs", "tmp", "transcripts", "covers"):
        (ROOT / name).mkdir(exist_ok=True, mode=0o700)
    STATE = StateStore(ROOT / "state")
    if not STATE.get("workspaces", WORKSPACE):
        STATE.write("workspaces", WORKSPACE, {
            "id": WORKSPACE,
            "objective": "InnoSage: acquire qualified AI developers and test real product demand through accurate, useful content. No unverifiable claims, no forced daily posts.",
            "created": now(),
        })
    # Resume state only; never blindly re-run external ASR, API or posting side effects.
    for job in STATE.items("jobs"):
        if job.get("status") in ("QUEUED", "RUNNING"):
            STATE.write("jobs", job["id"], {
                **job, "status":"BLOCKED", "error":"Prior external result unknown after restart; reconcile before retry",
                "updated":now(),
            })
    try:
        yield
    finally:
        for t in list(ACTIVE_TASKS):
            t.cancel()
        if ACTIVE_TASKS:
            await asyncio.gather(*list(ACTIVE_TASKS), return_exceptions=True)
        STATE.snapshot()
        STATE.close()
        STATE = None

app = FastAPI(title="InnoSage AI CMO Workbench", lifespan=lifespan)
@app.get("/health")
def health():
    return {"status":"ok", "mode":"private-lan-only",
            "auth_mode":workspace_auth_mode()}

@app.get("/api/status")
def status(workspace=Depends(access)):
    return {"workspace":workspace, "recipes": RECIPES,
            "auth_mode":workspace_auth_mode(),
            "execution_mode":execution_mode(), "transcription_mode":asr_mode(),
            "mock_no_external_ai":execution_mode()=="mock",
            "openai_configured":ready(), "edge_configured":speech_configured(),
            "model":os.getenv("OPENAI_MODEL","gpt-5-mini"),
            "credits_balance":"UNVERIFIED", "server_time":now()}

@app.get("/api/workspace")
def get_workspace(workspace=Depends(access)):
    return store().get("workspaces", workspace)

class Objective(BaseModel):
    objective: str = Field(min_length=10, max_length=1500)

@app.post("/api/workspace/objective")
def set_objective(payload: Objective, workspace=Depends(access)):
    old = store().get("workspaces", workspace)
    return store().write("workspaces", workspace, {**old, "objective":payload.objective, "updated":now()})

@app.get("/api/recordings")
def recordings(workspace=Depends(access)):
    return sorted(store().items("recordings"), key=lambda r:r["created"], reverse=True)

@app.post("/api/recordings")
async def upload(audio: UploadFile = File(...), client_id: str = Form(...),
                 recipe: str = Form("cmo_business_intake"), consent: bool = Form(False),
                 llm_consent: bool = Form(False), workspace=Depends(access)):
    async with UPLOAD_LOCK:
        if recipe not in RECIPES:
            raise HTTPException(400, "unknown_recipe")
        if not consent:
            raise HTTPException(400, "source_retention_consent_required")
        if not 4 <= len(client_id) <= 120 or not client_id.replace("-", "").replace("_", "").isalnum():
            raise HTTPException(400, "invalid_client_id")
        ext = Path(audio.filename or "audio.m4a").suffix.lower()
        if ext not in SUPPORTED:
            raise HTTPException(415, "unsupported_audio_format")
        existing = store().get("recordings", client_id)
        if existing:
            # An ambiguous timeout can be retried with the same client_id; prove
            # that bytes, declared recipe and content digest are identical.
            h = hashlib.sha256()
            n = 0
            while True:
                chunk = await audio.read(1024 * 1024)
                if not chunk: break
                n += len(chunk)
                if n > MAX_UPLOAD: raise HTTPException(413,"recording_too_large")
                h.update(chunk)
            if (existing["recipe"] != recipe or n != existing["bytes"]
                    or h.hexdigest() != existing["sha256"]
                    or existing.get("llm_consent") != llm_consent):
                raise HTTPException(409,"idempotency_conflict")
            return existing
        tmp = ROOT / "tmp" / (uuid.uuid4().hex + ext)
        h, total = hashlib.sha256(), 0
        try:
            with tmp.open("xb") as f:
                while True:
                    data = await audio.read(1024 * 1024)
                    if not data: break
                    total += len(data)
                    if total > MAX_UPLOAD:
                        raise HTTPException(413, "recording_too_large")
                    h.update(data)
                    f.write(data)
                f.flush()
                os.fsync(f.fileno())
            if total < 100:
                raise HTTPException(400, "recording_too_short")
            blob_name = h.hexdigest() + ext
            final = ROOT / "blobs" / blob_name
            if not final.exists():
                os.replace(tmp, final)
                # Persist directory rename before recording durable metadata ACK.
                directory_fd = os.open(ROOT / "blobs", os.O_RDONLY)
                try: os.fsync(directory_fd)
                finally: os.close(directory_fd)
            else:
                tmp.unlink(missing_ok=True)
            item = {"id":client_id, "workspace_id":workspace,
                    "created":now(), "recipe":recipe,
                    "bytes":total, "sha256":h.hexdigest(), "blob":blob_name,
                    "status":"CAPTURED", "source_consent":True,
                    "llm_consent":llm_consent}
            return store().write("recordings", client_id, item)
        finally:
            tmp.unlink(missing_ok=True)

@app.get("/api/recordings/{recording_id}")
def recording(recording_id: str, workspace=Depends(access)):
    entry = store().get("recordings", recording_id)
    if not entry: raise HTTPException(404, "recording_not_found")
    return entry

@app.get("/api/recordings/{recording_id}/audio")
def recording_audio(recording_id: str, workspace=Depends(access)):
    entry = store().get("recordings", recording_id)
    if not entry: raise HTTPException(404, "recording_not_found")
    blob = ROOT / "blobs" / entry["blob"]
    if not blob.is_file(): raise HTTPException(503, "blob_unavailable")
    media_type = {
        ".m4a":"audio/mp4", ".mp3":"audio/mpeg", ".wav":"audio/wav",
        ".webm":"audio/webm",
    }.get(blob.suffix,"application/octet-stream")
    return FileResponse(blob,media_type=media_type)

class AnalysisConsent(BaseModel):
    allow_openai_analysis: bool

@app.post("/api/recordings/{recording_id}/consent")
def update_analysis_consent(recording_id: str, body: AnalysisConsent,
                            workspace=Depends(access)):
    with store().guard:
        entry = store().get("recordings", recording_id)
        if not entry:
            raise HTTPException(404, "recording_not_found")
        return store().write("recordings", recording_id, {
            **entry, "llm_consent": body.allow_openai_analysis,
            "llm_consent_updated_at": now()
        })

@app.get("/api/recordings/{recording_id}/transcript")
def recording_transcript(recording_id: str, workspace=Depends(access)):
    entry = store().get("recordings", recording_id)
    if not entry: raise HTTPException(404, "recording_not_found")
    path = ROOT / "transcripts" / (recording_id + ".md")
    if not path.exists(): raise HTTPException(404, "transcript_not_available")
    return {"source_id":recording_id,"text":path.read_text(encoding="utf-8")}

def schedule(task):
    item = asyncio.create_task(task)
    ACTIVE_TASKS.add(item)
    item.add_done_callback(ACTIVE_TASKS.discard)

async def _qwen_input(item):
    source = ROOT / "blobs" / item["blob"]
    if not source.is_file():
        raise SpeechError("Audio source missing")
    if source.suffix == ".webm":
        converted = ROOT / "tmp" / (uuid.uuid4().hex + ".wav")
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-nostdin", "-v", "error", "-i", str(source),
                "-ac", "1", "-ar", "16000", "-y", str(converted),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), 120)
            if proc.returncode != 0: raise SpeechError("WebM conversion failed")
            return converted, True
        except Exception:
            converted.unlink(missing_ok=True)
            raise
    return source, False

async def _process(recording_id: str, job_id: str, recipe: str):
    entry = store().get("jobs", job_id)
    store().write("jobs", job_id, {**entry,"status":"RUNNING","updated":now()})
    source = store().get("recordings", recording_id)
    temporary = None
    try:
        # Reuse a previously confirmed transcript when granting consent later.
        transcript_path = ROOT / "transcripts" / (recording_id + ".md")
        if source.get("status") == "TRANSCRIBED" and transcript_path.is_file():
            markdown = transcript_path.read_text(encoding="utf-8")
            if hashlib.sha256(markdown.encode()).hexdigest() != source.get("transcript_sha256"):
                raise SpeechError("Retained transcript checksum mismatch")
        else:
            if asr_mode()=="mock":
                # No audio analysis occurs; a known synthetic fixture is used.
                store().write("jobs", job_id, {
                    **store().get("jobs",job_id),
                    "stage":"MOCK_TRANSCRIPTION_NO_AUDIO_ANALYSIS", "updated":now()
                })
                result, markdown = transcribe_fixture(recording_id)
            else:
                if not speech_configured():
                    raise SpeechError("Edge Speech service credential not configured")
                audio, temporary = await _qwen_input(source)
                # Durably fence before a potentially accepted external Qwen POST.
                store().write("jobs", job_id, {
                    **store().get("jobs",job_id), "stage":"QWEN_MAY_HAVE_ACCEPTED",
                    "updated":now()
                })
                try:
                    result, markdown = await transcribe(audio, audio.suffix.lower(), recording_id)
                finally:
                    if temporary: audio.unlink(missing_ok=True)
            temp = transcript_path.with_suffix(".part")
            with temp.open("w", encoding="utf-8") as f:
                f.write(markdown)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp, transcript_path)
            directory_fd = os.open(transcript_path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            # Never overwrite a successful consent revocation made while Qwen
            # was processing. Only update transcription fields on FRESH state.
            with store().guard:
                current = store().get("recordings", recording_id)
                if not current or current["sha256"] != source["sha256"]:
                    raise SpeechError("Recording identity changed during ASR")
                store().write("recordings", recording_id, {
                    **current, "status":"TRANSCRIBED",
                    "transcript_sha256":hashlib.sha256(markdown.encode()).hexdigest(),
                    "transcript_segments":len(result.get("transcription",{}).get("segments",[])),
                    "qwen_cleanup":result.get("_adapter_cleanup", "NOT_VERIFIED"),
                    "transcript_origin":(
                        "MOCK_FIXTURE_NOT_AUDIO" if asr_mode()=="mock"
                        else "LOCAL_QWEN_AUTHENTIC"
                    )
                })
        # No external Qwen call is necessary after durable transcript readback.
        store().write("jobs", job_id, {
            **store().get("jobs",job_id), "stage":"TRANSCRIPT_DURABLE",
            "updated":now()
        })
        # In Mock mode NO provider dispatch is allowed, even if credentials
        # happen to exist. In Live mode enforce current consent at dispatch.
        if execution_mode()=="mock":
            store().write("jobs", job_id, {
                **store().get("jobs",job_id),
                "stage":"MOCK_AGENT_NO_API", "updated":now()
            })
            intake_output = analyze_fixture(markdown, recipe, recording_id)
        else:
            with store().guard:
                current = store().get("recordings", recording_id)
                if not current or not current.get("llm_consent"):
                    raise MissingAgentConfig("No current OpenAI consent; Qwen transcript retained")
                if not ready():
                    raise MissingAgentConfig("OpenAI API key/Agents SDK not configured; Qwen transcript retained")
                job = store().get("jobs", job_id)
                store().write("jobs", job_id, {
                    **job, "stage":"OPENAI_DISPATCHED", "updated":now(),
                    "consent_decided_at":now(),
                    "consent_recording_version":current.get("llm_consent_updated_at")
                })
            intake_output = await analyze_transcript(markdown, recipe, recording_id)
        model_usage = intake_output.pop("_model_usage", {"dollar_cost":"UNKNOWN"})
        intake = {
            "id":"i_" + recording_id, "source_id":recording_id,
            "workspace_id":WORKSPACE, "recipe":recipe,
            "summary":intake_output.get("summary",""),
            "analysis":intake_output, "model_usage":model_usage,
            "visibility":"private_candidate",
            "status":"ANALYZED_CANDIDATE", "created":now(),
            "recipe_contract_version":RECIPE_CONTRACT["contract_version"],
            "execution_mode":execution_mode(),
            "transcript_origin":store().get("recordings", recording_id).get(
                "transcript_origin", "UNKNOWN"
            ),
            "mock_fixture":execution_mode()=="mock",
            "transcript_sha256":hashlib.sha256(markdown.encode()).hexdigest(),
            "source_sha256":source["sha256"], "rights":"internal_analysis_only"
        }
        store().write("intakes", intake["id"], intake)
        store().write("recordings", recording_id, {**store().get("recordings", recording_id), "status":"ANALYZED_CANDIDATE"})
        store().write("jobs", job_id, {**store().get("jobs",job_id),"status":"COMPLETED","intake_id":intake["id"],"updated":now()})
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        # Persist only known, sanitized operational reasons; SDK/provider
        # exceptions may contain private request or transcript excerpts.
        reason = (str(exc)[:180] if isinstance(exc,(SpeechError,MissingAgentConfig))
                  else "intake_failed_" + type(exc).__name__)
        store().write("jobs", job_id, {**store().get("jobs",job_id), "status":"BLOCKED",
             "error":reason, "updated":now()})

@app.post("/api/recordings/{recording_id}/process")
async def process_recording(recording_id: str, workspace=Depends(access)):
    entry = store().get("recordings", recording_id)
    if not entry: raise HTTPException(404, "recording_not_found")
    if entry.get("status") == "ANALYZED_CANDIDATE":
        raise HTTPException(409, "intake_already_created")
    previous = [j for j in store().items("jobs")
                if j.get("source_id")==recording_id and j.get("kind")=="intake"]
    pending = [j for j in previous if j.get("status") in ("RUNNING","QUEUED")]
    if pending: return pending[0]
    # Unknown side effects are not idempotent: Qwen may already have accepted
    # an upload, and a model call may already have consumed API credits.
    if any(j.get("stage")=="OPENAI_DISPATCHED"
           and j.get("status")!="COMPLETED" for j in previous):
        raise HTTPException(409,"OpenAI_result_unknown_requires_operator_reconciliation")
    if entry.get("status") not in ("TRANSCRIBED","ANALYZED_CANDIDATE"):
        if any(j.get("stage")=="QWEN_MAY_HAVE_ACCEPTED"
               and j.get("status")!="COMPLETED" for j in previous):
            raise HTTPException(409,"Qwen_result_unknown_requires_operator_reconciliation")
    if (execution_mode()=="live" and entry.get("llm_consent")
            and _agent_run_count() >= int(os.getenv("MAX_AGENT_RUNS_PER_DAY","6"))):
        raise HTTPException(429,"daily_model_run_limit_reached")
    if execution_mode()=="mock" and _mock_run_count() >= 30:
        raise HTTPException(429, "mock_daily_job_limit_reached")
    job = {"id":"j_" + uuid.uuid4().hex, "kind":"intake","source_id":recording_id,
           "execution_mode":execution_mode(),
           "llm_intended":bool(entry.get("llm_consent")) and execution_mode()=="live",
           "status":"QUEUED","created":now(), "updated":now()}
    store().write("jobs", job["id"], job)
    schedule(_process(recording_id, job["id"], entry["recipe"]))
    return job

@app.get("/api/jobs/{job_id}")
def job_status(job_id: str, workspace=Depends(access)):
    job = store().get("jobs", job_id)
    if not job: raise HTTPException(404, "job_not_found")
    return job

@app.get("/api/intakes")
def intakes(workspace=Depends(access)):
    return sorted(store().items("intakes"), key=lambda x:x["created"], reverse=True)

class PublicClaimsApproval(BaseModel):
    reviewed_source: bool = False
    public_claims: list[str] = Field(min_length=1, max_length=8)

@app.post("/api/intakes/{intake_id}/approve")
def approve_intake(intake_id: str, body: PublicClaimsApproval,
                   workspace=Depends(access)):
    if not body.reviewed_source:
        raise HTTPException(400, "source_review_required")
    claims = [c.strip() for c in body.public_claims]
    if not claims or any(len(c) < 5 or len(c) > 300 for c in claims):
        raise HTTPException(400, "invalid_public_claim")
    with store().guard:
        existing = store().get("intakes",intake_id)
        if not existing: raise HTTPException(404, "intake_not_found")
        if existing.get("execution_mode")=="mock":
            raise HTTPException(409, "mock_intake_cannot_be_approved_as_fact")
        # Promote only individually reviewed claims, not a private transcript
        # or its unverified broad business summary.
        return store().write("intakes",intake_id,{
            **existing, "visibility":"public_approved",
            "approved_public_claims":claims,"source_reviewed":True,
            "status":"APPROVED_FOR_USE","approved_at":now(),
            "rights":"verified_claims_only"
        })

def _mock_run_count():
    today = datetime.now(timezone.utc).date().isoformat()
    return sum(1 for j in store().items("jobs")
               if j.get("execution_mode")=="mock" and
               j.get("created","")[:10]==today)

def _agent_run_count():
    today = datetime.now(timezone.utc).date().isoformat()
    return sum(1 for j in store().items("jobs")
               if (j.get("kind")=="cmo" or (j.get("kind")=="intake" and j.get("llm_intended")))
               and j["created"][:10]==today)

async def _run_cmo(job_id: str):
    job = store().get("jobs",job_id)
    store().write("jobs",job_id,{**job,"status":"RUNNING","updated":now()})
    try:
        available = store().items("intakes")
        if execution_mode()=="mock":
            available = [item for item in available
                         if item.get("execution_mode")=="mock"]
        else:
            available = [item for item in available
                         if item.get("execution_mode")!="mock"]
        source_items = sorted(available,key=lambda x:x["created"],reverse=True)[:12]
        evidence = []
        for item in source_items:
            source_record = (store().get("recordings",item["source_id"])
                             if item.get("source_id") else None)
            consent_now = bool(source_record and source_record.get("llm_consent"))
            public_claims = (item.get("approved_public_claims",[])
                             if item.get("visibility") == "public_approved" else [])
            evidence.append({
                "id":item["id"], "status":item["status"],
                "visibility":item["visibility"],
                # A prior consent revocation disables further CMO uploads of
                # any private summary even if Intake was analyzed earlier.
                "summary":item["summary"] if (
                    consent_now or (
                        execution_mode()=="mock" and item.get("execution_mode")=="mock"
                    )
                ) else "",
                "approved_public_claims":public_claims,
                "source_llm_consent":consent_now,
                "execution_mode":item.get("execution_mode","live"),
            })
        objective = store().get("workspaces",WORKSPACE)["objective"]
        if execution_mode()=="mock":
            decision = decide_fixture(objective, evidence)
        else:
            decision = await decide_next_action(objective, evidence)
        model_usage = decision.pop("_model_usage", {"dollar_cost":"UNKNOWN"})
        did = "d_" + uuid.uuid4().hex
        record = {"id":did, "created":now(), "workspace_id":WORKSPACE,
                  "model_usage":model_usage,
                  "objective":objective,
                  "execution_mode":execution_mode(),
                  "decision":decision, "source_intake_ids":[s["id"] for s in evidence],
                  "status":("MOCK_ONLY" if execution_mode()=="mock" else
                            ("READY_FOR_APPROVAL" if decision.get("publishable") else "EXECUTED")),
                  "external_outcome":"none"}
        store().write("decisions", did, record)
        if decision.get("title") and decision.get("caption"):
            package_id = "p_" + uuid.uuid4().hex
            image = ROOT / "covers" / (package_id + ".png")
            render_cover(image, decision["title"], decision.get("poster_lines",[]),
                         is_mock=execution_mode()=="mock")
            package = {"id":package_id,"decision_id":did,"created":now(),
                "version":1,"title":decision["title"],"caption":decision["caption"],
                "tags":decision.get("tags",[]),"image":image.name,
                "execution_mode":execution_mode(), "mock_fixture":execution_mode()=="mock",
                "status":"MOCK_REVIEW_ONLY" if execution_mode()=="mock" else "DRAFT",
                "is_public_claims_verified":(decision.get("publishable",False)
                                             and execution_mode()=="live")}
            store().write("packages",package_id,package)
            record["package_id"]=package_id
            store().write("decisions",did,record)
        store().write("jobs",job_id,{**store().get("jobs",job_id),"status":"COMPLETED",
                     "decision_id":did,"updated":now()})
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        reason = (str(exc)[:180] if isinstance(exc,MissingAgentConfig)
                  else "cmo_failed_" + type(exc).__name__)
        store().write("jobs",job_id,{**store().get("jobs",job_id),
                     "status":"BLOCKED","error":reason,"updated":now()})

@app.post("/api/cmo/run")
async def run_cmo(workspace=Depends(access)):
    if execution_mode()=="live":
        if not ready(): raise HTTPException(503,"OpenAI_Agent_unavailable")
        if _agent_run_count() >= int(os.getenv("MAX_AGENT_RUNS_PER_DAY","6")):
            raise HTTPException(429, "daily_model_run_limit_reached")
    elif _mock_run_count() >= 30:
        raise HTTPException(429, "mock_daily_job_limit_reached")
    job={"id":"j_"+uuid.uuid4().hex,"kind":"cmo","execution_mode":execution_mode(),
         "created":now(),"updated":now(),"status":"QUEUED"}
    store().write("jobs",job["id"],job)
    schedule(_run_cmo(job["id"]))
    return job

@app.get("/api/decisions")
def decisions(workspace=Depends(access)):
    return sorted(store().items("decisions"),key=lambda r:r["created"],reverse=True)

@app.get("/api/packages")
def packages(workspace=Depends(access)):
    return sorted(store().items("packages"),key=lambda r:r["created"],reverse=True)

@app.get("/api/packages/{package_id}/cover")
def cover(package_id:str, workspace=Depends(access)):
    item=store().get("packages",package_id)
    if not item: raise HTTPException(404,"package_not_found")
    return FileResponse(ROOT/"covers"/item["image"],media_type="image/png")

class PackageEdit(BaseModel):
    title: str=Field(min_length=1,max_length=100)
    caption: str=Field(min_length=1,max_length=3500)

@app.post("/api/packages/{package_id}/edit")
def edit_package(package_id:str, body:PackageEdit, workspace=Depends(access)):
    with store().guard:
        item=store().get("packages",package_id)
        if not item: raise HTTPException(404,"package_not_found")
        version=item["version"]+1
        filename=package_id+"_v"+str(version)+".png"
        render_cover(ROOT/"covers"/filename,body.title,[],
                     is_mock=item.get("execution_mode")=="mock")
        updated={**item,"version":version,"title":body.title,"caption":body.caption,
                 "image":filename,
                 "status":"MOCK_REVIEW_ONLY" if item.get("execution_mode")=="mock" else "DRAFT",
                 "approved_version":None,
                 "is_public_claims_verified":False,"edited":now()}
        return store().write("packages",package_id,updated)

class HumanApproval(BaseModel):
    verified_sources:bool=False
    expected_version:int = Field(ge=1)

@app.post("/api/packages/{package_id}/approve")
def approve_package(package_id:str,body:HumanApproval,workspace=Depends(access)):
    if not body.verified_sources:
        raise HTTPException(400,"source_verification_required")
    with store().guard:
        item=store().get("packages",package_id)
        if not item: raise HTTPException(404,"package_not_found")
        if item.get("execution_mode")=="mock":
            raise HTTPException(409,"mock_package_cannot_be_approved_for_publication")
        if item["version"] != body.expected_version:
            raise HTTPException(409,"approval_version_conflict")
        updated={**item,"status":"AWAITING_HUMAN_PLATFORM_COMMIT",
                 "approved_version":body.expected_version,"approved_at":now()}
        return store().write("packages",package_id,updated)

class PublicationReceipt(BaseModel):
    url:str=Field(min_length=15,max_length=1000)

@app.post("/api/packages/{package_id}/receipt")
def receipt(package_id:str,body:PublicationReceipt,workspace=Depends(access)):
    item=store().get("packages",package_id)
    if not item: raise HTTPException(404,"package_not_found")
    if item.get("execution_mode")=="mock":
        raise HTTPException(409,"mock_package_cannot_report_real_publication")
    if item.get("approved_version") != item["version"]:
        raise HTTPException(409,"approval_outdated")
    if not body.url.startswith("https://"):
        raise HTTPException(400,"invalid_public_url")
    # User report != platform-verified publication.
    note={"id":"o_"+uuid.uuid4().hex,"package_id":package_id,
          "url":body.url,"source":"founder_reported","verification":"UNVERIFIED","created":now()}
    store().write("observations",note["id"],note)
    return note

@app.post("/api/admin/snapshot")
def snapshot(workspace=Depends(access)):
    return {"sha256":store().snapshot(),"sequence":store().seq}

# Only static web build goes into the server image; never include private sources
# or runtime state there. No separate Next.js/Node server is required.
WEB_DIR = Path(os.getenv("WEB_DIR", "/app/web"))
if WEB_DIR.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIR,html=True), name="web")
