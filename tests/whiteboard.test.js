import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const sources = await Promise.all(['identity.js', 'js.js', 'util.js', 'highlight.js', 'share.js', 'delete.js'].map(file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')));

// A small event-driven DOM fixture keeps these behavior tests dependency-free.
function setup({ ownId = 'presenter', leaderId = 'presenter', autoJoin = true, sendProfileMessage } = {}) {
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
            return selector === '.comment-item' ? children.filter(child => child.className?.split(' ').includes('comment-item')) : [];
        }
        getBoundingClientRect() { return this.rect || { left: 36, top: 104, right: 436, bottom: 454, width: 320, height: 220 }; }
        contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
        closest(selector) { return this.className?.split(' ').includes(selector.slice(1)) ? this : this.parentElement?.closest(selector) || null; }
        setCustomValidity() {}
        reportValidity() {}
        focus() { document.activeElement = this; }
        select() { this.selected = true; }
        click() { this.dispatchEvent(new Event('click')); }
        close() { this.open = false; this.dispatchEvent(new Event('close')); }
        showModal() { this.open = true; }
        remove() { nodes.delete(this.id); if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    }
    for (const id of ['connection-status', 'connection-status-text', 'model-status', 'close-comment-button', 'model-select', 'addButton', 'add-dialog', 'add-error', 'input', 'renderButton', 'add-form', 'chart-menu', 'headline', 'vis-container', 'comment-editor', 'comment-input', 'comment-form', 'comment-status', 'recordButton', 'record-label', 'speech-comment-button', 'transcript-indicator', 'transcript-status', 'transcript-text', 'live-transcript', 'board-notice', 'clearButton']) nodes.set(id, new Element());
    nodes.get('model-select').value = 'deepseek/deepseek-v4.1-flash';
    for (const id of ['transcript-toggle', 'transcript-toggle-label']) nodes.set(id, new Element());
    for (const id of ['chart-share-menu', 'chart-share-button']) nodes.set(id, new Element());
    for (const id of ['username-dialog', 'username-form', 'username-input', 'username-error', 'username-submit', 'username-preview', 'current-profile']) nodes.set(id, new Element());
    nodes.get('chart-menu').append(nodes.get('chart-share-button'), nodes.get('chart-share-menu'));
    nodes.get('chart-share-menu').hidden = true;
    nodes.get('comment-editor').hidden = true;
    nodes.get('model-status').hidden = true;
    nodes.get('headline').offsetHeight = 68;
    document = Object.assign(new EventTarget(), {
        body: new Element(),
        getElementById: id => nodes.get(id),
        querySelectorAll: selector => selector === '.draggable-chart' ? [...nodes.values()].filter(node => node.isChart) : [],
        createElement: tag => Object.assign(new Element(), { tagName: tag.toUpperCase() }),
        createTextNode: text => ({ textContent: text })
    });
    class CustomEvent extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } }
    const window = Object.assign(new EventTarget(), {
        vc: { ownId, leaderId }, innerWidth: 1280, innerHeight: 800
    });
    window.vc.sendProfileMessage = sendProfileMessage || (message => {
        if (message.action === 'claim') window.dispatchEvent(new CustomEvent('vischatter-profile-message', { detail: {
            action: 'result', sender: leaderId, participantId: ownId, requestId: message.requestId,
            profile: { id: ownId, username: message.username }, participants: [{ id: ownId, username: message.username }], revision: 1
        } }));
        return true;
    });
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
        window: Object.assign(window, { SpeechRecognition: Recognition }),
        selectChart() {},
        setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
        d3: {
            csvFormat: rows => [Object.keys(rows[0]).join(','), ...rows.map(row => Object.values(row).join(','))].join('\n'),
            csvParseRows: csv => csv.split('\n').map(row => row.split(','))
        },
        reRenderVegaLite: (spec, id) => renders.push({ spec, id })
    });
    sources.forEach(source => vm.runInContext(source, context));
    if (autoJoin) nodes.get('username-form').dispatchEvent(new Event('submit', { cancelable: true }));
    function addChart(id = 'vis-test', ownerId = ownId) {
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
        context.chartOwner = ownerId;
        vm.runInContext(`vlSpecDict['${id}'] = JSON.stringify(chartSpec); originalVisualizations['${id}'] = structuredClone(chartSpec); chartOwners['${id}'] = chartOwner;`, context);
        return chart;
    }
    context.renderVegaLite = (spec, id) => addChart(id, vm.runInContext(`chartOwners[${JSON.stringify(id)}]`, context));
    const emit = (type, detail, actor) => {
        const event = new CustomEvent(type, { detail });
        if (actor !== undefined) {
            event.collaboratorId = actor;
            event['visconnect-received'] = true;
        }
        return document.body.dispatchEvent(event);
    };
    const flushTimers = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); };
    return { context, nodes, renders, emit, addChart, flushTimers, Recognition };
}
const answer = value => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(['RETRIEVE', value]) } }] }) });
const factAnswer = (isDataFact, chartId = null) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ isDataFact, chartId }) } }] }) });
const settleRequests = () => new Promise(resolve => setImmediate(resolve));
const annotation = value => ({ title: value });

