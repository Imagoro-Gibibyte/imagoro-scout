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

"""Countermeasure guard: the code-level answer to "never firewall a homelab node".

Prompts ask models to be careful; this module makes carelessness impossible.
Every block / blacklist / firewall action the suite might take passes through
``CountermeasureGuard.evaluate`` and gets one of:

  ALLOW     the action may run (still dry-run unless SCOUT_SEC_COUNTERMEASURES=enforce)
  ESCALATE  needs the manager's reasoning plus an operator-signed approval
  DENY      never runs, whoever asks

Design choices (see docs/SECURITY_AUDIT.md F-07):
- Protection is keyed to a *registry of named nodes* (IPs, MACs, WireGuard keys),
  not to "any RFC1918 address". A blanket private-range exemption would let an
  attacker who spoofs a 192.168.x source be ignored forever.
- Conversely, an unregistered private address is never auto-blocked either: a
  spoofed source that *claims* to be local is exactly how an attacker tricks a
  defender into cutting off its own hosts. Those go to ESCALATE.
- Training and smoke modes are always dry-run, regardless of env.
"""

from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional

import yaml

ALLOW = "ALLOW"
ESCALATE = "ESCALATE"
DENY = "DENY"

BLOCKING_ACTIONS = frozenset({"block_ip", "blacklist_ip", "blacklist_device", "blacklist_user", "firewall_drop", "revoke_peer"})
OBSERVE_ACTIONS = frozenset({"observe", "tag", "rate_limit_observe", "alert"})

# Address space a homelab host could plausibly be (or be spoofed as). Explicit,
# because ipaddress.is_private also covers documentation/benchmark ranges.
LOCAL_NETWORKS = tuple(
    ipaddress.ip_network(n)
    for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "fc00::/7")
)

_DEFAULT_REGISTRY = Path(__file__).resolve().parent / "config" / "protected_nodes.yaml"


@dataclass(frozen=True)
class ProtectedNode:
    name: str
    ips: tuple = ()
    macs: tuple = ()
    wg_pubkeys: tuple = ()


@dataclass
class Decision:
    verdict: str
    reason: str
    dry_run: bool
    matched_node: Optional[str] = None

    def to_dict(self) -> dict:
        return dict(self.__dict__)


@dataclass
class Registry:
    nodes: List[ProtectedNode] = field(default_factory=list)
    trusted_networks: List[ipaddress._BaseNetwork] = field(default_factory=list)

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "Registry":
        p = Path(path or os.getenv("SCOUT_SEC_PROTECTED_NODES", "") or _DEFAULT_REGISTRY)
        if not p.exists():
            # Fail closed: without a registry every private target escalates and
            # nothing local can be blocked automatically.
            return cls()
        data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
        nodes = [
            ProtectedNode(
                name=str(n["name"]),
                ips=tuple(str(ipaddress.ip_address(i)) for i in n.get("ips", []) or []),
                macs=tuple(str(m).lower() for m in n.get("macs", []) or []),
                wg_pubkeys=tuple(str(k) for k in n.get("wg_pubkeys", []) or []),
            )
            for n in data.get("nodes", []) or []
        ]
        nets = [ipaddress.ip_network(c, strict=False) for c in data.get("trusted_networks", []) or []]
        return cls(nodes=nodes, trusted_networks=nets)

    def match(self, *, ip: str = "", mac: str = "", wg_pubkey: str = "") -> Optional[ProtectedNode]:
        ip_n = ""
        if ip:
            try:
                ip_n = str(ipaddress.ip_address(ip))
            except ValueError:
                ip_n = ""
        for node in self.nodes:
            if ip_n and ip_n in node.ips:
                return node
            if mac and mac.lower() in node.macs:
                return node
            if wg_pubkey and wg_pubkey in node.wg_pubkeys:
                return node
        return None

    def in_trusted_network(self, ip: str) -> bool:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return any(addr in net for net in self.trusted_networks)


