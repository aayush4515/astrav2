#!/usr/bin/env bash
# Drop and re-seed the demo database (removes all check-ins and facial enrollments).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend" && .venv/bin/python -m app.seed.seed
