#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ "${1:-}" == '--help' ]]; then
    echo 'Usage: ./shell/start-server.sh [start|restart|stop|status]'
    echo 'Optional overrides: config/hosting.env, or PUBLIC_HOSTNAME, TUNNEL_NAME, SESSION, PORT.'
    exit 0
fi
ACTION="${1:-start}"
if (( $# > 1 )) || [[ ! "$ACTION" =~ ^(start|restart|stop|status)$ ]]; then
    echo '[Error] Use start, restart, stop, status, or --help.' >&2
    exit 1
fi
# The optional file is shell syntax and should contain only your own settings.
if [[ -f "$APP_DIR/config/hosting.env" ]]; then source "$APP_DIR/config/hosting.env"; fi
PUBLIC_HOSTNAME="${PUBLIC_HOSTNAME:-vischatter.songwen.dev}"
TUNNEL_NAME="${TUNNEL_NAME:-VisChatter}"
SESSION="${SESSION:-VisChatter}"
PORT="${PORT:-8003}"
[[ "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo '[Error] Invalid tmux session name.' >&2; exit 1; }
require_command tmux

case "$ACTION" in
    stop)
        if tmux has-session -t "=$SESSION" 2>/dev/null; then
            tmux kill-session -t "=$SESSION"
            echo "Stopped $SESSION."
        else echo "$SESSION is already stopped."; fi
        exit 0
        ;;
    status)
        tmux has-session -t "=$SESSION" 2>/dev/null || { echo "$SESSION is stopped."; exit 1; }
        tmux list-panes -t "$SESSION:hosting" -F '#{pane_title}: exited=#{pane_dead} pid=#{pane_pid}'
        require_command curl
        curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$PORT/healthz"
        echo
        echo "Public URL: https://$PUBLIC_HOSTNAME"
        exit 0
        ;;
esac

if [[ "$ACTION" == start ]] && tmux has-session -t "=$SESSION" 2>/dev/null; then
    echo "$SESSION already exists. Use ./shell/start-server.sh status or restart."
    exit 0
fi
prepare_app
require_command cloudflared
require_command curl
validate_port
[[ "$PUBLIC_HOSTNAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ && "$PUBLIC_HOSTNAME" == *.* ]] || {
    echo '[Error] PUBLIC_HOSTNAME must be a domain name without a scheme or path.' >&2; exit 1;
}
[[ "$TUNNEL_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo '[Error] Invalid tunnel name.' >&2; exit 1; }
mkdir -p "$APP_DIR/.runtime"
chmod 700 "$APP_DIR/.runtime"

find_tunnel() {
    cloudflared tunnel list --output json > "$APP_DIR/.runtime/tunnels.json"
    node --input-type=module - "$APP_DIR/.runtime/tunnels.json" "$TUNNEL_NAME" <<'JS'
import { readFileSync } from 'node:fs';
const tunnel = JSON.parse(readFileSync(process.argv[2], 'utf8')).find(t => t.name === process.argv[3]);
if (tunnel) console.log(tunnel.id);
JS
}
TUNNEL_ID="$(find_tunnel)"
if [[ -z "$TUNNEL_ID" ]]; then
    echo "Creating Cloudflare tunnel: $TUNNEL_NAME"
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID="$(find_tunnel)"
fi
[[ "$TUNNEL_ID" =~ ^[a-f0-9-]{36}$ ]] || { echo '[Error] Could not resolve the tunnel UUID.' >&2; exit 1; }
CREDENTIALS_FILE="${TUNNEL_CREDENTIALS_FILE:-$HOME/.cloudflared/$TUNNEL_ID.json}"
[[ -r "$CREDENTIALS_FILE" ]] || {
    echo "[Error] Tunnel credentials are missing: $CREDENTIALS_FILE" >&2
    echo 'Use the server where the tunnel was created, or copy its credentials securely.' >&2
    exit 1
}
echo "Routing $PUBLIC_HOSTNAME to $TUNNEL_NAME..."
# No overwrite flag: an existing hostname belonging to another app causes a safe failure.
cloudflared tunnel route dns "$TUNNEL_ID" "$PUBLIC_HOSTNAME"
CONFIG_FILE="$APP_DIR/.runtime/cloudflared.yml"
node --input-type=module - "$CONFIG_FILE" "$TUNNEL_ID" "$CREDENTIALS_FILE" "$PUBLIC_HOSTNAME" "$PORT" <<'JS'
import { writeFileSync } from 'node:fs';
const [, , filename, tunnel, credentials, hostname, port] = process.argv;
writeFileSync(filename, `tunnel: ${JSON.stringify(tunnel)}\ncredentials-file: ${JSON.stringify(credentials)}\ningress:\n  - hostname: ${JSON.stringify(hostname)}\n    service: http://127.0.0.1:${port}\n  - service: http_status:404\n`, { mode: 0o600 });
JS
cloudflared tunnel --config "$CONFIG_FILE" ingress validate

# Complete Cloudflare checks before stopping an existing deployment on restart.
if [[ "$ACTION" == restart ]] && tmux has-session -t "=$SESSION" 2>/dev/null; then
    tmux kill-session -t "=$SESSION"
    for (( i=0; i<20; i++ )); do
        if node --input-type=module - "$PORT" <<'JS'
import net from 'node:net';
const server = net.createServer();
server.on('error', () => process.exit(1));
server.listen(Number(process.argv[2]), '127.0.0.1', () => server.close());
JS
        then break; fi
        sleep 0.25
    done
fi
# Fail before starting tmux if another application already owns the origin port.
node --input-type=module - "$PORT" <<'JS'
import net from 'node:net';
const server = net.createServer();
server.on('error', error => {
    console.error(`[Error] Cannot bind origin port ${process.argv[2]}: ${error.code}`);
    process.exit(1);
});
server.listen(Number(process.argv[2]), '127.0.0.1', () => server.close());
JS
printf -v APP_CMD 'exec env HOST=127.0.0.1 PORT=%q PUBLIC_HOSTNAME=%q API_KEYS_FILE=%q %q %q >> %q 2>&1' \
    "$PORT" "$PUBLIC_HOSTNAME" "$API_KEYS_FILE" "$(command -v node)" "$APP_DIR/src/server.js" "$APP_DIR/.runtime/app.log"
APP_PANE="$(tmux new-session -d -s "$SESSION" -n hosting -c "$APP_DIR" -P -F '#{pane_id}' "$APP_CMD")"
STARTUP_COMPLETE=false
cleanup_startup() {
    if [[ "$STARTUP_COMPLETE" != true ]]; then tmux kill-session -t "=$SESSION" 2>/dev/null || true; fi
}
trap cleanup_startup EXIT
tmux set-option -w -t "$SESSION:hosting" remain-on-exit on
tmux select-pane -t "$APP_PANE" -T application
startup_failed() {
    echo '[Error] Startup failed. Review .runtime/app.log and .runtime/tunnel.log.' >&2
    tmux kill-session -t "=$SESSION" 2>/dev/null || true
    exit 1
}
READY=false
for (( i=0; i<30; i++ )); do
    if [[ "$(tmux display-message -p -t "$APP_PANE" '#{pane_dead}')" == 1 ]]; then startup_failed; fi
    if curl --fail --silent --max-time 1 "http://127.0.0.1:$PORT/healthz" >/dev/null; then READY=true; break; fi
    sleep 1
done
[[ "$READY" == true ]] || startup_failed
printf -v TUNNEL_CMD 'exec %q tunnel --config %q --no-autoupdate run > %q 2>&1' \
    "$(command -v cloudflared)" "$CONFIG_FILE" "$APP_DIR/.runtime/tunnel.log"
TUNNEL_PANE="$(tmux split-window -h -t "$APP_PANE" -c "$APP_DIR" -P -F '#{pane_id}' "$TUNNEL_CMD")"
tmux select-pane -t "$TUNNEL_PANE" -T cloudflare
tmux select-layout -t "$SESSION:hosting" tiled >/dev/null
READY=false
for (( i=0; i<30; i++ )); do
    if [[ "$(tmux display-message -p -t "$TUNNEL_PANE" '#{pane_dead}')" == 1 ]]; then startup_failed; fi
    if grep -q 'Registered tunnel connection' "$APP_DIR/.runtime/tunnel.log" 2>/dev/null; then READY=true; break; fi
    sleep 1
done
if [[ "$READY" != true ]]; then
    STARTUP_COMPLETE=true
    echo '[Warning] The app is running, but tunnel registration is not confirmed yet. Check .runtime/tunnel.log.' >&2
    exit 1
fi
STARTUP_COMPLETE=true
echo "VisChatter is running at https://$PUBLIC_HOSTNAME"
echo "Attach: tmux attach -t $SESSION (Ctrl+B, then D to detach)"
echo 'Logs: .runtime/app.log and .runtime/tunnel.log'