function joinAs(fixture, username) {
    fixture.nodes.get('username-input').value = username;
    fixture.nodes.get('username-form').dispatchEvent(new Event('submit', { cancelable: true }));
}
function profileSession() {
    const clients = new Map();
    const messages = [];
    const add = ownId => {
        const fixture = setup({ ownId, leaderId: 'host', autoJoin: false, sendProfileMessage: (message, recipient) => {
            messages.push({ ...message, sender: ownId, recipient });
            return true;
        } });
        clients.set(ownId, fixture);
        return fixture;
    };
    const deliver = () => {
        while (messages.length) {
            const { recipient, ...message } = messages.shift();
            for (const [id, fixture] of clients) {
                if (id !== message.sender && (!recipient || id === recipient)) {
                    fixture.context.window.dispatchEvent(new fixture.context.CustomEvent('vischatter-profile-message', { detail: message }));
                }
            }
        }
    };
    return { add, deliver, clients, messages };
}

test('entry prompts use role defaults, require a name, and preview a stable palette of 26 colors', () => {
    for (const [ownId, expected] of [['presenter', 'presenter'], ['viewer', 'audience']]) {
        const fixture = setup({ ownId, autoJoin: false });
        assert.equal(fixture.nodes.get('username-dialog').open, true);
        assert.equal(fixture.nodes.get('username-input').value, expected);
        const cancel = new Event('cancel', { cancelable: true });
        fixture.nodes.get('username-dialog').dispatchEvent(cancel);
        assert.equal(cancel.defaultPrevented, true);
        joinAs(fixture, '   ');
        assert.equal(fixture.context.window.commentIdentity.current, null);
        assert.equal(fixture.nodes.get('username-error').textContent, 'Enter a username.');
        fixture.nodes.get('username-input').value = 'Alice';
        fixture.nodes.get('username-input').dispatchEvent(new Event('input'));
        assert.equal(fixture.nodes.get('username-preview').children[0].textContent, 'A');
        const colors = Array.from('abcdefghijklmnopqrstuvwxyz', letter => vm.runInContext(`profileColor('${letter}')`, fixture.context));
        assert.equal(new Set(colors).size, 26);
        assert.equal(vm.runInContext("profileColor('Alice') === profileColor('alice') && profileColor('Álice') === profileColor('Alice')", fixture.context), true);
        assert.equal(vm.runInContext("createProfileAvatar({username: '<script>'}).textContent", fixture.context), '<');
    }
});

test('the presenter arbitrates simultaneous names and conflicting visitors must re-enter', () => {
    const session = profileSession();
    const host = session.add('host');
    const first = session.add('first');
    const second = session.add('second');
    joinAs(first, 'presenter');
    session.deliver();
    assert.match(first.nodes.get('username-error').textContent, /already in use/);
    joinAs(host, 'presenter');
    joinAs(first, 'audience');
    joinAs(second, ' Audience ');
    session.deliver();
    assert.equal(first.context.window.commentIdentity.current.username, 'audience');
    assert.equal(second.context.window.commentIdentity.current, null);
    assert.equal(second.nodes.get('username-dialog').open, true);
    assert.equal(second.nodes.get('username-input').disabled, false);
    assert.equal(second.nodes.get('username-input').selected, true);
    assert.match(second.nodes.get('username-error').textContent, /Enter a different username/);
    joinAs(second, 'Bob');
    session.deliver();
    assert.equal(second.context.window.commentIdentity.current.username, 'Bob');
    assert.equal(second.nodes.get('username-dialog').open, false);
    assert.equal(host.context.window.commentIdentity.authorFor('second').username, 'Bob');
    assert.equal(first.context.window.commentIdentity.authorFor('second').username, 'Bob');
    assert.equal(second.nodes.get('current-profile').children[0].textContent, 'B');
});

test('claims retry after connection setup, reject forged results, and recover from timeouts', () => {
    const session = profileSession();
    const host = session.add('host');
    const viewer = session.add('viewer');
    joinAs(host, 'presenter');
    joinAs(viewer, 'Alice');
    assert.equal(viewer.nodes.get('username-submit').disabled, true);
    const claim = session.messages.find(message => message.action === 'claim');
    viewer.context.window.dispatchEvent(new viewer.context.CustomEvent('vischatter-profile-message', { detail: {
        action: 'result', sender: 'imposter', participantId: 'viewer', requestId: claim.requestId, profile: { id: 'viewer', username: 'Alice' }
    } }));
    assert.equal(viewer.context.window.commentIdentity.current, null);
    // Lose the first request, then reconnect before the claim times out.
    session.messages.length = 0;
    viewer.context.window.dispatchEvent(new viewer.context.CustomEvent('visconnect-ready'));
    session.deliver();
    assert.equal(viewer.context.window.commentIdentity.current.username, 'Alice');
    const unavailable = setup({ ownId: 'unavailable', autoJoin: false, sendProfileMessage: () => false });
    joinAs(unavailable, 'Charlie');
    unavailable.flushTimers();
    assert.match(unavailable.nodes.get('username-error').textContent, /Could not confirm/);
    assert.equal(unavailable.nodes.get('username-submit').disabled, false);
    assert.equal(unavailable.nodes.get('username-dialog').open, true);
});

test('late visitors receive the roster and historical comments retain their author before it arrives', () => {
    const session = profileSession();
    const host = session.add('host');
    joinAs(host, 'Pat');
    const alice = session.add('alice');
    joinAs(alice, 'Alice');
    session.deliver();
    const late = session.add('late');
    const chart = late.addChart();
    late.emit('chart-comment', { id: 'history', visId: chart.id, time: 100, generation: 0, text: 'Saved comment', status: 'ready', author: { id: 'alice', username: 'Alice' } }, 'alice');
    assert.equal(chart.querySelector('.comment-list').children[1].children[0].title, 'Alice');
    late.context.window.dispatchEvent(new late.context.CustomEvent('visconnect-ready'));
    session.deliver();
    assert.equal(late.context.window.commentIdentity.authorFor('host').username, 'Pat');
    assert.equal(late.context.window.commentIdentity.authorFor('alice').username, 'Alice');
    joinAs(late, ' ALICE ');
    session.deliver();
    assert.match(late.nodes.get('username-error').textContent, /already in use/);
});

