import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/vega.js', import.meta.url), 'utf8');
const base = { title: 'Base', mark: 'bar' };

function setup({ rendered = true } = {}) {
    class Element {
        constructor() { this.children = []; this.attributes = {}; this.style = {}; }
        get isConnected() { return this === body || !!this.parentElement?.isConnected; }
        appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
        remove() {
            if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
            this.parentElement = null;
        }
        replaceWith(child) {
            const parent = this.parentElement;
            const index = parent.children.indexOf(this);
            child.remove();
            parent.children[index] = child;
            child.parentElement = parent;
            this.parentElement = null;
        }
        replaceChildren(...children) { this.children.forEach(child => child.parentElement = null); this.children = []; children.forEach(child => this.appendChild(child)); }
        setAttribute(name, value) { this.attributes[name] = value; }
        removeAttribute(name) { delete this.attributes[name]; if (name === 'style') this.style = {}; }
        querySelector(selector) {
            for (const child of this.children) {
                if (child.className === selector.slice(1)) return child;
                const match = child.querySelector(selector);
                if (match) return match;
            }
            return null;
        }
        getBoundingClientRect() { return { width: 480, height: 320 }; }
    }
    const body = new Element();
    const chart = body.appendChild(new Element());
    chart.id = 'chart';
    const plot = chart.appendChild(new Element());
    plot.className = 'chart-visualization';
    const svg = plot.appendChild(new Element());
    svg.textContent = 'Base';
    const requests = [];
    const notices = [];
    const view = () => ({ finalized: 0, finalize() { this.finalized++; } });
    const originalView = view();
    if (rendered) {
        chart.vegaView = originalView;
        chart.renderedSpec = JSON.stringify(base);
    }
    const context = vm.createContext({
        document: { body, getElementById: id => id === chart.id && chart.isConnected ? chart : null, createElement: () => new Element() },
        console, notifyBoard: message => notices.push(message),
        vegaEmbed: (target, spec) => new Promise((resolve, reject) => {
            const nextView = view();
            requests.push({ target, spec, view: nextView, reject, finish() {
                const svg = new Element();
                svg.textContent = spec.title;
                target.replaceChildren(svg);
                resolve({ view: nextView });
            } });
        })
    });
    vm.runInContext(source, context);
    return { body, chart, plot, originalView, requests, notices, render: spec => context.reRenderVegaLite(spec, chart.id) };
}

test('a preview keeps the visible plot and its view alive until the replacement is ready', async () => {
    const fixture = setup();
    const pending = fixture.render({ title: 'Preview', mark: 'bar' });
    await Promise.resolve();
    assert.equal(fixture.chart.querySelector('.chart-visualization'), fixture.plot);
    assert.equal(fixture.plot.children[0].textContent, 'Base');
    assert.equal(fixture.originalView.finalized, 0);
    assert.notEqual(fixture.requests[0].target, fixture.plot);
    assert.equal(fixture.requests[0].target.style.width, '480px');
    fixture.requests[0].finish();
    await pending;
    const visible = fixture.chart.querySelector('.chart-visualization');
    assert.equal(visible.children[0].textContent, 'Preview');
    assert.equal(visible.attributes['aria-hidden'], undefined);
    assert.deepEqual(visible.style, {});
    assert.equal(fixture.originalView.finalized, 1);
    assert.equal(fixture.body.children.length, 1);
});

test('a slow superseded preview cannot overwrite the latest version or block its render', async () => {
    const fixture = setup();
    const older = fixture.render({ title: 'Older' });
    await Promise.resolve();
    const newer = fixture.render({ title: 'Newer' });
    await Promise.resolve();
    assert.equal(fixture.requests.length, 2);
    fixture.requests[1].finish();
    await newer;
    assert.equal(fixture.chart.querySelector('.chart-visualization').children[0].textContent, 'Newer');
    fixture.requests[0].finish();
    await older;
    assert.equal(fixture.chart.querySelector('.chart-visualization').children[0].textContent, 'Newer');
    assert.equal(fixture.requests[0].view.finalized, 1);
    assert.equal(fixture.requests[1].view.finalized, 0);
    assert.equal(fixture.body.children.length, 1);
});

test('rapid requests in one turn render only the last hovered version', async () => {
    const fixture = setup();
    const pending = [fixture.render({ title: 'First' }), fixture.render(base), fixture.render({ title: 'Last' })];
    await Promise.resolve();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].spec.title, 'Last');
    fixture.requests[0].finish();
    await Promise.all(pending);
    assert.equal(fixture.chart.querySelector('.chart-visualization').children[0].textContent, 'Last');
});

test('duplicate focus and hover requests reuse an unfinished or visible version', async () => {
    const fixture = setup();
    const spec = { title: 'Preview' };
    const pending = fixture.render(spec);
    await Promise.resolve();
    assert.equal(fixture.render(structuredClone(spec)), pending);
    assert.equal(fixture.requests.length, 1);
    fixture.requests[0].finish();
    await pending;
    await fixture.render(structuredClone(spec));
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].view.finalized, 0);
});

test('leaving a preview restores the already visible default and invalidates the unfinished render', async () => {
    const fixture = setup();
    const pending = fixture.render({ title: 'Preview' });
    await Promise.resolve();
    await fixture.render(base);
    assert.equal(fixture.requests.length, 1);
    fixture.requests[0].finish();
    await pending;
    assert.equal(fixture.chart.querySelector('.chart-visualization'), fixture.plot);
    assert.equal(fixture.requests[0].view.finalized, 1);
    assert.equal(fixture.originalView.finalized, 0);
    assert.equal(fixture.body.children.length, 1);
});

test('deleting a chart during a render discards its result and removes the temporary plot', async () => {
    const fixture = setup();
    const pending = fixture.render({ title: 'Preview' });
    await Promise.resolve();
    fixture.chart.remove();
    fixture.requests[0].finish();
    await pending;
    assert.equal(fixture.requests[0].view.finalized, 1);
    assert.equal(fixture.body.children.length, 0);
});

test('failed previews preserve the visible chart, ignore stale errors, and allow retrying', async () => {
    const fixture = setup();
    const stale = fixture.render({ title: 'Stale' });
    await Promise.resolve();
    const spec = { title: 'Preview' };
    const current = fixture.render(spec);
    await Promise.resolve();
    fixture.requests[0].reject(new Error('Stale error'));
    await stale;
    assert.equal(fixture.notices.length, 0);
    fixture.requests[1].reject(new Error('Data unavailable'));
    await current;
    assert.equal(fixture.chart.querySelector('.chart-visualization'), fixture.plot);
    assert.equal(fixture.originalView.finalized, 0);
    assert.match(fixture.notices[0], /Data unavailable/);
    assert.equal(fixture.body.children.length, 1);
    const retry = fixture.render(spec);
    await Promise.resolve();
    fixture.requests[2].finish();
    await retry;
    assert.equal(fixture.chart.querySelector('.chart-visualization').children[0].textContent, 'Preview');
});

test('initial render failures remain visible on the chart and clean up the temporary plot', async () => {
    const fixture = setup({ rendered: false });
    const pending = fixture.render(base);
    await Promise.resolve();
    fixture.requests[0].reject(new Error('Invalid specification'));
    await pending;
    assert.equal(fixture.plot.children[0].className, 'chart-error');
    assert.match(fixture.plot.children[0].textContent, /Invalid specification/);
    assert.equal(fixture.body.children.length, 1);
});
