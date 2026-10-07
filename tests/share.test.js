import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/share.js', import.meta.url), 'utf8');
function setup() {
    const nodes = [];
    const downloads = [];
    const notices = [];
    const revoked = [];
    const blobs = [];
    const rendered = [];
    const timers = [];
    let finalized = 0;
    const view = {
        toSVG: async () => '<svg xmlns="http://www.w3.org/2000/svg"><text>Selected annotation</text></svg>',
        toImageURL: async (format, scale) => { rendered.push({ format, scale }); return 'data:image/png;base64,test'; },
        finalize: () => finalized++
    };
    const document = {
        createElement: tag => ({
            tag, style: {}, setAttribute() {},
            click() { downloads.push({ name: this.download, url: this.href }); },
            remove() { nodes.splice(nodes.indexOf(this), 1); }
        }),
        body: { appendChild: node => nodes.push(node) }
    };
    const context = vm.createContext({
        document, navigator: {}, Blob,
        URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:chart'; }, revokeObjectURL: url => revoked.push(url) },
        setTimeout: callback => timers.push(callback),
        chartTitle: (spec, fallback) => spec.title || fallback,
        notifyBoard: message => notices.push(message),
        vegaEmbed: async (target, spec) => { rendered.push(spec); return { view }; }
    });
    vm.runInContext(source, context);
    context.spec = { title: 'Chart / selected', mark: 'bar', background: '#000' };
    return { context, nodes, downloads, notices, revoked, blobs, rendered, timers, view, get finalized() { return finalized; } };
}

test('SVG and PNG downloads render the supplied version and clean up their temporary views', async () => {
    for (const format of ['svg', 'png']) {
        const fixture = setup();
        await vm.runInContext(`downloadChartImage(spec, '${format}')`, fixture.context);
        assert.equal(fixture.rendered[0], fixture.context.spec);
        assert.equal(fixture.downloads[0].name, `Chart-selected.${format}`);
        assert.equal(fixture.finalized, 1);
        assert.equal(fixture.nodes.length, 0);
        if (format === 'svg') {
            assert.match(await fixture.blobs[0].text(), /Selected annotation/);
            assert.equal(fixture.blobs[0].type, 'image/svg+xml;charset=utf-8');
            fixture.timers.forEach(callback => callback());
            assert.deepEqual(fixture.revoked, ['blob:chart']);
        } else {
            assert.equal(fixture.rendered[1].format, 'png');
            assert.equal(fixture.rendered[1].scale, 2);
            assert.match(fixture.downloads[0].url, /^data:image\/png/);
        }
    }
});

test('failed image conversion reports an error and finalizes the view', async () => {
    const fixture = setup();
    fixture.view.toImageURL = async () => { throw new Error('Image conversion failed'); };
    await vm.runInContext("shareChartVersion(spec, 'download-png')", fixture.context);
    assert.equal(fixture.finalized, 1);
    assert.equal(fixture.nodes.length, 0);
    assert.deepEqual(fixture.downloads, []);
    assert.match(fixture.notices[0], /Image conversion failed/);
});

test('clipboard denial reports an error instead of a success notice', async () => {
    const fixture = setup();
    fixture.context.navigator.clipboard = { writeText: async () => { throw new Error('Clipboard denied'); } };
    await vm.runInContext("shareChartVersion(spec, 'copy-code')", fixture.context);
    assert.match(fixture.notices[0], /Clipboard denied/);
});
