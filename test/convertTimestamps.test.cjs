const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const { resolve } = require('node:path');

// Compile only this pure helper in memory: no Firebase app or output files.
const filename = resolve('src/lib/convertTimestamps.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { convertTimestamps } = loaded.exports;

test('preserves array shapes, nested maps and input contents', () => {
  const input = { photos: ['a', 'b'], allowedVehicles: ['x', 'y'], nested: [{ foo: 1 }] };
  const result = convertTimestamps(input);
  assert.deepEqual(result, input);
  for (const key of Object.keys(input)) {
    assert.ok(Array.isArray(result[key]));
    assert.notEqual(result[key], input[key]);
  }
  result.nested[0].foo = 2;
  assert.equal(input.nested[0].foo, 1);
});

test('converts SDK and both callable timestamp formats inside nested arrays/maps', () => {
  const date = new Date(1234);
  const input = Object.freeze({ values: Object.freeze([
    { toDate: () => date },
    { nested: [{ seconds: 1, nanoseconds: 234000000 }] },
    [{ _seconds: 1, _nanoseconds: 234000000 }],
  ]) });
  const result = convertTimestamps(input);
  assert.deepEqual(result.values, [date, { nested: [date] }, [date]]);
  assert.equal(input.values[1].nested[0].seconds, 1);
});

test('preserves null, undefined, primitives and Date objects', () => {
  for (const input of [null, undefined, false, true, 0, 12, '', 'false', '123', new Date(1234)]) {
    assert.equal(convertTimestamps(input), input);
  }
  const date = new Date(5678);
  assert.equal(convertTimestamps({ date }).date, date);
});
