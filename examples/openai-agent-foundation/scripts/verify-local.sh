#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
.venv/bin/pytest -q
node --check frontend/app.js
.venv/bin/python -m compileall -q backend
echo "Offline deterministic tests, JS syntax, Python compile: PASS"
echo "Real paid OpenAI reasoning/SDK compaction: NOT_RUN without explicit spend approval."
