# Introduction

VisChatter is a prototype for online collaboration on data visualization, hosted at [vischatter.songwen.dev](https://vischatter.songwen.dev). Open it in one browser tab, copy the sharing link, and open that link in another tab to test collaboration. Collaboration uses the existing public PeerJS signaling service and WebRTC; networks that block peer connections may need a separate TURN service.

# Hosting and development

The Node.js server serves the interface and datasets and forwards AI requests to OpenAI. It has no npm dependencies. Use Node.js 20 or newer and Bash. Server hosting also needs `tmux`, `cloudflared`, and `curl`.

## Private API key file

Startup creates `config/api-keys.json` from `config/api-keys.example.json` with owner-only permissions. Fill in this file on the machine running the app:

```json
{
  "openai": {
    "apiKey": "YOUR_OPENAI_API_KEY",
    "model": "ft:gpt-4o-mini-2024-07-18:personal:vischatter-finetune-0319:BCsQ8ZTt"
  }
}
```

The model defaults to the prototype's existing fine-tuned model. Your key must have access to it; change `openai.model` to a model available to your account if needed, such as `gpt-4o-mini`. The server reads this file on each AI request, so saving a key or model change does not require a restart. A blank key still allows the interface and chart rendering to run; AI requests return a clear configuration message. Use a new key instead of the credential previously embedded in browser source.

This file is ignored by Git and is never served over HTTP. Only the server sends the key to OpenAI; browser code calls `/api/chat/completions`. Provider error messages are sanitized, requests are limited to 1 MiB, and AI calls are limited to 30 per client per minute. `API_KEYS_FILE=/absolute/path/api-keys.json` can select an existing private file instead.

## Server: Cloudflare Tunnel in tmux

The default setup matches ViewRecovery's hosting pattern with its own tunnel and tmux session:

| Setting | Default |
| --- | --- |
| Public hostname | `vischatter.songwen.dev` |
| Tunnel and tmux session | `VisChatter` |
| Origin | `http://127.0.0.1:8003` |

From any working directory:

```bash
/path/to/VisChatter/start-server.sh
/path/to/VisChatter/start-server.sh status
/path/to/VisChatter/start-server.sh restart
/path/to/VisChatter/start-server.sh stop
```

`ocular-start-server-vischatter.sh` is an alias matching the legacy script's naming. The script creates the named tunnel if missing, adds its DNS record, writes a private runtime configuration, and starts Node and Cloudflare in two tmux panes. It checks origin health and tunnel registration. Repeated `start` calls keep an existing session; use `restart` after server code changes. Existing DNS records belonging to another tunnel cause an error instead of being overwritten.

If Cloudflare login is missing on a new server, run `cloudflared tunnel login` once and authorize your domain. This server already has that login. Tunnel credentials stay in `~/.cloudflared`; `TUNNEL_CREDENTIALS_FILE` can select another credentials file. The named tunnel and hostname route follow [Cloudflare's locally managed tunnel guide](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/).

Optional hosting settings can be supplied through environment variables or by copying `config/hosting.env.example` to `config/hosting.env` and editing it. The file uses Bash syntax and takes precedence over environment variables. The origin binds to loopback; public HTTPS is handled by Cloudflare.

```bash
tmux attach -t VisChatter
tail -f /path/to/VisChatter/.runtime/app.log
tail -f /path/to/VisChatter/.runtime/tunnel.log
```

Detach with Ctrl+B, then D. The processes keep running after SSH disconnects. A machine reboot stops tmux; rerun the hosting script afterward. Stop also keeps the named tunnel and DNS record for the next start. ViewRecovery's existing deployment runs independently.

## Local development

```bash
cd /path/to/VisChatter
./start-dev.sh
# Open http://127.0.0.1:5502
```

No Cloudflare login or tmux is needed locally. Node watches server changes; refresh your browser after editing frontend files. Ctrl+C stops development. Set `PORT=5503 ./start-dev.sh` to use another port. To test from another device, set `HOST=0.0.0.0 ./start-dev.sh`; microphone recognition generally requires HTTPS or localhost, so use localhost for speech testing. Use a browser that supports `webkitSpeechRecognition` for the Record button. AI development requests use the local machine's private key file.

Run `npm test` for server checks covering secret-file protection, missing keys, server-side model selection, live key reload, request validation, rate limits, and provider failures. `/healthz` returns origin health and whether an API key is present; it does not validate the key against OpenAI.

# Directories

### VisChatter

`index.html` is the HTML page of VisChatter, using `style.css` for better format and calling other JS files for functionality.

`delete.js` contains functions used to delete visualizations from the dashboard.

`drag.js` contains functions used to drag visualizations on the dashboard.

`highlight.js` contains functions of Vega-lite code modification. Those functions takes keywords returned by GPT as input and output highlighted Vega-lite code.

`util.js` contains functions used to call GPT APIs and other helper functions.

`vega.js` contains functions used to render Vega-lite code.

`visconnect-bundle.js` is forked from [VisConnect](https://visconnect.us/). It is a peer-to-peer protocol for synchronizing event among browsers. 

### Analyze

`Analyze/Evaluation` contains all the code and raw data for user study evaluation.

`Analyze/Formative` contains all the code and raw data used for the second formative study.

`Analyze/Test` contains all the code used for comparing the performance between GPT-4-turbo and fine-tuned llama-3-8b.


