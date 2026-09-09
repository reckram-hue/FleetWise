const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text, button } = require('./uiHarness.cjs');
const { calculateEconomy } = require('../functions-prod-jhb/lib/economyMetrics.js');
const report = () => calculateEconomy({ vehicles: [
  { id: 'ice', vehicleType: 'ICE', registration: 'ICE-ONE', manufacturerFuelConsumption: 8 },
  { id: 'ev', vehicleType: 'EV', registration: 'EV-ONE', manufacturerEnergyConsumption: 15 },
], drivers: [], assignments: [], refuels: [], sessions: [], chargingEvents: [] }, { period: '30', includeTest: false, now: Date.parse('2026-09-09T10:00Z') });

test('economy UI uses server evidence, distinct units and honest unknowns; period and TEST controls reach API', async () => {
  const calls = [], h = harness({ economyApi: { get: async (...args) => { calls.push(args); return report(); } } });
  const C = h.load('src/components/admin/FuelEconomyMonitor.tsx').default;
  const render = () => h.render(C, { vehicles: [{ currentFuelConsumption: 12345 }] });
  assert.match(text(render()), /Loading observed economy/); await h.settle();
  let tree = render(), words = text(tree);
  for (const phrase of ['L/100 km', 'kWh/100 km', 'Insufficient Data', 'INSUFFICIENT_COST_DATA', 'Manufacturer Reference', 'Observed FleetWise Baseline', 'Coverage / Data Quality']) assert.ok(words.includes(phrase), phrase);
  assert.doesNotMatch(words, /Performing Well|Normal|Poor|12345|leaderboard/i);
  assert.deepEqual(calls, [['30', false]]);
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: '90' } });
  render(); await h.settle(); tree = render();
  nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } });
  render(); await h.settle(); assert.deepEqual(calls.at(-1), ['90', true]);
});

test('economy API failure shows no partial numbers and retry recovers', async () => {
  let fail = true;
  const h = harness({ economyApi: { get: async () => { if (fail) throw Error('Unavailable'); return report(); } } });
  const C = h.load('src/components/admin/FuelEconomyMonitor.tsx').default, render = () => h.render(C, { vehicles: [] });
  render(); await h.settle(); let tree = render();
  assert.match(text(tree), /No partial totals/); assert.doesNotMatch(text(tree), /ICE-ONE/);
  fail = false; button(tree, 'Retry economy').props.onClick(); render(); await h.settle();
  assert.match(text(render()), /ICE-ONE/);
});

test('refuel defaults UNKNOWN and retries one immutable explicit fill without double submission', async () => {
  const calls = []; let reject;
  global.alert = () => {};
  const h = harness({ getVehicleForSession: async () => ({ id: 'v', registration: 'ICE', currentOdometer: 100 }),
    logRefuelWithSession: payload => { calls.push(payload); return new Promise((_resolve, no) => { reject = no; }); } });
  const C = h.load('src/components/driver/LogRefuelForm.tsx').default;
  const props = { assignmentId: 'a', activeVehicle: { id: 'v', vehicleType: 'ICE' }, onBack() {} };
  const render = () => h.render(C, props);
  render(); await h.settle(); let tree = render();
  assert.equal(nodes(tree, n => n.type === 'select')[0].props.value, 'UNKNOWN');
  const values = ['200', '20', '400'];
  nodes(tree, n => n.type === 'input' && n.props.type === 'number').forEach((n, i) => n.props.onChange({ target: { value: values[i] } }));
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'PARTIAL' } });
  tree = render(); button(tree, 'Proceed to Safety Check').props.onClick(); tree = render();
  nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox').forEach(n => n.props.onChange({ target: { checked: true } }));
  tree = render(); const complete = button(tree, 'Complete Refueling'); complete.props.onClick(); complete.props.onClick();
  assert.equal(calls.length, 1); assert.equal(calls[0].fillLevel, 'PARTIAL'); assert.ok(calls[0].clientRequestId);
  assert.equal(button(render(), 'Back').props.disabled, true);
  const savedError = console.error; console.error = () => {};
  try { reject(Error('Synthetic lost response')); await h.settle(); } finally { console.error = savedError; }
  tree = render(); assert.match(text(tree), /Retry sends the same/); button(tree, 'Complete Refueling').props.onClick();
  assert.equal(calls.length, 2); assert.strictEqual(calls[0], calls[1]);
});
