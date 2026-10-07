import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODELS = ['deepseek/deepseek-v4.1-flash', 'nvidia/nemotron-3.5-lightning:free', 'openai/gpt-6.1-sol'];
const DEFAULT_MODEL = MODELS[0];
const MAX_BODY = 1024 * 1024;
const PUBLIC_FILES = new Set([
  'index.html', 'style.css', 'src/connect.js', 'src/identity.js', 'src/util.js', 'src/js.js',
  'src/visconnect-bundle.js', 'src/drag.js', 'src/highlight.js', 'src/vega.js', 'src/share.js',
  'src/delete.js', 'src/sidebar-toggle.js', 'data/election-trimmed.csv', 'data/gapminder.csv',
  'data/seattle-weather-trimmed.csv', 'data/seattle-weather.csv', 'data/stock-trimmed.csv', 'data/stock.csv',
  'data/federal.json', 'data/employ.json',
  'data/example-1.json', 'data/example-2.json',
]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function fail(res, status, message) {
  json(res, status, { error: { message } });
}

export async function readConfig(configPath) {
  try {
    const text = (await readFile(configPath, 'utf8')).trim();
    if (!text.startsWith('{')) return { apiKey: text, model: DEFAULT_MODEL };
    const config = JSON.parse(text);
    if (typeof config.openrouter?.apiKey !== 'string') throw new Error('Invalid config');
    const model = config.openrouter.model || DEFAULT_MODEL;
    if (!MODELS.includes(model)) throw new Error('Invalid model');
    return { apiKey: config.openrouter.apiKey.trim(), model };
  } catch (error) {
    if (error.code === 'ENOENT') return { apiKey: '', model: DEFAULT_MODEL };
    throw new Error('Cannot read the OpenRouter key file. Check its format and permissions.');
  }
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error('Request exceeds the 1 MiB limit.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

export function createApp({
  configPath = process.env.API_KEYS_FILE || path.join(APP_DIR, 'env/key'),
  publicHostname = process.env.PUBLIC_HOSTNAME || '',
  fetchImpl = fetch,
} = {}) {
  const requests = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz' && req.method === 'GET') {
        const config = await readConfig(configPath);
        return json(res, 200, { status: 'ok', apiConfigured: Boolean(config.apiKey) });
      }
      if (url.pathname === '/api/chat/completions') {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return fail(res, 405, 'Use POST for this endpoint.');
        }
        const allowedOrigins = new Set([
          `http://${req.headers.host}`, `https://${req.headers.host}`,
          ...(publicHostname ? [`https://${publicHostname}`] : []),
        ]);
        if (req.headers['sec-fetch-site'] === 'cross-site' ||
            (req.headers.origin && !allowedOrigins.has(req.headers.origin))) {
          return fail(res, 403, 'Only requests from this site are accepted.');
        }
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
          return fail(res, 415, 'Content-Type must be application/json.');
        }
        if (Number(req.headers['content-length']) > MAX_BODY) {
          return fail(res, 413, 'Request exceeds the 1 MiB limit.');
        }
        const body = await readBody(req);
        if (!body || !Array.isArray(body.messages) || !body.messages.length ||
            body.messages.length > 30 || body.messages.some(message =>
              !message || !['system', 'user', 'assistant'].includes(message.role) ||
              typeof message.content !== 'string')) {
          return fail(res, 400, 'Provide 1–30 messages with a role and text content.');
        }
        const temperature = body.temperature ?? 0.2;
        if (typeof temperature !== 'number' || !Number.isFinite(temperature) ||
            temperature < 0 || temperature > 2) {
          return fail(res, 400, 'Temperature must be a number between 0 and 2.');
        }
        const config = await readConfig(configPath);
        const model = body.model ?? config.model;
        if (!MODELS.includes(model)) return fail(res, 400, 'Select a supported OpenRouter model.');
        if (!config.apiKey) {
          return fail(res, 503, 'AI assistance is not configured yet. Add your OpenRouter API key to env/key on the server.');
        }
        const now = Date.now();
        for (const [key, value] of requests) {
          if (value.expires <= now) requests.delete(key);
        }
        const client = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
        const limit = requests.get(client) || { count: 0, expires: now + 60000 };
        if (limit.count >= 30) {
          res.setHeader('Retry-After', String(Math.ceil((limit.expires - now) / 1000)));
          return fail(res, 429, 'Too many AI requests. Try again in a minute.');
        }
        limit.count += 1;
        requests.set(client, limit);
        let upstream;
        try {
          upstream = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify({
              model,
              messages: body.messages.map(({ role, content }) => ({ role, content })),
              temperature,
              max_tokens: 4096,
            }),
            signal: AbortSignal.timeout(60000),
          });
        } catch {
          return fail(res, 502, 'Cannot reach OpenRouter. Try again shortly.');
        }
        if (!upstream.ok) {
          // Do not return provider errors: they can contain credential fragments.
          const message = upstream.status === 401
            ? 'OpenRouter rejected the API key. Check env/key or API_KEYS_FILE on the server.'
            : upstream.status === 404
              ? 'The selected OpenRouter model is unavailable to this key. Choose another model.'
              : upstream.status === 429
                ? 'OpenRouter quota or rate limit reached. Check your account or try again later.'
                : 'OpenRouter could not complete the request. Try again later.';
          return fail(res, upstream.status === 429 ? 429 : 502, message);
        }
        const result = await upstream.json();
        const content = result.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) return fail(res, 502, 'OpenRouter returned an unexpected response.');
        return json(res, 200, { choices: [{ message: { role: 'assistant', content } }] });
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return fail(res, 405, 'Method not allowed.');
      }
      let filename;
      try {
        filename = decodeURIComponent(url.pathname).slice(1) || 'index.html';
      } catch {
        return fail(res, 400, 'Invalid URL.');
      }
      // Serve only the UI and datasets; config, source history and scripts stay private.
      if (!PUBLIC_FILES.has(filename)) return fail(res, 404, 'Not found.');
      const location = path.join(APP_DIR, filename);
      if (await realpath(location) !== location || !(await stat(location)).isFile()) {
        return fail(res, 404, 'Not found.');
      }
      const content = await readFile(location);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream',
        'Content-Length': content.length,
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      if (error.code === 'ENOENT') return fail(res, 404, 'Not found.');
      fail(res, error.status || 500, error.status ? error.message : 'Server configuration or request error. Check the server logs.');
      if (!error.status) console.error('Request failed:', error.code || error.name);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8003);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp();
  server.requestTimeout = 75000;
  server.on('error', error => {
    console.error(`Cannot start VisChatter: ${error.code || error.name}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`VisChatter listening on http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
