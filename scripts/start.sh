#!/usr/bin/env bash
# Start backend (port 8000) and frontend (port 5173). Ctrl+C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
PORT="${ASTRA_API_PORT:-8000}"
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$PORT" &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT
cd "$ROOT/frontend"
ASTRA_API_PORT="$PORT" npm run dev -- --host 127.0.0.1
