import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = vm.createContext({ document: { getElementById: () => ({ addEventListener() {} }), querySelectorAll: () => [], body: { addEventListener() {} } } });
vm.runInContext(await readFile(new URL('../src/util.js', import.meta.url), 'utf8'), context);

test('parses JSON and fenced model output without damaging quoted or comma-containing values', () => {
  const expected = ['COMPARE', 'Washington, DC', "O'Brien"];
  for (const text of [JSON.stringify(expected), '```json\n' + JSON.stringify(expected) + '\n```']) {
    assert.deepEqual(Array.from(context.parseTaskResponse(text)), expected);
  }
});

test('rejects invalid output before applying a chart annotation', () => {
  for (const text of ['Here is your answer', '["UNKNOWN", "2020"]', '["RANGE", "10"]', '["FILTER", {}]', '["RETRIEVE", ""]', '{"task":"RETRIEVE"}']) {
    assert.throws(() => context.parseTaskResponse(text), /invalid annotation/);
  }
});

test('trend responses can include one series only for a chart with series encodings', () => {
  for (const task of ['TREND^', 'TREND-', 'TRENDv']) {
    const response = JSON.stringify([task, '2013', '2018', 'Small']);
    assert.deepEqual(Array.from(context.parseTaskResponse(response, true)), [task, '2013', '2018', 'Small']);
    assert.throws(() => context.parseTaskResponse(response), /invalid annotation/);
    assert.throws(() => context.parseTaskResponse(JSON.stringify([task, '2013', '2018', 'Small', 'Minicar']), true), /invalid annotation/);
  }
});
