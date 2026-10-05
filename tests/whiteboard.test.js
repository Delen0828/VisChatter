import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const sources = await Promise.all(['js.js', 'util.js', 'highlight.js', 'delete.js'].map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));

// A small event-driven DOM fixture keeps these behavior tests dependency-free.
function setup() {
    const nodes = new Map();
    const timers = new Map();
    const renders = [];
    let timerId = 0;
    let document;
    class Element extends EventTarget {
        constructor() { super(); this.children = []; this.hidden = false; this.attributes = {}; this.dataset = {}; this.value = ''; this.selectors = {}; this.options = []; this.classList = { toggle() {}, remove() {} }; }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name]; }
        append(...children) { this.children.push(...children); }
        appendChild(child) { this.append(child); return child; }
        replaceChildren(...children) { this.children = children; }
        querySelector(selector) { return this.selectors[selector] ||= new Element(); }
        querySelectorAll() { return []; }
        setCustomValidity() {}
        reportValidity() {}
        focus() { document.activeElement = this; }
        close() { this.open = false; this.dispatchEvent(new Event('close')); }
        showModal() { this.open = true; }
        remove() { nodes.delete(this.id); }
    }
    for (const id of ['model-select', 'addButton', 'empty-add-button', 'add-dialog', 'add-error', 'input', 'renderButton', 'add-form', 'empty-board', 'chart-count', 'chart-menu', 'headline', 'vis-container', 'comment-dialog', 'comment-input', 'comment-form', 'comment-chart-name', 'comment-status', 'recordButton', 'record-label', 'speech-comment-button', 'transcript-indicator', 'transcript-status', 'transcript-text', 'live-transcript', 'board-notice', 'clearButton']) nodes.set(id, new Element());
    nodes.get('model-select').value = 'deepseek/deepseek-v4.1-flash';
    document = Object.assign(new EventTarget(), {
        body: new Element(),
        getElementById: id => nodes.get(id),
        querySelectorAll: selector => selector === '.draggable-chart' ? [...nodes.values()].filter(node => node.isChart) : [],
        createElement: () => new Element(),
        createTextNode: text => ({ textContent: text })
    });
    class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } }
    class Recognition {
        static instances = [];
        constructor() { this.starts = 0; this.stops = 0; Recognition.instances.push(this); }
        start() { this.starts++; }
        stop() { this.stops++; }
        result(entries) { this.onresult({ results: entries.map(([text, isFinal]) => Object.assign([{ transcript: text }], { isFinal })) }); }
    }
    const context = vm.createContext({
        document, Event, CustomEvent, structuredClone, AbortController,
        crypto: { randomUUID }, console: { log() {}, error() {} },
        MutationObserver: class { observe() {} }, localStorage: { getItem() {}, setItem() {} },
        window: { SpeechRecognition: Recognition, addEventListener() {} },
        setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
        d3: {
            csvFormat: rows => [Object.keys(rows[0]).join(','), ...rows.map(row => Object.values(row).join(','))].join('\n'),
            csvParseRows: csv => csv.split('\n').map(row => row.split(','))
        },
        reRenderVegaLite: (spec, id) => renders.push({ spec, id })
    });
    sources.forEach(source => vm.runInContext(source, context));
    function addChart(id = 'vis-test') {
        const chart = new Element();
        chart.id = id;
        chart.isChart = true;
        chart.querySelector('.comment-popover').hidden = true;
        chart.querySelector('.chart-name').textContent = 'Visualization 1';
        nodes.set(id, chart);
        context.chartSpec = {
            data: { values: [{ category: 'A', value: 20 }, { category: 'B', value: 40 }] },
            mark: 'bar', encoding: { x: { field: 'category', type: 'nominal' }, y: { field: 'value', type: 'quantitative' }, color: { value: '#4c78a8' } }
        };
        vm.runInContext(`vlSpecDict['${id}'] = JSON.stringify(chartSpec); originalVisualizations['${id}'] = structuredClone(chartSpec);`, context);
        return chart;
    }
    const emit = (type, detail) => document.body.dispatchEvent(new CustomEvent(type, { detail }));
    const flushTimers = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); };
    return { context, nodes, renders, emit, addChart, flushTimers, Recognition };
}
const answer = value => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(['RETRIEVE', value]) } }] }) });
const annotation = value => ({ title: value });

