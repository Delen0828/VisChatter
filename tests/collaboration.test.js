import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createApp } from '../src/server.js';
import WebSocket from 'ws';

async function fixture(t) {
    const server = createApp();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    t.after(() => { server.emit('collaboration-shutdown'); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    const post = (action, body, headers = {}) => fetch(`${origin}/api/collaboration/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const credentials = room => {
        const id = randomUUID();
        return { id, room: room || id, token: randomUUID() };
    };
    async function stream(client, lastId) {
        const controller = new AbortController();
        t.after(() => controller.abort());
        const response = await fetch(`${origin}/api/collaboration/events?${new URLSearchParams(client)}`, {
            signal: controller.signal, ...(lastId ? { headers: { 'Last-Event-ID': String(lastId) } } : {}),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /text\/event-stream/);
        const reader = response.body.getReader();
        let buffer = '';
        async function next(kind) {
            while (true) {
                const end = buffer.indexOf('\n\n');
                if (end < 0) {
                    const { value, done } = await reader.read();
                    assert.equal(done, false, 'Stream ended before the expected packet');
                    buffer += new TextDecoder().decode(value);
                    continue;
                }
                const entry = buffer.slice(0, end); buffer = buffer.slice(end + 2);
                const data = entry.split('\n').find(line => line.startsWith('data: '));
                if (!data) continue;
                const packet = JSON.parse(data.slice(6));
                if (kind && kind !== packet.kind) continue;
                const id = entry.split('\n').find(line => line.startsWith('id: '));
                return { ...packet, eventId: id ? Number(id.slice(4)) : undefined };
            }
        }
        return { next, close: () => controller.abort() };
    }
    async function socket(client, headers = {}) {
        const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/api/collaboration/socket?${new URLSearchParams(client)}`, { headers });
        const packets = [];
        const notifications = new Set();
        ws.on('message', buffer => { packets.push(JSON.parse(buffer.toString())); for (const notify of notifications) notify(); });
        ws.on('error', () => {});
        t.after(() => ws.terminate());
        await once(ws, 'open');
        async function next(kind) {
            while (true) {
                const index = packets.findIndex(packet => !kind || packet.kind === kind);
                if (index >= 0) return packets.splice(index, 1)[0];
                await new Promise(resolve => { const notify = () => { notifications.delete(notify); resolve(); }; notifications.add(notify); });
            }
        }
        return { ws, next };
    }
    return { post, stream, socket, credentials, origin };
}

test('HTTPS relay admits independent clients without WebRTC and isolates rooms and credentials', { timeout: 10000 }, async t => {
    const app = await fixture(t);
    const host = app.credentials();
    const guest = app.credentials(host.room);
    assert.equal((await app.post('join', guest)).status, 404);
    assert.equal((await app.post('join', host)).status, 200);
    const hostStream = await app.stream(host);
    assert.deepEqual((await hostStream.next('ready')).peers, [host.id]);
    assert.equal((await app.post('join', guest, { Origin: 'https://foreign.example' })).status, 403);
    assert.equal((await app.post('join', guest)).status, 200);
    const guestStream = await app.stream(guest);
    assert.equal((await guestStream.next('ready')).peers.length, 2);
    assert.equal((await hostStream.next('joined')).id, guest.id);
    assert.equal((await app.post('join', { ...host, token: randomUUID() })).status, 409);
    assert.equal((await app.post('messages', { ...guest, token: randomUUID(), sequence: 1, messages: [{ message: { type: 1, data: [] } }] })).status, 403);
    const other = app.credentials();
    assert.equal((await app.post('join', other)).status, 200);
    assert.equal((await app.post('messages', { ...other, sequence: 1, messages: [{ recipient: host.id, message: { type: 'vischatter-cursor' } }] })).status, 200);
    // Routing is limited to the sender's own room, even with a known participant ID.
    assert.equal((await app.post('messages', { ...guest, sequence: 1, messages: [{ message: { type: 'vischatter-profile', action: 'claim', sender: host.id } }] })).status, 200);
    const claim = await hostStream.next('message');
    assert.equal(claim.sender, guest.id);
    assert.equal(claim.message.sender, guest.id);
});

test('relay broadcasts every collaborator cursor, routes claims, and permits presenter history only', { timeout: 10000 }, async t => {
    const app = await fixture(t);
    const host = app.credentials();
    const alice = app.credentials(host.room);
    const bob = app.credentials(host.room);
    const streams = [];
    for (const client of [host, alice, bob]) {
        assert.equal((await app.post('join', client)).status, 200);
        streams.push(await app.stream(client));
        await streams.at(-1).next('ready');
    }
    const cursor = { type: 'vischatter-cursor', visible: true, x: 650, y: 920, sender: host.id };
    assert.equal((await app.post('messages', { ...alice, sequence: 1, messages: [{ message: cursor }] })).status, 200);
    for (const stream of [streams[0], streams[2]]) {
        const packet = await stream.next('message');
        assert.equal(packet.sender, alice.id);
        assert.equal(packet.message.sender, alice.id);
        assert.equal(packet.message.x, 650);
    }
    const history = [{ seqNum: 0, sender: alice.id, event: { collaboratorId: alice.id, type: 'vl-spec', detail: { id: 'vis-test', text: '{}' } } }];
    assert.equal((await app.post('messages', { ...alice, sequence: 2, messages: [{ recipient: bob.id, message: { type: 0, eventsLedger: history } }] })).status, 403);
    assert.equal((await app.post('messages', { ...host, sequence: 1, messages: [{ recipient: bob.id, message: { type: 0, eventsLedger: history } }] })).status, 200);
    assert.deepEqual((await streams[2].next('message')).message.eventsLedger, history);
    assert.equal((await app.post('messages', { ...alice, sequence: 2, messages: [{ message: { type: 1, data: history.map(e => ({ ...e, sender: host.id, event: { ...e.event, collaboratorId: host.id } })) } }] })).status, 200);
    const authenticated = await streams[0].next('message');
    assert.equal(authenticated.message.data[0].sender, alice.id);
    assert.equal(authenticated.message.data[0].event.collaboratorId, alice.id);
});

test('relay safely retries batches and replays missed chart changes after reconnect, excluding stale cursors', { timeout: 10000 }, async t => {
    const app = await fixture(t);
    const host = app.credentials();
    const guest = app.credentials(host.room);
    await app.post('join', host);
    await app.post('join', guest);
    const hostStream = await app.stream(host);
    await hostStream.next('ready');
    const guestStream = await app.stream(guest);
    await guestStream.next('ready');
    await hostStream.next('joined');
    const batch = sequence => ({ ...host, sequence, messages: [{ message: { type: 1,
        data: [{ seqNum: sequence - 1, event: { type: 'chart-move', detail: { x: sequence * 20 } } }] } }] });
    assert.equal((await app.post('messages', batch(1))).status, 200);
    const first = await guestStream.next('message');
    assert.equal((await app.post('messages', batch(1))).status, 200);
    guestStream.close();
    assert.equal((await hostStream.next('left')).id, guest.id);
    assert.equal((await app.post('messages', batch(2))).status, 200);
    assert.equal((await app.post('messages', { ...host, sequence: 3, messages: [{ message: { type: 'vischatter-cursor', visible: true, x: 10, y: 20 } }] })).status, 200);
    const reconnected = await app.stream(guest, first.eventId);
    await reconnected.next('ready');
    const replay = await reconnected.next('message');
    assert.equal(replay.message.type, 1);
    assert.equal(replay.message.data[0].seqNum, 1);
    // The next durable message follows the replay; neither the retry nor old cursor repeats.
    assert.equal((await app.post('messages', batch(4))).status, 200);
    assert.equal((await reconnected.next('message')).message.data[0].seqNum, 3);
});

const transportSource = await readFile(new URL('../src/collaboration.js', import.meta.url), 'utf8');
function transportFixture() {
    const timers = new Map();
    let timerId = 0;
    let now = 0;
    class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } }
    const window = Object.assign(new EventTarget(), {});
    const history = [];
    const context = vm.createContext({ window, crypto: { randomUUID }, URLSearchParams, AbortSignal, CustomEvent, Date: { now: () => now },
        EventSource: class { close() {} },
        setTimeout: (fn, delay = 0) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id) });
    vm.runInContext(transportSource, context);
    const client = new window.VisChatterCommunication({ ownId: 'audience-id', leaderId: 'presenter-id',
        onOpenCallback() {}, onEventReceived: (...args) => history.push(args), getPastEvents: () => [],
        onNewLockOwner() {}, onLockRequested() {} });
    function advance(ms) {
        const end = now + ms;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            now = next[1].at; timers.delete(next[0]); next[1].fn();
        }
        now = end;
    }
    return { client, history, window, timers, advance };
}

