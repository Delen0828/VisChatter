const ID = /^[a-zA-Z0-9-]{8,80}$/;
const MAX_BODY = 8 * 1024 * 1024;
const RECONNECT_GRACE = 5 * 60 * 1000;

// Same-origin HTTP relay: no direct connections, public signaling service, or TURN required.
export function createCollaborationRelay(server, publicHostname = '') {
    const rooms = new Map();
    const reply = (res, status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
    };
    const online = room => [...room.clients.values()].filter(client => client.res).map(client => client.id);
    function write(client, packet, durable = false) {
        const data = JSON.stringify(packet);
        const entry = { id: ++client.eventId, data };
        if (durable) {
            client.history.push(entry);
            client.bytes += data.length;
            while (client.history.length > 256 || client.bytes > MAX_BODY) client.bytes -= client.history.shift().data.length;
        }
        if (client.res && !client.res.destroyed && !client.res.writableEnded) {
            // Bound a slow reader's output buffer; EventSource reconnects and catches up.
            if (client.res.writableLength > MAX_BODY) client.res.destroy();
            else client.res.write(`id: ${entry.id}\ndata: ${data}\n\n`);
        }
    }
    function presence(room, kind, id) {
        for (const client of room.clients.values()) {
            if (client.id !== id && client.res) write(client, { kind, id });
        }
    }
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
    server.on('close', () => {
        for (const room of rooms.values()) for (const client of room.clients.values()) {
            clearTimeout(client.cleanup);
            clearInterval(client.heartbeat);
            const res = client.res;
            client.res = null;
            res?.end();
        }
        rooms.clear();
    });
    return async function handle(req, res, url) {
        if (!url.pathname.startsWith('/api/collaboration/')) return false;
        const origins = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`,
            ...(publicHostname ? [`https://${publicHostname}`] : [])]);
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !origins.has(req.headers.origin))) {
            reply(res, 403, { error: 'Only requests from this site are accepted.' });
            return true;
        }
        const stream = url.pathname === '/api/collaboration/events';
        const action = url.pathname.split('/').pop();
        if ((stream && req.method !== 'GET') || (!stream && req.method !== 'POST')) {
            reply(res, 405, { error: 'Method not allowed.' });
            return true;
        }
        if (!['join', 'events', 'messages', 'leave'].includes(action)) {
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
                    room = { clients: new Map(), hostToken: body.token };
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
                reply(res, 200, { session: body.room, sequence: room.clients.get(body.id).sequence });
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
                client.res = res;
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store, no-transform',
                    'X-Accel-Buffering': 'no', 'Connection': 'keep-alive',
                });
                res.write(`retry: 1500\ndata: ${JSON.stringify({ kind: 'ready', peers: online(room) })}\n\n`);
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
                reply(res, 200, { ok: true });
                return true;
            }
            if (!Number.isSafeInteger(body.sequence) || body.sequence < 1 || !Array.isArray(body.messages) ||
                body.messages.length < 1 || body.messages.length > 100 || body.messages.some(entry =>
                    !entry?.message || !['number', 'string'].includes(typeof entry.message.type) ||
                    (entry.recipient != null && !ID.test(entry.recipient)))) {
                reply(res, 400, { error: 'Invalid collaboration messages.' });
                return true;
            }
            if (body.sequence <= client.sequence) {
                reply(res, 200, { ok: true }); // Safe retry after a lost HTTP response.
                return true;
            }
            if (body.sequence !== client.sequence + 1) {
                reply(res, 409, { error: 'Collaboration messages arrived out of order.' });
                return true;
            }
            for (const { message } of body.messages) {
                if ([0, 4].includes(message.type) && body.id !== body.room) {
                    reply(res, 403, { error: 'Only the presenter can send session history or lock decisions.' });
                    return true;
                }
                if (message.type === 1 && (!Array.isArray(message.data) || message.data.some(event => !event?.event))) {
                    reply(res, 400, { error: 'Invalid visualization events.' });
                    return true;
                }
            }
            client.sequence = body.sequence;
            for (const { message, recipient } of body.messages) {
                const data = { ...message, sender: body.id };
                if (data.type === 1) data.data = data.data.map(event => ({ ...event, sender: body.id,
                    event: { ...event.event, collaboratorId: body.id } }));
                if (data.type === 2) data.requester = body.id;
                for (const target of room.clients.values()) {
                    if (target.id !== body.id && (!recipient || target.id === recipient)) {
                        write(target, { kind: 'message', sender: body.id, message: data }, data.type !== 'vischatter-cursor');
                    }
                }
            }
            reply(res, 200, { ok: true });
        } catch (error) {
            if (!res.headersSent) reply(res, error.status || 500, { error: error.status ? error.message : 'Collaboration request failed.' });
        }
        return true;
    };
    function scheduleCleanup(room, client, roomId) {
        clearTimeout(client.cleanup);
        client.cleanup = setTimeout(() => {
            if (client.res) return;
            room.clients.delete(client.id);
            if (!room.clients.size) rooms.delete(roomId);
        }, RECONNECT_GRACE);
        client.cleanup.unref();
    }
}
