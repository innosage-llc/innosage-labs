#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then
  echo "ERROR: Copy .env.example to .env, supply private credentials, then retry." >&2
  exit 1
fi
# --env-file controls Compose interpolation (incl. BIND_IP) AND app env_file.
docker compose --env-file "$ROOT/.env" -f deploy/compose.yaml build
docker compose --env-file "$ROOT/.env" -f deploy/compose.yaml up -d
docker compose --env-file "$ROOT/.env" -f deploy/compose.yaml ps
