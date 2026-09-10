const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text, button } = require('./uiHarness.cjs');
const { calculateEconomy } = require('../functions-prod-jhb/lib/economyMetrics.js');
const report = () => calculateEconomy({ vehicles: [
  { id: 'ice', vehicleType: 'ICE', registration: 'ICE-ONE', manufacturerFuelConsumption: 8 },
  { id: 'ev', vehicleType: 'EV', registration: 'EV-ONE', manufacturerEnergyConsumption: 15 },
], drivers: [], assignments: [], refuels: [], sessions: [], chargingEvents: [] }, { period: '30', includeTest: false, now: Date.parse('2026-09-09T10:00Z') });

test('central presentation mapping uses sentence case and does not leak unknown codes', () => {
  const { formatEconomyStatus, formatEconomyReason } = harness().load('src/lib/economyPresentation.ts');
  for (const [status, label] of Object.entries({ INSUFFICIENT_DATA: 'Insufficient data', INSUFFICIENT_COST_DATA: 'Insufficient cost data',
    INSUFFICIENT: 'Insufficient data', LIMITED: 'Limited data', MEASURED: 'Measured', ESTIMATED: 'Estimated', MIXED: 'Mixed data', UNKNOWN: 'Not available' })) {
    assert.equal(formatEconomyStatus(status), label);
  }
  assert.equal(formatEconomyStatus('FUTURE_STATUS'), 'Not available');
  assert.equal(formatEconomyReason('FUTURE_REASON'), 'Additional evidence is needed');
});

for (const [status, label] of [['MEASURED', 'Measured'], ['ESTIMATED', 'Estimated'], ['MIXED', 'Mixed data'], ['UNKNOWN', 'Not available']]) {
  test(`rendered economy humanizes ${status}, including expanded evidence, without changing values`, async () => {
    const data = report();
    for (const f of [data.fleet.ev, data.fleet.ice]) f.provenance = status;
    for (const v of data.vehicles) {
      v.distanceProvenance = v.economy.provenance = v.cost.provenance = v.chargerEnergy.provenance = v.provenance = status;
      v.economy.quality = 'LIMITED'; v.economy.value = 10.5; v.cost.value = 2.25;
      v.evidence = [{ recordIds: ['capture-1'], capacityUsed: null, provenance: status }];
      v.reasons.push('FUTURE_REASON');
    }
    const before = structuredClone(data), h = harness({ economyApi: { get: async () => data } });
    const C = h.load('src/components/admin/FuelEconomyMonitor.tsx').default;
    h.render(C, { vehicles: [] }); await h.settle();
    const tree = h.render(C, { vehicles: [] }), words = text(tree);
    assert.ok(words.includes(label)); assert.ok(words.includes('Limited data'));
    assert.match(words, /10[,.]5 L\/100 km/); assert.match(words, /10[,.]5 kWh\/100 km/); assert.match(words, /R2[,.]25\/km/);
    assert.ok(words.includes('Manufacturer Reference')); assert.ok(words.includes('Reference only; not an observed baseline.'));
    assert.match(words, /8[,.]0 L\/100 km/); assert.match(words, /15[,.]0 kWh\/100 km/);
    assert.ok(words.includes(`${label} · records: capture-1`));
    assert.doesNotMatch(words, /\b(?:INSUFFICIENT|LIMITED|MEASURED|ESTIMATED|MIXED|UNKNOWN)\b|\b[A-Z]+(?:_[A-Z]+)+\b/);
    assert.deepEqual(data, before);
  });
}

