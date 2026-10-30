#!/usr/bin/env bash
# Run every check CI runs. Needs Python 3.11+, Rust (cargo), Node 20+.
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n== %s\n' "$*"; }
step leakcheck;      python tools/leakcheck.py
step tools;          python -m unittest discover -s tools
step models;         python -m unittest discover -s models
step keygate;        (cd packages/keygate && python -m unittest test_keygate)
step hazard-sources; (cd packages/hazard-sources && python -m unittest discover -s tests)
step security-core;  (cd packages/security-core && python -m pytest -q -p no:cacheprovider)
step gate;           (cd packages/gate && cargo test --quiet)
step ui-core;        (cd packages/ui-core && npm ci --no-audit --no-fund --loglevel=error && npx vitest run && npx tsc -p tsconfig.json --noEmit)
printf '\nall checks passed\n'
