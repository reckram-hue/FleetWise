const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./uiHarness.cjs');
const { scenarioReport, planned, now } = require('./scenarioFixtures.cjs');
const engine = harness().load('src/lib/fleetScenario.ts');
const calc = (patch = {}, report = scenarioReport(), locations = []) => engine.calculateFleetScenario(report, { ...planned, ...patch }, locations, now);
test('battery scenario calculates annual, monthly and per-km difference without mutating observations', () => {
  const report = scenarioReport(), before = structuredClone(report), r = calc({}, report);
  assert.equal(r.ok, true); assert.equal(r.methodVersion, 'v1');
  assert.equal(r.outputs.annualIceLitres, 2500); assert.equal(r.outputs.annualBatteryKWh, 4500);
  assert.equal(r.outputs.annualGridKWh, 5000); assert.equal(r.outputs.annualIceFuelCost, 60000);
  assert.equal(r.outputs.annualEvEnergyCost, 12500); assert.equal(r.outputs.annualOperatingDifference, 47500);
  assert.equal(r.outputs.monthlyOperatingDifference, 47500/12); assert.equal(r.outputs.perKmDifference, 1.9);
  assert.deepEqual(report, before); assert.equal(r.trace.source.registration, 'TEST ICE'); assert.equal(r.trace.target.registration, 'TEST EV');
});
test('grid boundary ignores stale loss input and never invents battery energy', () => {
  const r = calc({ energyBoundary: 'GRID', chargingLossPercent: 99 });
  assert.equal(r.ok, true); assert.equal(r.outputs.annualGridKWh, 4500); assert.equal(r.outputs.annualBatteryKWh, null); assert.equal(r.basis.chargingLossPercent, null);
});
test('observed ICE and EV sources reuse sufficient metrics with battery boundary', () => {
  const r = calc({ iceSource: 'OBSERVED_VEHICLE', evSource: 'OBSERVED_VEHICLE', energyBoundary: 'GRID' });
  assert.equal(r.ok, true); assert.equal(r.basis.litresPer100Km, 10); assert.equal(r.basis.energyPer100Km, 10);
  assert.equal(r.basis.energyBoundary, 'BATTERY'); assert.equal(r.trace.target.economy.provenance, 'ESTIMATED');
});
test('observed complete cost takes priority over unneeded fuel-price assumptions', () => {
  const r = calc({ iceSource: 'OBSERVED_COST', fuelPricePerLitre: null });
  assert.equal(r.ok, true); assert.equal(r.outputs.iceCostPerKm, 2); assert.equal(r.outputs.annualIceFuelCost, 50000); assert.equal(r.basis.fuelPricePerLitre, null);
});
test('manufacturer ICE is explicit reference input; manufacturer EV is always rejected', () => {
  const r = calc({ iceSource: 'MANUFACTURER_REFERENCE' });
  assert.equal(r.ok, true); assert.equal(r.basis.litresPer100Km, 9);
  const invalid = calc({ evSource: 'MANUFACTURER_REFERENCE' }); assert.equal(invalid.ok, false); assert.match(invalid.errors.join(' '), /energy basis is not verified/);
});
for (const [vehicleIndex, purpose, patch] of [[0, 'consumption', {iceSource:'OBSERVED_VEHICLE'}], [1, 'consumption', {evSource:'OBSERVED_VEHICLE'}], [0, 'cost', {iceSource:'OBSERVED_COST'}]]) {
  for (const state of ['LIMITED_EVIDENCE', 'INSUFFICIENT_DATA']) test(`rejects ${vehicleIndex} ${purpose} ${state} as observed scenario input`, () => {
    const report = scenarioReport(); report.vehicles[vehicleIndex].readiness[purpose].state = state;
    assert.equal(calc(patch, report).ok, false); assert.equal(calc({}, report).ok, true);
  });
}
test('expired review cannot supply observed baseline; no permitted annualization method exists in v1', () => {
  const report = scenarioReport(); report.vehicles[0].readiness.consumption.scopeDay = '2026-01-01';
  assert.equal(calc({iceSource:'OBSERVED_VEHICLE'}, report).ok, false);
  assert.equal(calc({ distanceSource:'ANNUALIZED_OBSERVED' }).ok, false);
  assert.equal(calc({ distanceSource:'PLANNED' }).ok, true);
});
for (const patch of [{annualKm:0}, {annualKm:-1}, {annualKm:null}, {annualKm:Infinity}, {iceLitresPer100Km:0}, {iceLitresPer100Km:NaN},
  {fuelPricePerLitre:null}, {fuelPricePerLitre:-1}, {evKWhPer100Km:0}, {energyBoundary:''}, {chargingLossPercent:null}, {chargingLossPercent:100},
  {chargingLossPercent:-1}, {chargingLossPercent:NaN}, {tariffPerKWh:null}, {tariffPerKWh:-1}, {targetVehicleId:'missing'}, {iceSource:'FLEETWISE_COHORT'}, {annualKm:Number.MAX_VALUE}]) {
  test(`reject invalid or missing inputs ${JSON.stringify(patch)}`, () => assert.equal(calc(patch).ok, false));
}
test('explicit zero prices/loss are valid, and positive negative zero differences stay signed', () => {
  assert.equal(calc({ chargingLossPercent:0 }).outputs.annualGridKWh, 4500);
  assert.equal(calc({ fuelPricePerLitre:0, tariffPerKWh:0 }).outputs.annualOperatingDifference, 0);
  assert.equal(calc({ tariffPerKWh:12 }).outputs.annualOperatingDifference, 0);
  assert.equal(calc({ tariffPerKWh:13 }).outputs.annualOperatingDifference, -5000);
});
test('location selection uses one known tariff; free is explicit and per-session or missing rates rejected', () => {
  const location = { id:'charger', name:'TEST charger', active:true, tariffMethod:'PER_KWH', tariffRate:3 };
  const p = { tariffSource:'LOCATION', chargingLocationId:'charger', tariffPerKWh:999 };
  assert.equal(calc(p, scenarioReport(), [location]).outputs.annualEvEnergyCost, 15000);
  assert.equal(calc(p, scenarioReport(), [{...location, tariffMethod:'FREE'}]).outputs.annualEvEnergyCost, 0);
  for (const change of [{active:false}, {tariffMethod:'PER_SESSION'}, {tariffRate:null}, {tariffRate:NaN}]) assert.equal(calc(p, scenarioReport(), [{...location,...change}]).ok, false);
});
test('TEST selection, active admin guard, display rounding and blank numbers remain conservative', () => {
  assert.equal(calc({}, scenarioReport(false)).ok, false);
  assert.equal(engine.scenarioAdminAllowed({role:'admin',employmentStatus:'Active'}), true);
  for(const u of [null,{role:'driver',employmentStatus:'Active'},{role:'admin',employmentStatus:'Inactive'}]) assert.equal(engine.scenarioAdminAllowed(u), false);
  assert.match(engine.scenarioMoney(12.345), /12[,.]35/); assert.match(engine.scenarioMoney(-12.345), /-.*12[,.]35/);
  assert.equal(engine.parseScenarioNumber(''), null); assert.equal(engine.parseScenarioNumber(' '), null); assert.equal(engine.parseScenarioNumber('0'), 0);
});