test('comment bubbles show at most three distinct authors and every expanded comment has its author', () => {
    const { context, emit, addChart } = setup();
    const chart = addChart();
    const profiles = [{ id: 'p', username: 'presenter' }, { id: 'a', username: 'Alice' }, { id: 'b', username: 'Bob' }, { id: 'c', username: 'Charlie' }];
    for (const [index, profile] of [...profiles, profiles[0]].entries()) {
        emit('chart-comment', { id: `c-${index}`, visId: chart.id, time: 100 + index, generation: 0, text: `Comment ${index}`, status: 'pending', author: profile }, profile.id);
    }
    const bubble = chart.querySelector('.comment-bubble');
    assert.equal(bubble.children[0].children.length, 3);
    assert.deepEqual(bubble.children[0].children.map(avatar => avatar.title), ['presenter', 'Charlie', 'Bob']);
    assert.equal(bubble.children[1].textContent, '+5');
    const items = chart.querySelector('.comment-list').children.slice(1);
    assert.deepEqual(items.map(item => item.children[0].title), ['presenter', 'Charlie', 'Bob', 'Alice', 'presenter']);
    for (const item of items) assert.equal(item.children[0].title, item.children[1].children[0].children[0].textContent);
    // Completion updates cannot change the original author.
    emit('chart-comment', { id: 'c-0', visId: chart.id, time: 100, generation: 0, text: 'Comment 0', status: 'ready', annotatedSpec: annotation('done'), author: { id: 'p', username: 'Renamed' } }, 'p');
    assert.equal(vm.runInContext("chartComments['vis-test'].find(comment => comment.id === 'c-0').author.username", context), 'presenter');
    vm.runInContext("toggleCommentList(document.getElementById('vis-test'))", context);
    assert.equal(chart.querySelector('.comment-popover').hidden, false);
    assert.equal(bubble.getAttribute('aria-expanded'), 'true');
});

test('the comment pipeline retains the chosen username through annotation completion and requires joining', async () => {
    const fixture = setup({ autoJoin: false });
    joinAs(fixture, 'Pat');
    fixture.addChart();
    fixture.context.fetch = async () => answer('A');
    await vm.runInContext("highLight('Show A', 'vis-test', vlSpecDict['vis-test'])", fixture.context);
    const author = vm.runInContext("chartComments['vis-test'][0].author", fixture.context);
    assert.equal(author.username, 'Pat');
    assert.equal(author.id, 'presenter');
    const unjoined = setup({ autoJoin: false });
    unjoined.addChart();
    await vm.runInContext("highLight('Show A', 'vis-test', vlSpecDict['vis-test'])", unjoined.context);
    assert.equal(vm.runInContext("chartComments['vis-test']?.length || 0", unjoined.context), 0);
});

test('profile transport uses open peer connections, delivers once per peer, and trusts the connection sender', async () => {
    const fixture = setup();
    const bundle = await readFile(new URL('../src/visconnect-bundle.js', import.meta.url), 'utf8');
    vm.runInContext(bundle.slice(bundle.indexOf('var VcCommunication ='), bundle.indexOf('var VC_MESSAGE_TYPE;')), fixture.context);
    const communication = Object.create(fixture.context.VcCommunication.prototype);
    const sent = [];
    const conn = (peer, open = true) => ({ connection: { open }, getPeer: () => peer, send: message => sent.push({ peer, message }) });
    communication.id = 'host';
    communication.connections = [conn('host'), conn('alice'), conn('alice'), conn('bob', false), conn('charlie')];
    assert.equal(communication.sendProfileMessage({ action: 'roster', sender: 'spoof' }, 'alice'), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].message.sender, 'host');
    assert.equal(communication.sendProfileMessage({ action: 'roster' }, 'bob'), false);
    let received;
    fixture.context.window.addEventListener('vischatter-profile-message', event => received = event.detail);
    communication.receiveMessage({ type: 'vischatter-profile', sender: 'spoof', action: 'test' }, 'alice');
    assert.equal(received.sender, 'alice');
});

test('uploads retain their original owner on every peer and only the uploader or presenter can delete locally', () => {
    for (const ownId of ['presenter', 'uploader', 'viewer']) {
        const { context, nodes, emit } = setup({ ownId });
        const upload = { id: 'vis-shared', text: '{}', time: 100, ownerId: 'viewer' };
        emit('vl-spec', upload, 'uploader');
        emit('vl-spec', upload, 'viewer');
        assert.equal(vm.runInContext("chartOwners['vis-shared']", context), 'uploader');
        let broadcasts = 0;
        context.document.body.addEventListener('chart-delete', () => broadcasts++);
        const allowed = ownId !== 'viewer';
        assert.equal(vm.runInContext("boardEvent('chart-delete', { visId: 'vis-shared' })", context), allowed);
        assert.equal(nodes.has('vis-shared'), !allowed);
        assert.equal(broadcasts, allowed ? 1 : 0);
        if (allowed) assert.equal(vm.runInContext("chartOwners['vis-shared']", context), undefined);
    }
});

