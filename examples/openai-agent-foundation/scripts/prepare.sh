#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="/opt/homebrew/bin/python3"
if [[ ! -x "$PY" ]]; then PY="$(command -v python3)"; fi
if [[ ! -d .venv ]]; then "$PY" -m venv .venv; fi
.venv/bin/python -m pip install -r requirements.txt
echo "Prepared isolated #27 environment. Run scripts/start-local.sh."