test('HTTP transport orders retries, coalesces cursor updates, and uses authenticated profile senders', async () => {
    const { client, window, advance } = transportFixture();
    client.receivePacket({ kind: 'ready', peers: [client.id, client.leaderId, 'bob-id'] });
    const batches = [];
    let fail = true;
    client.post = async (_action, body) => {
        batches.push(structuredClone(body));
        if (fail) { fail = false; throw new Error('Lost acknowledgment'); }
    };
    client.broadcastEvent({ seqNum: 0, event: { type: 'chart-move' } });
    client.sendCursorMessage({ visible: true, x: 1, y: 2 });
    client.sendCursorMessage({ visible: true, x: 3, y: 4 });
    assert.equal(client.outbox.length, 2);
    await client.flush();
    client.broadcastEvent({ seqNum: 1, event: { type: 'chart-resize' } });
    advance(1500);
    await new Promise(resolve => setImmediate(resolve));
    advance(34);
    await client.flush();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(batches[0], batches[1]);
    assert.equal(batches[1].sequence, 1);
    assert.equal(batches[1].messages[1].message.x, 3);
    assert.equal(batches[2].sequence, 2);
    let profile;
    window.addEventListener('vischatter-profile-message', event => profile = event.detail);
    client.receiveMessage({ type: 'vischatter-profile', sender: 'forged' }, 'actual-id');
    assert.equal(profile.sender, 'actual-id');
    assert.equal(client.sendProfileMessage({ action: 'claim' }, 'absent-id'), false);
});

