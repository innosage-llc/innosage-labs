"""Restrict agent service network binds to a local RFC1918 interface."""
import ipaddress
import re
import subprocess

PRIVATE_V4 = tuple(ipaddress.ip_network(n) for n in
                   ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))


def validate_local_lan_ip(address: str):
    try:
        ip = ipaddress.ip_address(address)
    except ValueError as exc:
        raise SystemExit("LAN bind must be an actual RFC1918 IPv4 interface") from exc
    if ip.version != 4 or not any(ip in network for network in PRIVATE_V4):
        raise SystemExit("Non-private LAN bind refused")
    output = subprocess.check_output(["ifconfig"], text=True)
    assigned = re.findall(r"^\s+inet\s+(\d+\.\d+\.\d+\.\d+)\s", output, re.MULTILINE)
    if address not in assigned:
        raise SystemExit("LAN IP not assigned to this Mac")
    return str(ip)