test('comment bubbles hide at zero, sort by timestamp, and restore the latest annotation after preview', () => {
    const { context, nodes, renders, emit, addChart } = setup();
    const chart = addChart();
    emit('chart-comment', { id: 'new', visId: chart.id, time: 200, generation: 0, text: 'Newer', status: 'ready', annotatedSpec: annotation('new') });
    emit('chart-comment', { id: 'old', visId: chart.id, time: 100, generation: 0, text: 'Older', status: 'ready', annotatedSpec: annotation('old') });
    assert.equal(chart.querySelector('.comment-bubble').textContent, '+2');
    assert.equal(renders.at(-1).spec.title, 'new');
    const items = chart.querySelector('.comment-list').children;
    assert.equal(items[0].children[0].textContent, 'Newer');
    items[1].dispatchEvent(new Event('mouseenter'));
    assert.equal(renders.at(-1).spec.title, 'old');
    items[1].dispatchEvent(new Event('mouseleave'));
    assert.equal(renders.at(-1).spec.title, 'new');
    emit('chart-comments-clear', { visId: chart.id, generation: 1 });
    assert.equal(chart.querySelector('.comment-bubble').hidden, true);
    assert.equal(renders.at(-1).spec.mark, 'bar');
    // A result from before Clear cannot restore an old comment.
    emit('chart-comment', { id: 'late', visId: chart.id, time: 300, generation: 0, text: 'Late', status: 'ready', annotatedSpec: annotation('late') });
    assert.equal(chart.querySelector('.comment-list').children.length, 0);
});

test('out-of-order AI responses keep the newest submitted annotation as the default', async () => {
    const { context, renders, addChart } = setup();
    addChart();
    const requests = [];
    context.fetch = () => new Promise(resolve => requests.push(resolve));
    const older = vm.runInContext("highLight('Show A', 'vis-test', vlSpecDict['vis-test'])", context);
    const newer = vm.runInContext("highLight('Show B', 'vis-test', vlSpecDict['vis-test'])", context);
    requests[1](answer('B'));
    await newer;
    requests[0](answer('A'));
    await older;
    assert.match(renders.at(-1).spec.layer[1].encoding.color.condition.test, /'B'/);
    assert.equal(vm.runInContext("chartComments['vis-test'].length", context), 2);
});

