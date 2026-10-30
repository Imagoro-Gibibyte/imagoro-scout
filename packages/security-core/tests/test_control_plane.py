"""Control plane: operator signing, control store, server routes, executor, runner proposals, eval."""

from __future__ import annotations

import base64
import json
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from pathlib import Path

from scout_security import executor, runner
from scout_security.blackboard import auth
from scout_security.blackboard.control import ControlStore
from scout_security.blackboard.operator_auth import (OpAuthError, OperatorVerifier, canonical, new_operator_key,
                                                     sign_request)
from scout_security.blackboard.server import ServerState, make_handler
from scout_security.blackboard.store import BlackboardStore
from scout_security.protected_nodes import CountermeasureGuard, Registry

FIXTURE_REGISTRY = Path(__file__).parent / "fixtures" / "protected_nodes.yaml"

SECRET, ADMIN, ENTRY = "s" * 64, "a" * 64, "entry-token-test"


# --- operator auth --------------------------------------------------------------

@pytest.fixture()
def op(tmp_path, monkeypatch):
    key, pub = new_operator_key()
    (tmp_path / "alice.pub").write_text(pub)
    monkeypatch.setenv("SCOUT_SEC_OPERATORS_DIR", str(tmp_path))
    return key


def test_operator_signature_roundtrip_and_rejections(op, tmp_path):
    v = OperatorVerifier(str(tmp_path))
    h = sign_request(op, "alice", "POST", "/v1/op/state", b'{"crew_paused":true}')
    assert v.verify(h, "POST", "/v1/op/state", b'{"crew_paused":true}') == "alice"
    with pytest.raises(OpAuthError, match="replayed"):
        v.verify(h, "POST", "/v1/op/state", b'{"crew_paused":true}')
    h2 = sign_request(op, "alice", "POST", "/v1/op/state", b'{"crew_paused":true}')
    with pytest.raises(OpAuthError, match="signature"):
        v.verify(h2, "POST", "/v1/op/state", b'{"crew_paused":false}')  # tampered body
    old = sign_request(op, "alice", "GET", "/v1/op/status", ts=int(time.time()) - 600)
    with pytest.raises(OpAuthError, match="stale"):
        v.verify(old, "GET", "/v1/op/status", b"")
    other, _ = new_operator_key()
    with pytest.raises(OpAuthError, match="signature"):
        v.verify(sign_request(other, "alice", "GET", "/v1/op/status"), "GET", "/v1/op/status", b"")
    with pytest.raises(OpAuthError, match="unknown"):
        v.verify(sign_request(op, "mallory", "GET", "/v1/op/status"), "GET", "/v1/op/status", b"")


def test_canonical_form_is_stable():
    # Pinned so the Rust signer (ui/src-tauri/src/sign.rs) can be checked against it.
    assert canonical("get", "/v1/op/status", 1700000000, "nonce12345", b"") == (
        b"v1\nGET\n/v1/op/status\n1700000000\nnonce12345\n"
        b"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")


# --- control store -----------------------------------------------------------------

def test_proposal_lifecycle_and_guard_deny():
    cs = ControlStore(BlackboardStore(memory=True))
    denied = cs.add_proposal(source="m", action="block_ip", target="192.168.50.10", reason="r",
                             guard_verdict="DENY", guard_reason="protected")
    assert denied["status"] == "refused"
    with pytest.raises(ValueError):
        cs.decide(denied["id"], approve=True, actor="op")
    p = cs.add_proposal(source="m", action="block_ip", target="203.0.113.9", reason="r",
                        guard_verdict="ESCALATE", guard_reason="unattributed")
    assert cs.add_proposal(source="m", action="block_ip", target="203.0.113.9", reason="dup",
                           guard_verdict="ESCALATE", guard_reason="")["id"] == p["id"]
    approved = cs.decide(p["id"], approve=True, actor="operator:alice", ttl=600)
    assert approved["status"] == "approved" and approved["expires_at"] > time.time()
    assert [x["id"] for x in cs.approved_for_execution()] == [p["id"]]
    cs.report(p["id"], host="hub-1", outcome="applied", detail="ok")
    assert cs.get_proposal(p["id"])["reports"]["hub-1"]["outcome"] == "applied"


def test_state_switches_validate():
    cs = ControlStore(BlackboardStore(memory=True))
    st = cs.set_state({"crew_paused": True, "run_now": True}, actor="op")
    assert st["crew_paused"] is True and st["run_requested_at"] > 0
    with pytest.raises(ValueError):
        cs.set_state({"executor_armed": "yes"}, actor="op")
    with pytest.raises(ValueError):
        cs.set_state({"rm_rf": True}, actor="op")


