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

"""Deterministic injection screening for untrusted text (logs, blackboard data, chat).

The suite reads attacker-influenced text by design: auth logs, web access logs,
packet summaries, blackboard entries written by other hosts. None of that text
may ever carry authority. This module is the non-LLM first line:

- privilege / envelope markers inside data  -> counterfeit authority attempt
- pseudo-shell commands aimed at the agent   -> command injection attempt
- identity claims inside data                -> counterfeit identifier attempt
- hidden characters (bidi / zero-width)      -> smuggling attempt
- long encoded blobs                         -> possible encoded payload (signal only)

Screening never *grants* anything; it only produces findings and a neutralized
copy of the text that is safe to fence into a prompt. Authority is established
out-of-band (signed envelopes, see docs/SERVING_DESIGN.md), never by text.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import List

SEVERITY_ORDER = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}


@dataclass(frozen=True)
class Finding:
    rule: str
    severity: str
    excerpt: str


@dataclass
class ScreenResult:
    findings: List[Finding] = field(default_factory=list)
    neutralized: str = ""

    @property
    def max_severity(self) -> str:
        if not self.findings:
            return "none"
        return max(self.findings, key=lambda f: SEVERITY_ORDER[f.severity]).severity

    @property
    def flagged(self) -> bool:
        return any(SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER["medium"] for f in self.findings)

    def to_dict(self) -> dict:
        return {
            "flagged": self.flagged,
            "max_severity": self.max_severity,
            "findings": [f.__dict__ for f in self.findings],
        }


# Markers that look like prompt-envelope structure or privilege assertions. Any of
# these inside *data* is a counterfeit-authority attempt, including the legacy
# Scout PROMPT SYNTAX v1 markers this suite no longer honors.
_MARKER_PATTERNS = [
    re.compile(r"={2,}\s*[A-Z][A-Z0-9 _()\-]{2,60}\s*={2,}"),  # === ANY HEADER ===
    re.compile(r"<\|?\s*(im_start|im_end|system|endoftext|eot_id|start_header_id)\s*\|?>", re.I),
    re.compile(r"</?\s*(system|operator|admin|instructions?)\s*>", re.I),
    re.compile(r"\[\s*/?\s*(INST|SYS)\s*\]", re.I),
    re.compile(r"\bprivilege\s*:\s*(admin|root|operator|manager)\b", re.I),
]

_AUTHORITY_CLAIMS = re.compile(
    r"\b(ignore|disregard|override|forget)\b[^.\n]{0,40}\b(previous|prior|above|all|system|policy|rules|instructions)\b"
    r"|\b(you are now|act as|new instructions|developer mode|jailbreak)\b"
    r"|\b(this is (the )?(operator|admin|manager|root))\b"
    r"|\b(operator|admin|manager)\s+(override|approval|authori[sz]ation)\s*(granted|code|token)?\b",
    re.I,
)

# Commands an agent should never be talked into running or approving from data.
_PSEUDO_SHELL = re.compile(
    r"(^|[\s;|&`$(])("
    r"sudo\s+\S+|su\s+-\b|"
    r"rm\s+-[a-z]*r[a-z]*f?\s+/|"
    r"(iptables|ip6tables|nft|ufw|firewall-cmd)\s+[-a-z]|"
    r"(curl|wget)\s+[^\n|]*\|\s*(ba|z|da)?sh\b|"
    r"base64\s+(-d|--decode)[^\n|]*\|\s*(ba|z|da)?sh\b|"
    r"chmod\s+[0-7]*[67][0-7]{2}\s|chown\s+root|"
    r"systemctl\s+(stop|disable|mask)\s+|"
    r"wg\s+set\s+|ssh-keygen\s+-R|"
    r"mkfifo\s+|nc\s+(-e|-c)\s|/dev/tcp/"
    r")",
    re.I | re.M,
)

_IDENTITY_CLAIM = re.compile(
    r"\b(model|box|user|device|node|operator)[_\- ]?(id|hash|sha256|fingerprint)\s*[:=]\s*([0-9a-f]{16,64})\b",
    re.I,
)

_HIDDEN_CHARS = re.compile("[​-‏‪-‮⁠-⁤⁦-⁩﻿]")

_ENCODED_BLOB = re.compile(r"(?<![A-Za-z0-9+/=])([A-Za-z0-9+/]{120,}={0,2}|(?:[0-9a-fA-F]{2}){80,})(?![A-Za-z0-9+/=])")


def _excerpt(text: str, start: int, end: int, pad: int = 24) -> str:
    s = max(0, start - pad)
    e = min(len(text), end + pad)
    return text[s:e].replace("\n", " ")[:120]


def neutralize(text: str) -> str:
    """Return text that cannot impersonate envelope structure.

    Strips hidden characters, NFKC-normalizes (defeats fullwidth look-alikes),
    and defangs any marker so the model sees it as quoted data.
    """
    t = unicodedata.normalize("NFKC", text or "")
    t = _HIDDEN_CHARS.sub("", t)
    for pat in _MARKER_PATTERNS:
        t = pat.sub(lambda m: "[marker-removed:" + re.sub(r"[^A-Za-z0-9 _:-]", "", m.group(0))[:40] + "]", t)
    return t


def screen(text: str) -> ScreenResult:
    """Screen untrusted text. Pure, deterministic, no network."""
    raw = text or ""
    findings: List[Finding] = []

    for m in _HIDDEN_CHARS.finditer(raw):
        findings.append(Finding("hidden_char", "high", f"U+{ord(m.group(0)):04X} at {m.start()}"))
        break  # one is enough to flag; avoid flooding

    norm = _HIDDEN_CHARS.sub("", unicodedata.normalize("NFKC", raw))

    for pat in _MARKER_PATTERNS:
        for m in pat.finditer(norm):
            findings.append(Finding("envelope_marker_in_data", "critical", _excerpt(norm, m.start(), m.end())))
    for m in _AUTHORITY_CLAIMS.finditer(norm):
        findings.append(Finding("authority_claim_in_data", "high", _excerpt(norm, m.start(), m.end())))
    for m in _PSEUDO_SHELL.finditer(norm):
        findings.append(Finding("pseudo_shell", "high", _excerpt(norm, m.start(), m.end())))
    for m in _IDENTITY_CLAIM.finditer(norm):
        findings.append(Finding("identity_claim_in_data", "medium", _excerpt(norm, m.start(), m.end())))
    for m in _ENCODED_BLOB.finditer(norm):
        findings.append(Finding("encoded_blob", "low", _excerpt(norm, m.start(), m.end(), pad=0)[:60]))

    return ScreenResult(findings=findings, neutralized=neutralize(raw))
