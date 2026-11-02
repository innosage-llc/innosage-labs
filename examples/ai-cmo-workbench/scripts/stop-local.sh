#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
docker compose --env-file "$ROOT/.env" -f deploy/compose.yaml down
echo 'Product container stopped. Data in .data/ is untouched.'
