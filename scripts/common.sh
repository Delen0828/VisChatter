#!/usr/bin/env bash

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_command() {
    command -v "$1" >/dev/null 2>&1 || { echo "[Error] Install $1 first." >&2; exit 1; }
}

prepare_app() {
    require_command node
    require_command npm
    node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || {
        echo '[Error] Node.js 20 or newer is required.' >&2
        exit 1
    }
    (cd "$APP_DIR" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
    KEY_FILE="${API_KEYS_FILE:-$APP_DIR/env/key}"
    if [[ ! -f "$KEY_FILE" && -n "${API_KEYS_FILE:-}" ]]; then
        echo "[Error] The custom API_KEYS_FILE does not exist: $KEY_FILE" >&2
        exit 1
    fi
    if [[ ! -f "$KEY_FILE" ]]; then
        mkdir -p "$APP_DIR/env"
        (umask 077; touch "$APP_DIR/env/key")
        echo "Created private key file: $APP_DIR/env/key"
    fi
    chmod 600 "$KEY_FILE"
    KEY_FILE="$(cd "$(dirname "$KEY_FILE")" && pwd)/$(basename "$KEY_FILE")"
    export API_KEYS_FILE="$KEY_FILE"
    node --input-type=module - "$KEY_FILE" "$APP_DIR/src/server.js" <<'JS'
import { pathToFileURL } from 'node:url';
const { readConfig } = await import(pathToFileURL(process.argv[3]));
try {
    const config = await readConfig(process.argv[2]);
    if (!config.apiKey) console.log('AI assistance will stay unavailable until you add an OpenRouter key to env/key.');
} catch {
    console.error('[Error] Use a plain-text OpenRouter key or JSON with openrouter.apiKey and a supported openrouter.model.');
    process.exit(1);
}
JS
}

validate_port() {
    [[ "$PORT" =~ ^[0-9]{1,5}$ ]] && (( 10#$PORT > 0 && 10#$PORT <= 65535 )) || {
        echo '[Error] PORT must be between 1 and 65535.' >&2
        exit 1
    }
}
