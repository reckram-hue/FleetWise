const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Real component/handlers, deterministic hooks and local API doubles. No cloud access.
function harness(boundaryType, inspections = [], overrides = {}) {
  const state = [], effects = [], cache = new Map(), calls = []; let cursor = 0;
  const hooks = { ...React, useState(initial) {
    const i = cursor++; if (!(i in state)) state[i] = initial;
    return [state[i], next => state[i] = typeof next === 'function' ? next(state[i]) : next];
  }, useEffect(callback) { effects.push(callback); } };
  const api = { getAssignmentInspections: async () => inspections,
    createVehicleInspection: async () => { calls.push(['create']); return { id: 'inspection' }; },
    uploadInspectionPhoto: async (...args) => { calls.push(['upload', args[4]]); },
    completeVehicleInspection: async payload => { calls.push(['complete', payload]); return {}; }, ...overrides };
  function load(relative) {
    const filename = path.resolve(relative); if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); cache.set(filename, mod);
    const req = Module.createRequire(filename);
    mod.require = name => {
      if (name === 'react') return hooks;
      if (name.includes('firebaseApi')) return api;
      if (name.endsWith('store/session')) return { getDriverSession: () => ({ sessionToken: 'synthetic-session' }) };
      if (name.endsWith('/Card')) return p => React.createElement('div', null, p.children);
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), name);
        for (const suffix of ['.ts', '.tsx']) if (fs.existsSync(base + suffix)) return load(base + suffix);
      }
      return req(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText, filename); return mod.exports;
  }
  const Form = load('src/components/driver/VehicleInspectionForm.tsx').default;
  return { calls, render() { cursor = 0; return Form({ boundaryType, assignmentId: 'assignment', driverId: 'driver',
    vehicle: { registration: 'TEST', vehicleType: 'ICE' }, returnIntent: boundaryType === 'RETURN' ? 'SHIFT_END' : undefined,
    onCompleted: async value => { calls.push(['done', value]); } }); },
    async restore() { this.render(); await Promise.all(effects.splice(0).map(f => f())); return this.render(); } };
}
function nodes(tree, match) {
  const found = []; function visit(value) { React.Children.forEach(value, child => {
    if (!React.isValidElement(child)) return; if (match(child)) found.push(child); visit(child.props.children);
  }); } visit(tree); return found;
}
const button = (tree, text) => nodes(tree, n => n.type === 'button' && n.props.children === text)[0];
const photos = tree => nodes(tree, n => n.props.role === 'EXTERIOR' || n.props.role === 'INTERIOR');
const existing = boundaryType => [{ boundaryType, status: 'PENDING', exteriorPhotoPath: 'synthetic/exterior.jpg', interiorPhotoPath: 'synthetic/interior.jpg' }];

test('PICKUP hides all damage controls and retains both keyboard-accessible photo fields', async () => {
  const h = harness('PICKUP'), tree = await h.restore(), html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /Any new damage|Damage description|aria-pressed/);
  assert.equal(photos(tree).length, 2); assert.match(html, /Exterior condition photo/); assert.match(html, /Interior \/ dashboard photo/);
  assert.match(html, /class="sr-only"/); assert.ok(button(tree, 'Complete Pickup Inspection'));
});
for (const missing of ['EXTERIOR', 'INTERIOR']) test('PICKUP cannot complete without ' + missing + ' photo', async () => {
  const records = existing('PICKUP'); delete records[0][missing === 'EXTERIOR' ? 'exteriorPhotoPath' : 'interiorPhotoPath'];
  const h = harness('PICKUP', records); await button(await h.restore(), 'Complete Pickup Inspection').props.onClick();
  assert.ok(!h.calls.some(c => c[0] === 'complete')); assert.match(renderToStaticMarkup(h.render()), /Please capture/);
});
test('PICKUP completes with restored photos and neutral fields, even if old draft damage is present', async () => {
  const records = existing('PICKUP'); Object.assign(records[0], { hasDamage: true, damageDescription: '' });
  const h = harness('PICKUP', records); await button(await h.restore(), 'Complete Pickup Inspection').props.onClick();
  const payload = h.calls.find(c => c[0] === 'complete')[1];
  assert.equal(payload.hasDamage, false); assert.equal(payload.damageDescription, undefined);
  assert.deepEqual(h.calls.map(c => c[0]), ['create', 'complete', 'done']);
});
test('PICKUP new photos follow existing compression and two-upload flow before completion', async () => {
  const old = { FileReader: global.FileReader, Image: global.Image, document: global.document };
  global.FileReader = class { readAsDataURL() { this.result = 'data:image/jpeg;base64,c3ludGhldGlj'; this.onloadend(); } };
  global.Image = class { naturalWidth = 1; naturalHeight = 1; set src(_) { this.onload(); } };
  global.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,c3ludGhldGlj' }) };
  try {
    const h = harness('PICKUP'); let tree = await h.restore();
    for (const photo of photos(tree)) await photo.props.onFile(photo.props.role, { type: 'image/jpeg' });
    await button(h.render(), 'Complete Pickup Inspection').props.onClick();
    assert.deepEqual(h.calls.map(c => c.slice(0, c[0] === 'upload' ? 2 : 1)), [['create'], ['upload', 'EXTERIOR'], ['upload', 'INTERIOR'], ['complete'], ['done']]);
  } finally { Object.assign(global, old); }
});
test('RETURN still requires a description when damage is declared and preserves submitted damage', async () => {
  const h = harness('RETURN', existing('RETURN')); let tree = await h.restore();
  assert.match(renderToStaticMarkup(tree), /Any new damage/);
  button(tree, 'Yes').props.onClick(); tree = h.render();
  const readings = nodes(tree, n => typeof n.props.onOdometerChange === 'function')[0]; readings.props.onOdometerChange('1234');
  await button(h.render(), 'Complete Return Inspection').props.onClick();
  assert.match(renderToStaticMarkup(h.render()), /Please describe the damage/); assert.equal(h.calls.length, 0);
  nodes(h.render(), n => n.type === 'textarea' && n.props['aria-label'] === 'Damage description')[0].props.onChange({ target: { value: 'Visible scratch' } });
  await button(h.render(), 'Complete Return Inspection').props.onClick();
  const payload = h.calls.find(c => c[0] === 'complete')[1]; assert.equal(payload.hasDamage, true); assert.equal(payload.damageDescription, 'Visible scratch');
});
test('saved RETURN recovery retries finalization without rewriting evidence or uploading photos', async () => {
  const draft = { endOdometer: 1234, transitionReason: 'SHIFT_END' };
  const h = harness('RETURN', [{ ...existing('RETURN')[0], status: 'COMPLETED', returnFinalization: draft }]);
  const tree = await h.restore(); assert.match(renderToStaticMarkup(tree), /Return inspection saved/);
  await nodes(tree, n => typeof n.props.onComplete === 'function')[0].props.onComplete();
  assert.deepEqual(h.calls, [['done', { ...draft, returnIntent: 'SHIFT_END' }]]);
});
