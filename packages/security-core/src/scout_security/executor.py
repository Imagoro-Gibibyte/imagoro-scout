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

"""Countermeasure executor (PLAN Phase 5). Runs on each host every minute.

An approved proposal becomes a firewall block only when ALL hold:
  1. an operator approved it with a signed request (hub proposal status),
  2. the hub's executor_armed switch is on (operator, remote),
  3. this host runs with SCOUT_SEC_COUNTERMEASURES=enforce (local, physical),
  4. this host's own CountermeasureGuard does not say DENY (re-checked here
     against the local protected_nodes registry, never trusting the hub),
  5. the action is a supported block on an IPv4 address.

Mechanism: one dedicated table, nothing else touched, nothing flushed:

    table inet scout_sec {
      set blocked4 { type ipv4_addr; flags timeout; }
      chain input { type filter hook input priority -5; policy accept; ip saddr @blocked4 drop; }
    }

Every element carries a timeout = the proposal's remaining TTL, so blocks
expire on their own. Disarming (executor_armed=false) deletes the table.
"""

from __future__ import annotations

import ipaddress
import os
import shutil
import subprocess
import time
from typing import Callable, Dict, List, Optional

from scout_security.protected_nodes import DENY, CountermeasureGuard, countermeasure_mode

TABLE = "scout_sec"
SUPPORTED = frozenset({"block_ip", "blacklist_ip", "firewall_drop"})
TABLE_DEF = f"""table inet {TABLE} {{
  set blocked4 {{ type ipv4_addr; flags timeout; }}
  chain input {{ type filter hook input priority -5; policy accept; ip saddr @blocked4 counter drop; }}
}}
"""

Runner = Callable[[List[str], Optional[str]], subprocess.CompletedProcess]


def _nft(args: List[str], stdin: Optional[str] = None) -> subprocess.CompletedProcess:
    return subprocess.run(["nft", *args], input=stdin, capture_output=True, text=True, timeout=20, check=False)


class Executor:
    def __init__(self, client, guard: Optional[CountermeasureGuard] = None, *, host: str,
                 mode: Optional[str] = None, nft: Runner = _nft) -> None:
        self.client = client
        self.guard = guard or CountermeasureGuard()
        self.host = host
        self.mode = mode or countermeasure_mode()
        self.nft = nft

    def table_exists(self) -> bool:
        return self.nft(["list", "table", "inet", TABLE], None).returncode == 0

    def disarm(self) -> bool:
        if self.table_exists():
            r = self.nft(["delete", "table", "inet", TABLE], None)
            return r.returncode == 0
        return False

    def ensure_table(self) -> None:
        if not self.table_exists():
            r = self.nft(["-f", "-"], TABLE_DEF)
            if r.returncode != 0:
                raise RuntimeError(f"nft table create failed: {r.stderr.strip()[:200]}")

    def run_once(self, now: Optional[float] = None) -> Dict[str, object]:
        now = now or time.time()
        state = self.client.control_state(role="executor")
        if not state.get("executor_armed"):
            removed = self.disarm() if self.mode == "enforce" else False
            return {"armed": False, "mode": self.mode, "table_removed": removed, "handled": 0}

        results = []
        for p in self.client.approved_actions():
            if self.host in (p.get("reports") or {}):
                continue  # already handled here; the nft timeout covers expiry
            outcome, detail = self._handle(p, now)
            self.client.report_action(p["id"], outcome, detail)
            results.append({"id": p["id"], "outcome": outcome, "detail": detail})
        return {"armed": True, "mode": self.mode, "handled": len(results), "results": results}

    def _handle(self, p: dict, now: float):
        action, target = p.get("action", ""), p.get("target", "")
        decision = self.guard.evaluate(action, ip=target, attributable=False)
        if decision.verdict == DENY:
            return "refused", f"local guard: {decision.reason}"
        if action not in SUPPORTED:
            return "refused", f"unsupported action '{action}'"
        try:
            addr = ipaddress.ip_address(target)
        except ValueError:
            return "refused", "target is not an IP address"
        if addr.version != 4:
            return "refused", "IPv4 only in this version"
        remaining = int((p.get("expires_at") or 0) - now)
        if remaining < 30:
            return "refused", "approval already expired"
        if self.mode != "enforce":
            return "dry-run", f"would block {addr} for {remaining}s (host not in enforce mode)"
        if not shutil.which("nft") and self.nft is _nft:
            return "error", "nft not installed"
        try:
            self.ensure_table()
        except RuntimeError as exc:
            return "error", str(exc)
        r = self.nft(["add", "element", "inet", TABLE, "blocked4", f"{{ {addr} timeout {remaining}s }}"], None)
        if r.returncode != 0:
            return "error", r.stderr.strip()[:200]
        return "applied", f"blocked {addr} for {remaining}s"


def run(host_label: str) -> Dict[str, object]:
    from scout_security.blackboard.client import BlackboardClient

    return Executor(BlackboardClient(), host=host_label or os.getenv("SCOUT_SEC_HOST_LABEL", "host")).run_once()
