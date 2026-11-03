"""Private single-process #27 app. Never print its access token."""
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RUN_DIR=Path(os.environ.get("FOUNDATION_DATA_DIR",str(ROOT/".local-run"))).resolve()
TOKEN_FILE=RUN_DIR/"access.token"

def main():
    import uvicorn
    RUN_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
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
