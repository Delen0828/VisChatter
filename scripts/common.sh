#!/usr/bin/env bash

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_command() {
    command -v "$1" >/dev/null 2>&1 || { echo "[Error] Install $1 first." >&2; exit 1; }
}

prepare_app() {
    require_command node
    node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || {
        echo '[Error] Node.js 20 or newer is required.' >&2
        exit 1
    }
    KEY_FILE="${API_KEYS_FILE:-$APP_DIR/config/api-keys.json}"
    if [[ ! -f "$KEY_FILE" && -n "${API_KEYS_FILE:-}" ]]; then
        echo "[Error] The custom API_KEYS_FILE does not exist: $KEY_FILE" >&2
        exit 1
    fi
    if [[ ! -f "$KEY_FILE" ]]; then
        (umask 077; cp "$APP_DIR/config/api-keys.example.json" "$APP_DIR/config/api-keys.json")
        echo "Created private key file: $APP_DIR/config/api-keys.json"
    fi
    chmod 600 "$KEY_FILE"
    KEY_FILE="$(cd "$(dirname "$KEY_FILE")" && pwd)/$(basename "$KEY_FILE")"
    export API_KEYS_FILE="$KEY_FILE"
    node --input-type=module - "$KEY_FILE" <<'JS'
import { readFileSync } from 'node:fs';
try {
    const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    if (!config.openai || typeof config.openai.apiKey !== 'string') throw new Error();
    if (!config.openai.apiKey.trim()) console.log('AI assistance will stay unavailable until you fill in openai.apiKey.');
} catch {
    console.error('[Error] config/api-keys.json must contain an openai object with an apiKey string.');
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
