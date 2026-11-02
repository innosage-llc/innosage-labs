"""Private-LAN HTTPS trust for this internal Android APK.

Keep normal hostname, certificate chain and expiry validation. If the local
ignored public CA exists, bundle it for app-only trust; never bundle keys or
disable TLS. Not for publicly distributed builds.
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

# Test builds may include ONLY the public LAN CA certificate, scoped to this
# internal app. This avoids installing a device-wide root CA on Android TVs.
# The CA private key and all workspace secrets remain outside the APK.
from shutil import copyfile

private_ca_public = Path(__file__).resolve().parents[1] / ".data/tls/ca.crt"
extra_anchors = ""
if private_ca_public.is_file():
    import ssl
    ssl.PEM_cert_to_DER_cert(private_ca_public.read_text())
    raw = android / "app/src/main/res/raw"
    raw.mkdir(parents=True, exist_ok=True)
    copyfile(private_ca_public, raw / "innosage_lan_ca.pem")
    extra_anchors = '<certificates src="@raw/innosage_lan_ca"/>'

directory = android / "app/src/main/res/xml"
directory.mkdir(parents=True, exist_ok=True)
(directory / "network_security_config.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<network-security-config>\n'
    '  <base-config cleartextTrafficPermitted="false">\n'
    '    <trust-anchors><certificates src="system"/>'
    '<certificates src="user"/>' + extra_anchors + '</trust-anchors>\n'
    '  </base-config>\n'
    '</network-security-config>\n'
)
print("Internal APK uses verified TLS; optional bundled public LAN CA:", bool(extra_anchors))
