#!/bin/bash
# Read-only preflight. No setup, signing changes, device registration, or deployment.
set -euo pipefail
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required for iOS device checks." >&2
  exit 2
fi
exec python3 "$(dirname "$0")/ios_device.py" doctor "$@"
