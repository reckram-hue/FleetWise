const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Compile frontend modules in memory. Firebase/network modules are explicitly stubbed.
const cache = new Map();
const storage = new Map();
const previousStorage = global.localStorage;
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
after(() => { global.localStorage = previousStorage; });
function load(relative) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  cache.set(filename, loaded);
  const realRequire = Module.createRequire(filename);
  loaded.require = name => {
    if (name.includes('firebaseApi')) return { default: new Proxy({}, { get() { throw new Error('Firebase access forbidden in UX tests'); } }) };
    if (name.endsWith('store/session')) return { getDriverSession: () => null, isSessionLocallyExpired: () => true };
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), name);
      for (const suffix of ['.ts', '.tsx']) if (fs.existsSync(base + suffix)) return load(base + suffix);
    }
    return realRequire(name);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, filename);
  return loaded.exports;
}
const { VehicleStartReadings, ReturnReadings } = load('src/components/driver/VehicleReadings.tsx');
const Choice = load('src/components/driver/ReturnChargingChoice.tsx').default;
const Saved = load('src/components/driver/SavedReturnNotice.tsx').default;
const { findScannedVehicle, outstandingDefects } = load('src/lib/driverVehiclePresentation.ts');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
function elements(tree, type) {
  const result = [];
  function visit(node) {
    React.Children.forEach(node, child => {
      if (!React.isValidElement(child)) return;
      if (child.type === type) result.push(child);
      visit(child.props.children);
    });
  }
  visit(tree); return result;
}

test('EV current vehicle summary displays the three assignment readings, including zero', () => {
  const html = render(VehicleStartReadings, { isEV: true, odometer: 10600, stateOfCharge: 90, predictedRange: 295 });
  assert.match(html, /Start Odometer/); assert.ok(html.includes((10600).toLocaleString() + ' km'));
  assert.match(html, /Start State of Charge/); assert.match(html, /90%/);
  assert.match(html, /Start Predicted Range/); assert.match(html, /295 km/);
  assert.equal((html.match(/<dt /g) || []).length, 3);
  assert.match(render(VehicleStartReadings, { isEV: true, predictedRange: 0 }), /0 km/);
});

test('ICE hides EV fields and unknown EV readings do not become false placeholders', () => {
  const ice = render(VehicleStartReadings, { isEV: false, odometer: 123, stateOfCharge: 80, predictedRange: 300 });
  assert.doesNotMatch(ice, /State of Charge|Predicted Range/);
  const unknown = render(VehicleStartReadings, { isEV: true, odometer: 123 });
  assert.doesNotMatch(unknown, /State of Charge|Predicted Range|Not recorded/);
});

test('EV return reading controls keep order, labels, limits and update callbacks', () => {
  let changed;
  const props = { isEV: true, odometer: '10700', stateOfCharge: '45', predictedRange: '160', disabled: false,
    onOdometerChange: () => {}, onStateOfChargeChange: value => { changed = value; }, onPredictedRangeChange: () => {} };
  const tree = ReturnReadings(props), inputs = elements(tree, 'input'), labels = elements(tree, 'label');
  assert.deepEqual(inputs.map(i => i.props.id), ['return-odometer', 'return-soc', 'return-range']);
  assert.deepEqual(labels.map(l => l.props.htmlFor), inputs.map(i => i.props.id));
  assert.ok(inputs.every(i => i.props.required && Number(i.props.min) === 0));
  assert.equal(inputs[1].props.max, 100); assert.equal(inputs[2].props.max, 2000);
  inputs[1].props.onChange({ target: { value: '46' } }); assert.equal(changed, '46');
  assert.equal(elements(ReturnReadings({ ...props, isEV: false }), 'input').length, 1);
  assert.equal(ReturnReadings({ ...props, disabled: true }).props.disabled, true);
});

test('charging handover is undecided initially; YES reveals location, NO hides it', () => {
  let choice;
  const props = { value: null, disabled: false, onChange: value => { choice = value; },
    children: React.createElement('select', { 'aria-label': 'Required charging location' }) };
  assert.doesNotMatch(render(Choice, props), /<select/);
  const radios = elements(Choice(props), 'input');
  assert.ok(radios.every(input => input.props.checked === false));
  radios[1].props.onChange(); assert.equal(choice, true);
  assert.match(render(Choice, { ...props, value: true }), /<select/);
  assert.doesNotMatch(render(Choice, { ...props, value: false }), /<select/);
  assert.equal(Choice({ ...props, disabled: true }).props.disabled, true);
});