def countermeasure_mode() -> str:
    """dry-run (default) | enforce. Anything unrecognized is dry-run."""
    mode = os.getenv("SCOUT_SEC_COUNTERMEASURES", "dry-run").strip().lower()
    return "enforce" if mode == "enforce" else "dry-run"


class CountermeasureGuard:
    def __init__(self, registry: Optional[Registry] = None, *, training: bool = False) -> None:
        self.registry = registry if registry is not None else Registry.load()
        self.training = training

    def _dry_run(self) -> bool:
        return self.training or countermeasure_mode() != "enforce"

    def evaluate(
        self,
        action: str,
        *,
        ip: str = "",
        mac: str = "",
        wg_pubkey: str = "",
        attributable: bool = False,
    ) -> Decision:
        """Decide whether a countermeasure may run against a target.

        ``attributable`` means the source identity was proven cryptographically
        (signed envelope / WireGuard key), not merely observed as a packet field.
        """
        action_n = (action or "").strip().lower()
        dry = self._dry_run()

        if action_n in OBSERVE_ACTIONS:
            return Decision(ALLOW, "observation-only action", dry)
        if action_n not in BLOCKING_ACTIONS:
            return Decision(DENY, f"unknown action '{action_n}' (allowlist only)", dry)

        node = self.registry.match(ip=ip, mac=mac, wg_pubkey=wg_pubkey)
        if node is not None:
            return Decision(DENY, "target is a registered protected node; blocking it is never automatic", dry, node.name)

        if not ip and not mac and not wg_pubkey:
            return Decision(DENY, "no target", dry)

        try:
            addr = ipaddress.ip_address(ip) if ip else None
        except ValueError:
            return Decision(DENY, f"unparseable ip '{ip}'", dry)

        if addr is not None and (addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_unspecified):
            return Decision(DENY, "loopback/link-local/multicast/unspecified targets are never blocked", dry)

        if addr is not None and (any(addr in n for n in LOCAL_NETWORKS) or self.registry.in_trusted_network(ip)):
            return Decision(
                ESCALATE,
                "unregistered address inside a local/trusted range: possible spoof of a homelab node; "
                "manager review + operator-signed approval required",
                dry,
            )

        if not attributable:
            return Decision(
                ESCALATE,
                "external source not cryptographically attributable (packet source can be spoofed); "
                "prefer rate_limit_observe, escalate for block",
                dry,
            )
        return Decision(ALLOW, "external, attributable, not protected", dry)


def facts(guard: CountermeasureGuard, action: str, *, ip: str = "", mac: str = "", wg_pubkey: str = "",
          attributable: bool = False) -> dict:
    """The classification the guard itself uses, as plain facts for the enforcer model."""
    a = (action or "").strip().lower()
    action_class = "blocking" if a in BLOCKING_ACTIONS else "observation" if a in OBSERVE_ACTIONS else "unknown"
    node = guard.registry.match(ip=ip, mac=mac, wg_pubkey=wg_pubkey)
    if node is not None:
        target_class = "protected-node"
    else:
        try:
            addr = ipaddress.ip_address(ip) if ip else None
        except ValueError:
            addr = None
        if addr is None:
            target_class = "invalid"
        elif addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_unspecified:
            target_class = "non-routable"
        elif any(addr in n for n in LOCAL_NETWORKS) or guard.registry.in_trusted_network(ip):
            target_class = "local-unregistered"
        else:
            target_class = "external"
    return {"action_class": action_class, "target_class": target_class, "attributable": bool(attributable)}


def evaluate_many(guard: CountermeasureGuard, requests: Iterable[dict]) -> List[Decision]:
    return [guard.evaluate(r.get("action", ""), ip=r.get("ip", ""), mac=r.get("mac", ""),
                           wg_pubkey=r.get("wg_pubkey", ""), attributable=bool(r.get("attributable"))) for r in requests]
