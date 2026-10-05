import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const sources = await Promise.all(['js.js', 'util.js', 'highlight.js', 'share.js', 'delete.js'].map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));

// A small event-driven DOM fixture keeps these behavior tests dependency-free.
function setup() {
    const nodes = new Map();
    const timers = new Map();
    const renders = [];
    let timerId = 0;
    let document;
    class Element extends EventTarget {
        constructor() { super(); this.children = []; this.hidden = false; this.attributes = {}; this.dataset = {}; this.value = ''; this.selectors = {}; this.style = {}; this.options = []; this.classList = { toggle() {}, remove() {} }; }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name]; }
        append(...children) { children.forEach(child => child.parentElement = this); this.children.push(...children); }
        appendChild(child) { this.append(child); return child; }
        replaceChildren(...children) { this.children = children; }
        querySelector(selector) { return this.selectors[selector] ||= new Element(); }
        querySelectorAll(selector) {
            const direct = [...new Set([...this.children, ...Object.values(this.selectors)])];
            const children = [...direct, ...direct.flatMap(child => child.querySelectorAll(selector))];
            return selector === '.annotation-choice' ? children.filter(child => child.className === 'annotation-choice') : [];
        }
        getBoundingClientRect() { return this.rect || { left: 36, top: 104, right: 436, bottom: 454, width: 320, height: 220 }; }
        contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
        setCustomValidity() {}
        reportValidity() {}
        focus() { document.activeElement = this; }
        click() { this.dispatchEvent(new Event('click')); }
        close() { this.open = false; this.dispatchEvent(new Event('close')); }
        showModal() { this.open = true; }
        remove() { nodes.delete(this.id); if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    }
    for (const id of ['connection-status', 'connection-status-text', 'model-status', 'close-comment-button', 'model-select', 'addButton', 'add-dialog', 'add-error', 'input', 'renderButton', 'add-form', 'chart-menu', 'headline', 'vis-container', 'comment-editor', 'comment-input', 'comment-form', 'comment-status', 'recordButton', 'record-label', 'speech-comment-button', 'transcript-indicator', 'transcript-status', 'transcript-text', 'live-transcript', 'board-notice', 'clearButton']) nodes.set(id, new Element());
    nodes.get('model-select').value = 'deepseek/deepseek-v4.1-flash';
    for (const id of ['chart-share-menu', 'chart-share-button']) nodes.set(id, new Element());
    nodes.get('chart-menu').append(nodes.get('chart-share-button'), nodes.get('chart-share-menu'));
    nodes.get('chart-share-menu').hidden = true;
    nodes.get('comment-editor').hidden = true;
    nodes.get('model-status').hidden = true;
    nodes.get('headline').offsetHeight = 68;
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
        document, Event, CustomEvent, structuredClone, AbortController, Blob, URL, navigator: {},
        crypto: { randomUUID }, console: { log() {}, error() {} },
        MutationObserver: class { observe() {} }, localStorage: { getItem() {}, setItem() {} },
        window: { SpeechRecognition: Recognition, innerWidth: 1280, innerHeight: 800, addEventListener() {} },
        selectChart() {},
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
    assert.equal(items[0].children[0].textContent, 'Base version');
    assert.equal(items[1].children[0].textContent, 'Newer');
    items[2].dispatchEvent(new Event('mouseenter'));
    assert.equal(renders.at(-1).spec.title, 'old');
    items[2].dispatchEvent(new Event('mouseleave'));
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

