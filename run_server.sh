#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$SCRIPT_DIR"

if [ -f .env_key ]; then
    source .env_key
fi

if [ -n "$1" ]; then
    export GEMINI_API_KEY="$1"
fi

if [ -f venv/bin/activate ]; then
    source venv/bin/activate
fi

exec python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 1
