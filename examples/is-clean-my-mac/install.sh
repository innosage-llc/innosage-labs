#!/bin/sh
# Inspect this entrypoint and install.py before running. No scans or cleanup.
set -eu
command -v python3 >/dev/null 2>&1 || { echo 'Install Python 3.9+ before continuing.' >&2; exit 1; }
exec python3 "$(dirname "$0")/install.py" "$@"
