#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations..."
alembic upgrade head

PORT="${PORT:-8000}"
if [ -z "${MEDIA_BASE_URL:-}" ] && [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  export MEDIA_BASE_URL="${RENDER_EXTERNAL_URL}/media"
fi

echo "Starting API on port ${PORT}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
