#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "[1/3] Expo shared TypeScript"
npm --prefix app ci --no-audit --no-fund
(cd app && npx tsc --noEmit)
echo "[2/3] Build standalone server/Web image"
docker build -f deploy/Dockerfile -t innosage-ai-cmo-demo:local . > /tmp/innosage-ai-cmo-validation-build.log
echo "[3/3] Isolated synthetic API/state/CMO tests (network denied)"
docker run --rm --network none --entrypoint python -w /app innosage-ai-cmo-demo:local \
  -m unittest discover -s tests -v
if [[ "$#" -gt 0 && "$1" == "--mock" ]]; then
  echo "[4] Fixture-driven browser E2E against running private Mock server (no LLM cost)"
  node app/e2e-mock.mjs
elif [[ "$#" -gt 0 && "$1" == "--web" ]]; then
  echo "[4] HTTPS synthetic Web browser + recording upload E2E (active private LAN required)"
  node app/e2e-web.mjs
fi
