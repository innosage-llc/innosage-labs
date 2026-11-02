#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAN_IP="$1"
if [[ -z "$LAN_IP" ]]; then echo "Usage: make-lan-cert.sh PRIVATE_IP" >&2; exit 2; fi
python3 - "$LAN_IP" <<'PY'
import ipaddress,sys
ip=ipaddress.ip_address(sys.argv[1])
if ip.version != 4 or not ip.is_private or ip.is_loopback:
    raise SystemExit("Expected a private, non-loopback IPv4 LAN address")
PY
TLS="$ROOT/.data/tls"
mkdir -p "$TLS"
chmod 700 "$TLS"
# Regenerating CA requires reinstalling ca.crt on devices.
openssl genpkey -algorithm RSA -out "$TLS/ca.key" -pkeyopt rsa_keygen_bits:3072 >/dev/null 2>&1
openssl req -new -x509 -key "$TLS/ca.key" -out "$TLS/ca.crt" -days 365 -sha256 \
  -subj "/CN=InnoSage CMO Private LAN CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"
openssl genpkey -algorithm RSA -out "$TLS/server.key" -pkeyopt rsa_keygen_bits:3072 >/dev/null 2>&1
openssl req -new -key "$TLS/server.key" -out "$TLS/server.csr" \
  -subj "/CN=InnoSage CMO LAN Server"
cat > "$TLS/server.ext" <<END_CERT
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:$LAN_IP
END_CERT
openssl x509 -req -in "$TLS/server.csr" -CA "$TLS/ca.crt" -CAkey "$TLS/ca.key" \
  -CAserial "$TLS/ca.srl" -CAcreateserial -out "$TLS/server.crt" -days 60 -sha256 \
  -extfile "$TLS/server.ext" >/dev/null 2>&1
chmod 600 "$TLS/ca.key" "$TLS/server.key"
openssl verify -CAfile "$TLS/ca.crt" "$TLS/server.crt" >/dev/null
echo "Generated private-LAN CA and serverAuth leaf (without emitting secrets)."
echo "Install only .data/tls/ca.crt on authorized Android devices."
