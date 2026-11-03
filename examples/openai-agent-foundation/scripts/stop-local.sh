#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PID_FILE=".local-run/server.pid"
if [[ ! -f "$PID_FILE" ]]; then
  echo "Foundation #27 has no managed PID."
  exit 0
fi
PID="$(cat "$PID_FILE")"
if ! kill -0 "$PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "Removed stale PID file."
  exit 0
fi
CMD="$(ps -p "$PID" -o command= 2>/dev/null || true)"
CWD="$(lsof -a -p "$PID" -d cwd -F n 2>/dev/null | sed -n 's/^n//p' | tail -1)"
if [[ "$CMD" != *" -m backend.serve"* || "$CWD" != "$ROOT" ]]; then
  echo "Refusing to stop PID $PID: process command or workspace mismatch." >&2
  exit 1
fi
kill "$PID"
for i in {1..30}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Stopped Foundation #27. Local SQLite and token retained."
    exit 0
  fi
  sleep .2
done
echo "Process still running; no force-kill attempted." >&2
exit 1
