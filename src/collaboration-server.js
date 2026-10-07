import { WebSocketServer, WebSocket } from 'ws';

const ID = /^[a-zA-Z0-9-]{8,80}$/;
const MAX_BODY = 8 * 1024 * 1024;
const RECONNECT_GRACE = 5 * 60 * 1000;

// Same-origin relay: no direct connections, public signaling service, or TURN required.
export function createCollaborationRelay(server, publicHostname = '') {
    const rooms = new Map();
    const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY, perMessageDeflate: false });
    const allowedOrigin = req => !req.headers.origin || new Set([
        `http://${req.headers.host}`, `https://${req.headers.host}`,
        ...(publicHostname ? [`https://${publicHostname}`] : [])
    ]).has(req.headers.origin);
    const reply = (res, status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
    };
    const online = room => [...room.clients.values()].filter(client => client.res || client.ws?.readyState === WebSocket.OPEN).map(client => client.id);
    const roster = room => ({ action: 'roster', participants: [...room.profiles.values()], revision: room.revision });
    function deliver(client, entry) {
        if (client.ws?.readyState === WebSocket.OPEN) {
            if (client.ws.bufferedAmount > MAX_BODY) client.ws.terminate();
            else client.ws.send(JSON.stringify({ ...JSON.parse(entry.data), eventId: entry.id }));
        } else if (client.res && !client.res.destroyed && !client.res.writableEnded) {
            if (client.res.writableLength > MAX_BODY) client.res.destroy();
            else client.res.write(`id: ${entry.id}\ndata: ${entry.data}\n\n`);
        }
    }
    function write(client, packet, durable = false) {
        const data = JSON.stringify(packet);
        const entry = { id: ++client.eventId, data };
        if (durable) {
            client.history.push(entry);
            client.bytes += data.length;
            while (client.history.length > 256 || client.bytes > MAX_BODY) client.bytes -= client.history.shift().data.length;
        }
        deliver(client, entry);
    }
    function presence(room, kind, id) {
        for (const client of room.clients.values()) {
            if (client.id !== id && (client.res || client.ws)) write(client, { kind, id });
        }
    }
    function claim(room, client, body) {
        const key = `${client.id}:${body.requestId}`;
        if (room.decisions.has(key)) return { ...room.decisions.get(key), ...roster(room), action: 'result' };
        const username = typeof body.username === 'string' ? body.username.trim().normalize('NFC') : '';
        const error = !username ? 'Enter a username.' : username.length > 40 ? 'Use 40 characters or fewer.'
            : /[\p{Cc}\p{Cf}]/u.test(username) ? 'Use a username without control characters.'
            : [...room.profiles.values()].some(profile => profile.id !== client.id && profile.username.toLowerCase() === username.toLowerCase())
                ? 'That username is already in use. Enter a different username.' : '';
        if (!error) {
            room.profiles.set(client.id, { id: client.id, username });
            room.revision++;
            for (const target of room.clients.values()) write(target, { kind: 'profiles', profile: roster(room) }, true);
        }
        const result = { requestId: body.requestId, participantId: client.id, error, profile: error ? null : room.profiles.get(client.id) };
        room.decisions.set(key, result);
        if (room.decisions.size > 256) room.decisions.delete(room.decisions.keys().next().value);
        return { ...result, ...roster(room), action: 'result' };
    }
    function processBatch(room, client, body, roomId) {
        if (!Number.isSafeInteger(body.sequence) || body.sequence < 1 || !Array.isArray(body.messages) ||
            body.messages.length < 1 || body.messages.length > 100 || body.messages.some(entry =>
                !entry?.message || !['number', 'string'].includes(typeof entry.message.type) ||
                (entry.recipient != null && (typeof entry.recipient !== 'string' || !ID.test(entry.recipient))))) {
            return { status: 400, error: 'Invalid collaboration messages.' };
        }
        if (body.sequence <= client.sequence) return { status: 200, ok: true, sequence: client.sequence };
        if (body.sequence !== client.sequence + 1) return { status: 409, error: 'Collaboration messages arrived out of order.' };
        for (const { message } of body.messages) {
            if ([0, 4].includes(message.type) && client.id !== roomId) return { status: 403, error: 'Only the presenter can send session history or lock decisions.' };
            if (message.type === 1 && (!Array.isArray(message.data) || message.data.some(event => !event?.event))) return { status: 400, error: 'Invalid visualization events.' };
        }
        client.sequence = body.sequence;
        for (const { message, recipient } of body.messages) {
            const data = { ...message, sender: client.id };
            delete data.serverConfirmed;
            if (data.type === 1) data.data = data.data.map(event => ({ ...event, sender: client.id,
                event: { ...event.event, collaboratorId: client.id } }));
            if (data.type === 2) data.requester = client.id;
            for (const target of room.clients.values()) if (target.id !== client.id && (!recipient || target.id === recipient)) {
                write(target, { kind: 'message', sender: client.id, message: data }, data.type !== 'vischatter-cursor');
            }
        }
        return { status: 200, ok: true, sequence: client.sequence };
    }
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, 'http://localhost');
        const body = Object.fromEntries(url.searchParams);
        const room = rooms.get(body.room);
        const client = room?.clients.get(body.id);
        if (url.pathname !== '/api/collaboration/socket' || !allowedOrigin(req) || !client || client.token !== body.token) {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            return;
        }
        sockets.handleUpgrade(req, socket, head, ws => {
            clearTimeout(client.cleanup);
            clearInterval(client.heartbeat);
            const previousResponse = client.res;
            client.res = null;
            previousResponse?.end();
            client.ws?.terminate();
            client.ws = ws;
            ws.on('error', () => {});
            ws.send(JSON.stringify({ kind: 'ready', peers: online(room), profiles: roster(room) }));
            const lastId = Number(body.lastEventId || 0);
            for (const entry of client.history) if (entry.id > lastId) deliver(client, entry);
            presence(room, 'joined', client.id);
            let alive = true;
            ws.on('pong', () => { alive = true; });
            client.heartbeat = setInterval(() => { if (!alive) ws.terminate(); else { alive = false; ws.ping(); } }, 15000);
            client.heartbeat.unref();
            ws.on('message', (buffer, binary) => {
                let result;
                try {
                    if (binary) throw new Error('Expected JSON');
                    result = processBatch(room, client, JSON.parse(buffer.toString()), body.room);
                } catch { result = { status: 400, error: 'Provide valid JSON.' }; }
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(result.status === 200
                    ? { kind: 'ack', sequence: result.sequence } : { kind: 'error', ...result }));
            });
            ws.on('close', () => {
                if (client.ws !== ws) return;
                clearInterval(client.heartbeat);
                client.ws = null;
                presence(room, 'left', client.id);
                scheduleCleanup(room, client, body.room);
            });
        });
    });
    async function readBody(req) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > MAX_BODY) throw Object.assign(new Error('Collaboration request is too large.'), { status: 413 });
            chunks.push(chunk);
        }
        try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { throw Object.assign(new Error('Provide valid JSON.'), { status: 400 }); }
    }
    const shutdown = () => {
        for (const room of rooms.values()) for (const client of room.clients.values()) {
            clearTimeout(client.cleanup);
            clearInterval(client.heartbeat);
            const res = client.res;
            client.res = null;
            res?.end();
            const ws = client.ws;
            client.ws = null;
            ws?.terminate();
        }
        rooms.clear();
    };
    server.on('close', shutdown);
    server.on('collaboration-shutdown', shutdown);
    return async function handle(req, res, url) {
        if (!url.pathname.startsWith('/api/collaboration/')) return false;
        if (req.headers['sec-fetch-site'] === 'cross-site' || !allowedOrigin(req)) {
            reply(res, 403, { error: 'Only requests from this site are accepted.' });
            return true;
        }
        const stream = url.pathname === '/api/collaboration/events';
        const action = url.pathname.split('/').pop();
        if ((stream && req.method !== 'GET') || (!stream && req.method !== 'POST')) {
            reply(res, 405, { error: 'Method not allowed.' });
            return true;
        }
        if (!['join', 'events', 'messages', 'leave', 'profile'].includes(action)) {
            reply(res, 404, { error: 'Not found.' });
            return true;
        }
        if (!stream && req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
            reply(res, 415, { error: 'Content-Type must be application/json.' });
            return true;
        }
        try {
            const body = stream ? Object.fromEntries(url.searchParams) : await readBody(req);
            if (!body || [body.room, body.id, body.token].some(value => typeof value !== 'string' || !ID.test(value))) {
                reply(res, 400, { error: 'Invalid collaboration credentials.' });
                return true;
            }
            let room = rooms.get(body.room);
            if (action === 'join') {
                if (!room) {
                    if (body.room !== body.id) {
                        reply(res, 404, { error: 'Session unavailable. Ask the presenter for a new sharing link.' });
                        return true;
                    }
                    if (rooms.size >= 100) {
                        reply(res, 503, { error: 'Too many active sessions. Try again shortly.' });
                        return true;
                    }
                    room = { clients: new Map(), hostToken: body.token, profiles: new Map([[body.id, { id: body.id, username: 'presenter' }]]), decisions: new Map(), revision: 0 };
                    rooms.set(body.room, room);
                }
                if (body.id === body.room && body.token !== room.hostToken) {
                    reply(res, 409, { error: 'This presenter is already connected.' });
                    return true;
                }
                const existing = room.clients.get(body.id);
                if (existing && existing.token !== body.token) {
                    reply(res, 409, { error: 'This collaborator is already connected.' });
                    return true;
                }
                if (!existing) {
                    if (room.clients.size >= 32) {
                        reply(res, 503, { error: 'This session is full.' });
                        return true;
                    }
                    const client = { id: body.id, token: body.token, history: [], bytes: 0, eventId: 0, sequence: 0 };
                    room.clients.set(body.id, client);
                    // Expire registrations that never open their event stream too.
                    scheduleCleanup(room, client, body.room);
                }
                reply(res, 200, { session: body.room, sequence: room.clients.get(body.id).sequence, protocol: 2 });
                return true;
            }
            const client = room?.clients.get(body.id);
            if (!client || client.token !== body.token) {
                if (stream) {
                    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
                    res.end(`data: ${JSON.stringify({ kind: 'expired' })}\n\n`);
                } else reply(res, 403, { error: 'Collaboration session expired. Reconnect to continue.' });
                return true;
            }
            if (stream) {
                clearTimeout(client.cleanup);
                clearInterval(client.heartbeat);
                client.res?.end();
                const ws = client.ws;
                client.ws = null;
                ws?.terminate();
                client.res = res;
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store, no-transform',
                    'X-Accel-Buffering': 'no', 'Connection': 'keep-alive',
                });
                res.write(`retry: 1500\ndata: ${JSON.stringify({ kind: 'ready', peers: online(room), profiles: roster(room) })}\n\n`);
                const lastId = Number(req.headers['last-event-id'] || 0);
                for (const entry of client.history) if (entry.id > lastId) res.write(`id: ${entry.id}\ndata: ${entry.data}\n\n`);
                presence(room, 'joined', body.id);
                client.heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
                client.heartbeat.unref();
                res.on('close', () => {
                    if (client.res !== res) return;
                    clearInterval(client.heartbeat);
                    client.res = null;
                    presence(room, 'left', body.id);
                    scheduleCleanup(room, client, body.room);
                });
                return true;
            }
            if (action === 'leave') {
                client.res?.destroy();
                client.ws?.terminate();
                reply(res, 200, { ok: true });
                return true;
            }
            if (action === 'profile') {
                if (typeof body.requestId !== 'string' || !ID.test(body.requestId)) reply(res, 400, { error: 'Invalid username request.' });
                else reply(res, 200, claim(room, client, body));
                return true;
            }
            const result = processBatch(room, client, body, body.room);
            reply(res, result.status, result);
        } catch (error) {
            if (!res.headersSent) reply(res, error.status || 500, { error: error.status ? error.message : 'Collaboration request failed.' });
        }
        return true;
    };
    function scheduleCleanup(room, client, roomId) {
        clearTimeout(client.cleanup);
        client.cleanup = setTimeout(() => {
            if (client.res || client.ws) return;
            room.clients.delete(client.id);
            if (!room.clients.size) rooms.delete(roomId);
        }, RECONNECT_GRACE);
        client.cleanup.unref();
    }
}