test('receiving peers enforce the event actor for deletion and clearing comments, including catch-up events', () => {
    for (const action of ['chart-delete', 'chart-comments-clear']) {
        for (const ownId of ['presenter', 'uploader', 'viewer']) {
            const { context, nodes, emit, addChart } = setup({ ownId });
            addChart('vis-shared', 'uploader');
            const comment = { id: 'pending', visId: 'vis-shared', generation: 0, time: 100, text: 'Comment', status: 'pending' };
            emit('chart-comment', comment, 'viewer');
            for (const actor of ['viewer', null]) {
                emit(action, { visId: 'vis-shared', generation: 1, ownerId: 'uploader', actor: 'presenter' }, actor);
                assert.equal(nodes.has('vis-shared'), true);
                assert.equal(vm.runInContext("chartComments['vis-shared'].length", context), 1);
                assert.equal(nodes.get('model-status').hidden, false);
            }
            emit(action, { visId: 'vis-shared', generation: 1 }, 'uploader');
            assert.equal(nodes.has('vis-shared'), action !== 'chart-delete');
            assert.equal(nodes.get('model-status').hidden, true);
        }
    }
});

test('Clear removes only the actor’s charts, while the presenter can clear every chart on all peers', () => {
    for (const ownId of ['presenter', 'uploader', 'viewer']) {
        for (const actor of ['viewer', 'presenter']) {
            const { context, nodes, emit, addChart } = setup({ ownId });
            addChart('vis-viewer', 'viewer');
            addChart('vis-uploader', 'uploader');
            addChart('vis-presenter', 'presenter');
            for (const visId of ['vis-viewer', 'vis-uploader', 'vis-presenter']) {
                emit('chart-comment', { id: visId, visId, generation: 0, time: 100, text: 'Pending', status: 'pending' });
            }
            emit('board-clear', {}, actor);
            assert.equal(nodes.has('vis-viewer'), false);
            assert.equal(nodes.has('vis-uploader'), actor !== 'presenter');
            assert.equal(nodes.has('vis-presenter'), actor !== 'presenter');
            assert.equal(nodes.get('model-status').hidden, actor === 'presenter');
            assert.equal(vm.runInContext('Object.keys(chartOwners).length', context), actor === 'presenter' ? 0 : 2);
        }
    }
});

test('participants can post and annotate typed and speech comments on another participant’s chart', async () => {
    for (const speech of [false, true]) {
        const fixture = setup({ ownId: 'viewer', autoJoin: false });
        joinAs(fixture, 'Robin');
        const { context, nodes, addChart, Recognition } = fixture;
        addChart('vis-shared', 'uploader');
        context.fetch = async () => answer('A');
        vm.runInContext(`openCommentEditor('vis-shared', ${speech})`, context);
        if (speech) Recognition.instances[0].result([['Show A', true]]);
        else nodes.get('comment-input').value = 'Show A';
        nodes.get('comment-form').dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(vm.runInContext("chartComments['vis-shared'][0].text", context), 'Show A');
        assert.equal(vm.runInContext("chartComments['vis-shared'][0].status", context), 'ready');
        assert.equal(vm.runInContext("chartComments['vis-shared'][0].author.username", context), 'Robin');
        assert.equal(nodes.get('comment-editor').hidden, true);
    }
});

