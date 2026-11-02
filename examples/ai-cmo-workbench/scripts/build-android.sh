#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd "$ROOT/app"
npm ci --no-audit --no-fund
npx expo prebuild --platform android --clean --no-install
python3 "$ROOT/scripts/patch-android-tls.py"
cd android
./gradlew :app:assembleRelease --no-daemon
printf "Internal APK: %s\n" "$ROOT/app/android/app/build/outputs/apk/release/app-release.apk"
shasum -a 256 "$ROOT/app/android/app/build/outputs/apk/release/app-release.apk"
