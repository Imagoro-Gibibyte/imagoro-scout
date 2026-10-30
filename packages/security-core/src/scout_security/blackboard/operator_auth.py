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

"""Operator request signing (Ed25519) for the control API.

No bearer secret: an operator holds a private key (the UI stores it in the user
profile), the hub holds only public keys in SCOUT_SEC_OPERATORS_DIR
(<name>.pub = base64 of the 32-byte raw key). Every request carries

    X-Scout-Op: v1.<name>.<unix_ts>.<nonce>.<base64url(signature)>

over the canonical string

    v1\n<METHOD>\n<path?query>\n<unix_ts>\n<nonce>\n<sha256(body) hex>

Rejected: unknown operator, |now - ts| > 60 s, reused nonce, bad signature.
The same canonical form is implemented in the Tauri app (ui/src-tauri/src/sign.rs).
"""

from __future__ import annotations

import base64
import hashlib
import os
import threading
import time
from pathlib import Path
from typing import Dict, Optional, Tuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

HEADER = "X-Scout-Op"
WINDOW_S = 60


class OpAuthError(ValueError):
    pass


def canonical(method: str, path: str, ts: int, nonce: str, body: bytes) -> bytes:
    return "\n".join(["v1", method.upper(), path, str(ts), nonce, hashlib.sha256(body or b"").hexdigest()]).encode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_request(key: Ed25519PrivateKey, name: str, method: str, path: str, body: bytes = b"",
                 ts: Optional[int] = None, nonce: Optional[str] = None) -> str:
    """Client side (tests, CLI). Returns the X-Scout-Op header value."""
    ts = int(ts if ts is not None else time.time())
    nonce = nonce or base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
    sig = key.sign(canonical(method, path, ts, nonce, body))
    return f"v1.{name}.{ts}.{nonce}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"


def public_key_b64(key: Ed25519PrivateKey) -> str:
    return base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()


class OperatorVerifier:
    def __init__(self, keys_dir: Optional[str] = None) -> None:
        self.dir = Path(keys_dir or os.getenv("SCOUT_SEC_OPERATORS_DIR", "/etc/scout-sec/operators"))
        self._nonces: Dict[str, float] = {}
        self._lock = threading.Lock()

    def _key(self, name: str) -> Ed25519PublicKey:
        if not name.replace("-", "").replace("_", "").isalnum() or len(name) > 64:
            raise OpAuthError("bad operator name")
        p = self.dir / f"{name}.pub"
        if not p.is_file():
            raise OpAuthError("unknown operator")
        raw = base64.b64decode(p.read_text(encoding="ascii").strip())
        if len(raw) != 32:
            raise OpAuthError("operator key malformed")
        return Ed25519PublicKey.from_public_bytes(raw)

    def verify(self, header: str, method: str, path: str, body: bytes, now: Optional[float] = None) -> str:
        """Return the operator name, or raise OpAuthError."""
        parts = (header or "").split(".")
        if len(parts) != 5 or parts[0] != "v1":
            raise OpAuthError("missing or malformed operator signature")
        _, name, ts_s, nonce, sig_s = parts
        now = time.time() if now is None else now
        try:
            ts = int(ts_s)
        except ValueError as exc:
            raise OpAuthError("bad timestamp") from exc
        if abs(now - ts) > WINDOW_S:
            raise OpAuthError("stale or future-dated request")
        if not (8 <= len(nonce) <= 64):
            raise OpAuthError("bad nonce")
        key = self._key(name)
        try:
            key.verify(_b64d(sig_s), canonical(method, path, ts, nonce, body))
        except (InvalidSignature, ValueError) as exc:
            raise OpAuthError("bad signature") from exc
        with self._lock:
            self._nonces = {k: v for k, v in self._nonces.items() if now - v <= 2 * WINDOW_S}
            if f"{name}:{nonce}" in self._nonces:
                raise OpAuthError("replayed request")
            self._nonces[f"{name}:{nonce}"] = now
        return name


def new_operator_key() -> Tuple[Ed25519PrivateKey, str]:
    k = Ed25519PrivateKey.generate()
    return k, public_key_b64(k)