test('comment bubbles hide at zero, sort by timestamp, and restore the latest annotation after preview', () => {
    const { context, nodes, renders, emit, addChart } = setup();
    const chart = addChart();
    emit('chart-comment', { id: 'new', visId: chart.id, time: 200, generation: 0, text: 'Newer', status: 'ready', annotatedSpec: annotation('new') });
    emit('chart-comment', { id: 'old', visId: chart.id, time: 100, generation: 0, text: 'Older', status: 'ready', annotatedSpec: annotation('old') });
    assert.equal(chart.querySelector('.comment-bubble').children[1].textContent, '+2');
    assert.equal(renders.at(-1).spec.title, 'new');
    const items = chart.querySelector('.comment-list').children;
    assert.equal(items[0].children[0].textContent, 'Original chart');
    assert.equal(items[1].children[1].children[1].textContent, 'Newer');
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

test('moving hover or focus between version options does not briefly restore the default', () => {
    for (const [enter, leave] of [['mouseenter', 'mouseleave'], ['focusin', 'focusout']]) {
        const { renders, emit, addChart } = setup();
        const chart = addChart();
        for (const [id, time] of [['new', 200], ['old', 100]]) {
            emit('chart-comment', { id, time, visId: chart.id, generation: 0, text: id, status: 'ready', annotatedSpec: annotation(id) });
        }
        const items = chart.querySelector('.comment-list').children;
        items[0].dispatchEvent(new Event(enter));
        const count = renders.length;
        items[0].dispatchEvent(Object.assign(new Event(leave), { relatedTarget: items[2].children.at(-1) }));
        assert.equal(renders.length, count);
        items[2].dispatchEvent(new Event(enter));
        assert.equal(renders.at(-1).spec.title, 'old');
        // A delayed exit from the previous option must not clear the new preview.
        items[0].dispatchEvent(new Event(leave));
        assert.equal(renders.at(-1).spec.title, 'old');
        items[2].dispatchEvent(new Event(leave));
        assert.equal(renders.at(-1).spec.title, 'new');
    }
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

test('clicking tabs selects an older annotation or the original across previews and newer responses', () => {
    const { context, renders, emit, addChart } = setup();
    const chart = addChart();
    const addComment = (id, time) => emit('chart-comment', { id, time, visId: chart.id, generation: 0, text: id, status: 'ready', annotatedSpec: annotation(id) });
    addComment('older', 100);
    addComment('newer', 200);
    let items = chart.querySelector('.comment-list').children;
    const oldChoice = items[2];
    oldChoice.click();
    assert.equal(oldChoice.getAttribute('aria-pressed'), 'true');
    assert.equal(items[1].getAttribute('aria-pressed'), 'false');
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
    items[0].click();
    addComment('later', 400);
    assert.equal(renders.at(-1).spec.mark, 'bar');
    assert.equal(chart.querySelector('.comment-list').children[0].getAttribute('aria-pressed'), 'true');
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
    for (const item of chart.querySelector('.comment-list').children.slice(1)) assert.equal(item.getAttribute('aria-disabled'), 'true');
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

test('live recording checks finalized phrases once, restarts after pauses, and leaves nonfacts as transcript only', async () => {
    const { context, nodes, flushTimers, Recognition } = setup();
    let posted = 0;
    const phrases = [];
    context.fetch = async (_url, options) => {
        phrases.push(JSON.parse(JSON.parse(options.body).messages[1].content).phrase);
        return factAnswer(false);
    };
    context.document.body.addEventListener('chart-comment', () => posted++);
    nodes.get('recordButton').dispatchEvent(new Event('click'));
    const transcript = nodes.get('transcript-text');
    transcript.scrollHeight = 500;
    const microphone = Recognition.instances[0];
    assert.equal(microphone.continuous, true);
    assert.equal(microphone.interimResults, true);
    microphone.result([['Hello', true], ['world', false]]);
    assert.equal(transcript.scrollTop, 500);
    transcript.scrollTop = 0;
    transcript.scrollHeight = 750;
    microphone.result([['Hello', true], ['world', true]]);
    assert.equal(transcript.scrollTop, 750);
    assert.equal(vm.runInContext('liveFinalTranscript', context), 'Hello world');
    await settleRequests();
    microphone.onend();
    flushTimers();
    assert.equal(microphone.starts, 2);
    microphone.result([['Again', true]]);
    assert.equal(vm.runInContext('liveFinalTranscript', context), 'Hello world Again');
    await settleRequests();
    nodes.get('recordButton').dispatchEvent(new Event('click'));
    assert.equal(transcript.scrollTop, transcript.scrollHeight);
    assert.equal(nodes.get('recordButton').getAttribute('aria-pressed'), 'false');
    microphone.onend();
    flushTimers();
    assert.equal(microphone.starts, 2);
    assert.equal(posted, 0);
    assert.deepEqual(phrases, ['Hello', 'world', 'Again']);
});

test('phrase boundaries preserve decimals, thousands separators, abbreviations, and transcript offsets', () => {
    const { context } = setup();
    context.spokenText = 'Revenue is 1,000.5 million. U.S. sales rose; profit fell. Thanks!';
    const phrases = vm.runInContext('splitTranscriptPhrases(spokenText)', context);
    assert.deepEqual(Array.from(phrases, phrase => phrase.text), ['Revenue is 1,000.5 million.', 'U.S. sales rose;', 'profit fell.', 'Thanks!']);
    for (const phrase of phrases) assert.equal(context.spokenText.slice(phrase.start, phrase.end), phrase.text);
});

test('live phrases use the selected model, post only data facts to the matching chart, and keep interim words visible', async () => {
    const { context, nodes, addChart, Recognition } = setup({ ownId: 'viewer' });
    addChart('vis-first', 'uploader');
    addChart('vis-second', 'uploader');
    nodes.get('model-select').value = 'openai/gpt-6.1-sol';
    const requests = [];
    context.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (body.temperature === 0) {
            const input = JSON.parse(body.messages[1].content);
            assert.deepEqual(input.charts.map(chart => chart.id), ['vis-first', 'vis-second']);
            return input.phrase === 'B is highest;' ? factAnswer(true, 'vis-second') : factAnswer(false);
        }
        return answer('B');
    };
    nodes.get('recordButton').click();
    Recognition.instances[0].result([['B is highest; thanks for listening.', true], ['More words', false]]);
    assert.equal(nodes.get('model-status').hidden, false);
    await settleRequests();
    assert.equal(vm.runInContext("(chartComments['vis-first'] || []).length", context), 0);
    assert.equal(vm.runInContext("chartComments['vis-second'][0].text", context), 'B is highest;');
    assert.equal(vm.runInContext("chartComments['vis-second'][0].status", context), 'ready');
    assert.equal(requests.length, 3);
    assert.ok(requests.every(request => request.model === 'openai/gpt-6.1-sol'));
    const transcript = nodes.get('transcript-text');
    const marks = transcript.children.filter(child => child.tagName === 'MARK');
    assert.equal(marks.length, 1);
    assert.equal(marks[0].textContent, 'B is highest;');
    assert.equal(marks[0].className, 'transcript-fact');
    assert.equal(transcript.children.at(-1).textContent, ' More words');
    assert.equal(nodes.get('model-status').hidden, true);
    Recognition.instances[0].result([['B is highest; thanks for listening.', true], ['More words', false]]);
    await settleRequests();
    assert.equal(requests.length, 3);
});

test('out-of-order phrase decisions preserve spoken comment order and continue after recording pauses', async () => {
    const { context, nodes, addChart, Recognition } = setup();
    addChart();
    const decisions = [];
    context.fetch = async (_url, options) => {
        if (JSON.parse(options.body).temperature === 0) return new Promise(resolve => decisions.push(resolve));
        return answer('A');
    };
    nodes.get('recordButton').click();
    Recognition.instances[0].result([['A is twenty. B is forty.', true]]);
    assert.equal(decisions.length, 2);
    nodes.get('recordButton').click();
    decisions[1](factAnswer(true, 'vis-test'));
    await settleRequests();
    assert.equal(nodes.get('model-status').hidden, false);
    decisions[0](factAnswer(true, 'vis-test'));
    await settleRequests();
    assert.deepEqual(Array.from(vm.runInContext("sortedChartComments('vis-test')", context), comment => comment.text), ['B is forty.', 'A is twenty.']);
    assert.equal(nodes.get('transcript-status').textContent, 'Transcript paused');
    assert.equal(nodes.get('model-status').hidden, true);
    assert.equal(nodes.get('transcript-text').children.filter(child => child.tagName === 'MARK').length, 2);
});

test('phrase checks queue with limited concurrency, and failure does not block subsequent facts', async () => {
    const { context, nodes, addChart, Recognition } = setup();
    addChart();
    const decisions = [];
    context.fetch = async (_url, options) => {
        if (JSON.parse(options.body).temperature === 0) return new Promise(resolve => decisions.push(resolve));
        return answer('B');
    };
    nodes.get('recordButton').click();
    Recognition.instances[0].result([['Hello. A is twenty. B is highest.', true]]);
    assert.equal(decisions.length, 2);
    decisions[0]({ ok: false, json: async () => ({ error: { message: 'Provider unavailable' } }) });
    await settleRequests();
    assert.equal(decisions.length, 3);
    assert.equal(nodes.get('board-notice').textContent, 'Provider unavailable');
    assert.equal(nodes.get('model-status').hidden, false);
    decisions[1](factAnswer(false));
    decisions[2](factAnswer(true, 'vis-test'));
    await settleRequests();
    assert.equal(vm.runInContext("chartComments['vis-test'].length", context), 1);
    assert.equal(nodes.get('model-status').hidden, true);
});

test('unmatched facts are highlighted without attaching them to an arbitrary chart, and malformed decisions create no comment', async () => {
    for (const withChart of [false, true]) {
        const { context, nodes, addChart, Recognition } = setup();
        if (withChart) addChart();
        context.fetch = async () => factAnswer(true);
        nodes.get('recordButton').click();
        Recognition.instances[0].result([['Revenue doubled.', true]]);
        await settleRequests();
        assert.equal(nodes.get('transcript-text').children.filter(child => child.tagName === 'MARK').length, 1);
        assert.match(nodes.get('board-notice').textContent, /No matching chart/);
        assert.equal(vm.runInContext('Object.values(chartComments).flat().length', context), 0);
        context.fetch = async () => factAnswer(true, 'unknown-chart');
        Recognition.instances[0].result([['Revenue doubled.', true], ['B is highest.', true]]);
        await settleRequests();
        assert.match(nodes.get('board-notice').textContent, /invalid data-fact decision/);
        assert.equal(nodes.get('transcript-text').children.filter(child => child.tagName === 'MARK').length, 1);
        assert.equal(nodes.get('model-status').hidden, true);
    }
});

test('clearing comments or deleting a chart cancels queued and pending phrase checks and ignores late responses', async () => {
    for (const action of ['chart-comments-clear', 'chart-delete', 'board-clear']) {
        const { context, nodes, emit, addChart, Recognition } = setup();
        addChart();
        const pending = [];
        context.fetch = async (_url, options) => new Promise(resolve => pending.push({ resolve, signal: options.signal }));
        nodes.get('recordButton').click();
        Recognition.instances[0].result([['A is twenty. B is forty. B is highest.', true]]);
        assert.equal(pending.length, 2);
        emit(action, { visId: 'vis-test', generation: 1 });
        assert.ok(pending.every(request => request.signal.aborted));
        assert.equal(nodes.get('model-status').hidden, true);
        pending.forEach(request => request.resolve(factAnswer(true, 'vis-test')));
        await settleRequests();
        assert.equal(pending.length, 2);
        assert.equal(vm.runInContext("(chartComments['vis-test'] || []).length", context), 0);
        assert.equal(nodes.get('transcript-text').children.filter(child => child.tagName === 'MARK').length, 0);
    }
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

test('example 1 comparisons select Small and Minicar across capitalization and whitespace variations', async () => {
    for (const categories of [['Small', 'Minicar'], [' small ', 'MINICAR']]) {
        const { context, addChart } = setup();
        addChart();
        const spec = JSON.parse(await readFile(new URL('../data/example-1.json', import.meta.url), 'utf8'));
        context.spec = spec;
        let prompt;
        context.fetch = async (_url, options) => {
            prompt = JSON.parse(options.body);
            return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(['COMPARE', ...categories]) } }] }) };
        };
        await vm.runInContext("highLight('Compare small and minicar', 'vis-test', spec)", context);
        const comment = vm.runInContext("chartComments['vis-test'][0]", context);
        assert.equal(comment.status, 'ready', comment.error);
        const highlighted = comment.annotatedSpec.layer[1];
        assert.deepEqual(matchesLineFilter(highlighted, spec.data.values).map(row => row['Car type']), ['Small', 'Minicar']);
        assert.deepEqual(JSON.parse(JSON.stringify(highlighted.encoding.color)), spec.encoding.color);
        assert.match(prompt.messages[1].content, /category values from "Car type" \(the y-axis\)/);
        assert.equal(spec.encoding.opacity, undefined);
    }
});

test('bar comparisons reject missing categories and measurement values before creating an empty layer', async () => {
    for (const categories of [['2685.29', '1101.78'], ['Small', 'Unknown']]) {
        const { context, addChart, renders } = setup();
        addChart();
        context.spec = JSON.parse(await readFile(new URL('../data/example-1.json', import.meta.url), 'utf8'));
        context.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(['COMPARE', ...categories]) } }] }) });
        await vm.runInContext("highLight('Compare small and minicar', 'vis-test', spec)", context);
        const comment = vm.runInContext("chartComments['vis-test'][0]", context);
        assert.equal(comment.status, 'error');
        assert.match(comment.error, /category.*could not be found/i);
        assert.equal(comment.annotatedSpec, undefined);
        assert.ok(renders.every(render => !render.spec.layer));
    }
});

