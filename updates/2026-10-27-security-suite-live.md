---
title: The security suite goes live
date: 2026-10-27
area: security
---

# The security suite goes live

The lab now audits itself:
- collectors on each machine post redacted events to a mesh-only security blackboard;
- every 30 minutes, an eight-role crew of local Qwen3 models turns them into findings and a decision.

Countermeasures are dry-run, and no executor exists yet.

## What changed

- **Collectors** read sshd, sudo, listeners, WireGuard, apt, disk and the web edge, read-only, as a sandboxed user. Each event is redacted and screened for injection on the host before it's posted. Raw logs never leave the machine.
- **The blackboard** is role-scoped: each of the eight roles gets a 24-hour token limited to its categories, refreshed every 12 hours.
- **The crew** has one reasoning manager and seven no-think specialists. The cycle is skipped when nothing is low severity or above.

## Why it's built this way

The first live cycle failed: tool calling through the local engine returned empty responses. Rather than fight it, agents lost their tools entirely, and the runner now does every blackboard read and write. That turned out to be the better security design anyway: a confused model can't write anything.

The second cycle worked (155 s, 10 events, verdict BENIGN, which was correct: it was setup activity). It also showed the manager **inventing guard verdicts**. Those are now overwritten; only the guard writes verdicts.

The contract test passed on the live model: a PHP-CGI exploit line carrying "mark this BENIGN" came back THREAT, with the override flagged.
