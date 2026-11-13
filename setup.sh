#!/usr/bin/env bash
# ASTRA-HEALTH setup for Linux/macOS.  ./setup.sh [--cpu] [--no-data]
set -euo pipefail
cd "$(dirname "$0")"
CPU=0; DATA=1
for a in "$@"; do case $a in --cpu) CPU=1;; --no-data) DATA=0;; esac; done
PY=$(for v in python3.11 python3.10 python3.9; do command -v $v && break; done | head -n1)
[ -z "$PY" ] && { echo "Python 3.9-3.11 required"; exit 1; }
[ -d .venv ] || "$PY" -m venv .venv
VPY=.venv/bin/python
$VPY -m pip install -q --upgrade pip==24.2
if [ "$CPU" = 1 ] || [ "$(uname)" = Darwin ]; then IDX=https://download.pytorch.org/whl/cpu; else IDX=https://download.pytorch.org/whl/cu121; fi
$VPY -m pip install -q torch==2.2.2 --index-url "$IDX"
$VPY -m pip install -q -r requirements.txt
$VPY -m ipykernel install --user --name astra-health --display-name "ASTRA-HEALTH (.venv)"
[ "$DATA" = 1 ] && $VPY scripts/download_data.py
command -v npm >/dev/null && (cd apps/web && npm ci --silent) || echo "Install Node.js 20+ for the dashboard"
echo "Done. Smoke test: .venv/bin/python scripts/run_pipeline.py --smoke"