test('round choices lock an older annotation or the base across previews and newer responses', () => {
    const { context, renders, emit, addChart } = setup();
    const chart = addChart();
    const addComment = (id, time) => emit('chart-comment', { id, time, visId: chart.id, generation: 0, text: id, status: 'ready', annotatedSpec: annotation(id) });
    addComment('older', 100);
    addComment('newer', 200);
    let items = chart.querySelector('.comment-list').children;
    const oldChoice = items[2].children.at(-1);
    oldChoice.click();
    assert.equal(oldChoice.getAttribute('aria-pressed'), 'true');
    assert.equal(items[1].children.at(-1).getAttribute('aria-pressed'), 'false');
    addComment('newest', 300);
    assert.equal(renders.at(-1).spec.title, 'older');
    items = chart.querySelector('.comment-list').children;
    items[0].dispatchEvent(new Event('focusin'));
    assert.equal(renders.at(-1).spec.mark, 'bar');
    items[0].dispatchEvent(new Event('focusout'));
    assert.equal(renders.at(-1).spec.title, 'older');
    items[1].dispatchEvent(new Event('mouseenter'));
    assert.equal(renders.at(-1).spec.title, 'newest');
    items[1].dispatchEvent(new Event('mouseleave'));
    assert.equal(renders.at(-1).spec.title, 'older');
    items[0].children.at(-1).click();
    addComment('later', 400);
    assert.equal(renders.at(-1).spec.mark, 'bar');
    assert.equal(chart.querySelector('.comment-list').children[0].children.at(-1).getAttribute('aria-pressed'), 'true');
    emit('chart-comments-clear', { visId: chart.id, generation: 1 });
    assert.equal(vm.runInContext("defaultAnnotations['vis-test']", context), undefined);
    emit('chart-comment', { id: 'fresh', time: 500, visId: chart.id, generation: 1, text: 'fresh', status: 'ready', annotatedSpec: annotation('fresh') });
    assert.equal(renders.at(-1).spec.title, 'fresh');
    vm.runInContext("setDefaultAnnotation('vis-test', BASE_VERSION)", context);
    emit('chart-delete', { visId: chart.id });
    assert.equal(vm.runInContext("defaultAnnotations['vis-test']", context), undefined);
});

test('pending and failed annotations cannot become the default visualization', () => {
    const { context, emit, addChart } = setup();
    const chart = addChart();
    for (const status of ['pending', 'error']) {
        emit('chart-comment', { id: status, time: 100, visId: chart.id, generation: 0, text: status, status });
    }
    for (const item of chart.querySelector('.comment-list').children.slice(1)) assert.equal(item.children.at(-1).disabled, true);
    vm.runInContext("setDefaultAnnotation('vis-test', 'pending'); setDefaultAnnotation('vis-test', 'error')", context);
    assert.equal(vm.runInContext("defaultAnnotations['vis-test']", context), undefined);
});

test('Share captures the selected version and its code survives newer annotations', async () => {
    const { context, emit, addChart } = setup();
    const chart = addChart();
    emit('chart-comment', { id: 'old', time: 100, visId: chart.id, generation: 0, text: 'old', status: 'ready', annotatedSpec: annotation('old') });
    const copied = [];
    context.navigator.clipboard = { writeText: async code => copied.push(JSON.parse(code)) };
    context.chart = chart;
    vm.runInContext("setDefaultAnnotation('vis-test', 'old'); openChartMenu(chart, 100, 200)", context);
    emit('chart-comment', { id: 'new', time: 200, visId: chart.id, generation: 0, text: 'new', status: 'ready', annotatedSpec: annotation('new') });
    await vm.runInContext("shareChartVersion(menuChartSpec, 'copy-code')", context);
    assert.equal(copied[0].title, 'old');
    vm.runInContext("setDefaultAnnotation('vis-test', BASE_VERSION); openChartMenu(chart, 100, 200)", context);
    await vm.runInContext("shareChartVersion(menuChartSpec, 'copy-code')", context);
    assert.equal(copied[1].mark, 'bar');
    // Opening actions during a keyboard preview also captures the preview.
    chart.querySelector('.comment-popover').hidden = false;
    vm.runInContext("previewComment('vis-test', {id: 'old'}); openChartMenu(chart, 100, 200)", context);
    await vm.runInContext("shareChartVersion(menuChartSpec, 'copy-code')", context);
    assert.equal(copied[2].title, 'old');
});

