import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/drag.js', import.meta.url), 'utf8');

function setup() {
    class Element {
        constructor() {
            this.listeners = new Map();
            this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } };
            const classes = new Set();
            this.classList = {
                add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
                toggle: (name, value) => value ? classes.add(name) : classes.delete(name)
            };
            this.isConnected = true;
        }
        addEventListener(type, listener) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(listener);
        }
        removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
        dispatchEvent(event) { for (const listener of [...(this.listeners.get(event.type) || [])]) listener(event); }
        emit(type, values = {}) {
            const event = { type, target: this, button: 0, preventDefault() { this.prevented = true; }, ...values };
            this.dispatchEvent(event);
            return event;
        }
        closest() { return this.control ? this : null; }
        getBoundingClientRect() { return { left: 36, top: 104, width: 480, height: 320 }; }
    }
    const board = new Element();
    board.scrollLeft = board.scrollTop = 0;
    const chart = new Element();
    chart.id = 'chart';
    chart.parentElement = board;
    const document = new Element();
    document.body = new Element();
    document.getElementById = id => id === chart.id && chart.isConnected ? chart : board;
    document.querySelectorAll = () => [chart];
    const window = new Element();
    window.getComputedStyle = element => ({ transform: element.style.transform || 'none' });
    const frames = new Map();
    const events = [];
    const plotSizes = [];
    let frameId = 0;
    const context = vm.createContext({
        document, window,
        DOMMatrixReadOnly: class {
            constructor(transform) { const parts = transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/); this.m41 = Number(parts[1]); this.m42 = Number(parts[2]); }
        },
        requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame: id => frames.delete(id),
        resizeChartVisualization: element => plotSizes.push([element.style.width, element.style.height]),
        boardEvent: (type, detail) => { events.push({ type, detail }); document.body.emit(type, { detail }); }
    });
    vm.runInContext(source, context);
    chart.style.transform = 'translate3d(36px, 36px, 0)';
    context.makeDraggable(chart);
    return { chart, board, document, window, frames, events, plotSizes };
}

test('hovering every border and corner changes only the resize cursor', () => {
    const { chart } = setup();
    for (const [clientX, clientY, cursor] of [
        [38, 106, 'nw'], [276, 106, 'n'], [514, 106, 'ne'], [514, 264, 'e'],
        [514, 422, 'se'], [276, 422, 's'], [38, 422, 'sw'], [38, 264, 'w']
    ]) {
        chart.emit('mousemove', { clientX, clientY });
        assert.equal(chart.style.cursor, `${cursor}-resize`);
    }
    chart.emit('mousemove', { clientX: 276, clientY: 264 });
    assert.equal(chart.style.cursor, '');
    chart.emit('mouseleave');
    assert.equal(chart.style.width, undefined);
});

test('corner dragging resizes the panel and plot, then publishes its final size and cleans up', () => {
    const { chart, document, events, plotSizes, frames } = setup();
    const down = chart.emit('mousedown', { clientX: 514, clientY: 422 });
    assert.equal(down.prevented, true);
    assert.equal(chart.classList.contains('dragging'), false);
    document.emit('mousemove', { clientX: 714, clientY: 522 });
    assert.equal(chart.style.width, '680px');
    assert.equal(chart.style.height, '420px');
    assert.equal(chart.style.transform, 'translate3d(36px, 36px, 0)');
    assert.deepEqual(plotSizes.at(-1), ['680px', '420px']);
    document.emit('mouseup');
    assert.equal(events.at(-1).type, 'chart-resize');
    assert.deepEqual({ ...events.at(-1).detail }, { visId: 'chart', x: 36, y: 36, width: 680, height: 420 });
    assert.equal(frames.size, 0);
    assert.equal(document.listeners.get('mousemove').size, 0);
    assert.equal(document.body.classList.contains('chart-resizing'), false);
    assert.equal(chart.cancelResize, null);
});

test('top and left resizing keeps opposite edges fixed and clamps at minimum size and board origin', () => {
    const { chart, document, window } = setup();
    chart.emit('mousedown', { clientX: 38, clientY: 106 });
    document.emit('mousemove', { clientX: 1000, clientY: 1000 });
    assert.equal(chart.style.width, '240px');
    assert.equal(chart.style.height, '180px');
    assert.equal(chart.style.transform, 'translate3d(276px, 176px, 0)');
    document.emit('mousemove', { clientX: -100, clientY: -100 });
    assert.equal(chart.style.width, '516px');
    assert.equal(chart.style.height, '356px');
    assert.equal(chart.style.transform, 'translate3d(0px, 0px, 0)');
    window.emit('blur');
    assert.equal(document.body.classList.contains('chart-resizing'), false);
});

test('interior dragging and controls retain their behavior while shared resize events update the chart', () => {
    const { chart, document, events } = setup();
    chart.emit('mousedown', { clientX: 200, clientY: 130 });
    document.emit('mousemove', { clientX: 250, clientY: 160 });
    document.emit('mouseup');
    assert.equal(chart.style.transform, 'translate3d(86px, 66px, 0)');
    assert.equal(chart.style.width, undefined);
    assert.equal(events.at(-1).type, 'chart-move');
    chart.emit('mousedown', { target: { closest: () => true }, clientX: 514, clientY: 422 });
    assert.equal(document.body.classList.contains('chart-resizing'), false);
    document.body.emit('chart-resize', { detail: { visId: 'chart', x: 90, y: 100, width: 600, height: 400 } });
    assert.equal(chart.style.width, '600px');
    assert.equal(chart.style.height, '400px');
    assert.equal(chart.style.transform, 'translate3d(90px, 100px, 0)');
    document.body.emit('chart-resize', { detail: { visId: 'chart', x: 0, y: 0, width: NaN, height: 1 } });
    assert.equal(chart.style.width, '600px');
});
