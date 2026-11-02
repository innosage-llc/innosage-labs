"""Allow Android *explicitly installed* user CA certificates in this INTERNAL APK.

Still verifies certificate chain, hostname and expiry. Never disables TLS.
Not intended for publicly distributed Android builds.
"""
from pathlib import Path

android = Path(__file__).resolve().parents[1] / "app/android"
manifest = android / "app/src/main/AndroidManifest.xml"
content = manifest.read_text()
needle = "<application "
if needle not in content:
    raise SystemExit("Cannot locate Android application manifest; no silent patch")
if 'android:networkSecurityConfig=' not in content:
    content = content.replace(needle,
       '<application android:networkSecurityConfig="@xml/network_security_config" ', 1)
    manifest.write_text(content)
# Sensitive local recordings must not be included in Android cloud/device backups.
# This development-only APK intentionally opts out of OS backup and extraction.
if 'android:allowBackup="true"' in content:
    content = content.replace('android:allowBackup="true"', 'android:allowBackup="false"', 1)
    manifest.write_text(content)
elif 'android:allowBackup="false"' not in content:
    raise SystemExit("Android backup policy unknown: refusing build")

directory = android / "app/src/main/res/xml"
directory.mkdir(parents=True, exist_ok=True)
(directory / "network_security_config.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<network-security-config>\n'
    '  <base-config cleartextTrafficPermitted="false">\n'
    '    <trust-anchors><certificates src="system"/>'
    '<certificates src="user"/></trust-anchors>\n'
    '  </base-config>\n'
    '</network-security-config>\n'
)
print("Internal APK trusts installed user CA; certificate verification remains enabled")
