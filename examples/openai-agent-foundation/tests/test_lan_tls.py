"""Independent LAN-only TLS and binding invariants, with no network or real data."""
import importlib.util
import ipaddress
import stat
from pathlib import Path

import pytest
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import ec

from backend import lan_security


def load_tls_script():
    path=Path(__file__).resolve().parents[1]/"scripts"/"lan-tls.py"
    spec=importlib.util.spec_from_file_location("foundation_lan_tls_test",path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_reject_public_wildcard_and_fake_private_binding(monkeypatch):
    monkeypatch.setattr(lan_security.subprocess,"check_output",
                        lambda *_a,**_kw:"\tinet 192.168.60.7 netmask\n")
    assert lan_security.validate_local_lan_ip("192.168.60.7")=="192.168.60.7"
    for invalid in ("0.0.0.0","127.0.0.1","8.8.8.8","192.168.60.8","100.64.0.8"):
        with pytest.raises(SystemExit):
            lan_security.validate_local_lan_ip(invalid)


def test_private_ca_server_cert_san_and_rotation(tmp_path,monkeypatch):
    tls=load_tls_script()
    monkeypatch.setattr(tls,"TLS",tmp_path)
    for attr,name in (("CA_KEY","ca.key"),("CA_CERT","ca.crt"),
                      ("SERVER_KEY","server.key"),("SERVER_CERT","server.crt")):
        monkeypatch.setattr(tls,attr,tmp_path/name)
    monkeypatch.setattr(tls,"local_addresses",lambda:["192.168.60.7","192.168.60.8"])
    tls.ensure("192.168.60.7")
    original_ca=tls.CA_CERT.read_bytes()
    ca=x509.load_pem_x509_certificate(original_ca)
    leaf=x509.load_pem_x509_certificate(tls.SERVER_CERT.read_bytes())
    assert ca.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
    assert ca.extensions.get_extension_for_class(x509.SubjectKeyIdentifier)
    assert ca.extensions.get_extension_for_class(x509.AuthorityKeyIdentifier)
    assert leaf.extensions.get_extension_for_class(x509.AuthorityKeyIdentifier)
    san=leaf.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert ipaddress.ip_address("192.168.60.7") in san.get_values_for_type(x509.IPAddress)
    assert ipaddress.ip_address("127.0.0.1") in san.get_values_for_type(x509.IPAddress)
    ca.public_key().verify(leaf.signature,leaf.tbs_certificate_bytes,
                           ec.ECDSA(leaf.signature_hash_algorithm))
    for file in (tls.CA_KEY,tls.CA_CERT,tls.SERVER_KEY,tls.SERVER_CERT):
        assert stat.S_IMODE(file.stat().st_mode)==0o600
    tls.ensure("192.168.60.8")
    assert tls.CA_CERT.read_bytes()==original_ca
    rotated=x509.load_pem_x509_certificate(tls.SERVER_CERT.read_bytes())
    assert ipaddress.ip_address("192.168.60.8") in (
        rotated.extensions.get_extension_for_class(
            x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress))
    with pytest.raises(SystemExit):
        tls.ensure("203.0.113.18")


def test_lan_override_must_be_on_interface(monkeypatch):
    tls=load_tls_script()
    monkeypatch.setattr(tls,"local_addresses",lambda:["192.168.60.7"])
    monkeypatch.setenv("FOUNDATION_LAN_IP","192.168.60.9")
    with pytest.raises(SystemExit):
        tls.discover()
    monkeypatch.setenv("FOUNDATION_LAN_IP","192.168.60.7")
    assert tls.discover()=="192.168.60.7"
