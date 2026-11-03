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
FOUNDATION_DATA_DIR="$ROOT/.local-run" nohup .venv/bin/python -m backend.serve \
  > .local-run/server.log 2>&1 < /dev/null &
echo "$!" > .local-run/server.pid
for i in {1..40}; do
  if curl --noproxy '*' -fsS --connect-timeout 1 http://127.0.0.1:8434/health >/dev/null 2>&1; then
    echo "Agent Foundation #27 started: http://127.0.0.1:8434/"
    echo "Private access token is .local-run/access.token (never printed)."
    echo "MacBook access: SSH tunnel MacBook 8434 -> Mac Studio localhost:8434."
    exit 0
  fi
  sleep .25
done
echo "Server did not become healthy. Examine .local-run/server.log." >&2
exit 1
