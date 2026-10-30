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

"""Minimal multi-machine HTTP frontend for the Scout blackboard.

  python -m scout_security.blackboard.server --host 127.0.0.1 --port 8765

Key authorization (token auth): when SCOUT_BLACKBOARD_TOKEN_SECRET is set, data
endpoints require a category-scoped bearer token. Tokens are minted at runtime:

  POST /v1/keys/authorize  entry-token gated -> device-id + token for a DEVICE role only
  POST /v1/keys/issue      admin secret (X-Scout-Admin) -> any role, incl. manager/dev
  POST /v1/keys/revoke     admin secret -> revoke a token jti

The admin secret (SCOUT_BLACKBOARD_ADMIN_SECRET) is separate from the token
signing secret and must differ from it: the signing key never travels in a
header. Bind a loopback or VPN address, not 0.0.0.0: this is plain HTTP and
bearer tokens must not cross untrusted segments.
  GET  /v1/audit           manager bearer token -> moderation/audit log + per-token volume

No bootstrap or deploy-time minting. Memory mode (--memory) runs the store in
RAM for per-peer sandbox contexts; the hub stays file-backed.
"""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
import uuid
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Deque, Dict, Optional
from urllib.parse import parse_qs, urlparse

from scout_security.blackboard import auth
from scout_security.blackboard.control import ControlStore
from scout_security.blackboard.operator_auth import HEADER as OP_HEADER
from scout_security.blackboard.operator_auth import OpAuthError, OperatorVerifier
from scout_security.blackboard.store import CATEGORIES, DEVICE_ROLES, ROLE_ACL, BlackboardStore

MAX_AUDIT = 2000
MAX_BODY_BYTES = 256 * 1024


class ServerState:
    """Mutable per-server state shared across handler threads."""

    def __init__(
        self,
        store: BlackboardStore,
        secret: str = "",
        entry_token: str = "",
        admin_secret: str = "",
    ) -> None:
        self.store = store
        self.secret = secret
        self.entry_token = entry_token
        self.admin_secret = admin_secret
        self.control = ControlStore(store)
        self.ops = OperatorVerifier()
        # Revocations persist across restarts (they used to reset in memory).
        self.revoked: set[str] = self.control.revoked_set()
        self.audit: Deque[Dict[str, Any]] = deque(maxlen=MAX_AUDIT)
        self.volume: Dict[str, int] = {}
        self._lock = threading.RLock()

    def log(self, kind: str, **fields: Any) -> Dict[str, Any]:
        event = {"ts": time.time(), "kind": kind, **fields}
        with self._lock:
            self.audit.append(event)
            jti = (fields.get("jti") or "").strip()
            if jti:
                self.volume[jti] = self.volume.get(jti, 0) + 1
        return event

    def audit_snapshot(self, limit: int = 200) -> Dict[str, Any]:
        with self._lock:
            events = list(self.audit)[-limit:]
            volume = dict(sorted(self.volume.items(), key=lambda kv: -kv[1])[:50])
        return {"events": events, "volume": volume}

    def revoke(self, jti: str, exp: float = 0.0) -> None:
        with self._lock:
            self.revoked.add(jti)
        self.control.revoke(jti, exp or time.time() + 86400)

    def status(self) -> Dict[str, Any]:
        """Operator dashboard summary (no raw event bodies)."""
        now = time.time()
        hosts: Dict[str, Dict[str, Any]] = {}
        counts: Dict[str, int] = {}
        last_decision = None
        with self.store._lock, self.store._conn() as c:
            for row in c.execute("SELECT category, COUNT(*) AS n FROM entries WHERE created_at > ? GROUP BY category", (now - 86400,)):
                counts[row["category"]] = row["n"]
            for row in c.execute("SELECT tags, created_at, title FROM entries WHERE category='events' AND created_at > ? ORDER BY created_at DESC LIMIT 2000", (now - 86400,)):
                tags = json.loads(row["tags"] or "[]")
                host = next((t[5:] for t in tags if t.startswith("host:")), None)
                if not host:
                    continue
                h = hosts.setdefault(host, {"last_event_at": row["created_at"], "events_24h": 0, "high_24h": 0})
                h["events_24h"] += 1
                if "sev:high" in tags or "sev:medium" in tags:
                    h["high_24h"] += 1
            row = c.execute("SELECT id, title, body, author, created_at, tags FROM entries WHERE category='decisions' ORDER BY created_at DESC LIMIT 1").fetchone()
            if row:
                last_decision = {"id": row["id"], "title": row["title"], "author": row["author"],
                                 "created_at": row["created_at"], "body": row["body"][:4000], "tags": json.loads(row["tags"] or "[]")}
        return {
            "now": now,
            "state": self.control.get_state(),
            "hosts": hosts,
            "counts_24h": counts,
            "last_decision": last_decision,
            "proposals": {
                "pending": len(self.control.list_proposals("pending", 500)),
                "active_approved": len(self.control.approved_for_execution()),
            },
        }