test('bar comparisons safely select categories and field names containing apostrophes', async () => {
    const { context, addChart } = setup();
    addChart();
    const rows = [{ "Owner's category": "O'Brien", value: 20 }, { "Owner's category": 'Other', value: 40 }];
    context.spec = { data: { values: rows }, mark: 'bar', encoding: { x: { field: "Owner's category", type: 'nominal' }, y: { field: 'value', type: 'quantitative' } } };
    context.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(['COMPARE', "O'Brien", 'Other']) } }] }) });
    await vm.runInContext("highLight('Compare owners', 'vis-test', spec)", context);
    const comment = vm.runInContext("chartComments['vis-test'][0]", context);
    assert.equal(comment.status, 'ready', comment.error);
    assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[1], rows).map(row => row["Owner's category"]), ["O'Brien", 'Other']);
});

test('a Small-car trend annotates only 2013–2018 using the encoded fields and preserves chart colors', async () => {
    const { context, addChart } = setup();
    addChart();
    const spec = JSON.parse(await readFile(new URL('../data/example-2.json', import.meta.url), 'utf8'));
    context.spec = spec;
    let prompt;
    context.fetch = async (_url, options) => {
        prompt = JSON.parse(options.body);
        return { ok: true, json: async () => ({ choices: [{ message: { content: '["TREND^", "2013", "2018", "Small"]' } }] }) };
    };
    await vm.runInContext("highLight('Small cars have increasing trend from 2013 to 2018', 'vis-test', spec)", context);
    const comment = vm.runInContext("chartComments['vis-test'][0]", context);
    assert.equal(comment.status, 'ready', comment.error);
    assert.match(prompt.messages[1].content, /Car type/);
    const highlighted = comment.annotatedSpec.layer[1];
    const matches = matchesLineFilter(highlighted, spec.data.values);
    assert.deepEqual(matches.map(row => [row.Year, row['Car type']]), [2013, 2014, 2015, 2016, 2017, 2018].map(year => [year, 'Small']));
    assert.deepEqual(JSON.parse(JSON.stringify(highlighted.encoding.color)), spec.encoding.color);
    const label = comment.annotatedSpec.layer[2];
    const anchors = matchesLineFilter(label, spec.data.values);
    assert.deepEqual(anchors.map(row => [row.Year, row['Car type']]), [[2015, 'Small']]);
    assert.equal(label.encoding.text.value, 'Increase ↗');
    assert.equal(label.mark.angle ?? 0, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(label.encoding.color)), spec.encoding.color);
    assert.equal(spec.mark.type, 'line');
});

