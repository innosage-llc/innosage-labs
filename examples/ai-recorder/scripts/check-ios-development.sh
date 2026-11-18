#!/bin/bash
# Read-only local preflight. Never installs Xcode, accepts a license or creates credentials.
set -euo pipefail
if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  export DEVELOPER_DIR="${XCODE_APP:-/Applications/Xcode.app}/Contents/Developer"
fi
if [[ ! -x "$DEVELOPER_DIR/usr/bin/xcodebuild" ]]; then
  echo "Full Xcode is required; Command Line Tools alone cannot build for iPhone." >&2
  echo "Install Xcode from Apple's official source, launch it to finish setup, then rerun." >&2
  echo "For another installation, set DEVELOPER_DIR to its Contents/Developer directory." >&2
  exit 2
fi
xcodebuild -version
if ! xcodebuild -checkFirstLaunchStatus; then
  echo "Open Xcode and complete its required first-launch setup yourself." >&2
  exit 2
fi
if ! command -v pod >/dev/null 2>&1; then
  echo "CocoaPods is required for native dependencies. Follow Expo's official local iOS setup." >&2
  exit 2
fi
echo "Tooling preflight passed. Xcode must still verify signing, device trust and Developer Mode."
echo "Do not publish device lists, provisioning profiles, signing identities or credentials."