def _json_response(handler: BaseHTTPRequestHandler, code: int, payload: Any) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def _bearer_token(handler: BaseHTTPRequestHandler) -> str:
    header = handler.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[len("bearer ") :].strip()
    return ""


def _client_ip(handler: BaseHTTPRequestHandler, state: ServerState) -> str:
    return handler.client_address[0]


def make_handler(state: ServerState):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:  # quieter
            print(f"[blackboard] {self.address_string()} {fmt % args}")

        # ---- auth helpers -------------------------------------------------

        def _require_token(self) -> Optional[Dict[str, Any]]:
            """Return verified claims, or write a 401/403 and return None."""
            if not state.secret:
                return {}  # auth disabled
            token = _bearer_token(self)
            if not token:
                return self._reject(401, "missing bearer token")
            try:
                claims = auth.verify_token(state.secret, token)
            except auth.TokenError as exc:
                state.log("deny", why=str(exc), ip=_client_ip(self, state))
                return self._reject(401, f"invalid token: {exc}")
            jti = str(claims.get("jti") or "")
            if jti in state.revoked:
                state.log("deny", why="revoked", jti=jti, ip=_client_ip(self, state))
                return self._reject(401, "token revoked")
            return claims

        def _enforce_request(self, claims: Dict[str, Any], *, role: str, category: str, action: str) -> bool:
            """Token role/category binding. Returns True on approval."""
            if not state.secret:
                return True
            if not claims:
                return False
            cats = claims.get("categories") or []
            if not cats or category not in cats:
                state.log(
                    "deny", why="category_not_scoped", role=role, category=category,
                    action=action, jti=claims.get("jti"), ip=_client_ip(self, state),
                )
                self._reject(403, f"token is not scoped to category '{category}'")
                return False
            tok_role = (claims.get("role") or "").strip().lower()
            req_role = (role or "").strip().lower()
            if req_role and req_role != tok_role and not (tok_role == "manager" and action in {"read", "snapshot", "audit"}):
                self._reject(403, f"token role '{tok_role}' does not match requested role '{req_role}'")
                return False
            return True

        def _reject(self, code: int, message: str):
            _json_response(self, code, {"error": message})
            return None

        def _require_admin(self) -> bool:
            """Master-secret gate (X-Scout-Admin) for issue/revoke."""
            if not state.secret or not state.admin_secret or not self._secure_eq(
                self.headers.get("X-Scout-Admin") or "", state.admin_secret
            ):
                self._reject(401, "admin secret required (X-Scout-Admin)")
                return False
            return True

        # ---- HTTP --------------------------------------------------------

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            qs = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            try:
                if parsed.path.startswith("/v1/op/"):
                    return self._op_route("GET", parsed, b"", {})
                if parsed.path.startswith("/v1/control/"):
                    return self._control_route("GET", parsed, {})
                if parsed.path in {"/", "/health"}:
                    return _json_response(self, 200, {"ok": True, "service": "scout-blackboard", "auth": bool(state.secret)})
                if parsed.path == "/v1/stats":
                    # Stats reveal db path, hostname and volumes: token required.
                    if self._require_token() is None:
                        return
                    return _json_response(self, 200, state.store.stats())
                if parsed.path == "/v1/audit":
                    claims = self._require_token()
                    if claims is None:
                        return
                    if (claims.get("role") or "").lower() != "manager":
                        return self._reject(403, "audit requires a manager token")
                    state.log("audit", role="manager", jti=claims.get("jti"), ip=_client_ip(self, state))
                    return _json_response(self, 200, state.audit_snapshot(limit=int(qs.get("limit") or 200)))
                if parsed.path in {"/v1/read", "/v1/snapshot"}:
                    claims = self._require_token()
                    if claims is None:
                        return
                    role = qs.get("role") or ""
                    category = qs.get("category") or "findings"
                    if not self._enforce_request(claims, role=role, category=category, action="read"):
                        return
                    if parsed.path == "/v1/read":
                        limit = int(qs.get("limit") or 20)
                        since = float(qs["since"]) if qs.get("since") else None
                        entries = state.store.read(
                            category=category,
                            role=role,
                            limit=limit,
                            active_only=qs.get("active_only", "1") not in {"0", "false", "False"},
                            kind=qs.get("kind"),
                            tag=qs.get("tag"),
                            query=qs.get("query"),
                            since=since,
                        )
                        state.log("read", role=role, category=category, jti=claims.get("jti"), ip=_client_ip(self, state))
                        return _json_response(self, 200, [e.to_dict() for e in entries])
                    snap = state.store.snapshot(
                        role=role,
                        limit_per_category=int(qs.get("limit_per_category") or 15),
                    )
                    state.log("snapshot", role=role, jti=claims.get("jti"), ip=_client_ip(self, state))
                    return _json_response(self, 200, snap)
                return _json_response(self, 404, {"error": "not found"})
            except PermissionError as e:
                return _json_response(self, 403, {"error": str(e)})
            except Exception as e:  # noqa: BLE001
                return _json_response(self, 400, {"error": str(e)})

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return _json_response(self, 400, {"error": "bad content-length"})
            if length < 0 or length > MAX_BODY_BYTES:
                return _json_response(self, 413, {"error": "body too large"})
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload: Dict[str, Any] = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return _json_response(self, 400, {"error": "invalid json"})
            try:
                if parsed.path.startswith("/v1/op/"):
                    return self._op_route("POST", parsed, raw, payload)
                if parsed.path.startswith("/v1/control/"):
                    return self._control_route("POST", parsed, payload)
                if parsed.path == "/v1/keys/authorize":
                    return self._do_authorize(payload)
                if parsed.path == "/v1/keys/issue":
                    return self._do_issue(payload)
                if parsed.path == "/v1/keys/revoke":
                    return self._do_revoke(payload)
                if parsed.path == "/v1/write":
                    if not state.secret:
                        entry = state.store.write(**payload)
                        return _json_response(self, 200, entry.to_dict())
                    claims = self._require_token()
                    if claims is None:
                        return
                    role = str(payload.get("role") or "")
                    category = str(payload.get("category") or "")
                    if not self._enforce_request(claims, role=role, category=category, action="write"):
                        return
                    meta = dict(payload.get("meta") or {})
                    meta.setdefault("device_id", (claims.get("device_id") or ""))
                    meta.setdefault("token_jti", (claims.get("jti") or ""))
                    write_payload = dict(payload)
                    write_payload["meta"] = meta
                    # Attribution comes from the verified token, never the body.
                    write_payload["author"] = claims.get("device_id") or claims.get("role") or "unknown"
                    entry = state.store.write(**write_payload)
                    state.log("write", role=role, category=category, entry_kind=entry.kind, jti=claims.get("jti"), ip=_client_ip(self, state))
                    return _json_response(self, 200, entry.to_dict())
                return _json_response(self, 404, {"error": "not found"})
            except PermissionError as e:
                return _json_response(self, 403, {"error": str(e)})
            except Exception as e:  # noqa: BLE001
                return _json_response(self, 400, {"error": str(e)})

        # ---- key endpoints ----------------------------------------------

        def _do_authorize(self, payload: Dict[str, Any]) -> None:
            """Proof-gated device onboarding: assign device id + role-scoped token."""
            if not state.secret:
                return _json_response(self, 503, {"error": "key authorization not configured; set SCOUT_BLACKBOARD_TOKEN_SECRET"})
            proof = payload.get("proof") or {}
            entry_proof = str(proof.get("entry_token") or "").strip()
            captcha = str(proof.get("captcha_token") or "").strip()
            del captcha  # Scout accepted any non-empty captcha string as proof (F-02)
            if not state.entry_token:
                return _json_response(self, 503, {"error": "device onboarding disabled; set SCOUT_BLACKBOARD_ENTRY_TOKEN"})
            if not entry_proof or not self._secure_eq(entry_proof, state.entry_token):
                state.log("deny", why="bad_entry_proof", ip=_client_ip(self, state))
                return _json_response(self, 401, {"error": "invalid entry proof"})
            sent_device = str(payload.get("device_id") or "").strip()
            device_id = sent_device or uuid.uuid4().hex
            role = state.store.normalize_role(str(payload.get("role") or self._default_role()))
            if role not in DEVICE_ROLES:
                # An entry-token holder must not be able to self-issue manager/dev (F-01).
                state.log("deny", why="authorize_role_not_device", role=role, ip=_client_ip(self, state))
                return _json_response(self, 403, {"error": f"role '{role}' cannot self-onboard; use /v1/keys/issue"})
            try:
                categories = _readable_categories(state.store, role, payload.get("categories"))
            except ValueError as exc:
                return _json_response(self, 400, {"error": str(exc)})
            ttl = max(60, min(int(payload.get("ttl") or 3600), 86400))
            token = auth.mint_token(
                state.secret,
                role=role,
                categories=categories,
                device_id=device_id,
                ttl=ttl,
                extra={
                    "observed_ip": _client_ip(self, state),
                    "kind": "device",
                },
            )
            claims = auth.parse_token(token)
            state.log(
                "authorize", role=role, device_id=device_id,
                jti=claims["jti"], ip=_client_ip(self, state), categories=categories,
            )
            return _json_response(
                self, 200,
                {
                    "ok": True,
                    "token": token,
                    "device_id": device_id,
                    "role": role,
                    "categories": categories,
                    "expires_in": ttl,
                    "observed_ip": _client_ip(self, state),
                },
            )

        def _do_issue(self, payload: Dict[str, Any]) -> None:
            """Master-secret token mint for manager/CLI (moderation path)."""
            if not self._require_admin():
                return
            role = state.store.normalize_role(str(payload.get("role") or ""))
            if not role:
                return _json_response(self, 400, {"error": "role required"})
            try:
                categories = _readable_categories(state.store, role, payload.get("categories"))
            except ValueError as exc:
                return _json_response(self, 400, {"error": str(exc)})
            device_id = str(payload.get("device_id") or "").strip()
            ttl = max(60, min(int(payload.get("ttl") or 3600), 86400))
            token = auth.mint_token(
                state.secret, role=role, categories=categories,
                device_id=device_id, ttl=ttl,
            )
            claims = auth.parse_token(token)
            state.log("issue", role=role, device_id=device_id, jti=claims["jti"], ip=_client_ip(self, state), categories=categories)
            return _json_response(
                self, 200,
                {"ok": True, "token": token, "claims": claims, "expires_in": ttl},
            )

        def _do_revoke(self, payload: Dict[str, Any]) -> None:
            if not self._require_admin():
                return
            jti = str(payload.get("jti") or "").strip()
            if not jti:
                return _json_response(self, 400, {"error": "jti required"})
            state.revoke(jti)
            state.log("revoke", jti=jti, ip=_client_ip(self, state))
            return _json_response(self, 200, {"ok": True, "revoked_jti": jti})

        # ---- operator API (Ed25519-signed; used by the desktop console) -------

        def _op_route(self, method: str, parsed, raw: bytes, payload: Dict[str, Any]) -> None:
            path_q = parsed.path + (f"?{parsed.query}" if parsed.query else "")
            try:
                op = state.ops.verify(self.headers.get(OP_HEADER, ""), method, path_q, raw if method == "POST" else b"")
            except OpAuthError as exc:
                state.log("deny", why=f"op:{exc}", ip=_client_ip(self, state))
                return _json_response(self, 401, {"error": "operator authentication failed"})
            qs = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            actor = f"operator:{op}"
            p = parsed.path
            if method == "GET" and p == "/v1/op/whoami":
                return _json_response(self, 200, {"operator": op})
            if method == "GET" and p == "/v1/op/status":
                return _json_response(self, 200, state.status())
            if method == "GET" and p == "/v1/op/feed":
                cat = state.store.normalize_category(qs.get("category") or "decisions")
                entries = state.store.read(category=cat, role="manager", limit=int(qs.get("limit") or 50),
                                           since=float(qs["since"]) if qs.get("since") else None)
                return _json_response(self, 200, [e.to_dict() for e in entries])
            if method == "GET" and p == "/v1/op/proposals":
                return _json_response(self, 200, state.control.list_proposals(qs.get("status") or None, int(qs.get("limit") or 100)))
            if method == "GET" and p == "/v1/op/audit":
                return _json_response(self, 200, state.control.audit_tail(int(qs.get("limit") or 100)))
            if method == "POST" and p == "/v1/op/state":
                try:
                    return _json_response(self, 200, state.control.set_state(payload, actor=actor))
                except ValueError as exc:
                    return _json_response(self, 400, {"error": str(exc)})
            if method == "POST" and p.startswith("/v1/op/proposals/") and p.endswith("/decide"):
                pid = p[len("/v1/op/proposals/"):-len("/decide")]
                try:
                    res = state.control.decide(pid, approve=bool(payload.get("approve")), actor=actor, ttl=payload.get("ttl"))
                except KeyError:
                    return _json_response(self, 404, {"error": "no such proposal"})
                except ValueError as exc:
                    return _json_response(self, 409, {"error": str(exc)})
                return _json_response(self, 200, res)
            return _json_response(self, 404, {"error": "not found"})

        # ---- host control API (role tokens) -----------------------------------

        def _control_route(self, method: str, parsed, payload: Dict[str, Any]) -> None:
            claims = self._require_token()
            if claims is None:
                return
            role = (claims.get("role") or "").lower()
            host = claims.get("device_id") or "unknown"
            p = parsed.path
            if method == "GET" and p == "/v1/control/state":
                return _json_response(self, 200, state.control.get_state())
            if method == "POST" and p == "/v1/control/proposals":
                if role != "manager":
                    return self._reject(403, "proposals require a manager token")
                try:
                    res = state.control.add_proposal(
                        source=f"manager:{host}", action=str(payload["action"]), target=str(payload["target"]),
                        reason=str(payload.get("reason") or ""), guard_verdict=str(payload["guard_verdict"]),
                        guard_reason=str(payload.get("guard_reason") or ""), ttl=int(payload.get("ttl") or 3600))
                except (KeyError, ValueError) as exc:
                    return _json_response(self, 400, {"error": f"bad proposal: {exc}"})
                return _json_response(self, 200, res)
            if method == "GET" and p == "/v1/control/approved":
                if role != "executor":
                    return self._reject(403, "executor token required")
                return _json_response(self, 200, state.control.approved_for_execution())
            if method == "POST" and p == "/v1/control/report":
                if role != "executor":
                    return self._reject(403, "executor token required")
                try:
                    res = state.control.report(str(payload["id"]), host=host, outcome=str(payload["outcome"]),
                                               detail=str(payload.get("detail") or ""))
                except KeyError:
                    return _json_response(self, 404, {"error": "no such proposal"})
                except ValueError as exc:
                    return _json_response(self, 400, {"error": str(exc)})
                return _json_response(self, 200, {"ok": True, "status": res["status"]})
            return _json_response(self, 404, {"error": "not found"})

        @staticmethod
        def _secure_eq(a: str, b: str) -> bool:
            import hmac

            return hmac.compare_digest(a, b)

        def _default_role(self) -> str:
            writers = getattr(state.store, "sandbox_writers", None)
            if writers:
                return sorted(writers)[0]
            return "alert"

    return Handler


