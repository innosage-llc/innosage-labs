"""One Python state owner. TLS is compulsory for LAN access."""
import os
from pathlib import Path
import uvicorn

if __name__ == "__main__":
    bind = os.getenv("BIND_IP", "127.0.0.1")
    cert, key = os.getenv("TLS_CERT_PATH", ""), os.getenv("TLS_KEY_PATH", "")
    if bind != "127.0.0.1" and (not cert or not key):
        raise SystemExit("LAN service requires configured TLS certificate/key")
    if bool(cert) != bool(key):
        raise SystemExit("Partial TLS configuration")
    kwargs = {
        "app": "server.main:app",
        "host": "0.0.0.0",
        "port": 8433,
        "workers": 1,
        "access_log": False,
    }
    if cert and key:
        if not Path(cert).is_file() or not Path(key).is_file():
            raise SystemExit("TLS certificate/key not mounted")
        kwargs.update(ssl_certfile=cert, ssl_keyfile=key)
    uvicorn.run(**kwargs)
