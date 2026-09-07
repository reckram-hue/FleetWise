const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Deterministic hook harness: render real form handlers without DOM, timers or Firebase.
function harness(api = {}) {
  const state = [], effects = [], cache = new Map(); let cursor = 0;
  const hooks = { ...React, useState(initial) {
    const i = cursor++; if (!(i in state)) state[i] = initial;
    return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }];
  }, useRef(initial) { const i = cursor++; return state[i] ||= { current: initial }; },
  useEffect(callback) { effects.push(callback); }, useContext: () => ({ currentUser: { id: 'test-driver' } }) };
  function load(relative) {
    const filename = path.resolve(relative); if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename, module); cache.set(filename, mod);
    const realRequire = Module.createRequire(filename);
    mod.require = name => {
      if (name === 'react') return hooks;
      if (name.includes('firebaseApi')) return api;
      if (name.includes('UserContext')) return { UserContext: {} };
      if (name.endsWith('store/session')) return { getDriverSession: () => ({ driverId: 'test-driver', sessionToken: 'synthetic-session' }) };
      if (name.includes('/shared/')) return props => React.createElement('div', null, props.children);
      if (name.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), name);
        for (const suffix of ['.ts', '.tsx']) if (fs.existsSync(base + suffix)) return load(base + suffix);
      }
      return realRequire(name);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText, filename);
    return mod.exports;
  }
  const Form = load('src/components/driver/ReportDefectForm.tsx').default;
  let closed = 0;
  return { load, renderComponent(Component, props) { cursor = 0; return Component(props); },
    async flushEffects() { await Promise.all(effects.splice(0).map(effect => effect())); },
    render(pickup = false) { cursor = 0; return Form({ pickup, currentVehicle: { id: 'test-vehicle', registration: 'TEST', vehicleType: 'EV' }, onBack: () => closed++ }); }, closed: () => closed };
}
function nodes(tree, type) {
  const found = []; function visit(value) { React.Children.forEach(value, child => {
    if (!React.isValidElement(child)) return; if (child.type === type) found.push(child); visit(child.props.children);
  }); } visit(tree); return found;
}
function field(tree, id) { return [...nodes(tree, 'input'), ...nodes(tree, 'textarea'), ...nodes(tree, 'select')].find(n => n.props.id === id); }
const submit = tree => nodes(tree, 'form')[0].props.onSubmit({ preventDefault() {} });

test('outstanding cards have distinct caution/danger treatments and visible severity; closed defects excluded', () => {
  const h = harness(), { OutstandingDefectList } = h.load('src/components/driver/OutstandingVehicleDefects.tsx');
  for (const [urgency, color] of [['Low', 'amber-50'], ['Medium', 'orange-100'], ['High', 'red-50'], ['Critical', 'red-100']]) {
    const html = renderToStaticMarkup(React.createElement(OutstandingDefectList, { defects: [
      { id: 'open', status: 'New', urgency, category: 'Other', description: 'Visible concern' },
      ...['Resolved', 'Duplicate'].map(status => ({ id: status, status, urgency, description: 'Excluded concern' })),
    ] }));
    assert.ok(html.includes(color)); assert.ok(html.includes('Severity: ' + urgency));
    assert.doesNotMatch(html, /Excluded concern/); if (urgency === 'Low') assert.doesNotMatch(html, /red-/);
  }
});

for (const [entry, filename, pickup] of [
  ['Active Shift', 'src/pages/ActiveShift.tsx', false],
  ['Driver Dashboard', 'src/components/driver/DriverDashboard.tsx', false],
  ['Initial pickup', 'src/pages/ShiftStart.tsx', true],
  ['Replacement pickup', 'src/components/driver/TakeVehicleForm.tsx', true],
]) test(entry + ' routes to the full shared form with a locked vehicle and optional photos', () => {
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const forms = []; function visit(n) { if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'ReportDefectForm') forms.push(n); ts.forEachChild(n, visit); } visit(ast);
  assert.equal(forms.length, 1);
  const attrs = forms[0].attributes.properties.map(n => n.getText(ast));
  assert.ok(attrs.some(a => a.startsWith('currentVehicle='))); assert.equal(attrs.includes('pickup'), pickup);
  if (pickup) assert.match(source, /onReport=/);
  const tree = harness().render(pickup);
  for (const key of ['category', 'urgency', 'location', 'description', 'notes']) {
    assert.ok(field(tree, 'driver-formData-' + key));
    assert.ok(nodes(tree, 'label').some(n => n.props.htmlFor === 'driver-formData-' + key));
  }
  assert.equal(field(tree, 'driver-formData-description').props.required, true);
  assert.ok(!field(tree, 'defect-photos').props.required);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Vehicle Location/); assert.match(html, /Add photos \(optional\)/);
  assert.match(html, /You can submit without photos/);
  assert.equal(nodes(tree, 'select').length, 2); // Category and urgency, never vehicle selection.
});

