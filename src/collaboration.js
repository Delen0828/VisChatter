// Implements the VisConnect communication API over the app's HTTPS origin.
// EventSource reconnects automatically; POST batches retain order and retry safely.
class VisChatterCommunication {
    constructor(data) {
        Object.assign(this, data);
        this.id = data.ownId;
        this.token = crypto.randomUUID();
        this.peers = [];
        this.opened = false;
        this.sequence = 0;
        this.outbox = [];
        this.onConnectionCallback = () => {};
    }
    credentials() { return { room: this.leaderId, id: this.id, token: this.token }; }
    init() {
        this.join();
        window.addEventListener('pagehide', () => {
            this.stopped = true;
            clearTimeout(this.retryTimer);
            clearTimeout(this.sendTimer);
            this.source?.close();
            navigator.sendBeacon?.('/api/collaboration/leave', new Blob([JSON.stringify(this.credentials())], { type: 'application/json' }));
        });
        window.addEventListener('pageshow', event => {
            if (event.persisted) { this.stopped = false; this.join(); }
        });
    }
    async post(action, body) {
        const response = await fetch(`/api/collaboration/${action}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...this.credentials(), ...body }), signal: AbortSignal.timeout(15000),
        });
        const result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.error || 'Cannot connect to this session.'), { status: response.status });
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
            const result = await this.post('join');
            if (this.stopped) return;
            if (this.batch && this.batch.sequence <= result.sequence) this.batch = null;
            else if (this.batch) this.batch.sequence = result.sequence + 1;
            this.sequence = result.sequence;
            this.source?.close();
            this.source = new EventSource(`/api/collaboration/events?${new URLSearchParams(this.credentials())}`);
            this.source.onmessage = event => this.receivePacket(JSON.parse(event.data));
            this.source.onerror = () => {
                this.opened = false;
                this.statusText = 'Reconnecting…';
                this.onConnectionCallback();
            };
        } catch (error) {
            this.opened = false;
            this.statusText = error.status ? error.message : 'Reconnecting…';
            this.onConnectionCallback();
            this.retryTimer = setTimeout(() => this.join(), 2000);
        } finally { this.joining = false; }
    }
    receivePacket(packet) {
        if (packet.kind === 'expired') {
            this.source.close();
            this.opened = false;
            this.statusText = 'Reconnecting…';
            this.onConnectionCallback();
            this.join();
        } else if (packet.kind === 'ready') {
            this.peers = packet.peers;
            this.opened = true;
            this.statusText = '';
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
        if (!this.sendTimer) this.sendTimer = setTimeout(() => { this.sendTimer = null; this.flush(); }, 40);
    }
    async flush() {
        if (this.sending || !this.opened || this.stopped || (!this.batch && !this.outbox.length)) return;
        this.sending = true;
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
        try {
            await this.post('messages', this.batch);
            this.sequence = this.batch.sequence;
            this.batch = null;
            if (this.statusText) { this.statusText = ''; this.onConnectionCallback(); }
            this.sending = false;
            this.flush();
        } catch (error) {
            this.sending = false;
            this.statusText = error.status && ![403, 409].includes(error.status) ? error.message : 'Reconnecting…';
            this.onConnectionCallback();
            if ([403, 409].includes(error.status)) {
                this.opened = false;
                this.source?.close();
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
                { detail: { ...data, sender } }));
        } else if (data.type === 0 && sender === this.leaderId) this.onEventReceived(data.eventsLedger, sender, true);
        else if (data.type === 1) this.onEventReceived(data.data, sender);
        else if (data.type === 2 && this.id === this.leaderId) this.onLockRequested(data.targetSelector, sender);
        else if (data.type === 4 && sender === this.leaderId) this.onNewLockOwner(data.targetSelector, data.owner, data.seqNum);
    }
}
window.VisChatterCommunication = VisChatterCommunication;