test('saved-return view preserves evidence and offers one disabled-while-busy completion action', () => {
  let completed = 0;
  const props = { odometer: 10700, busy: false, error: null, onComplete: () => { completed++; } };
  const html = render(Saved, props);
  assert.match(html, /Return inspection saved/); assert.match(html, /do not need to repeat/);
  assert.doesNotMatch(html, /<input|<textarea|persisted draft|idempotent/);
  const buttons = elements(Saved(props), 'button'); assert.equal(buttons.length, 1);
  buttons[0].props.onClick(); assert.equal(completed, 1);
  assert.equal(elements(Saved({ ...props, busy: true }), 'button')[0].props.disabled, true);
  assert.match(render(Saved, { ...props, error: 'Please retry' }), /role="alert"/);
});

test('QR codes select only exact authorized available vehicle IDs, not URLs or unrelated IDs', () => {
  const available = [{ id: 'synthetic-vehicle', registration: 'TEST' }];
  assert.equal(findScannedVehicle(available, ' synthetic-vehicle '), available[0]);
  for (const text of ['unknown', 'https://example.invalid/synthetic-vehicle', 'synthetic']) {
    assert.equal(findScannedVehicle(available, text), undefined);
  }
});

test('outstanding defect view excludes Resolved and Duplicate without changing records', () => {
  const defects = ['New', 'In Progress', 'Resolved', 'Duplicate'].map((status, id) => ({ id: String(id), status }));
  const before = JSON.stringify(defects);
  assert.deepEqual(outstandingDefects(defects).map(d => d.status), ['New', 'In Progress']);
  assert.equal(JSON.stringify(defects), before);
});

test('predicted range survives server hydration, assignment swap, local persistence and clearing', () => {
  const { toActiveShiftState } = load('src/lib/resolveActiveShift.ts');
  const { shiftStore } = load('src/store/shift.ts');
  const state = toActiveShiftState({ id: 'synthetic-driver', firstName: 'Test', surname: 'Driver' }, {
    hasActiveShift: true, shift: { id: 'shift', startTime: '2026-01-01T00:00:00Z', startOdometer: 10600 },
    hasActiveAssignment: true, assignment: { id: 'assignment', vehicleId: 'vehicle', startOdometer: 10600,
      startChargePercent: 90, startPredictedRangeKm: 295 },
    vehicle: { registration: 'TEST', vehicleType: 'EV' }, inspections: [],
  });
  assert.equal(state.assignmentStartPredictedRangeKm, 295);
  shiftStore.setActiveShift(state);
  assert.equal(JSON.parse(storage.get('fleetwise_active_shift')).assignmentStartPredictedRangeKm, 295);
  shiftStore.setVehicleAssignment({ assignmentId: 'next', vehicleId: 'next', vehicle: { id: 'next', registration: 'NEXT', vehicleType: 'EV' }, startPredictedRangeKm: 0 });
  assert.equal(shiftStore.getActiveShift().assignmentStartPredictedRangeKm, 0);
  shiftStore.clearVehicleAssignment();
  assert.equal(shiftStore.getActiveShift().assignmentStartPredictedRangeKm, undefined);
});

test('both pickup screens reuse QR and outstanding-defect components; initial reporting uses the standard form', () => {
  const tags = file => {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = [];
    function visit(node) { if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) found.push(node.tagName.getText(ast)); ts.forEachChild(node, visit); }
    visit(ast); return found;
  };
  for (const file of ['src/pages/ShiftStart.tsx', 'src/components/driver/TakeVehicleForm.tsx']) {
    assert.ok(tags(file).includes('VehicleQrScanner')); assert.ok(tags(file).includes('OutstandingVehicleDefects'));
  }
  assert.ok(tags('src/pages/ShiftStart.tsx').includes('ReportDefectForm'));
  const order = tags('src/components/driver/VehicleInspectionForm.tsx');
  assert.ok(order.indexOf('ReturnReadings') < order.indexOf('ReturnChargingChoice'));
  assert.ok(order.indexOf('ReturnChargingChoice') < order.indexOf('PhotoField'));
});