test('Share submenu stays inside the viewport near both edges and on narrow screens', () => {
    const { context } = setup();
    context.size = { width: 218, height: 132 };
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        context.viewport = viewport;
        for (const x of [8, viewport.width - 226]) {
            context.anchor = { left: x, right: x + 218, top: viewport.height - 228, bottom: viewport.height - 8 };
            const position = vm.runInContext('shareMenuPosition(anchor, size, viewport, 94)', context);
            assert.ok(position.x >= 8 && position.x + 218 <= viewport.width - 8);
            assert.ok(position.y >= 102 && position.y + 132 <= viewport.height - 8);
        }
    }
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
    vm.runInContext("openCommentEditor('vis-test', true)", context);
    const microphone = Recognition.instances[0];
    assert.equal(microphone.continuous, false);
    microphone.result([['Show A', true]]);
    microphone.onend();
    assert.equal(nodes.get('comment-input').value, 'Show A');
    assert.equal(vm.runInContext("(chartComments['vis-test'] || []).length", context), 0);
    nodes.get('comment-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(vm.runInContext("chartComments['vis-test'][0].status", context), 'ready');
    assert.equal(nodes.get('comment-editor').hidden, true);
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

test('model status stays busy until all pending comments finish, fail, or are cleared', () => {
    const { nodes, emit, addChart } = setup();
    addChart();
    const comment = { visId: 'vis-test', generation: 0, time: 100, text: 'Pending', status: 'pending' };
    emit('chart-comment', { ...comment, id: 'one' });
    emit('chart-comment', { ...comment, id: 'two' });
    assert.equal(nodes.get('model-status').hidden, false);
    assert.equal(nodes.get('model-status').getAttribute('aria-busy'), 'true');
    emit('chart-comment', { ...comment, id: 'one', status: 'ready', annotatedSpec: annotation('ready') });
    assert.equal(nodes.get('model-status').hidden, false);
    emit('chart-comment', { ...comment, id: 'two', status: 'error', error: 'Provider unavailable' });
    assert.equal(nodes.get('model-status').hidden, true);
    assert.equal(nodes.get('model-status').getAttribute('aria-busy'), 'false');
    emit('chart-comment', { ...comment, id: 'three' });
    emit('chart-comments-clear', { visId: 'vis-test', generation: 1 });
    assert.equal(nodes.get('model-status').hidden, true);
    emit('chart-comment', { ...comment, generation: 1, id: 'four' });
    emit('chart-delete', { visId: 'vis-test' });
    assert.equal(nodes.get('model-status').hidden, true);
});

test('comment editor anchors beside its chart and stays within the viewport', () => {
    const { context, nodes, addChart } = setup();
    addChart();
    vm.runInContext("openCommentEditor('vis-test')", context);
    const editor = nodes.get('comment-editor');
    assert.equal(editor.hidden, false);
    assert.equal(editor.style.left, '448px');
    assert.equal(editor.style.top, '104px');
    context.anchor = { left: 900, top: 620, right: 1250, bottom: 790 };
    context.size = { width: 320, height: 220 };
    const left = vm.runInContext('commentEditorPosition(anchor, size, {width: 1280, height: 800}, 68)', context);
    assert.equal(left.x, 568);
    assert.equal(left.y, 572);
    context.anchor = { left: 36, top: 94, right: 436, bottom: 454 };
    const narrow = vm.runInContext('commentEditorPosition(anchor, size, {width: 390, height: 844}, 94)', context);
    assert.equal(narrow.x, 36);
    assert.equal(narrow.y, 466);
    vm.runInContext('closeCommentEditor()', context);
    assert.equal(editor.hidden, true);
});

test('connection states stay in the header without creating a loading overlay', async () => {
    const { context, nodes } = setup();
    const bundle = await readFile(new URL('../visconnect-bundle.js', import.meta.url), 'utf8');
    const source = bundle.slice(bundle.indexOf('var VisConnectUi ='), bundle.indexOf('// From https://hackernoon.com/copying-text'));
    vm.runInContext(source, context);
    const communication = { opened: false, getNumberOfConnections: () => 0 };
    const ui = Object.create(context.VisConnectUi.prototype);
    ui.visconnect = { protocol: { communication }, stop() {} };
    ui.showLoadingScreen();
    assert.equal(nodes.get('connection-status-text').textContent, 'Connecting…');
    assert.equal(context.document.body.children.length, 0);
    communication.opened = true;
    ui.hideLoadingScreen();
    assert.equal(nodes.get('connection-status-text').textContent, 'Connected');
    communication.getNumberOfConnections = () => 3;
    ui.updateConnections();
    assert.equal(nodes.get('connection-status-text').textContent, '2 connected');
    ui.onFailure();
    ui.hideLoadingScreen();
    assert.equal(nodes.get('connection-status').getAttribute('data-state'), 'disconnected');
    assert.equal(nodes.get('connection-status-text').textContent, 'Disconnected');
});

test('empty canvas and comment markup preserve the minimal, nonmodal interface preferences', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /<div id="vis-container" aria-label="Charts"><\/div>/);
    assert.match(html, /<section id="comment-editor" role="dialog" aria-modal="false"/);
    assert.doesNotMatch(html, /id="empty-board"|A space for your data stories|Drag to arrange|ON YOUR WHITEBOARD|class="board-name"|id="comment-dialog"/);
});