test('replacement report action opens the selected vehicle form and restores readings with a fresh defect check', async () => {
  const h = harness({ listVehiclesForSession: async () => [] });
  const Take = h.load('src/components/driver/TakeVehicleForm.tsx').default;
  const Outstanding = h.load('src/components/driver/OutstandingVehicleDefects.tsx').default;
  const Form = h.load('src/components/driver/ReportDefectForm.tsx').default;
  const vehicle = { id: 'test-vehicle', registration: 'TEST', vehicleType: 'EV' };
  const props = { driverId: 'test-driver', shiftId: 'test-shift', suggestedVehicle: vehicle, suggestedStartOdo: 1234, onBack() {}, onAssigned() { assert.fail('Reporting must not create an assignment'); } };
  h.renderComponent(Take, props); await h.flushEffects();
  let tree = h.renderComponent(Take, props);
  nodes(tree, Outstanding)[0].props.onReadyChange(true);
  nodes(tree, Outstanding)[0].props.onReport();
  const report = h.renderComponent(Take, props);
  assert.equal(report.type, Form); assert.equal(report.props.currentVehicle, vehicle); assert.equal(report.props.pickup, true);
  report.props.onBack(); tree = h.renderComponent(Take, props);
  assert.equal(field(tree, 'pickup-odometer').props.value, '1234');
  const accept = nodes(tree, 'button').find(n => n.props.children === 'Take Vehicle');
  assert.equal(accept.props.disabled, true);
  assert.equal(nodes(tree, Outstanding)[0].props.vehicleId, vehicle.id);
});

async function withBrowserStubs(run) {
  const old = { localStorage: global.localStorage, alert: global.alert, FileReader: global.FileReader };
  global.localStorage = { getItem: () => null }; global.alert = () => {};
  global.FileReader = class { readAsDataURL() { this.result = 'data:image/jpeg;base64,c3ludGhldGlj'; this.onload(); } };
  try { await run(); } finally { Object.assign(global, old); }
}
test('no-photo submission succeeds, preserves driver/vehicle and closes once', () => withBrowserStubs(async () => {
  let payload; const h = harness({ uploadDefectPhoto() { assert.fail('No upload expected'); }, reportDefectWithSession: async p => { payload = p; } });
  field(h.render(), 'driver-formData-description').props.onChange({ target: { value: 'Intermittent noise' } });
  await submit(h.render()); assert.equal(payload.photos, undefined); assert.equal(payload.vehicleId, 'test-vehicle');
  assert.equal(payload.driverId, 'test-driver'); assert.equal(h.closed(), 1);
}));
test('selected photos upload before submission; double-submit and Back are blocked while pending', () => withBrowserStubs(async () => {
  const calls = []; let finish;
  const h = harness({ uploadDefectPhoto: async (...args) => { calls.push('upload'); assert.equal(args[2], 'test-vehicle'); await new Promise(r => finish = r); return { photoPath: 'defects/test/photo.jpg' }; },
    reportDefectWithSession: async p => { calls.push('report'); assert.deepEqual(p.photos, ['defects/test/photo.jpg']); } });
  field(h.render(), 'driver-formData-description').props.onChange({ target: { value: 'Visible leak' } });
  await field(h.render(), 'defect-photos').props.onChange({ target: { files: [{ type: 'image/jpeg' }], value: 'photo' } });
  const tree = h.render(), first = submit(tree); await submit(tree);
  assert.deepEqual(calls, ['upload']); assert.equal(nodes(h.render(), 'button')[0].props.disabled, true);
  finish(); await first; assert.deepEqual(calls, ['upload', 'report']); assert.equal(h.closed(), 1);
}));
test('upload failure prevents report, retains inputs/photos and allows retry', () => withBrowserStubs(async () => {
  let fail = true, reports = 0;
  const h = harness({ uploadDefectPhoto: async () => { if (fail) throw new Error('Photo upload failed'); return { photoPath: 'defects/test/photo.jpg' }; }, reportDefectWithSession: async () => reports++ });
  field(h.render(), 'driver-formData-description').props.onChange({ target: { value: 'Visible leak' } });
  await field(h.render(), 'defect-photos').props.onChange({ target: { files: [{ type: 'image/jpeg' }], value: 'photo' } });
  const error = console.error; console.error = () => {}; try { await submit(h.render()); } finally { console.error = error; }
  assert.equal(reports, 0); assert.equal(h.closed(), 0);
  const tree = h.render(); assert.equal(field(tree, 'driver-formData-description').props.value, 'Visible leak');
  assert.equal(nodes(tree, 'img').length, 1); assert.match(renderToStaticMarkup(tree), /Photo upload failed/);
  fail = false; await submit(h.render()); assert.equal(reports, 1); assert.equal(h.closed(), 1);
}));
test('pending local photo read cannot race ahead into report submission', () => withBrowserStubs(async () => {
  let reader, reports = 0; global.FileReader = class { readAsDataURL() { reader = this; } };
  const h = harness({ reportDefectWithSession: async () => reports++ });
  const read = field(h.render(), 'defect-photos').props.onChange({ target: { files: [{ type: 'image/jpeg' }], value: '' } });
  await submit(h.render()); assert.equal(reports, 0);
  reader.result = 'data:image/jpeg;base64,c3ludGhldGlj'; reader.onload(); await read;
  assert.equal(nodes(h.render(), 'img').length, 1);
}));
