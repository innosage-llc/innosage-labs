#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
umask 077
mkdir -p .local-run
if [[ ! -x .venv/bin/python ]]; then
  echo "Python venv absent. Run scripts/prepare.sh first." >&2
  exit 1
fi
if [[ -f .local-run/server.pid ]]; then
  PID="$(cat .local-run/server.pid)"
  if kill -0 "$PID" 2>/dev/null; then
    echo "Agent Foundation already running PID=$PID"
    exit 0
  fi
  rm -f .local-run/server.pid
fi
if lsof -nP -iTCP:8434 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
  echo "Port 8434 already in use; refusing to stop an unrelated service." >&2
  exit 1
fi
if [[ ! -f .local-run/access.token ]]; then
  .venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(36))' > .local-run/access.token
fi
chmod 600 .local-run/access.token
LAN_IP="$(.venv/bin/python scripts/lan-tls.py discover)"
.venv/bin/python scripts/lan-tls.py ensure "$LAN_IP"
FOUNDATION_BIND_IP="$LAN_IP" FOUNDATION_DATA_DIR="$ROOT/.local-run" \
  nohup .venv/bin/python -m backend.serve > .local-run/server.log 2>&1 < /dev/null &
echo "$!" > .local-run/server.pid
for i in {1..40}; do
  if curl --noproxy '*' --cacert .local-run/tls/ca.crt -fsS --connect-timeout 1 \
      "https://$LAN_IP:8434/health" >/dev/null 2>&1; then
    echo "Agent Foundation #27 private LAN: https://$LAN_IP:8434/"
    echo "Import & explicitly trust public CA on each client: .local-run/tls/ca.crt"
    echo "Private bearer token remains in .local-run/access.token (never printed)."
    echo "The CA private key never leaves Mac Studio."
    exit 0
  fi
  sleep .25
done
echo "LAN HTTPS server failed health check. Examine .local-run/server.log." >&2
exit 1
