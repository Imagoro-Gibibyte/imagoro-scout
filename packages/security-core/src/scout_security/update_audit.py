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

"""Automatic update audit: inspect pending OS/package updates via the shell.

Operates entirely through subprocess (shell) commands so it can run on any host
without a Python agent. Reports a structured summary that the security crew or
an operator can turn into proposals (block/observe) or push updates with
approval or automatically.
"""

from __future__ import annotations

import json
import shlex
import subprocess
from typing import Any, Dict, List, Optional


def _run(cmd: List[str], *, timeout: int = 120, sudo: bool = False) -> Dict[str, Any]:
    full = (["sudo"] if sudo else []) + list(cmd)
    try:
        proc = subprocess.run(full, capture_output=True, text=True, timeout=timeout, check=False)
        return {
            "cmd": " ".join(shlex.quote(x) for x in full),
            "rc": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }
    except subprocess.TimeoutExpired as exc:
        return {"cmd": " ".join(shlex.quote(x) for x in full), "rc": 124,
                "stdout": exc.stdout or "", "stderr": f"timeout after {timeout}s"}
    except FileNotFoundError as exc:
        return {"cmd": " ".join(shlex.quote(x) for x in full), "rc": 127,
                "stderr": str(exc)}


def audit_apt(*, sudo: bool = False) -> Dict[str, Any]:
    """Audit pending Debian/Ubuntu updates via apt (shell)."""
    out = _run(["apt-get", "-s", "upgrade"], sudo=sudo, timeout=300)
    upgradable = _run(["apt", "list", "--upgradable"], sudo=False, timeout=120)
    lines = [ln for ln in upgradable["stdout"].splitlines() if "/" in ln]
    pkgs = []
    for ln in lines:
        # name/version arch [upgradable from: old]
        name = ln.split("/")[0].strip()
        pkgs.append(name)
    return {
        "manager": "apt",
        "sudo_used": sudo,
        "upgradable_count": len(pkgs),
        "upgradable": pkgs,
        "dry_run_rc": out["rc"],
        "dry_run_tail": (out["stdout"] or "")[-2000:],
    }


def audit_dnf(*, sudo: bool = False) -> Dict[str, Any]:
    out = _run(["dnf", "check-update"], sudo=sudo, timeout=300)
    pkgs = []
    for ln in (out["stdout"] or "").splitlines():
        parts = ln.split()
        if len(parts) >= 2 and "." in parts[0] and parts[1].startswith(("x86", "noarch", "aarch")):
            pkgs.append(parts[0])
    return {"manager": "dnf", "sudo_used": sudo, "upgradable_count": len(pkgs),
            "upgradable": pkgs, "rc": out["rc"]}


def detect_manager() -> Optional[str]:
    for mgr, probe in (("apt", ["apt-get", "--version"]), ("dnf", ["dnf", "--version"])):
        r = _run(probe, sudo=False, timeout=30)
        if r["rc"] == 0:
            return mgr
    return None


def run_update_audit(*, allow_sudo: bool = False, push: str = "approval",
                    auto: bool = False) -> Dict[str, Any]:
    """Run an automatic update audit via shell.

    push: 'none' | 'approval' | 'automatic'
    auto: shortcut to push='automatic'
    """
    if auto:
        push = "automatic"
    mgr = detect_manager()
    if mgr == "apt":
        result = audit_apt(sudo=allow_sudo)
    elif mgr == "dnf":
        result = audit_dnf(sudo=allow_sudo)
    else:
        result = {"manager": None, "error": "no supported package manager found"}
    result["push_mode"] = push
    result["allow_sudo"] = allow_sudo
    # Push step only when explicitly automatic and sudo allowed.
    if push == "automatic" and allow_sudo and mgr in {"apt", "dnf"}:
        cmd = ["apt-get", "upgrade", "-y"] if mgr == "apt" else ["dnf", "upgrade", "-y"]
        push_res = _run(cmd, sudo=True, timeout=600)
        result["push"] = {"rc": push_res["rc"], "tail": (push_res["stdout"] or "")[-2000:]}
    else:
        result["push"] = {"skipped": True, "reason": "approval required or sudo disabled"}
    return result


def main(argv=None) -> int:
    import argparse

    p = argparse.ArgumentParser(prog="scout-sec update-audit", description="Automatic update audit via shell")
    p.add_argument("--sudo", action="store_true", help="allow temporary sudo/root")
    p.add_argument("--push", choices=["none", "approval", "automatic"], default="approval")
    p.add_argument("--auto", action="store_true", help="automatic push (requires --sudo)")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)
    res = run_update_audit(allow_sudo=args.sudo, push=args.push, auto=args.auto)
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        print(f"manager={res.get('manager')} upgradable={res.get('upgradable_count', 0)} push={res.get('push_mode')}")
        for pkg in res.get("upgradable", [])[:50]:
            print("  ", pkg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
