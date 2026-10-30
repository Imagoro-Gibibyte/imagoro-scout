# Copyright 2026 Scout Project Contributors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Deterministic redaction before anything reaches the shared blackboard.

The blackboard is readable by every auditor host, so assume an adversary can
read it too. Collectors pass every event through ``redact`` first; the LLM
sanitizer (scout-sec-sanitizer) is a second pass, never the only one.

What is removed / coarsened:
- secrets: bearer tokens, key=value secrets, JWTs, long hex/base64 blobs
- internal IPv4 (RFC1918, CGNAT, mesh): host octet dropped (192.168.1.x)
- MAC addresses: vendor prefix kept, device part dropped
- usernames in auth lines: replaced with a keyed hash (stable per deployment,
  not reversible by dictionary without the key)
- home directories: /home/<user>/
- this host's hostname: replaced with its node label

External IPs are kept on purpose: they are the indicators the auditors need,
and an attacker learns nothing from seeing their own address.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import os
import re
import socket
from typing import Optional

_SECRET_PATTERNS = [
    re.compile(r"(?i)\b(bearer|token|authorization)\s*[:=]?\s*[A-Za-z0-9._\-+/=]{16,}"),
    re.compile(r"(?i)\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)[A-Z0-9_]*)\s*[=:]\s*\S+"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b"),  # JWT
    re.compile(r"\b[A-Fa-f0-9]{40,}\b"),
    re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{43}=(?![A-Za-z0-9+/=])"),  # 32-byte base64 (WG keys, PSKs)
]
_IPV4 = re.compile(r"(?<![\d.])((?:\d{1,3}\.){3}\d{1,3})(?![\d.])")
_MAC = re.compile(r"\b([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){2})(?::[0-9A-Fa-f]{2}){3}\b")
# Only log shapes that carry a username. A bare "by X" / "for X" matched ordinary prose
# ("not evaluated by guard") and hashed it, so "for" needs a following "from" (sshd).
_USER_KEYED = re.compile(r"(?i)\b(invalid user|for user|USER=|ruser=)(\s*)([A-Za-z_][A-Za-z0-9_.\-]{0,31})\b")
_USER_SSHD = re.compile(r"(?i)\b(for)(\s+)([A-Za-z_][A-Za-z0-9_.\-]{0,31})(?=\s+from\b)")
_HOME = re.compile(r"/home/[A-Za-z0-9_.\-]+")
_SUDO_USER = re.compile(r"(sudo\[\d+\]:\s+)([A-Za-z_][A-Za-z0-9_.\-]{0,31})(\s+:)")
_INTERNAL_NETS = tuple(
    ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10")
)
# Words that follow "for"/"by" in log lines and are not usernames.
_NOT_USERS = frozenset({"from", "port", "the", "a", "an", "root", "uid", "session", "invalid", "user", "ssh2"})


def _key() -> bytes:
    return (os.getenv("SCOUT_SEC_REDACT_KEY") or "scout-sec-default-redact-key").encode()


def user_token(name: str) -> str:
    digest = hmac.new(_key(), name.encode(), hashlib.sha256).hexdigest()[:8]
    return f"user:{digest}"


def _coarsen_ip(match: re.Match) -> str:
    text = match.group(1)
    try:
        addr = ipaddress.ip_address(text)
    except ValueError:
        return text
    if any(addr in n for n in _INTERNAL_NETS):
        a, b, c, _ = text.split(".")
        return f"{a}.{b}.{c}.x"
    return text


def redact(text: str, *, host_label: Optional[str] = None) -> str:
    out = text or ""
    for pat in _SECRET_PATTERNS:
        out = pat.sub("[REDACTED]", out)
    out = _MAC.sub(lambda m: m.group(1) + ":xx:xx:xx", out)
    out = _IPV4.sub(_coarsen_ip, out)

    def _user(m: re.Match) -> str:
        name = m.group(3)
        if name.lower() in _NOT_USERS or name.startswith("user:"):
            return m.group(0)
        return f"{m.group(1)}{m.group(2)}{user_token(name)}"

    out = _USER_KEYED.sub(_user, out)
    out = _USER_SSHD.sub(_user, out)
    out = _HOME.sub("/home/<user>", out)
    out = _SUDO_USER.sub(lambda m: m.group(1) + user_token(m.group(2)) + m.group(3), out)
    hn = socket.gethostname()
    if hn and len(hn) > 2:
        # Standalone tokens only: a host called "scout" must not rewrite "scout-sec".
        out = re.sub(rf"(?<![\w.\-/]){re.escape(hn)}(?![\w.\-/])", host_label or "<host>", out)
    return out
