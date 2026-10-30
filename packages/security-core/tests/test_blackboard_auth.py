"""End-to-end checks of the blackboard hardening (docs/SECURITY_AUDIT.md F-01..F-04)."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from scout_security.blackboard import auth
from scout_security.blackboard.server import ServerState, make_handler
from scout_security.blackboard.store import BlackboardStore

SECRET = "s" * 64
ADMIN = "a" * 64
ENTRY = "entry-token-for-tests"


@pytest.fixture()
def server():
    store = BlackboardStore(memory=True)
    state = ServerState(store, secret=SECRET, entry_token=ENTRY, admin_secret=ADMIN)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}", store
    httpd.shutdown()
    store.close()


def _call(base, method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def test_authorize_cannot_self_issue_manager(server):
    base, _ = server
    code, body = _call(base, "POST", "/v1/keys/authorize", {"role": "manager", "proof": {"entry_token": ENTRY}})
    assert code == 403, body


def test_authorize_device_role_ok_and_scoped(server):
    base, _ = server
    code, body = _call(base, "POST", "/v1/keys/authorize", {"role": "alert", "proof": {"entry_token": ENTRY}})
    assert code == 200
    assert body["role"] == "alert"
    assert "dev_debug" not in body["categories"]


def test_authorize_rejects_captcha_only(server):
    base, _ = server
    code, _ = _call(base, "POST", "/v1/keys/authorize", {"role": "alert", "proof": {"captcha_token": "x"}})
    assert code == 401


def test_issue_rejects_signing_secret_as_admin(server):
    base, _ = server
    code, _ = _call(base, "POST", "/v1/keys/issue", {"role": "manager"}, {"X-Scout-Admin": SECRET})
    assert code == 401
    code, body = _call(base, "POST", "/v1/keys/issue", {"role": "manager"}, {"X-Scout-Admin": ADMIN})
    assert code == 200 and body["claims"]["role"] == "manager"


def test_stats_requires_token(server):
    base, _ = server
    code, _ = _call(base, "GET", "/v1/stats")
    assert code == 401


def test_token_without_exp_rejected():
    tok = auth.mint_token(SECRET, role="alert", categories=["events"])
    payload = auth.parse_token(tok)
    payload.pop("exp")
    p64 = auth._b64e(json.dumps(payload, separators=(",", ":")).encode())
    forged = f"{p64}.{auth._sign(SECRET, p64)}"
    with pytest.raises(auth.TokenError):
        auth.verify_token(SECRET, forged)


def test_extra_claims_cannot_override_role():
    tok = auth.mint_token(SECRET, role="alert", categories=["events"], extra={"role": "manager", "kind": "device"})
    assert auth.verify_token(SECRET, tok)["role"] == "alert"


def test_write_author_comes_from_token(server):
    base, _ = server
    tok = auth.mint_token(SECRET, role="alert", categories=["events"], device_id="dev-123")
    code, body = _call(base, "POST", "/v1/write",
                       {"category": "events", "role": "alert", "title": "t", "body": "b", "author": "sec_manager"},
                       {"Authorization": f"Bearer {tok}"})
    assert code == 200, body
    assert body["author"] == "dev-123"


def test_body_size_cap(server):
    import http.client
    from urllib.parse import urlparse

    u = urlparse(server[0])
    conn = http.client.HTTPConnection(u.hostname, u.port, timeout=5)
    # Claim a 300 KiB body; the server must refuse before reading it.
    conn.putrequest("POST", "/v1/write")
    conn.putheader("Content-Length", str(300 * 1024))
    conn.endheaders()
    assert conn.getresponse().status == 413
    conn.close()


def test_supersede_requires_owner_or_manager():
    store = BlackboardStore(memory=True)
    e = store.write(category="findings", role="alert", title="f", body="b")
    with pytest.raises(PermissionError):
        store.write(category="findings", role="intel", title="hide", body="b", supersede_id=e.id)
    store.write(category="findings", role="manager", title="sum", body="b", kind="summary", supersede_id=e.id)
    store.close()
