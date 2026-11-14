#!/usr/bin/env bash
# One-time setup (needs internet). Afterwards ASTRA runs fully offline.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements-dev.txt
cd "$ROOT"
backend/.venv/bin/python scripts/download_models.py
cd "$ROOT/frontend"
npm install
echo "Setup complete. Start with: scripts/start.sh"
