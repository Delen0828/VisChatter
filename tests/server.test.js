import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp, MODELS } from '../server.js';

async function fixture(t, { apiKey = '', fetchImpl, model = MODELS[0] } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vischatter-test-'));
  const configPath = path.join(directory, 'api-keys.json');
  await writeFile(configPath, JSON.stringify({ openrouter: { apiKey, model } }));
  const server = createApp({ configPath, fetchImpl, publicHostname: 'vischatter.songwen.dev' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    configPath,
    get: url => fetch(origin + url),
    post: (body = { messages: [{ role: 'user', content: 'Highlight 2020' }] }, headers = {}) => fetch(origin + '/api/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    }),
  };
}

test('serves frontend and datasets while denying secrets, source history and hosting files', async t => {
  const app = await fixture(t);
  for (const url of ['/', '/util.js', '/data/federal.json', '/gapminder.csv']) {
    assert.equal((await app.get(url)).status, 200, url);
  }
  for (const url of ['/env/key', '/env/key.json', '/config/api-keys.json', '/config/api-keys.example.json', '/.git/config', '/server.js', '/start-server.sh', '/.runtime/cloudflared.yml', '/%63onfig/api-keys.json', '/data/../config/api-keys.json']) {
    assert.equal((await app.get(url)).status, 404, url);
  }
  assert.equal((await app.get('/%ZZ')).status, 400);
  const frontend = await (await app.get('/js.js')).text();
  assert.doesNotMatch(frontend, /openai_yek|decodeAsciiString|sk-proj-/);
});

test('runs without a key and reports unavailable AI without calling OpenRouter', async t => {
  const app = await fixture(t, { fetchImpl: () => { throw new Error('Must not contact OpenRouter'); } });
  assert.deepEqual(await (await app.get('/healthz')).json(), { status: 'ok', apiConfigured: false });
  const response = await app.post();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error.message, /env\/key/);
});

test('forwards the private key and selected model, ignoring token overrides', async t => {
  let captured;
  const app = await fixture(t, {
    apiKey: 'test-private-key',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return Response.json({ choices: [{ message: { content: "['RETRIEVE', '2020']" } }], extra: 'not exposed' });
    },
  });
  const response = await app.post({ model: MODELS[2], max_tokens: 999999, messages: [{ role: 'user', content: 'Highlight 2020', extra: 'ignored' }] });
  assert.equal(response.status, 200);
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-private-key');
  assert.deepEqual(JSON.parse(captured.options.body), {
    model: MODELS[2], messages: [{ role: 'user', content: 'Highlight 2020' }], temperature: 0.2, max_tokens: 4096,
  });
  assert.deepEqual(await response.json(), { choices: [{ message: { role: 'assistant', content: "['RETRIEVE', '2020']" } }] });
  assert.equal((await app.get('/healthz')).status, 200);
});

test('reads newly entered keys without restarting the server', async t => {
  const app = await fixture(t, { fetchImpl: async () => Response.json({ choices: [{ message: { content: 'ok' } }] }) });
  assert.equal((await app.post()).status, 503);
  await writeFile(app.configPath, JSON.stringify({ openrouter: { apiKey: 'new-private-key', model: MODELS[2] } }));
  assert.equal((await app.post()).status, 200);
});

test('rejects foreign origins and malformed requests before contacting the provider', async t => {
  const app = await fixture(t, { apiKey: 'test-key', fetchImpl: () => { throw new Error('Must not contact OpenRouter'); } });
  assert.equal((await app.post(undefined, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await app.post(undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  for (const body of [null, {}, { messages: [] }, { messages: [null] }, { messages: [{ role: 'tool', content: 'x' }] }]) {
    assert.equal((await app.post(body)).status, 400);
  }
  assert.equal((await app.post({ messages: [{ role: 'user', content: 'x' }], temperature: -1 })).status, 400);
  assert.equal((await app.post(undefined, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await app.get('/api/chat/completions')).status, 405);
});

test('limits oversized requests and repeated AI calls', async t => {
  const app = await fixture(t, { apiKey: 'test-key', fetchImpl: async () => Response.json({ choices: [{ message: { content: 'ok' } }] }) });
  assert.equal((await app.post({ messages: [{ role: 'user', content: 'a'.repeat(1024 * 1024) }] })).status, 413);
  for (let i = 0; i < 30; i++) assert.equal((await app.post()).status, 200);
  const response = await app.post();
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
});

test('hides key fragments in OpenRouter errors and handles provider failure', async t => {
  for (const status of [401, 404, 429, 500]) {
    const app = await fixture(t, {
      apiKey: 'test-private-key',
      fetchImpl: async () => Response.json({ error: { message: 'Invalid key test-private-key' } }, { status }),
    });
    const response = await app.post();
    assert.equal(response.status, status === 429 ? 429 : 502);
    assert.doesNotMatch(await response.text(), /test-private-key/);
  }
  const disconnected = await fixture(t, { apiKey: 'test-key', fetchImpl: async () => { throw new Error('Network unavailable'); } });
  assert.equal((await disconnected.post()).status, 502);
  const unexpected = await fixture(t, { apiKey: 'test-key', fetchImpl: async () => Response.json({ choices: [] }) });
  assert.equal((await unexpected.post()).status, 502);
});

test('supports every listed model and rejects unlisted model IDs', async t => {
  const forwarded = [];
  const app = await fixture(t, { apiKey: 'test-key', fetchImpl: async (_url, options) => {
    forwarded.push(JSON.parse(options.body).model);
    return Response.json({ choices: [{ message: { content: 'ok' } }] });
  } });
  for (const model of MODELS) {
    assert.equal((await app.post({ model, messages: [{ role: 'user', content: 'test' }] })).status, 200);
  }
  for (const model of ['unknown/model', '', 42, {}]) {
    assert.equal((await app.post({ model, messages: [{ role: 'user', content: 'test' }] })).status, 400);
  }
  assert.deepEqual(forwarded, MODELS);
  const html = await (await app.get('/')).text();
  for (const model of MODELS) assert.ok(html.includes(`value="${model}"`));
});

test('reads plain-text keys with whitespace and uses the default model', async t => {
  let forwarded;
  const app = await fixture(t, { fetchImpl: async (_url, options) => {
    forwarded = options;
    return Response.json({ choices: [{ message: { content: 'ok' } }] });
  } });
  await writeFile(app.configPath, '  plain-text-test-key\n');
  assert.equal((await app.post()).status, 200);
  assert.equal(forwarded.headers.Authorization, 'Bearer plain-text-test-key');
  assert.equal(JSON.parse(forwarded.body).model, MODELS[0]);
});