test('presenters send catch-up on joins and reconnects; guests accept history only from the presenter', async () => {
    const { client, history, advance } = transportFixture();
    client.receiveMessage({ type: 0, eventsLedger: ['fake'] }, 'bob-id');
    assert.equal(history.length, 0);
    client.receiveMessage({ type: 0, eventsLedger: ['saved'] }, client.leaderId);
    assert.equal(history[0][2], true);
    client.id = client.leaderId;
    const sent = [];
    client.post = async (_action, body) => sent.push(structuredClone(body));
    client.receivePacket({ kind: 'ready', peers: [client.id, 'bob-id'] });
    client.receivePacket({ kind: 'joined', id: 'alice-id' });
    await new Promise(resolve => setImmediate(resolve));
    advance(34);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.flatMap(batch => batch.messages).filter(e => e.message.type === 0).length, 2);
    client.receivePacket({ kind: 'left', id: 'bob-id' });
    assert.equal(client.peers.includes('bob-id'), false);
});

test('expired registrations reset the batch sequence, preserve unsent edits, and wait for in-flight requests', async () => {
    const { client, timers } = transportFixture();
    const messages = [{ message: { type: 1, data: [{ event: { type: 'chart-move' } }] } }];
    client.sequence = 18;
    client.batch = { sequence: 19, messages };
    const sent = [];
    client.post = async (action, body) => {
        sent.push({ action, body: structuredClone(body) });
        return { sequence: 0, protocol: 2 };
    };
    client.sending = true;
    await client.join();
    assert.equal(sent.length, 0);
    assert.equal(timers.size, 1);
    client.sending = false;
    await client.join();
    assert.equal(client.sequence, 0);
    assert.equal(client.batch.sequence, 1);
    client.receivePacket({ kind: 'ready', peers: [client.id, client.leaderId] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent[1].body.sequence, 1);
    assert.deepEqual(sent[1].body.messages, messages);
    assert.equal(client.batch, null);
});

test('large catch-up histories are chunked without reordering or dropping chart events', async () => {
    const { client, advance } = transportFixture();
    const history = Array.from({ length: 6 }, (_, seqNum) => ({ seqNum, event: { type: 'vl-spec', detail: { text: 'x'.repeat(400000) } } }));
    client.getPastEvents = () => history;
    client.sendHistory(client.leaderId);
    assert.equal(client.outbox.length, 3);
    assert.deepEqual(Array.from(client.outbox.flatMap(entry => entry.message.eventsLedger), event => event.seqNum), [0, 1, 2, 3, 4, 5]);
    const sent = [];
    client.post = async (_action, body) => sent.push(structuredClone(body));
    client.opened = true;
    await client.flush();
    await new Promise(resolve => setImmediate(resolve));
    advance(34);
    await new Promise(resolve => setImmediate(resolve));
    advance(34);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 3);
    assert.ok(sent.every(batch => JSON.stringify(batch).length < 1024 * 1024));
});

test('username confirmation succeeds without a presenter stream and reserves simultaneous names atomically', { timeout: 10000 }, async t => {
    const app = await fixture(t);
    const host = app.credentials();
    const alice = app.credentials(host.room);
    const bob = app.credentials(host.room);
    for (const client of [host, alice, bob]) assert.equal((await app.post('join', client)).status, 200);
    const claim = (client, username) => app.post('profile', { ...client, requestId: randomUUID(), username });
    assert.equal((await (await claim(alice, 'presenter')).json()).error.includes('already in use'), true);
    const results = await Promise.all([claim(alice, ' Alice '), claim(bob, 'ALICE')].map(async request => (await request).json()));
    assert.equal(results.filter(result => !result.error).length, 1);
    assert.equal(results.filter(result => result.error.includes('already in use')).length, 1);
    const request = { ...bob, requestId: randomUUID(), username: 'Bob' };
    const first = await (await app.post('profile', request)).json();
    const retry = await (await app.post('profile', request)).json();
    assert.equal(first.profile.username, 'Bob');
    assert.equal(first.revision, retry.revision);
    const hostStream = await app.stream(host);
    assert.ok((await hostStream.next('ready')).profiles.participants.some(profile => profile.username === 'Bob'));
    const foreign = app.credentials();
    await app.post('join', foreign);
    assert.equal((await app.post('profile', { ...bob, token: foreign.token, requestId: randomUUID(), username: 'Forged' })).status, 403);
});

