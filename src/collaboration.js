// Same-origin WebSocket relay, with SSE/HTTP fallback when an upgrade is blocked.
const COLLABORATION_FRAME_INTERVAL = 1000 / 30;
class VisChatterCommunication {
    constructor(data) {
        Object.assign(this, data);
        this.id = data.ownId;
        this.token = crypto.randomUUID();
        this.peers = [];
        this.opened = false;
        this.sequence = 0;
        this.outbox = [];
        this.unacknowledged = new Map();
        this.lastFlush = -Infinity;
        this.onConnectionCallback = () => {};
    }
    credentials() { return { room: this.leaderId, id: this.id, token: this.token }; }
    init() {
        this.join();
        window.addEventListener('pagehide', () => {
            this.stopped = true;
            clearTimeout(this.retryTimer);
            clearTimeout(this.sendTimer);
            clearTimeout(this.socketTimer);
            this.source?.close();
            this.socket?.close();
            navigator.sendBeacon?.('/api/collaboration/leave', new Blob([JSON.stringify(this.credentials())], { type: 'application/json' }));
        });
        window.addEventListener('pageshow', event => {
            if (event.persisted) { this.stopped = false; this.registered = false; this.join(); }
        });
    }
    async post(action, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(`/api/collaboration/${action}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...this.credentials(), ...body }), signal: controller.signal,
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(typeof result.error === 'string' ? result.error
                : result.error?.message || 'Cannot connect to this session. Refresh the presenter and try a new sharing link.'), { status: response.status });
            return result;
        } finally { clearTimeout(timer); }
    }
    async ensureRegistered() {
        if (this.registered) return;
        if (!this.registration) this.registration = this.post('join').then(result => {
            if (result.protocol !== 2) throw Object.assign(new Error('The collaboration server needs an update. Restart it and refresh both browsers.'), { status: 426 });
            const missed = [...this.unacknowledged.values()].filter(batch => batch.sequence > result.sequence);
            if (missed.length) {
                // Earlier unacknowledged edits must precede a batch whose send failed.
                this.outbox.unshift(...missed.flatMap(batch => batch.messages),
                    ...(this.batch?.sequence > result.sequence ? this.batch.messages : []));
                this.batch = null;
            }
            this.unacknowledged.clear();
            if (this.batch && this.batch.sequence <= result.sequence) this.batch = null;
            else if (this.batch) this.batch.sequence = result.sequence + 1;
            if (result.sequence < this.sequence) this.lastEventId = 0;
            this.sequence = result.sequence;
            this.registered = true;
        }).finally(() => { this.registration = null; });
        return this.registration;
    }
    publishProfiles(profile) {
        if (profile) window.dispatchEvent(new CustomEvent('vischatter-profile-message',
            { detail: { ...profile, sender: this.leaderId, serverConfirmed: true } }));
    }
    async claimUsername(request) {
        await this.ensureRegistered();
        let result;
        try { result = await this.post('profile', request); }
        catch (error) {
            if (error.status !== 403) throw error;
            this.registered = false;
            await this.ensureRegistered();
            result = await this.post('profile', request);
        }
        this.publishProfiles({ ...result, action: 'roster' });
        return result;
    }
    async join() {
        if (this.stopped || this.joining) return;
        if (this.sending) {
            clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => this.join(), 1500);
            return;
        }
        this.joining = true;
        try {
            await this.ensureRegistered();
            if (this.stopped) return;
            this.connectRealtime();
        } catch (error) {
            this.opened = false;
            this.statusText = error.status ? error.message : 'Reconnecting…';
            this.onConnectionCallback();
            this.retryTimer = setTimeout(() => this.join(), 2000);
        } finally { this.joining = false; }
    }
    connectRealtime() {
        if (typeof WebSocket !== 'function') { this.connectEventSource(); return; }
        this.source?.close();
        const url = new URL('/api/collaboration/socket', location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.search = new URLSearchParams({ ...this.credentials(), lastEventId: this.lastEventId || 0 });
        const socket = this.socket = new WebSocket(url);
        let ready = false;
        this.socketTimer = setTimeout(() => { if (!ready && this.socket === socket) { this.socket = null; socket.close(); this.connectEventSource(); } }, 3500);
        socket.onmessage = event => {
            if (this.socket !== socket) return;
            const packet = JSON.parse(event.data);
            if (packet.kind === 'ready') { ready = true; clearTimeout(this.socketTimer); }
            this.receivePacket(packet);
        };
        socket.onerror = () => {}; // Close handles upgrade failures and reconnects.
        socket.onclose = () => {
            if (this.socket !== socket || this.stopped) return;
            clearTimeout(this.socketTimer);
            this.socket = null;
            this.opened = false;
            if (!ready) { this.connectEventSource(); return; }
            this.registered = false;
            this.statusText = 'Reconnecting…';
            this.onConnectionCallback();
            this.retryTimer = setTimeout(() => this.join(), 1000);
        };
    }
    connectEventSource() {
        if (this.stopped) return;
        this.source?.close();
        this.source = new EventSource(`/api/collaboration/events?${new URLSearchParams(this.credentials())}`);
        this.source.onmessage = event => {
            if (event.lastEventId) this.lastEventId = Number(event.lastEventId);
            this.receivePacket(JSON.parse(event.data));
        };
        this.source.onerror = () => { this.opened = false; this.statusText = 'Reconnecting…'; this.onConnectionCallback(); };
    }
    receivePacket(packet) {
        if (packet.eventId) this.lastEventId = packet.eventId;
        if (packet.kind === 'ack') {
            for (const sequence of this.unacknowledged.keys()) if (sequence <= packet.sequence) this.unacknowledged.delete(sequence);
        } else if (packet.kind === 'profiles') this.publishProfiles(packet.profile);
        else if (packet.kind === 'error') {
            this.statusText = packet.error;
            this.onConnectionCallback();
            this.socket?.close();
        } else if (packet.kind === 'expired') {
            this.source.close();
            this.registered = false;
            this.opened = false;
            this.statusText = 'Reconnecting…';
            this.onConnectionCallback();
            this.join();
        } else if (packet.kind === 'ready') {
            this.peers = packet.peers;
            this.opened = true;
            this.statusText = '';
            this.publishProfiles(packet.profiles);
            this.onOpenCallback();
            this.onConnectionCallback();
            if (this.id === this.leaderId) for (const peer of this.peers) if (peer !== this.id) this.sendHistory(peer);
            this.flush();
        } else if (packet.kind === 'joined') {
            if (!this.peers.includes(packet.id)) this.peers.push(packet.id);
            this.onConnectionCallback();
            if (this.id === this.leaderId) this.sendHistory(packet.id);
        } else if (packet.kind === 'left') {
            this.peers = this.peers.filter(id => id !== packet.id);
            this.onConnectionCallback();
        } else if (packet.kind === 'message') this.receiveMessage(packet.message, packet.sender);
    }
    getId() { return this.id; }
    getNumberOfConnections() { return this.opened ? this.peers.length : 0; }
    send(message, recipient) {
        this.outbox.push({ message: { ...message, sender: this.id }, ...(recipient ? { recipient } : {}) });
        this.scheduleFlush();
    }
    scheduleFlush() {
        if (this.sendTimer || (!this.batch && !this.outbox.length)) return;
        this.sendTimer = setTimeout(() => { this.sendTimer = null; this.flush(); },
            Math.max(0, COLLABORATION_FRAME_INTERVAL - (Date.now() - this.lastFlush)));
    }
    async flush() {
        if (this.sending || !this.opened || this.stopped || (!this.batch && !this.outbox.length)) return;
        if (Date.now() - this.lastFlush < COLLABORATION_FRAME_INTERVAL - 0.5) { this.scheduleFlush(); return; }
        if (!this.batch) {
            const messages = [];
            let size = 0;
            while (this.outbox.length && messages.length < 100) {
                const length = JSON.stringify(this.outbox[0]).length;
                if (messages.length && size + length > 1024 * 1024) break;
                messages.push(this.outbox.shift());
                size += length;
            }
            this.batch = { sequence: this.sequence + 1, messages };
        }
        this.lastFlush = Date.now();
        if (this.socket?.readyState === 1) {
            const batch = this.batch;
            try { this.socket.send(JSON.stringify(batch)); }
            catch { this.socket.close(); return; }
            this.sequence = batch.sequence;
            this.unacknowledged.set(batch.sequence, batch);
            this.batch = null;
            this.scheduleFlush();
            return;
        }
        this.sending = true;
        try {
            await this.post('messages', this.batch);
            this.sequence = this.batch.sequence;
            this.batch = null;
            if (this.statusText) { this.statusText = ''; this.onConnectionCallback(); }
            this.sending = false;
            this.scheduleFlush();
        } catch (error) {
            this.sending = false;
            this.statusText = error.status && ![403, 409].includes(error.status) ? error.message : 'Reconnecting…';
            this.onConnectionCallback();
            if ([403, 409].includes(error.status)) {
                this.opened = false;
                this.source?.close();
                this.registered = false;
                this.join();
            } else if (!error.status || error.status === 429 || error.status >= 500) {
                this.sendTimer = setTimeout(() => { this.sendTimer = null; this.flush(); }, 1500);
            }
        }
    }
    broadcastEvent(event) {
        const last = this.outbox.at(-1);
        if (last?.message.type === 1 && !last.recipient && JSON.stringify(last.message).length + JSON.stringify(event).length < 1024 * 1024) last.message.data.push(event);
        else this.send({ type: 1, data: [event] });
    }
    requestLock(targetSelector) {
        if (this.id !== this.leaderId && !this.peers.includes(this.leaderId)) return false;
        const message = { type: 2, targetSelector, requester: this.id, sender: this.id };
        if (this.id === this.leaderId) this.receiveMessage(message, this.id);
        else this.send(message, this.leaderId);
        return true;
    }
    changeLockOwner(targetSelector, owner, seqNum) {
        const message = { type: 4, targetSelector, owner, seqNum, sender: this.id };
        this.send(message);
        this.receiveMessage(message, this.id);
    }
    sendHistory(recipient) {
        let eventsLedger = [];
        let size = 0;
        for (const event of this.getPastEvents()) {
            const length = JSON.stringify(event).length;
            if (eventsLedger.length && size + length > 1024 * 1024) {
                this.send({ type: 0, eventsLedger }, recipient);
                eventsLedger = [];
                size = 0;
            }
            eventsLedger.push(event);
            size += length;
        }
        this.send({ type: 0, eventsLedger }, recipient);
    }
    sendProfileMessage(message, recipient) {
        if (!this.opened || (recipient && !this.peers.includes(recipient))) return false;
        this.send({ ...message, type: 'vischatter-profile' }, recipient);
        return true;
    }
    sendCursorMessage(message) {
        if (!this.opened || this.peers.length < 2) return false;
        // Keep only the newest unsent position, even while an HTTP batch is in flight.
        const pending = this.outbox.find(entry => entry.message.type === 'vischatter-cursor');
        if (pending) pending.message = { ...message, type: 'vischatter-cursor', sender: this.id };
        else this.send({ ...message, type: 'vischatter-cursor' });
        return true;
    }
    receiveMessage(data, sender) {
        if (data.type === 'vischatter-profile' || data.type === 'vischatter-cursor') {
            window.dispatchEvent(new CustomEvent(data.type === 'vischatter-profile' ? 'vischatter-profile-message' : 'vischatter-cursor-message',
                { detail: { ...data, sender, serverConfirmed: false } }));
        } else if (data.type === 0 && sender === this.leaderId) this.onEventReceived(data.eventsLedger, sender, true);
        else if (data.type === 1) this.onEventReceived(data.data, sender);
        else if (data.type === 2 && this.id === this.leaderId) this.onLockRequested(data.targetSelector, sender);
        else if (data.type === 4 && sender === this.leaderId) this.onNewLockOwner(data.targetSelector, data.owner, data.seqNum);
    }
}
window.VisChatterCommunication = VisChatterCommunication;
