#!/usr/bin/env python3
"""Issue #27 independent private-LAN TLS bootstrap.

Uses a private CA and a single server-only certificate. The CA public cert
must be explicitly trusted on clients. Never edits system keychains or #11 TLS.
"""
from __future__ import annotations

import ipaddress
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

ROOT = Path(__file__).resolve().parents[1]
TLS = ROOT / ".local-run" / "tls"
CA_KEY = TLS / "ca.key"
CA_CERT = TLS / "ca.crt"
SERVER_KEY = TLS / "server.key"
SERVER_CERT = TLS / "server.crt"
RFC1918 = [ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]


def private_lan(address: str):
    try:
        ip = ipaddress.ip_address(address)
        if ip.version != 4 or not any(ip in block for block in RFC1918):
            raise ValueError("Not a private RFC1918 IPv4 address")
        return ip
    except ValueError as exc:
        raise SystemExit("Refusing non-RFC1918 LAN bind address") from exc


def local_addresses() -> list[str]:
    output = subprocess.check_output(["ifconfig"], text=True)
    return re.findall(r"^\s+inet\s+(\d+\.\d+\.\d+\.\d+)\s", output, re.MULTILINE)


def discover() -> str:
    addresses = [x for x in local_addresses() if
                 any(ipaddress.ip_address(x) in n for n in RFC1918)]
    override = os.environ.get("FOUNDATION_LAN_IP", "").strip()
    if override:
        private_lan(override)
        if override not in addresses:
            raise SystemExit("FOUNDATION_LAN_IP is not assigned to this Mac")
        return override
    if not addresses:
        raise SystemExit("No private LAN interface found: set a valid FOUNDATION_LAN_IP")
    # Stable preference for physical Wi-Fi/Ethernet before virtual/VPN addresses.
    for interface in ("en1", "en0", "en2", "en3"):
        result = subprocess.run(["ipconfig", "getifaddr", interface],
                                capture_output=True, text=True, check=False)
        address = result.stdout.strip()
        if result.returncode == 0 and address in addresses:
            return address
    return addresses[0]


def write_private(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(data)
    path.chmod(0o600)


def create_ca(now: datetime):
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,
                                        "InnoSage Agent Foundation #27 private test CA")])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=730))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()),critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(key.public_key()),critical=False)
        .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
            key_encipherment=False, data_encipherment=False, key_agreement=False,
            key_cert_sign=True, crl_sign=True, encipher_only=False, decipher_only=False),
            critical=True)
        .sign(key, hashes.SHA256()))
    write_private(CA_KEY, key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    write_private(CA_CERT, cert.public_bytes(serialization.Encoding.PEM))
    return key, cert


def ensure(address: str):
    ip = private_lan(address)
    if address not in local_addresses():
        raise SystemExit("Refusing bind IP not currently assigned to this Mac")
    now = datetime.now(timezone.utc)
    TLS.mkdir(parents=True, exist_ok=True, mode=0o700)
    if CA_KEY.exists() != CA_CERT.exists():
        raise SystemExit("Private CA incomplete: refuse partial/corrupt credentials")
    if CA_KEY.exists():
        key = serialization.load_pem_private_key(CA_KEY.read_bytes(), password=None)
        ca = x509.load_pem_x509_certificate(CA_CERT.read_bytes())
        if ca.not_valid_after_utc <= now + timedelta(days=180):
            raise SystemExit("Private CA expiring: rotate explicitly; do not silently invalidate client trust")
        try:
            ca.extensions.get_extension_for_class(x509.SubjectKeyIdentifier)
            ca.extensions.get_extension_for_class(x509.AuthorityKeyIdentifier)
        except x509.ExtensionNotFound as exc:
            raise SystemExit("Private CA missing strict TLS extensions; operator must rotate explicitly") from exc
    else:
        key, ca = create_ca(now)
    wanted = {ip, ipaddress.ip_address("127.0.0.1")}
    renew = not (SERVER_KEY.exists() and SERVER_CERT.exists())
    if not renew:
        old = x509.load_pem_x509_certificate(SERVER_CERT.read_bytes())
        san = old.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        actual = set(san.get_values_for_type(x509.IPAddress))
        renew = not wanted.issubset(actual) or old.not_valid_after_utc < now + timedelta(days=14)
        try:
            old.extensions.get_extension_for_class(x509.AuthorityKeyIdentifier)
        except x509.ExtensionNotFound:
            renew = True
    if renew:
        leaf = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,
                                            "InnoSage Agent Foundation LAN")])
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(ca.subject)
            .public_key(leaf.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5))
            .not_valid_after(now + timedelta(days=180))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(leaf.public_key()),critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(key.public_key()),critical=False)
            .add_extension(x509.SubjectAlternativeName([
                x509.IPAddress(ip), x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                x509.DNSName("localhost")]), critical=False)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
                           critical=False)
            .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False,
                key_encipherment=False, data_encipherment=False, key_agreement=False,
                key_cert_sign=False, crl_sign=False, encipher_only=False, decipher_only=False),
                critical=True)
            .sign(key, hashes.SHA256()))
        write_private(SERVER_KEY, leaf.private_bytes(serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
        write_private(SERVER_CERT, cert.public_bytes(serialization.Encoding.PEM))
    print("LAN TLS ready:", address, "(independent CA; private keys remain in .local-run/tls)")
    return address


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("discover", "ensure"):
        raise SystemExit("usage: python scripts/lan-tls.py discover | ensure [LAN_IPV4]")
    if sys.argv[1] == "discover":
        print(discover())
        return
    ensure(sys.argv[2] if len(sys.argv) == 3 else discover())


if __name__ == "__main__":
    main()
