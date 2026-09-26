from __future__ import annotations

import hashlib
import hmac
import ipaddress

from fastapi import Request

from app.config.settings import Settings


def actor_fingerprint(request: Request, settings: Settings) -> str:
    peer = request.client.host if request.client else 'unknown'
    client_ip = peer
    if settings.trusted_proxy_count > 0 and _is_trusted_proxy(peer, settings.trusted_proxy_hosts):
        forwarded = request.headers.get('x-forwarded-for', '')
        addresses = [address.strip() for address in forwarded.split(',') if address.strip()]
        if addresses:
            index = max(0, len(addresses) - settings.trusted_proxy_count - 1)
            client_ip = addresses[index]

    try:
        normalized_ip = str(ipaddress.ip_address(client_ip))
    except ValueError:
        normalized_ip = peer or 'unknown'
    return hmac.new(settings.ai_identity_secret.encode(), normalized_ip.encode(), hashlib.sha256).hexdigest()


def _is_trusted_proxy(peer: str, trusted_hosts: list[str]) -> bool:
    try:
        address = ipaddress.ip_address(peer)
    except ValueError:
        return False
    for host in trusted_hosts:
        try:
            if address in ipaddress.ip_network(host, strict=False):
                return True
        except ValueError:
            continue
    return False