function matchesLineFilter(layer, rows) {
    return rows.filter(datum => vm.runInNewContext(layer.transform[0].filter, {
        datum, toNumber: Number, toString: String, toDate: value => new Date(value), time: value => +value, indexof: (values, value) => values.indexOf(value)
    }));
}

test('single-series trends honor bounds despite metadata columns, reversed endpoints, and unordered numeric rows', async () => {
    const { context, addChart } = setup();
    addChart();
    const rows = [12, 9, 11, 10].map(year => ({ metadata: 'Published', value: year * 2, 'Fiscal year': year }));
    context.spec = {
        data: { values: rows }, mark: 'line',
        encoding: { x: { field: 'Fiscal year', type: 'quantitative' }, y: { field: 'value', type: 'quantitative' } }
    };
    context.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '["TRENDv", "11", "9"]' } }] }) });
    await vm.runInContext("highLight('Decreasing from 11 to 9', 'vis-test', spec)", context);
    const comment = vm.runInContext("chartComments['vis-test'][0]", context);
    assert.equal(comment.status, 'ready', comment.error);
    assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[1], rows).map(row => row['Fiscal year']).sort((a, b) => a - b), [9, 10, 11]);
    assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[2], rows).map(row => row['Fiscal year']), [10]);
    assert.equal(comment.annotatedSpec.layer[2].encoding.text.value, 'Decrease ↘');
    assert.equal(comment.annotatedSpec.layer[2].mark.angle ?? 0, 0);
});

test('temporal trends work with arbitrary field names and keep the original date scales', async () => {
    const { context, addChart } = setup();
    addChart();
    const rows = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01'].map(date => ({ 'Reported on': date, value: 2 }));
    const x = { field: 'Reported on', type: 'temporal', axis: { format: '%b' } };
    context.spec = { data: { values: rows }, mark: 'line', encoding: { x, y: { field: 'value', type: 'quantitative' } } };
    context.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '["TREND-", "2024-02-01", "2024-04-01"]' } }] }) });
    await vm.runInContext("highLight('Stable from February to April', 'vis-test', spec)", context);
    const comment = vm.runInContext("chartComments['vis-test'][0]", context);
    assert.equal(comment.status, 'ready', comment.error);
    assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[1], rows).map(row => row['Reported on']), ['2024-02-01', '2024-03-01', '2024-04-01']);
    assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[2], rows).map(row => row['Reported on']), ['2024-03-01']);
    assert.deepEqual(JSON.parse(JSON.stringify(comment.annotatedSpec.layer[2].encoding.x)), x);
    assert.equal(comment.annotatedSpec.layer[2].encoding.text.value, 'Stable →');
    assert.equal(comment.annotatedSpec.layer[2].mark.angle ?? 0, 0);
});

