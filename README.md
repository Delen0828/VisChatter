# Introduction

VisChatter is a prototype for online collaboration on data visualization, hosted at [vischatter.songwen.dev](https://vischatter.songwen.dev). Open it in one browser tab, copy the sharing link, and open that link in another tab or on another device to test collaboration. Collaboration uses a same-origin HTTPS relay with server-sent events and ordered HTTP messages. Collaborators connect through the hosted app, including across different networks, without a PeerJS signaling service or TURN configuration.

# Hosting and development

The Node.js server serves the interface and datasets and forwards AI requests to OpenRouter. It has no npm dependencies. Use Node.js 20 or newer and Bash. Server hosting also needs `tmux`, `cloudflared`, and `curl`.

## Private API key file

Put your OpenRouter API key in `env/key` as plain text. Startup uses this file by default and creates an empty file with owner-only permissions if it is missing. The existing key in `env/key` needs no conversion.

Choose a model from the **Model** selector in the header. Your selection is saved in this browser and applies to subsequent AI annotations:

- [DeepSeek V4.1 Flash](https://openrouter.ai/deepseek/deepseek-v4.1-flash) (default): `deepseek/deepseek-v4.1-flash`
- [Nemotron 3.5 Lightning (free)](https://openrouter.ai/nvidia/nemotron-3.5-lightning:free): `nvidia/nemotron-3.5-lightning:free`
- [GPT-6.1 Sol](https://openrouter.ai/openai/gpt-6.1-sol): `openai/gpt-6.1-sol`

The server accepts only these model IDs. General-purpose models receive explicit annotation instructions and return validated JSON arrays used by the existing Vega-Lite editing code.

For a different private file, set `API_KEYS_FILE=/absolute/path/to/key`. It can contain plain text or JSON matching `config/api-keys.example.json`:

```json
{
  "openrouter": {
    "apiKey": "YOUR_OPENROUTER_API_KEY",
    "model": "deepseek/deepseek-v4.1-flash"
  }
}
```

The JSON model is the server fallback for clients that omit a model. The interface sends its selected model explicitly. The server reads the key file on every request, so key changes need no restart. A blank key allows chart rendering but AI requests return a configuration message.

`env/` and `config/api-keys.json` are ignored by Git and never served over HTTP. Only the server sends the key to OpenRouter; the browser calls `/api/chat/completions`. Provider errors are sanitized, requests are limited to 1 MiB, and AI calls are limited to 30 per client per minute.

## Server: Cloudflare Tunnel in tmux

The default setup matches ViewRecovery's hosting pattern with its own tunnel and tmux session:

| Setting | Default |
| --- | --- |
| Public hostname | `vischatter.songwen.dev` |
| Tunnel and tmux session | `VisChatter` |
| Origin | `http://127.0.0.1:8003` |

From any working directory:

```bash
/path/to/VisChatter/shell/start-server.sh
/path/to/VisChatter/shell/start-server.sh status
/path/to/VisChatter/shell/start-server.sh restart
/path/to/VisChatter/shell/start-server.sh stop
```

`shell/ocular-start-server-vischatter.sh` is an alias matching the legacy script's naming. The script creates the named tunnel if missing, adds its DNS record, writes a private runtime configuration, and starts Node and Cloudflare in two tmux panes. It checks origin health and tunnel registration. Repeated `start` calls keep an existing session; use `restart` after server code changes. Existing DNS records belonging to another tunnel cause an error instead of being overwritten.

If Cloudflare login is missing on a new server, run `cloudflared tunnel login` once and authorize your domain. This server already has that login. Tunnel credentials stay in `~/.cloudflared`; `TUNNEL_CREDENTIALS_FILE` can select another credentials file. The named tunnel and hostname route follow [Cloudflare's locally managed tunnel guide](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/).

Optional hosting settings can be supplied through environment variables or by copying `config/hosting.env.example` to `config/hosting.env` and editing it. The file uses Bash syntax and takes precedence over environment variables. The origin binds to loopback; public HTTPS is handled by Cloudflare.

```bash
tmux attach -t VisChatter
tail -f /path/to/VisChatter/.runtime/app.log
tail -f /path/to/VisChatter/.runtime/tunnel.log
```

Detach with Ctrl+B, then D. The processes keep running after SSH disconnects. A machine reboot stops tmux; rerun the hosting script afterward. Stop also keeps the named tunnel and DNS record for the next start. ViewRecovery's existing deployment runs independently.

## Whiteboard controls

The header keeps the model selector, sharing link, and connection status. An indeterminate indicator appears while model responses are pending. Charts live on a dotted whiteboard and can be dragged to arrange them.

Opening the interface or a shared link asks for a username, prefilled with **presenter** for the session owner and **audience** for a shared-link visitor. The presenter checks names before visitors join; names are unique within the session, ignoring case and surrounding spaces. Claimed names stay reserved for the session so comment history remains unambiguous. Profile icons show the username's first letter on a solid color from a fixed A–Z palette.

- **Add** in the bottom toolkit opens a popup for Vega-Lite JSON, including specs with inline data.
- Right-click a chart (or use its **···** button) for **Comment**, **Speech comment**, **Share**, **Clear all comments**, and **Delete**. Comments open in a small box beside the chart. Speech comments fill an editable draft there; choose **Post** to add the comment and generate its annotation.
- A chart with comments shows up to three distinct commenters' profile icons beside a translucent **+X** comment count. Click it to open a compact version list that floats to the right of the chart without resizing it, with the author's icon and username beside each comment. Hover or focus a comment to preview its annotation, or preview **Original chart** for the original chart. Click a version to select it as the default. Use the small grey × on a comment to remove it. Click the comment count again or outside the panel to close it. Leaving a preview restores your selected default; until you select one, it restores the latest annotation by submission timestamp, even when AI requests finish out of order.
- **Share** opens **Copy code to clipboard**, **Download SVG**, and **Download PNG**. All three use the visualization version selected when the actions menu opens, including the base version. Code is formatted Vega-Lite JSON; PNGs export at twice the chart's resolution.
- **Clear** removes all charts and their comments. Clearing comments or deleting a chart cancels its pending annotation requests.
- **Record** toggles continuous speech recognition and displays a live transcript above the toolkit. Finalized speech is split into sentences and clauses at punctuation and pauses. Each phrase is checked by the selected model; data facts receive a light yellow highlight and are automatically posted as comments on the matching chart through the annotation pipeline. Other speech stays in the transcript. If no chart matches, the fact is highlighted and a notice explains why it could not be saved as a chart comment. The transcript stays visible when recording is paused, and checks for captured phrases finish in the background.

Chart additions, movements, comments, and deletions use the existing collaboration connection. Comment drafts, annotation previews, default version choices, and live transcripts stay local to each browser.

Every collaborator's cursor appears with their username and profile color. Positions follow whiteboard coordinates across window sizes and scrolling. Cursors disappear when participants leave the canvas, switch away, or disconnect. Cursor updates are transient and do not enter the chart history.

The relay retries interrupted connections and replays missed messages. The presenter sends chart history to newly joined and reconnected participants; keep the presenter tab open for username approval and complete chart catch-up. Session credentials are kept for five minutes after a disconnect. Sessions are held in server memory, so a server restart requires reconnecting; if the presenter refreshes, copy a new sharing link. After deploying collaboration changes, run `./scripts/start-server.sh restart` on the hosting machine and refresh all participants' tabs.

## Local development

```bash
cd /path/to/VisChatter
./shell/start-dev.sh
# Open http://127.0.0.1:5502
```

No Cloudflare login or tmux is needed locally. Node watches server changes; refresh your browser after editing frontend files. Ctrl+C stops development. Set `PORT=5503 ./shell/start-dev.sh` to use another port. To test from another device, set `HOST=0.0.0.0 ./shell/start-dev.sh`; microphone recognition generally requires HTTPS or localhost, so use localhost for speech testing. Use a browser that supports `SpeechRecognition` or `webkitSpeechRecognition` for voice input; microphone access is requested when you start recording or a speech comment. AI development requests use the local machine's private key file.

Run `npm test` for whiteboard checks covering comment ordering, annotation previews, request cancellation, and mocked speech recording, plus server checks covering secret-file protection, missing keys, server-side model selection, live key reload, request validation, rate limits, and provider failures. `/healthz` returns origin health and whether an API key is present; it does not validate the key against OpenRouter.

# Directories

### VisChatter

`index.html` is the HTML page of VisChatter, using `style.css` for better format and calling other JS files for functionality.

`src/` contains the application JavaScript, including the Node server. `data/` contains CSV datasets, existing JSON datasets, and two Vega-Lite examples: car registrations by segment in `example-1.json` and small-car and minicar sales from 2013 to 2020 in `example-2.json`. `shell/` contains startup scripts and their shared helpers. Tests remain in `tests/`.

`src/delete.js` handles chart menus, clearing comments, chart deletion, and clearing the whiteboard.

`src/drag.js` contains functions used to drag visualizations on the dashboard.

`src/highlight.js` contains functions of Vega-lite code modification. Those functions takes keywords returned by GPT as input and output highlighted Vega-lite code.

`src/util.js` contains functions used to call GPT APIs and other helper functions.

`src/vega.js` contains functions used to render Vega-lite code.

`src/visconnect-bundle.js` is forked from [VisConnect](https://visconnect.us/) and retains its chart event ledger and replay logic. `src/collaboration.js` supplies its HTTP communication adapter, `src/collaboration-server.js` relays session messages, and `src/cursors.js` renders transient collaborator presence using confirmed profile colors.

### Analyze

`Analyze/Evaluation` contains all the code and raw data for user study evaluation.

`Analyze/Formative` contains all the code and raw data used for the second formative study.

`Analyze/Test` contains all the code used for comparing the performance between GPT-4-turbo and fine-tuned llama-3-8b.
