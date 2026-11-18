#!/bin/sh
# Read-only; honors an explicitly selected per-process DEVELOPER_DIR.
set -eu
xcodebuild -version
xcrun --sdk iphonesimulator --show-sdk-path
xcrun --find simctl
xcrun simctl list runtimes available
if ! command -v pod >/dev/null 2>&1; then
  echo 'BLOCKED: CocoaPods is required by the generated Expo iOS Podfile; no installation attempted.' >&2
  exit 1
fi
pod --version