def _readable_categories(store: BlackboardStore, role: str, requested: Any) -> list:
    """Validate requested categories: known, and accessible to the role."""
    cats = [store.normalize_category(str(c)) for c in (requested or []) if str(c).strip()]
    if role == "executor":
        if cats:
            raise ValueError("executor tokens carry no blackboard categories")
        return []  # control endpoints only
    if not cats:
        cats = [c for c in CATEGORIES if role in ROLE_ACL[c]["read"]]
    for c in cats:
        acl = ROLE_ACL[c]
        if role not in acl["read"] and role not in acl["write"]:
            raise ValueError(f"role '{role}' has no access to category '{c}'")
    if not cats:
        raise ValueError(f"role '{role}' has no blackboard access")
    return sorted(set(cats))


_LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _noauth_bind_refused(host: str, secret: str) -> bool:
    """Fail closed: no token secret + a non-loopback bind would publish an
    unauthenticated read/write blackboard to the whole LAN/mesh. Allow it only
    when explicitly requested via SCOUT_BLACKBOARD_ALLOW_NOAUTH=1."""
    if secret:
        return False
    if host.strip().lower() in _LOOPBACK_HOSTS or host.startswith("127."):
        return False
    return os.getenv("SCOUT_BLACKBOARD_ALLOW_NOAUTH", "0") not in {"1", "true", "True", "yes"}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Scout multi-machine blackboard server")
    p.add_argument("--host", default=os.getenv("SCOUT_BLACKBOARD_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.getenv("SCOUT_BLACKBOARD_PORT", "8765")))
    p.add_argument("--db", default=os.getenv("SCOUT_BLACKBOARD_PATH", ""))
    p.add_argument(
        "--memory",
        action="store_true",
        default=os.getenv("SCOUT_BLACKBOARD_MEMORY", "0") not in {"", "0", "false", "False"},
        help="Run store in RAM (per-peer sandbox context). Hub stays file-backed.",
    )
    p.add_argument("--secret", default=os.getenv("SCOUT_BLACKBOARD_TOKEN_SECRET", ""))
    p.add_argument("--entry-token", default=os.getenv("SCOUT_BLACKBOARD_ENTRY_TOKEN", ""))
    p.add_argument("--admin-secret", default=os.getenv("SCOUT_BLACKBOARD_ADMIN_SECRET", ""))
    p.add_argument(
        "--sandbox-writers",
        default=os.getenv("SCOUT_BLACKBOARD_SANDBOX_WRITERS", ""),
        help="CSV roles allowed to write raw events (default: ACL)",
    )
    args = p.parse_args(argv)
    if _noauth_bind_refused(args.host, args.secret):
        print(
            f"scout blackboard: refusing to listen on {args.host} without SCOUT_BLACKBOARD_TOKEN_SECRET "
            "(every client could read and write). Set the secret, bind --host 127.0.0.1, or set "
            "SCOUT_BLACKBOARD_ALLOW_NOAUTH=1 to accept an unauthenticated network blackboard."
        )
        return 2
    if args.secret and args.admin_secret and args.admin_secret == args.secret:
        print("scout blackboard: SCOUT_BLACKBOARD_ADMIN_SECRET must differ from the token signing secret.")
        return 2
    db = Path(args.db).expanduser() if args.db else None
    sandbox_writers = None
    if args.sandbox_writers.strip():
        sandbox_writers = [w.strip() for w in args.sandbox_writers.split(",") if w.strip()]
    store = BlackboardStore(db_path=db, memory=args.memory, sandbox_writers=sandbox_writers)
    state = ServerState(store, secret=args.secret, entry_token=args.entry_token, admin_secret=args.admin_secret)
    try:
        httpd = ThreadingHTTPServer((args.host, args.port), make_handler(state))
    except OSError as exc:
        print(f"scout blackboard: cannot bind {args.host}:{args.port} — {exc}")
        return 1
    def _retention_loop() -> None:
        while True:
            try:
                purged = state.control.purge()
                if any(purged.values()):
                    print(f"retention purge: {purged}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"retention purge failed: {exc}", flush=True)
            time.sleep(3600)

    threading.Thread(target=_retention_loop, name="retention", daemon=True).start()
    print(f"scout blackboard listening on http://{args.host}:{args.port}")
    print(f"db={store.db_path} mode={'memory' if store.memory else 'file'}")
    print(f"auth={'enabled' if state.secret else 'disabled'} sandbox_writers={sorted(store.sandbox_writers) if store.sandbox_writers is not None else 'acl-only'}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nshutdown")
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())