test('clearing or deleting a chart cancels pending requests and ignores late responses', async () => {
    for (const action of ['chart-comments-clear', 'chart-delete', 'board-clear']) {
        const { context, nodes, emit, addChart } = setup();
        addChart();
        let resolve;
        let signal;
        context.fetch = (url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
        const pending = vm.runInContext("highLight('Show A', 'vis-test', vlSpecDict['vis-test'])", context);
        emit(action, { visId: 'vis-test', generation: 1 });
        assert.equal(signal.aborted, true);
        resolve(answer('A'));
        await pending;
        assert.equal(vm.runInContext('Object.keys(annotationRequests).length', context), 0);
        if (action === 'chart-comments-clear') assert.equal(vm.runInContext("chartComments['vis-test'].length", context), 0);
        else assert.equal(nodes.has('vis-test'), false);
    }
});

test('live recording accumulates finalized words once, restarts after pauses, and never posts comments', () => {
    const { context, nodes, flushTimers, Recognition } = setup();
    let posted = 0;
    context.document.body.addEventListener('chart-comment', () => posted++);
    nodes.get('recordButton').dispatchEvent(new Event('click'));
    const microphone = Recognition.instances[0];
    assert.equal(microphone.continuous, true);
    assert.equal(microphone.interimResults, true);
    microphone.result([['Hello', true], ['world', false]]);
    microphone.result([['Hello', true], ['world', true]]);
    assert.equal(vm.runInContext('liveFinalTranscript', context), 'Hello world');
    microphone.onend();
    flushTimers();
    assert.equal(microphone.starts, 2);
    microphone.result([['Again', true]]);
    assert.equal(vm.runInContext('liveFinalTranscript', context), 'Hello world Again');
    nodes.get('recordButton').dispatchEvent(new Event('click'));
    assert.equal(nodes.get('recordButton').getAttribute('aria-pressed'), 'false');
    microphone.onend();
    flushTimers();
    assert.equal(microphone.starts, 2);
    assert.equal(posted, 0);
});

test('speech comments fill a chart-specific draft and post through the annotation pipeline', async () => {
    const { context, nodes, addChart, Recognition } = setup();
    addChart();
    context.fetch = async () => answer('A');
    vm.runInContext("openCommentDialog('vis-test', true)", context);
    const microphone = Recognition.instances[0];
    assert.equal(microphone.continuous, false);
    microphone.result([['Show A', true]]);
    microphone.onend();
    assert.equal(nodes.get('comment-input').value, 'Show A');
    assert.equal(vm.runInContext("(chartComments['vis-test'] || []).length", context), 0);
    nodes.get('comment-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(vm.runInContext("chartComments['vis-test'][0].status", context), 'ready');
    assert.equal(nodes.get('comment-dialog').open, false);
});

test('unsupported or denied microphones reset the controls and leave typed commenting available', () => {
    const { context, nodes, Recognition } = setup();
    nodes.get('recordButton').dispatchEvent(new Event('click'));
    Recognition.instances[0].onerror({ error: 'not-allowed' });
    assert.equal(nodes.get('recordButton').getAttribute('aria-pressed'), 'false');
    assert.match(nodes.get('board-notice').textContent, /denied/);
    context.window.SpeechRecognition = undefined;
    vm.runInContext("startSpeechSession('comment')", context);
    assert.match(nodes.get('comment-status').textContent, /unavailable/);
    assert.equal(nodes.get('speech-comment-button').getAttribute('aria-pressed'), 'false');
});

test('a standard bar spec without an explicit color can still receive an annotation', async () => {
    const { context, addChart } = setup();
    addChart();
    context.fetch = async () => answer('A');
    await vm.runInContext("delete chartSpec.encoding.color; vlSpecDict['vis-test'] = JSON.stringify(chartSpec); highLight('Show A', 'vis-test', vlSpecDict['vis-test'])", context);
    assert.equal(vm.runInContext("chartComments['vis-test'][0].status", context), 'ready');
    assert.equal(vm.runInContext("JSON.parse(vlSpecDict['vis-test']).encoding.color", context), undefined);
});

test('local controls register immediately while shared listeners wait for VisConnect initialization', async () => {
    const bundle = await readFile(new URL('../visconnect-bundle.js', import.meta.url), 'utf8');
    const source = bundle.slice(bundle.indexOf('function delayAddEventListener()'), bundle.indexOf('function disableStopPropagation()'));
    const callbacks = [];
    class Element {
        constructor(local) { this.local = local; this.listeners = []; }
        closest() { return this.local; }
        addEventListener(...args) { this.listeners.push(args); }
    }
    const schedule = callback => callbacks.push(callback);
    const context = vm.createContext({ Element, setTimeout: schedule, window: { setTimeout: schedule } });
    vm.runInContext(source, context);
    const ready = context.delayAddEventListener();
    const local = new Element(true);
    const shared = new Element(false);
    const handler = () => {};
    local.addEventListener('click', handler, { once: true });
    shared.addEventListener('chart-comment', handler);
    assert.equal(local.listeners.length, 1);
    assert.equal(local.listeners[0][2].once, true);
    assert.equal(shared.listeners.length, 0);
    callbacks.forEach(callback => callback());
    await ready;
    assert.equal(shared.listeners.length, 1);
});
