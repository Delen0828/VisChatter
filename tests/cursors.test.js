import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/cursors.js', import.meta.url), 'utf8');
const identity = await readFile(new URL('../src/identity.js', import.meta.url), 'utf8');

function fixture() {
    class Element {
        constructor() {
            this.listeners = new Map(); this.children = []; this.attributes = {};
            this.style = { setProperty(name, value) { this[name] = value; } };
            this.rect = { left: 0, top: 68 }; this.hidden = false;
        }
        addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
        emit(type, values = {}) { for (const fn of this.listeners.get(type) || []) fn({ type, target: this, ...values }); }
        appendChild(child) { child.parent = this; this.children.push(child); return child; }
        remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
        setAttribute(name, value) { this.attributes[name] = value; }
        closest() { return this.control ? this : null; }
        getBoundingClientRect() { return this.rect; }
    }
    const board = Object.assign(new Element(), { rect: { left: 20, top: 100 }, scrollLeft: 100, scrollTop: 200,
        clientLeft: 2, clientTop: 3, clientWidth: 800, clientHeight: 600 });
    const whiteboard = new Element();
    const document = Object.assign(new Element(), { hidden: false, getElementById: id => id === 'vis-container' ? board : whiteboard,
        createElement: () => new Element() });
    const profiles = new Map([['alice', { id: 'alice', username: 'Alice' }], ['bob', { id: 'bob', username: 'Bob' }]]);
    const sent = [];
    let connected = ['self', 'alice', 'bob'];
    const window = Object.assign(new Element(), { commentIdentity: { current: { username: 'Pat' }, profileFor: id => profiles.get(id) },
        vc: { ownId: 'self', connectedIds: () => connected, sendCursorMessage: message => { sent.push(message); return true; } } });
    const timers = new Map(); const intervals = []; let timerId = 0; let now = 0;
    const context = vm.createContext({ document, window, Date: { now: () => now },
        setTimeout: (fn, delay = 0) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id),
        setInterval: fn => intervals.push(fn) });
    vm.runInContext(identity.slice(0, identity.indexOf('(() => {')), context);
    vm.runInContext(source, context);
    const receive = detail => window.emit('vischatter-cursor-message', { detail });
    const flush = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(timer => timer.fn()); };
    const tick = ms => {
        const end = now + ms;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            now = next[1].at; timers.delete(next[0]); next[1].fn();
        }
        now = end;
    };
    return { board, whiteboard, layer: whiteboard.children[0], document, window, profiles, sent, receive, flush, intervals,
        tick,
        disconnect: ids => { connected = ids; window.emit('visconnect-connections-changed'); },
        advance: ms => { now += ms; intervals.forEach(fn => fn()); }, context };
}

test('remote cursors use profile colors and board coordinates at different scroll positions', () => {
    const f = fixture();
    f.receive({ sender: 'alice', visible: true, x: 360, y: 480 });
    f.receive({ sender: 'bob', visible: true, x: 400, y: 500 });
    assert.equal(f.layer.children.length, 2);
    const alice = f.layer.children[0];
    assert.equal(alice.style.transform, 'translate(282px, 315px)');
    assert.equal(alice.style.color, vm.runInContext("profileColor('Alice')", f.context));
    assert.equal(alice.style['--cursor-color'], alice.style.color);
    assert.equal(alice.children[0].textContent, 'Alice');
    assert.equal(f.layer.children[1].style.color, vm.runInContext("profileColor('Bob')", f.context));
    f.board.scrollLeft = 200; f.board.scrollTop = 300; f.board.emit('scroll');
    assert.equal(alice.style.transform, 'translate(182px, 215px)');
    f.board.scrollLeft = 800; f.board.emit('scroll');
    assert.equal(alice.hidden, true);
    f.board.scrollLeft = 100; f.board.emit('scroll');
    assert.equal(alice.hidden, false);
    assert.equal(f.layer.attributes['data-visconnect-local'], '');
    assert.equal(f.layer.attributes['aria-hidden'], 'true');
});

test('cursor sending is throttled, shares content coordinates, and hides on controls, blur and tab hiding', () => {
    const f = fixture();
    f.document.emit('pointermove', { target: f.board, clientX: 200, clientY: 240 });
    f.document.emit('pointermove', { target: f.board, clientX: 220, clientY: 260 });
    assert.equal(f.sent.length, 0);
    f.flush();
    assert.deepEqual({ ...f.sent[0] }, { visible: true, x: 298, y: 357 });
    f.board.scrollTop = 240; f.board.emit('scroll'); f.flush();
    assert.equal(f.sent.at(-1).y, 397);
    f.window.emit('blur');
    assert.equal(f.sent.at(-1).visible, false);
    f.document.emit('pointermove', { target: f.board, clientX: 220, clientY: 260 }); f.flush();
    f.document.hidden = true; f.document.emit('visibilitychange');
    assert.equal(f.sent.at(-1).visible, false);
    f.document.hidden = false;
    f.board.control = true;
    const count = f.sent.length;
    f.document.emit('pointermove', { target: f.board, clientX: 220, clientY: 260 }); f.flush();
    assert.equal(f.sent.length, count);
});

test('cursors disappear on leave, disconnect and stale presence, and ignore local or invalid messages', () => {
    const f = fixture();
    for (const message of [{ sender: 'self', x: 360, y: 480 }, { sender: 'stranger', x: 360, y: 480 },
        { sender: 'alice', x: NaN, y: 480 }, { sender: 'alice', x: -5, y: 480 }]) f.receive({ ...message, visible: true });
    assert.equal(f.layer.children.length, 0);
    f.receive({ sender: 'alice', visible: true, x: 360, y: 480 });
    f.receive({ sender: 'alice', visible: false });
    assert.equal(f.layer.children.length, 0);
    f.receive({ sender: 'alice', visible: true, x: 360, y: 480 });
    f.disconnect(['self', 'bob']);
    assert.equal(f.layer.children.length, 0);
    f.receive({ sender: 'bob', visible: true, x: 360, y: 480 });
    f.advance(16000);
    assert.equal(f.layer.children.length, 0);
});

test('a cursor arriving before its roster waits for the confirmed profile and never trusts a supplied color', () => {
    const f = fixture();
    f.profiles.delete('alice');
    f.receive({ sender: 'alice', visible: true, x: 360, y: 480, username: 'Spoof', color: '#ff0000' });
    const cursor = f.layer.children[0];
    assert.equal(cursor.hidden, true);
    f.profiles.set('alice', { id: 'alice', username: 'Álice' });
    f.window.emit('vischatter-profiles-changed');
    assert.equal(cursor.hidden, false);
    assert.equal(cursor.children[0].textContent, 'Álice');
    assert.equal(cursor.style.color, vm.runInContext("profileColor('Álice')", f.context));
});

test('60 fps pointer input publishes at 30 fps using the latest position', () => {
    const f = fixture();
    for (let frame = 0; frame < 60; frame++) {
        f.document.emit('pointermove', { target: f.board, clientX: 200 + frame, clientY: 240 });
        f.tick(1000 / 60);
    }
    assert.ok(f.sent.length >= 30 && f.sent.length <= 31, `Published ${f.sent.length} positions in one second`);
    f.tick(1000 / 30);
    assert.equal(f.sent.at(-1).x, 200 + 59 - f.board.rect.left - f.board.clientLeft + f.board.scrollLeft);
});