for (const [label, shares, expected] of [
  ['numeric', [42.5, 57.5], [/42[,.]5% of known/, /57[,.]5% of known/]],
  ['zero and full', [0, 100], [/km · 0[,.]0% of known/, /km · 100[,.]0% of known/]],
  ['unavailable', [null, null], [/Insufficient data of known/, /Insufficient data of known/]],
  ['nonfinite', [NaN, Infinity], [/Insufficient data of known/, /Insufficient data of known/]],
]) test(`fleet share presentation: ${label}`, async () => {
  const data = report(); [data.fleet.evSharePercent, data.fleet.iceSharePercent] = shares;
  const h = harness({ economyApi: { get: async () => data } });
  const C = h.load('src/components/admin/FuelEconomyMonitor.tsx').default;
  h.render(C, { vehicles: [] }); await h.settle();
  const tree = h.render(C, { vehicles: [] }), cards = nodes(tree, n => n.type === 'article');
  for (let i = 0; i < 2; i++) assert.match(text(cards[i]), expected[i]);
  assert.doesNotMatch(text(tree), /Insufficient data\s*%/);
});

test('economy UI uses server evidence, distinct units and honest unknowns; period and TEST controls reach API', async () => {
  const calls = [], h = harness({ economyApi: { get: async (...args) => { calls.push(args); return report(); } } });
  const C = h.load('src/components/admin/FuelEconomyMonitor.tsx').default;
  const render = () => h.render(C, { vehicles: [{ currentFuelConsumption: 12345 }] });
  assert.match(text(render()), /Loading observed economy/); await h.settle();
  let tree = render(), words = text(tree);
  for (const phrase of ['L/100 km', 'kWh/100 km', 'Insufficient data', 'Insufficient cost data', 'Manufacturer Reference', 'Observed Economy', 'Coverage / Data quality', 'Fleet Economics']) assert.ok(words.includes(phrase), phrase);
  assert.ok(words.includes('No usable driving data yet'));
  assert.ok(words.includes('Not enough data to calculate a reliable baseline.'));
  assert.doesNotMatch(words, /\b[A-Z]+(?:_[A-Z]+)+\b|\b(?:LIMITED|MEASURED|ESTIMATED|MIXED|UNKNOWN)\b/);
  assert.equal(nodes(tree, n => n.props.role === 'alert' || /(?:text|bg)-red-/.test(n.props.className || '')).length, 0);
  assert.doesNotMatch(words, /Performing Well|Normal|Poor|12345|leaderboard|ROI|Ready for analysis|Replacement candidate|Replace now/i);
  assert.equal(nodes(tree, n => n.type === 'table').length, 1);
  assert.equal(text(nodes(tree, n => n.type === 'th')[0]), 'Registration / provenance');
  assert.match(words, /Total eligible EV\/ICE distance: Insufficient data km/);
  assert.deepEqual(calls, [['90', false]]);
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: '90' } });
  render(); await h.settle(); tree = render();
  nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } });
  render(); await h.settle(); assert.deepEqual(calls.at(-1), ['90', true]);
  tree = render(); nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'ALL' } });
  render(); await h.settle(); assert.deepEqual(calls.at(-1), ['ALL', true]);
});

test('comparison exposes partial cost amount, denominator and human provenance without changing the report', async () => {
  const data = report();
  Object.assign(data.fleet.ice, { cost: 100, costPerKm: 2, costCoverageKm: 50, costSampleCount: 1, costProvenance: 'MEASURED', partialCostCoverage: true });
  Object.assign(data.vehicles[0], { distanceKm: 100, distanceSampleCount: 1 });
  Object.assign(data.vehicles[0].cost, { amount: 100, value: 2, coverageKm: 50, sampleCount: 1, provenance: 'MEASURED' });
  const before = structuredClone(data), h = harness({ economyApi: { get: async () => data } });
  const C = h.load('src/components/admin/FuelEconomyMonitor.tsx').default;
  h.render(C, { vehicles: [] }); await h.settle(); const words = text(h.render(C, { vehicles: [] }));
  assert.match(words, /Operating fuel cost\/km: R2[,.]00\/km/);
  assert.match(words, /R100[,.]00/); assert.match(words, /Coverage 50[,.]0 km/);
  assert.match(words, /Partial cost coverage/); assert.match(words, /Measured/);
  assert.deepEqual(data, before);
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