def test_retention_purges_old_events_only():
    store = BlackboardStore(memory=True)
    cs = ControlStore(store)
    old = store.write(category="events", role="sanitizer", title="old", body="b")
    store.write(category="decisions", role="manager", title="keep", body="b")
    with store._lock, store._conn() as c:
        c.execute("UPDATE entries SET created_at=? WHERE id=?", (time.time() - 20 * 86400, old.id))
    purged = cs.purge()
    assert purged["events"] == 1 and purged["decisions"] == 0


def test_revocations_persist():
    store = BlackboardStore(memory=True)
    ControlStore(store).revoke("abc", time.time() + 100)
    assert "abc" in ControlStore(store).revoked_set()


# --- server routes -----------------------------------------------------------------

@pytest.fixture()
def hub(op, tmp_path):
    store = BlackboardStore(memory=True)
    state = ServerState(store, secret=SECRET, entry_token=ENTRY, admin_secret=ADMIN)
    state.ops = OperatorVerifier(str(tmp_path))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}", state
    httpd.shutdown()
    store.close()


def _req(base, method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(base + path, data=data, method=method,
                               headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(r, timeout=5) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def _op_req(base, key, method, path, body=None):
    raw = json.dumps(body).encode() if body is not None else b""
    h = sign_request(key, "alice", method, path, raw)
    r = urllib.request.Request(base + path, data=raw or None, method=method,
                               headers={"Content-Type": "application/json", "X-Scout-Op": h})
    try:
        with urllib.request.urlopen(r, timeout=5) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def _tok(role, device="crew-1"):
    return {"Authorization": "Bearer " + auth.mint_token(SECRET, role=role, categories=[], device_id=device)}


def test_operator_routes_end_to_end(hub, op):
    base, state = hub
    assert _req(base, "GET", "/v1/op/status")[0] == 401  # unsigned
    assert _req(base, "GET", "/v1/op/status", headers={"Authorization": f"Bearer {ADMIN}"})[0] == 401
    code, st = _op_req(base, op, "GET", "/v1/op/status")
    assert code == 200 and st["state"]["executor_armed"] is False
    code, st = _op_req(base, op, "POST", "/v1/op/state", {"executor_armed": True, "run_now": True})
    assert code == 200 and st["executor_armed"] is True and st["executor_armed__by"] == "operator:alice"

    # manager proposes, operator approves, executor fetches + reports
    code, p = _req(base, "POST", "/v1/control/proposals",
                   {"action": "block_ip", "target": "203.0.113.9", "reason": "bruteforce",
                    "guard_verdict": "ESCALATE", "guard_reason": "unattributed"}, _tok("manager"))
    assert code == 200 and p["status"] == "pending"
    assert _req(base, "POST", "/v1/control/proposals", {"action": "block_ip", "target": "1.1.1.1",
                "guard_verdict": "ALLOW"}, _tok("alert"))[0] == 403
    assert _req(base, "GET", "/v1/control/approved", headers=_tok("manager"))[0] == 403
    code, d = _op_req(base, op, "POST", f"/v1/op/proposals/{p['id']}/decide", {"approve": True, "ttl": 900})
    assert code == 200 and d["status"] == "approved"
    code, ap = _req(base, "GET", "/v1/control/approved", headers=_tok("executor", "hub-1"))
    assert code == 200 and [x["id"] for x in ap] == [p["id"]]
    code, _ = _req(base, "POST", "/v1/control/report", {"id": p["id"], "outcome": "dry-run"}, _tok("executor", "hub-1"))
    assert code == 200
    code, audit = _op_req(base, op, "GET", "/v1/op/audit?limit=20")
    assert code == 200 and {a["action"] for a in audit} >= {"set_state", "propose", "approved", "dry-run"}


def test_executor_role_onboards_without_categories(hub):
    base, _ = hub
    code, body = _req(base, "POST", "/v1/keys/authorize", {"role": "executor", "proof": {"entry_token": ENTRY}})
    assert code == 200 and body["categories"] == []


# --- executor ------------------------------------------------------------------------

class _FakeHub:
    def __init__(self, armed, approved):
        self.armed, self.approved, self.reports = armed, approved, []

    def control_state(self, role):
        return {"executor_armed": self.armed}

    def approved_actions(self):
        return self.approved

    def report_action(self, pid, outcome, detail=""):
        self.reports.append((pid, outcome, detail))


class _FakeNft:
    def __init__(self):
        self.calls, self.table = [], False

    def __call__(self, args, stdin):
        self.calls.append(args)
        if args[:3] == ["list", "table", "inet"]:
            return subprocess.CompletedProcess(args, 0 if self.table else 1, "", "")
        if args[:1] == ["-f"]:
            self.table = True
        if args[:1] == ["delete"]:
            self.table = False
        return subprocess.CompletedProcess(args, 0, "", "")


def _guard():
    return CountermeasureGuard(Registry.load(FIXTURE_REGISTRY), training=False)


def _p(pid, target, ttl=600):
    return {"id": pid, "action": "block_ip", "target": target, "expires_at": time.time() + ttl, "reports": {}}


def test_executor_enforce_applies_and_rechecks_guard():
    hub_, nft = _FakeHub(True, [_p("a", "203.0.113.9"), _p("b", "192.168.50.10"), _p("c", "2001:db8::1")]), _FakeNft()
    res = executor.Executor(hub_, _guard(), host="hub-1", mode="enforce", nft=nft).run_once()
    outcomes = {pid: o for pid, o, _ in hub_.reports}
    assert outcomes == {"a": "applied", "b": "refused", "c": "refused"}
    assert any(c[:4] == ["add", "element", "inet", "scout_sec"] and "203.0.113.9" in c[-1] for c in nft.calls)
    assert not any("192.168.50.10" in " ".join(c) for c in nft.calls)
    assert res["handled"] == 3


def test_executor_dry_run_never_touches_nft():
    hub_, nft = _FakeHub(True, [_p("a", "203.0.113.9")]), _FakeNft()
    executor.Executor(hub_, _guard(), host="nuc", mode="dry-run", nft=nft).run_once()
    assert hub_.reports[0][1] == "dry-run"
    assert not any(c[0] in {"add", "-f"} for c in nft.calls)


def test_executor_disarm_removes_table_and_skips_handled():
    nft = _FakeNft()
    nft.table = True
    res = executor.Executor(_FakeHub(False, []), _guard(), host="h", mode="enforce", nft=nft).run_once()
    assert res["table_removed"] is True and nft.table is False
    done = _p("a", "203.0.113.9")
    done["reports"] = {"h": {"outcome": "applied"}}
    hub_ = _FakeHub(True, [done])
    executor.Executor(hub_, _guard(), host="h", mode="enforce", nft=_FakeNft()).run_once()
    assert hub_.reports == []


# --- runner proposals ----------------------------------------------------------------

def test_runner_turns_blocks_into_guarded_proposals():
    submitted = []

    def submit(**kw):
        submitted.append(kw)
        return {"id": "p1", "status": "refused" if kw["guard_verdict"] == "DENY" else "pending"}

    text = json.dumps({"decision": "ESCALATE", "countermeasures": [
        {"action": "block_ip", "target": "203.0.113.9", "reason": "bruteforce", "guard_verdict": "ALLOW"},
        {"action": "block_ip", "target": "192.168.50.10", "reason": "spoofed?"},
        {"action": "observe", "target": "198.51.100.7"},
        {"action": "Monitor everything", "guard_verdict": "DENIED"},
    ]})
    out = json.loads(runner.process_countermeasures(text, guard=_guard(), submit=submit))
    cms = out["countermeasures"]
    assert cms[0]["guard_verdict"] == "ESCALATE" and cms[0]["proposal_status"] == "pending"
    assert cms[1]["guard_verdict"] == "DENY"
    assert cms[2]["guard_verdict"] == "ALLOW" and "proposal_id" not in cms[2]
    assert cms[3]["guard_verdict"] == runner.NOT_EVALUATED
    assert [s["target"] for s in submitted] == ["203.0.113.9", "192.168.50.10"]


def test_runner_respects_pause_and_run_now(monkeypatch, tmp_path):
    monkeypatch.setattr(runner, "STATE_DIR", tmp_path)

    class BB:
        def __init__(self, st):
            self.st = st

        def control_state(self, role):
            return self.st

        def read(self, **kw):
            return []

    assert runner.run_cycle(client=BB({"crew_paused": True}))["reason"] == "crew paused by operator"
    assert runner.run_cycle(client=BB({"run_requested_at": 0}), if_requested=True)["reason"] == "no run requested"
    res = runner.run_cycle(client=BB({"run_requested_at": time.time()}), if_requested=True, dry_run=True)
    assert res["reason"] == "dry-run"
    assert runner.run_cycle(client=BB({"run_requested_at": 1}), if_requested=True)["reason"] == "no run requested"
