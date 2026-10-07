#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ "${1:-}" == '--help' ]]; then
    echo 'Usage: ./shell/start-dev.sh'
    echo 'Optional variables: PORT=5502 HOST=127.0.0.1 API_KEYS_FILE=/path/to/api-keys.json'
    exit 0
fi
if (( $# > 0 )); then echo '[Error] Unexpected argument. Use --help.' >&2; exit 1; fi
prepare_app
export PORT="${PORT:-5502}"
export HOST="${HOST:-127.0.0.1}"
validate_port
cd "$APP_DIR"
echo "Development URL: http://$HOST:$PORT"
echo 'Node reloads when server code changes; refresh the browser for frontend edits. Ctrl+C stops development.'
exec node --watch "$APP_DIR/src/server.js"
