---
title: vLLM on an RDNA 4 card, under WSL
date: 2026-10-28
area: serving
---

# vLLM on an RDNA 4 card, under WSL

The heavy tier runs: Qwen3-8B-AWQ on vLLM, on a Radeon RX 9060 XT, inside WSL2 on a Windows workstation. It's reachable only through a keyed gate.

## What it took

1. **ROCm inside WSL.** The distro gets ROCm's user space plus AMD's DXG bridge library, which routes ROCm compute through the Windows driver. `rocminfo` lists `gfx1200`.
2. **A container built for the card family**, AMD's `gfx120X` vLLM image. Inside it, PyTorch saw the GPU, but vLLM didn't: it picks its platform through amd-smi, and the image's amd-smi can't see the GPU under WSL. Mounting AMD's WSL build of the library fixed that.
3. **Hardening that held.** It runs with no capabilities, `no-new-privileges`, a read-only root, a loopback-only port, offline weights, telemetry off, and a checksum manifest verified before every start. One adjustment was needed: the kernel compiler caches now point at the writable cache volume.
4. **Two WSL surprises.**
   - WSL stops its VM when nothing on the Windows side is attached. A running container doesn't count, so a healthy server died after a few minutes. Serving now holds one tagged session open.
   - Mirrored networking shares one port space with Windows, so the engine and its gate need different port numbers.

## Numbers

Warm start takes about 40 s; the first start adds about a minute of kernel compilation, which is then cached. KV cache holds about 42k tokens at 85% of the card. Through the gate, chat returns 200 with a client key, and a request without one gets 401. The engine also enforces its own key, and LAN addresses are refused.

## Constraints

The GPU is shared with everything else on that machine. A game holding 10 GB means vLLM refuses to start. So switching between the Ollama stack and the vLLM stack is a deliberate, manual step.