test('ordinal trends match numeric categories in the inline dataset', async () => {
    const { context, addChart } = setup();
    addChart();
    const rows = [2013, 2014, 2015, 2016].map(year => ({ year, value: 2 }));
    context.spec = { data: { values: rows }, mark: 'line', encoding: { x: { field: 'year', type: 'ordinal' }, y: { field: 'value', type: 'quantitative' } } };
    context.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '["TREND^", "2013", "2015"]' } }] }) });
    await vm.runInContext("highLight('Increasing from 2013 to 2015', 'vis-test', spec)", context);
    const comment = vm.runInContext("chartComments['vis-test'][0]", context);
    assert.equal(comment.status, 'ready', comment.error);
    assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[1], rows).map(row => row.year), [2013, 2014, 2015]);
    assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[2], rows).map(row => row.year), [2014]);
});

test('retrieving or comparing line endpoints uses a detail series field and safely handles apostrophes', async () => {
    for (const taskList of [['RETRIEVE', '12', "O'Brien"], ['COMPARE', '9', '12', "O'Brien", 'Other']]) {
        const { context, addChart } = setup();
        addChart();
        const rows = ["O'Brien", 'Other'].flatMap(series => [12, 9, 11, 10].map(year => ({ value: year, year, "Owner's category": series })));
        context.spec = {
            data: { values: rows }, mark: 'line',
            encoding: { x: { field: 'year', type: 'quantitative' }, y: { field: 'value', type: 'quantitative' }, detail: { field: "Owner's category", type: 'nominal' } }
        };
        context.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(taskList) } }] }) });
        await vm.runInContext("highLight('Compare endpoints', 'vis-test', spec)", context);
        const comment = vm.runInContext("chartComments['vis-test'][0]", context);
        assert.equal(comment.status, 'ready', comment.error);
        const selected = matchesLineFilter(comment.annotatedSpec.layer[1], rows);
        assert.deepEqual(selected.map(row => row.year).sort((a, b) => a - b), taskList[0] === 'RETRIEVE' ? [11, 12] : [9, 10]);
        assert.ok(selected.every(row => row["Owner's category"] === "O'Brien"));
        if (taskList[0] === 'COMPARE') {
            const second = matchesLineFilter(comment.annotatedSpec.layer[2], rows);
            assert.deepEqual(second.map(row => row.year).sort((a, b) => a - b), [11, 12]);
            assert.ok(second.every(row => row["Owner's category"] === 'Other'));
        }
    }
});

test('trends without a series apply their supplied range to every line, while unknown series report an error', async () => {
    for (const series of [undefined, 'Unknown']) {
        const { context, addChart } = setup();
        addChart();
        const spec = JSON.parse(await readFile(new URL('../data/example-2.json', import.meta.url), 'utf8'));
        context.spec = spec;
        const taskList = ['TREND^', '2016', '2018', ...(series ? [series] : [])];
        context.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(taskList) } }] }) });
        await vm.runInContext("highLight('Increasing from 2016 to 2018', 'vis-test', spec)", context);
        const comment = vm.runInContext("chartComments['vis-test'][0]", context);
        if (series) {
            assert.equal(comment.status, 'error');
            assert.match(comment.error, /selected series could not be found/);
        } else {
            assert.equal(comment.status, 'ready', comment.error);
            assert.equal(matchesLineFilter(comment.annotatedSpec.layer[1], spec.data.values).length, 6);
            assert.deepEqual(matchesLineFilter(comment.annotatedSpec.layer[2], spec.data.values).map(row => [row.Year, row['Car type']]), [[2017, 'Small'], [2017, 'Minicar']]);
        }
    }
});

test('local controls register immediately while shared listeners wait for VisConnect initialization', async () => {
    const bundle = await readFile(new URL('../src/visconnect-bundle.js', import.meta.url), 'utf8');
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
    const bundle = await readFile(new URL('../src/visconnect-bundle.js', import.meta.url), 'utf8');
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


test('removing a selected comment restores the latest remaining version and ignores late peer results', () => {
    const { context, renders, emit, addChart } = setup();
    const chart = addChart();
    for (const [id, time] of [['old', 100], ['new', 200]]) {
        emit('chart-comment', { id, time, visId: chart.id, generation: 0, text: id, status: 'ready', annotatedSpec: annotation(id) });
    }
    const items = chart.querySelector('.comment-list').children;
    items[2].click();
    items[2].children.at(-1).click();
    assert.equal(renders.at(-1).spec.title, 'new');
    assert.equal(vm.runInContext("chartComments['vis-test'].length", context), 1);
    emit('chart-comment', { id: 'old', time: 100, visId: chart.id, generation: 0, text: 'old', status: 'ready', annotatedSpec: annotation('late') });
    assert.equal(vm.runInContext("chartComments['vis-test'].length", context), 1);
    emit('chart-comment-delete', { visId: chart.id, commentId: 'new' }, 'viewer');
    assert.equal(chart.querySelector('.comment-bubble').hidden, true);
    assert.equal(renders.at(-1).spec.mark, 'bar');
});

test('removing a pending comment aborts its annotation and clears the top-panel indicator', async () => {
    const { context, nodes, emit, addChart } = setup();
    addChart();
    let respond;
    let signal;
    context.fetch = (_url, options) => { signal = options.signal; return new Promise(resolve => { respond = resolve; }); };
    const pending = vm.runInContext("highLight('Show A', 'vis-test', vlSpecDict['vis-test'])", context);
    const id = vm.runInContext("chartComments['vis-test'][0].id", context);
    emit('chart-comment-delete', { visId: 'vis-test', commentId: id });
    assert.equal(signal.aborted, true);
    assert.equal(nodes.get('model-status').hidden, true);
    respond(answer('A'));
    await pending;
    assert.equal(vm.runInContext("chartComments['vis-test'].length", context), 0);
});
