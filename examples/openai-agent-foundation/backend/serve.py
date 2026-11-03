"""Private single-process #27 app. Never print its access token."""
import os
import stat
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RUN_DIR=Path(os.environ.get("FOUNDATION_DATA_DIR",str(ROOT/".local-run"))).resolve()
TOKEN_FILE=RUN_DIR/"access.token"
MODEL_CONFIG=RUN_DIR/"model.env"
ALLOWED_CONFIG={"OPENAI_API_KEY","OPENAI_MODEL",
                "FOUNDATION_ALLOW_BILLABLE","FOUNDATION_MAX_PROBES",
                "FOUNDATION_MODEL_OUTPUT_LIMIT","FOUNDATION_ENABLE_SDK_COMPACTION"}

def load_private_model_config():
    """Parse private key=value data, never execute a shell script."""
    if not MODEL_CONFIG.exists():
        return False
    if stat.S_IMODE(MODEL_CONFIG.stat().st_mode)&0o077:
        raise SystemExit("model.env must be chmod 600 (owner-only)")
    for line in MODEL_CONFIG.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit("Invalid model.env setting")
        key,value=line.split("=",1)
        if key not in ALLOWED_CONFIG:
            raise SystemExit("Unknown model.env setting")
        os.environ[key]=value.strip()
    return True

def main():
    import uvicorn
    RUN_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
    load_private_model_config()
    if not os.environ.get("FOUNDATION_AUTH_TOKEN"):
        if not TOKEN_FILE.exists():
            raise SystemExit("Missing private access.token; use scripts/start-local.sh")
        token=TOKEN_FILE.read_text(encoding="utf-8").strip()
        if len(token)<32:
            raise SystemExit("Refuse weak access.token")
        os.environ["FOUNDATION_AUTH_TOKEN"]=token
    address=os.environ.get("FOUNDATION_BIND_IP","127.0.0.1")
    if address!="127.0.0.1":
        raise SystemExit("Bind only loopback. Use an authenticated SSH tunnel.")
    port=int(os.environ.get("FOUNDATION_PORT","8434"))
    if port!=8434:
        raise SystemExit("This isolated example reserves port 8434 only")
    uvicorn.run("backend.app:app",host=address,port=port,
                workers=1,log_level="info",access_log=False)

if __name__=="__main__":
    main()
