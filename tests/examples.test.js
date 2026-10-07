import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/util.js', import.meta.url), 'utf8');
const examples = await Promise.all([1, 2].map(index => readFile(new URL(`../data/example-${index}.json`, import.meta.url), 'utf8').then(JSON.parse)));

function setup() {
    class Element {
        constructor() { this.listeners = {}; this.attributes = {}; this.value = ''; this.hidden = true; }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name]; }
        click() { return this.listeners.click(); }
    }
    const nodes = new Map();
    const buttons = [0, 1].map(index => {
        const button = new Element();
        button.dataset = { visualizationExample: String(index) };
        button.setAttribute('aria-pressed', 'false');
        return button;
    });
    const requests = [];
    const context = vm.createContext({
        document: {
            getElementById: id => {
                if (!nodes.has(id)) nodes.set(id, new Element());
                return nodes.get(id);
            },
            querySelectorAll: () => buttons,
            body: new Element()
        },
        fetch: url => new Promise(resolve => requests.push({ url, finish: (spec, ok = true) => resolve({ ok, json: async () => spec }) }))
    });
    vm.runInContext(source, context);
    return { buttons, nodes, requests, context };
}

test('examples contain usable registration categories and only the retained line-chart years', () => {
    const [bar, line] = examples;
    assert.equal(bar.data.url, undefined);
    assert.equal(bar.data.values.length, 10);
    assert.equal(new Set(bar.data.values.map(row => row[bar.encoding.y.field])).size, 10);
    for (const row of bar.data.values) {
        assert.equal(typeof row[bar.encoding.y.field], 'string');
        assert.ok(Number.isFinite(row[bar.encoding.x.field]));
    }
    const years = [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020];
    assert.equal(line.data.values.length, 16);
    assert.deepEqual([...new Set(line.data.values.map(row => row['Car type']))], ['Small', 'Minicar']);
    for (const category of ['Small', 'Minicar']) {
        const rows = line.data.values.filter(row => row['Car type'] === category);
        assert.deepEqual(rows.map(row => row.Year), years);
        assert.equal(rows.find(row => row.Year === 2019)['New registrations in thousands'], bar.data.values.find(row => row['Car type'] === category)['New registrations in thousands']);
    }
    assert.deepEqual(line.encoding.x.scale.domain, [2013, 2020]);
    assert.deepEqual(line.encoding.x.axis.values, years);
    assert.deepEqual(line.encoding.y.scale.domain, [0, 3000]);
    assert.equal(line.encoding.y.scale.nice, false);
    assert.equal(line.encoding.color.field, 'Car type');
    assert.deepEqual(line.encoding.color.scale.domain, ['Small', 'Minicar']);
    assert.equal(line.encoding.color.scale.range[0], bar.encoding.color.value);
    assert.ok(line.encoding.color.legend);
    assert.ok(line.encoding.tooltip.some(channel => channel.field === 'Car type'));
    assert.doesNotMatch(JSON.stringify(line), /2010|2011|2012|Synthetic|synthetic/);
});

test('example tags use full chart titles accessibly and selecting them loads the renamed specs', async () => {
    const { buttons, nodes, requests, context } = setup();
    const pending = buttons.map(button => context.loadVisualizationExample(button));
    requests.forEach((request, index) => request.finish(examples[index]));
    await Promise.all(pending);
    assert.deepEqual(requests.map(request => request.url), ['data/example-1.json', 'data/example-2.json']);
    for (const [index, button] of buttons.entries()) {
        const title = index === 0 ? examples[index].title.join(' ') : examples[index].title.text;
        assert.ok(Array.from(button.textContent).length < 15);
        assert.ok(button.textContent.endsWith('...'));
        assert.equal(button.title, title);
        assert.ok(button.getAttribute('aria-label').includes(title));
        await button.click();
        assert.deepEqual(JSON.parse(nodes.get('input').value), examples[index]);
    }
    assert.equal(requests.length, 2);
    await buttons[1].click();
    assert.equal(nodes.get('input').value, '');
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
    context.setVisualizationExampleTitle(buttons[0], { title: '12345678901234' });
    assert.equal(buttons[0].textContent, '12345678901234');
    context.setVisualizationExampleTitle(buttons[0], { title: '123456789012345' });
    assert.equal(buttons[0].textContent, '12345678901...');
});

test('a delayed earlier selection cannot overwrite the latest example', async () => {
    const { buttons, nodes, requests } = setup();
    const older = buttons[0].click();
    const newer = buttons[1].click();
    requests[1].finish(examples[1]);
    await newer;
    requests[0].finish(examples[0]);
    await older;
    assert.deepEqual(JSON.parse(nodes.get('input').value), examples[1]);
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
});

test('failed preloads can be retried and selection errors clear after recovery', async () => {
    const { buttons, nodes, requests, context } = setup();
    const pending = buttons.map(button => context.loadVisualizationExample(button));
    requests[0].finish(null, false);
    requests[1].finish(examples[1]);
    await Promise.allSettled(pending);
    const failed = buttons[0].click();
    requests[2].finish(null, false);
    await failed;
    assert.equal(nodes.get('add-error').hidden, false);
    assert.match(nodes.get('add-error').textContent, /Could not load/);
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
    const retry = buttons[0].click();
    requests[3].finish(examples[0]);
    await retry;
    assert.equal(nodes.get('add-error').hidden, true);
    assert.deepEqual(JSON.parse(nodes.get('input').value), examples[0]);
});
