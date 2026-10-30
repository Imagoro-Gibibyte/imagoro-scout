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

"""Control plane state on the hub: switches, proposals, revocations, retention.

Shares the blackboard's SQLite file (separate tables). Three kinds of callers:
- operators (UI), authenticated by Ed25519-signed requests (operator_auth.py)
- the crew runner (manager token): submits countermeasure proposals
- executors (executor token): fetch approved actions, report what they did

Proposal lifecycle:
  pending  --operator approve-->  approved --executor--> applied | refused | dry-run
           --operator reject--->  rejected
  (guard DENY is stored directly as refused and can never be approved)
  approved/applied rows expire at expires_at (the nft element times out too).
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

DEFAULT_STATE = {
    "crew_paused": False,
    "collect_paused": False,
    "executor_armed": False,  # remote half of the two-key arm; hosts also need SCOUT_SEC_COUNTERMEASURES=enforce
    "run_requested_at": 0.0,
}
BOOL_KEYS = ("crew_paused", "collect_paused", "executor_armed")

# Retention (seconds) per category; proposals kept 30 days after their last change.
RETENTION = {
    "events": 14 * 86400,
    "findings": 180 * 86400,
    "decisions": 180 * 86400,
    "dev_debug": 30 * 86400,
    "telemetry": 365 * 86400,
}
PROPOSAL_RETENTION = 30 * 86400
MAX_BLOCK_TTL = 7 * 86400
DEFAULT_BLOCK_TTL = 3600


class ControlStore:
    def __init__(self, store) -> None:
        self.store = store
        with store._lock, store._conn() as c:
            c.execute("CREATE TABLE IF NOT EXISTS control_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at REAL NOT NULL, updated_by TEXT NOT NULL)")
            c.execute(
                """CREATE TABLE IF NOT EXISTS proposals (
                    id TEXT PRIMARY KEY, created_at REAL NOT NULL, updated_at REAL NOT NULL,
                    source TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
                    reason TEXT NOT NULL, guard_verdict TEXT NOT NULL, guard_reason TEXT NOT NULL,
                    status TEXT NOT NULL, decided_by TEXT, ttl INTEGER NOT NULL,
                    expires_at REAL, reports TEXT NOT NULL DEFAULT '{}')"""
            )
            c.execute("CREATE TABLE IF NOT EXISTS revoked (jti TEXT PRIMARY KEY, exp REAL NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS audit (ts REAL NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL)")

    # --- state ------------------------------------------------------------------
    def get_state(self) -> Dict[str, Any]:
        out = dict(DEFAULT_STATE)
        with self.store._lock, self.store._conn() as c:
            for row in c.execute("SELECT key, value, updated_at, updated_by FROM control_state"):
                out[row["key"]] = json.loads(row["value"])
                out[f"{row['key']}__by"] = row["updated_by"]
                out[f"{row['key']}__at"] = row["updated_at"]
        return out

    def set_state(self, changes: Dict[str, Any], *, actor: str) -> Dict[str, Any]:
        now = time.time()
        clean: Dict[str, Any] = {}
        for k, v in changes.items():
            if k in BOOL_KEYS:
                if not isinstance(v, bool):
                    raise ValueError(f"{k} must be a boolean")
                clean[k] = v
            elif k == "run_now" and v is True:
                clean["run_requested_at"] = now
            else:
                raise ValueError(f"unknown control key '{k}'")
        with self.store._lock, self.store._conn() as c:
            for k, v in clean.items():
                c.execute("INSERT INTO control_state(key,value,updated_at,updated_by) VALUES(?,?,?,?) "
                          "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by",
                          (k, json.dumps(v), now, actor))
        self.audit(actor, "set_state", clean)
        return self.get_state()

    # --- proposals -----------------------------------------------------------------
    def add_proposal(self, *, source: str, action: str, target: str, reason: str,
                     guard_verdict: str, guard_reason: str, ttl: int = DEFAULT_BLOCK_TTL) -> Dict[str, Any]:
        now = time.time()
        ttl = max(60, min(int(ttl or DEFAULT_BLOCK_TTL), MAX_BLOCK_TTL))
        status = "refused" if guard_verdict == "DENY" else "pending"
        with self.store._lock, self.store._conn() as c:
            dup = c.execute("SELECT id FROM proposals WHERE action=? AND target=? AND status IN ('pending','approved')",
                            (action, target)).fetchone()
            if dup:
                return self.get_proposal(dup["id"])
            pid = uuid.uuid4().hex[:12]
            c.execute("INSERT INTO proposals(id,created_at,updated_at,source,action,target,reason,guard_verdict,guard_reason,status,ttl) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                      (pid, now, now, source, action, target, reason[:2000], guard_verdict, guard_reason[:500], status, ttl))
        self.audit(source, "propose", {"id": pid, "action": action, "target": target, "guard": guard_verdict})
        return self.get_proposal(pid)

    def get_proposal(self, pid: str) -> Optional[Dict[str, Any]]:
        with self.store._lock, self.store._conn() as c:
            row = c.execute("SELECT * FROM proposals WHERE id=?", (pid,)).fetchone()
        return self._row(row) if row else None

    def list_proposals(self, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        q, args = "SELECT * FROM proposals", []
        if status:
            q += " WHERE status=?"
            args.append(status)
        q += " ORDER BY updated_at DESC LIMIT ?"
        args.append(max(1, min(int(limit), 500)))
        with self.store._lock, self.store._conn() as c:
            return [self._row(r) for r in c.execute(q, args).fetchall()]

    def decide(self, pid: str, *, approve: bool, actor: str, ttl: Optional[int] = None) -> Dict[str, Any]:
        p = self.get_proposal(pid)
        if p is None:
            raise KeyError(pid)
        if p["status"] != "pending":
            raise ValueError(f"proposal is {p['status']}, not pending")
        if p["guard_verdict"] == "DENY":
            raise ValueError("guard DENY cannot be approved")
        now = time.time()
        ttl = max(60, min(int(ttl or p["ttl"]), MAX_BLOCK_TTL))
        status = "approved" if approve else "rejected"
        with self.store._lock, self.store._conn() as c:
            c.execute("UPDATE proposals SET status=?, decided_by=?, ttl=?, expires_at=?, updated_at=? WHERE id=?",
                      (status, actor, ttl, now + ttl if approve else None, now, pid))
        self.audit(actor, status, {"id": pid, "ttl": ttl})
        return self.get_proposal(pid)

    def approved_for_execution(self) -> List[Dict[str, Any]]:
        now = time.time()
        return [p for p in self.list_proposals("approved", 500) if (p["expires_at"] or 0) > now]

    def report(self, pid: str, *, host: str, outcome: str, detail: str = "") -> Dict[str, Any]:
        if outcome not in {"applied", "dry-run", "refused", "error"}:
            raise ValueError("bad outcome")
        p = self.get_proposal(pid)
        if p is None:
            raise KeyError(pid)
        reports = p["reports"]
        reports[host] = {"outcome": outcome, "detail": detail[:300], "at": time.time()}
        with self.store._lock, self.store._conn() as c:
            c.execute("UPDATE proposals SET reports=?, updated_at=? WHERE id=?", (json.dumps(reports), time.time(), pid))
        self.audit(f"executor:{host}", outcome, {"id": pid})
        return self.get_proposal(pid)

    # --- revocations (persisted) ----------------------------------------------------
    def revoke(self, jti: str, exp: float) -> None:
        with self.store._lock, self.store._conn() as c:
            c.execute("INSERT OR REPLACE INTO revoked(jti, exp) VALUES(?,?)", (jti, float(exp or time.time() + 86400)))

    def revoked_set(self) -> set:
        with self.store._lock, self.store._conn() as c:
            return {r["jti"] for r in c.execute("SELECT jti FROM revoked WHERE exp > ?", (time.time(),))}

    # --- audit + retention --------------------------------------------------------------
    def audit(self, actor: str, action: str, detail: Any) -> None:
        with self.store._lock, self.store._conn() as c:
            c.execute("INSERT INTO audit(ts,actor,action,detail) VALUES(?,?,?,?)", (time.time(), actor, action, json.dumps(detail)[:2000]))

    def audit_tail(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self.store._lock, self.store._conn() as c:
            rows = c.execute("SELECT * FROM audit ORDER BY ts DESC LIMIT ?", (max(1, min(limit, 1000)),)).fetchall()
        return [{"ts": r["ts"], "actor": r["actor"], "action": r["action"], "detail": json.loads(r["detail"])} for r in rows]

    def purge(self, now: Optional[float] = None) -> Dict[str, int]:
        now = now or time.time()
        out: Dict[str, int] = {}
        with self.store._lock, self.store._conn() as c:
            for cat, keep in RETENTION.items():
                out[cat] = c.execute("DELETE FROM entries WHERE category=? AND created_at < ?", (cat, now - keep)).rowcount
            out["proposals"] = c.execute("DELETE FROM proposals WHERE updated_at < ? AND status NOT IN ('pending','approved')",
                                         (now - PROPOSAL_RETENTION,)).rowcount
            out["revoked"] = c.execute("DELETE FROM revoked WHERE exp < ?", (now,)).rowcount
            out["audit"] = c.execute("DELETE FROM audit WHERE ts < ?", (now - 180 * 86400,)).rowcount
        return out

    @staticmethod
    def _row(r) -> Dict[str, Any]:
        d = dict(r)
        d["reports"] = json.loads(d.get("reports") or "{}")
        return d
