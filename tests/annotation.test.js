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