test('WebSocket and SSE clients share authenticated changes, profiles, history and reconnect replay', { timeout: 10000 }, async t => {
    const app = await fixture(t);
    const host = app.credentials();
    const guest = app.credentials(host.room);
    await app.post('join', host); await app.post('join', guest);
    const presenter = await app.socket(host);
    await presenter.next('ready');
    const audience = await app.stream(guest);
    assert.equal((await audience.next('ready')).peers.length, 2);
    assert.equal((await presenter.next('joined')).id, guest.id);
    await app.post('profile', { ...guest, requestId: randomUUID(), username: 'Alice' });
    assert.ok((await presenter.next('profiles')).profile.participants.some(profile => profile.id === guest.id));
    const send = sequence => presenter.ws.send(JSON.stringify({ sequence, messages: [{ message: { type: 1,
        data: [{ seqNum: sequence - 1, event: { type: 'chart-move', target: 'body', detail: { x: sequence * 20 } } }] } }] }));
    send(1);
    assert.equal((await presenter.next('ack')).sequence, 1);
    const first = await audience.next('message');
    assert.equal(first.message.data[0].event.collaboratorId, host.id);
    audience.close();
    await presenter.next('left');
    send(2);
    await presenter.next('ack');
    const reconnected = await app.socket({ ...guest, lastEventId: first.eventId });
    await reconnected.next('ready');
    assert.equal((await reconnected.next('message')).message.data[0].seqNum, 1);
    reconnected.ws.send(JSON.stringify({ sequence: 1, messages: [{ message: { type: 'vischatter-cursor', visible: true, x: 42, y: 60 } }] }));
    assert.equal((await presenter.next('message')).message.x, 42);
});

test('WebSocket upgrades reject other origins and invalid session tokens', { timeout: 10000 }, async t => {
    const app = await fixture(t);
    const host = app.credentials(); await app.post('join', host);
    await assert.rejects(app.socket(host, { Origin: 'https://foreign.example' }), /403/);
    await assert.rejects(app.socket({ ...host, token: randomUUID() }), /403/);
});

test('cursor and visualization batches continue at 30 fps while all acknowledgements are delayed', () => {
    const { client, advance } = transportFixture();
    client.opened = true;
    client.peers = [client.id, client.leaderId];
    const sent = [];
    client.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)) };
    for (let tick = 0; tick < 200; tick++) {
        client.sendCursorMessage({ visible: true, x: tick, y: tick });
        client.broadcastEvent({ seqNum: tick, event: { type: 'chart-move', target: 'body', detail: { x: tick } } });
        advance(5);
    }
    assert.ok(sent.length >= 30 && sent.length <= 31, `Sent ${sent.length} batches in one second`);
    assert.equal(client.unacknowledged.size, sent.length);
    assert.equal([...sent.flatMap(batch => batch.messages), ...client.outbox].filter(entry => entry.message.type === 1).flatMap(entry => entry.message.data).length, 200);
    advance(1000 / 30);
    assert.equal(sent.at(-1).messages.find(entry => entry.message.type === 'vischatter-cursor').message.x, 199);
    client.receivePacket({ kind: 'ack', sequence: client.sequence });
    assert.equal(client.unacknowledged.size, 0);
});

test('an old server gives a version error instead of falling back to PeerJS or waiting for the presenter', async () => {
    const { client } = transportFixture();
    client.post = async () => ({ sequence: 0 });
    await assert.rejects(client.claimUsername({ requestId: randomUUID(), username: 'Alice' }), /server needs an update/);
    assert.equal(client.registered, undefined);
});

test('WebSocket reconnect resends only uncommitted edits before a failed send and newer queued changes', async () => {
    const { client } = transportFixture();
    const message = seqNum => ({ message: { type: 1, data: [{ seqNum, event: { type: 'chart-move' } }] } });
    client.sequence = 3;
    client.unacknowledged = new Map([1, 2, 3].map(sequence => [sequence, { sequence, messages: [message(sequence)] }]));
    client.batch = { sequence: 4, messages: [message(4)] };
    client.outbox = [message(5)];
    client.lastEventId = 10;
    client.post = async () => ({ protocol: 2, sequence: 1 });
    await client.ensureRegistered();
    const sent = [];
    client.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)) };
    client.opened = true;
    await client.flush();
    assert.equal(sent[0].sequence, 2);
    assert.deepEqual(sent[0].messages.flatMap(entry => entry.message.data).map(event => event.seqNum), [2, 3, 4, 5]);
    assert.equal(client.unacknowledged.size, 1);
});
