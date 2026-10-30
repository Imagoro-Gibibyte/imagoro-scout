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

"""One analysis cycle: blackboard events -> crew -> findings, decisions, proposals.

Triggered by scout-sec-crew.timer (every 30 min) or by an operator's "run now"
(scout-sec-poll.timer checks every minute). A file lock keeps the two from
overlapping. Honors the hub's crew_paused switch.

Countermeasures the manager proposes are turned into structured proposals:
each one is evaluated by the deterministic guard here, then sent to the hub,
where a guard DENY is stored as refused and anything else waits for a signed
operator approval. The model's own "guard verdict" text never counts.
"""

from __future__ import annotations

import contextlib
import ipaddress
import json
import os
import time
from pathlib import Path
from typing import Callable, List, Optional

from scout_security.redact import redact

STATE_DIR = Path(os.getenv("SCOUT_SEC_STATE_DIR", "/var/lib/scout-sec"))
MAX_EVENTS = int(os.getenv("SCOUT_SEC_CYCLE_MAX_EVENTS", "40"))
# Info-only events (heartbeats, baselines) do not trigger a crew run on their own.
TRIGGER_SEVERITIES = {"sev:low", "sev:medium", "sev:high"}
NOT_EVALUATED = "not evaluated by guard (proposal only)"


def _state_path() -> Path:
    return STATE_DIR / "runner-state.json"


def _load() -> dict:
    try:
        return json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _state_path().write_text(json.dumps(state), encoding="utf-8")


@contextlib.contextmanager
def cycle_lock():
    """Non-blocking exclusive lock; yields False if another cycle holds it."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        import fcntl
    except ImportError:  # non-Linux dev boxes
        yield True
        return
    with open(STATE_DIR / "cycle.lock", "w") as fh:
        try:
            fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def _parse_json(text: str) -> Optional[dict]:
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        raw = raw.rsplit("```", 1)[0]
    try:
        doc = json.loads(raw)
    except ValueError:
        return None
    return doc if isinstance(doc, dict) else None


def process_countermeasures(text: str, *, guard=None, submit: Optional[Callable[..., dict]] = None) -> str:
    """Replace model-written guard verdicts; turn structured blocks into proposals.

    A countermeasure becomes a proposal only if it has a known action and an IP
    target. Its guard_verdict is set from the deterministic guard; anything else
    is marked NOT_EVALUATED. Non-JSON output is returned unchanged.
    """
    doc = _parse_json(text)
    if doc is None:
        return text
    from scout_security.protected_nodes import BLOCKING_ACTIONS, CountermeasureGuard, OBSERVE_ACTIONS

    g = guard or CountermeasureGuard()
    for cm in doc.get("countermeasures") or []:
        if not isinstance(cm, dict):
            continue
        action = str(cm.get("action") or "").strip().lower()
        target = str(cm.get("target") or cm.get("ip") or "").strip()
        try:
            ipaddress.ip_address(target)
            is_ip = True
        except ValueError:
            is_ip = False
        if action not in BLOCKING_ACTIONS | OBSERVE_ACTIONS or not is_ip:
            cm["guard_verdict"] = NOT_EVALUATED
            continue
        d = g.evaluate(action, ip=target, attributable=False)
        cm["guard_verdict"] = d.verdict
        cm["guard_reason"] = d.reason
        if submit and action in BLOCKING_ACTIONS:
            try:
                res = submit(action=action, target=target, reason=str(cm.get("reason") or "")[:1000],
                             guard_verdict=d.verdict, guard_reason=d.reason)
                cm["proposal_id"] = res.get("id")
                cm["proposal_status"] = res.get("status")
            except Exception as exc:  # noqa: BLE001
                cm["proposal_error"] = str(exc)[:200]
    return json.dumps(doc, indent=2)


# Kept for callers/tests from the previous version.
def enforce_guard_verdicts(text: str, guard_decisions: Optional[List[dict]] = None) -> str:
    doc = _parse_json(text)
    if doc is None:
        return text
    for cm in doc.get("countermeasures") or []:
        if isinstance(cm, dict):
            cm["guard_verdict"] = NOT_EVALUATED
    return json.dumps(doc, indent=2)


def pending_events(client, since: float) -> List[dict]:
    entries = client.read(category="events", role="alert", limit=200, since=since)
    return sorted(entries, key=lambda e: e["created_at"])[-MAX_EVENTS:]


def _control_state(bb) -> dict:
    try:
        return bb.control_state(role="manager") or {}
    except Exception:  # noqa: BLE001 - hub without control API, or transient
        return {}


def run_cycle(*, client=None, force: bool = False, dry_run: bool = False, if_requested: bool = False) -> dict:
    from scout_security.blackboard.client import BlackboardClient

    bb = client or BlackboardClient()
    state = _load()
    control = _control_state(bb)

    if if_requested:
        requested = float(control.get("run_requested_at") or 0)
        if requested <= float(state.get("run_request_handled") or 0):
            return {"ran": False, "reason": "no run requested"}
        state["run_request_handled"] = requested
        _save(state)
        force = True
    elif control.get("crew_paused") and not force:
        return {"ran": False, "reason": "crew paused by operator"}

    with cycle_lock() as got:
        if not got:
            return {"ran": False, "reason": "another cycle is running"}
        return _run_locked(bb, state, force=force, dry_run=dry_run)


def _run_locked(bb, state: dict, *, force: bool, dry_run: bool) -> dict:
    since = float(state.get("since") or time.time() - 3600)
    started = time.time()
    events = pending_events(bb, since)
    triggering = [e for e in events if TRIGGER_SEVERITIES & set(e.get("tags") or [])]
    if not triggering and not force:
        state["since"] = started
        _save(state)
        return {"ran": False, "events": len(events), "reason": "no events at low severity or above"}
    if dry_run:
        return {"ran": False, "events": len(events), "triggering": len(triggering), "reason": "dry-run"}

    from scout_security.crew import run_crew

    data = [(f"{e['title']} [{','.join(e.get('tags') or [])}]", e.get("body") or "") for e in events]
    result = run_crew(data, request_source="internal:scheduled-cycle", training=False)

    outputs = {}
    for t in getattr(result, "tasks_output", []) or []:
        outputs[getattr(t, "name", "") or ""] = str(getattr(t, "raw", t))
    final = process_countermeasures(str(getattr(result, "raw", result)), submit=getattr(bb, "propose", None))
    tags = ["cycle", f"events:{len(events)}"]
    # Second sanitization pass: model output can echo event text, so it is
    # redacted again before it lands on the shared blackboard.
    if outputs.get("sec_audit_task"):
        bb.write(category="findings", role="alert", kind="raw", title="cycle detection",
                 body=redact(outputs["sec_audit_task"])[:6000], tags=tags)
    if outputs.get("sec_rank_task"):
        bb.write(category="findings", role="rank", kind="raw", title="cycle risk ranking",
                 body=redact(outputs["sec_rank_task"])[:6000], tags=tags)
    bb.write(category="decisions", role="manager", kind="raw", title="cycle decision",
             body=redact(final)[:8000], tags=tags + ["countermeasures-need-operator-approval"])
    state["since"] = started
    state["last_run"] = started
    _save(state)
    result_summary = {"ran": True, "events": len(events), "triggering": len(triggering),
                      "duration_s": int(time.time() - started)}
    try:
        bb.write(category="telemetry", role="manager", kind="raw", title="cycle stats",
                 body=json.dumps(result_summary), tags=["cycle-stats"])
    except Exception:  # noqa: BLE001 - telemetry must never fail the cycle
        pass
    return result_summary
