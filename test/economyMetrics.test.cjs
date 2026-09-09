const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const start = Date.parse('2026-09-01T08:00:00Z'), now = Date.parse('2026-09-10T08:00:00Z');
const at = h => new Date(start + h * 3600000).toISOString();
const capacity = { valueKWh: 50, source: 'Explicit usable specification, revision 1', recordedAt: at(-1) };
const assignment = (over = {}) => ({ id: 'a', vehicleId: 'v', driverId: 'd', shiftId: 'shift', status: 'COMPLETED',
  startOdometer: 0, endOdometer: 300, startedAt: at(0), endedAt: at(4), startChargePercent: 80, endChargePercent: 60,
  usableCapacitySnapshot: capacity, energyCaptureVersion: 1, ...over });
const fill = (id, odometer, fillLevel, litresFilled, fuelCost) => ({ id, clientRequestId: id, captureVersion: 1, recordStatus: 'ACTIVE', currency: 'ZAR',
  assignmentId: 'a', shiftId: 'shift', vehicleId: 'v', driverId: 'd', date: at(odometer / 100), odometer, fillLevel, litresFilled, fuelCost });
const fills = () => [fill('first', 0, 'FULL', 50, 1000), fill('partial', 100, 'PARTIAL', 10, 200), fill('last', 300, 'FULL', 20, 400)];
const charge = (over = {}) => ({ id: 'charge', assignmentId: 'a', vehicleId: 'v', driverId: 'd', shiftId: 'shift', status: 'CLOSED', recordStatus: 'ACTIVE',
  economyCaptureVersion: 1, startedAt: at(1), endedAt: at(2), startOdometer: 50, startChargePercent: 50, endChargePercent: 70,
  usableCapacitySnapshot: capacity, chargerEnergyDeliveredKWh: 12, chargerEnergyProvenance: 'REPORTED_METER', chargeCost: 24, costProvenance: 'REPORTED', currency: 'ZAR', ...over });
const input = (type = 'ICE', over = {}) => ({ vehicles: [{ id: 'v', registration: 'TEST FIXTURE', vehicleType: type, manufacturerFuelConsumption: 8, manufacturerEnergyConsumption: 15 }],
  drivers: [{ id: 'd' }], assignments: [assignment()], refuels: type === 'ICE' ? fills() : [], sessions: [], chargingEvents: [], ...over });
const opts = { period: '30', includeTest: false, now };

for (const backend of ['functions', 'functions-prod-jhb']) {
  const m = require(resolve(backend, 'lib/economyMetrics.js'));
  const run = (label, fn) => test(`${backend}: ${label}`, fn);
  const calculate = (data, options = {}) => m.calculateEconomy(data, { ...opts, ...options });
  run('factual fleet metadata reconciles EV, ICE, missing and TEST evidence without readiness claims', () => {
    const data = input();
    data.vehicles.push({ id: 'ev', vehicleType: 'EV' }, { id: 'qa', vehicleType: 'EV', isTestData: true }, { id: 'unknown', vehicleType: 'OTHER' });
    data.assignments.push(assignment({ id: 'ev-a', vehicleId: 'ev', endOdometer: 100 }), assignment({ id: 'qa-a', vehicleId: 'qa', endOdometer: 50 }), assignment({ id: 'u-a', vehicleId: 'unknown' }));
    const r = calculate(data), f = r.fleet;
    assert.equal(f.totalEligibleKm, 400); assert.equal(f.distanceSampleCount, 2); assert.equal(f.excludedPowertrainAssignments, 1);
    assert.equal(f.evSharePercent, 25); assert.equal(f.iceSharePercent, 75);
    assert.equal(f.provenance, 'MIXED'); assert.equal(f.ev.provenance, 'ESTIMATED'); assert.equal(f.ice.provenance, 'MEASURED');
    assert.equal(f.ice.cost, 600); assert.equal(f.ice.costCoverageKm, 300); assert.equal(f.ice.costPerKm, 2);
    assert.equal(f.ice.costSampleCount, 1); assert.equal(f.ice.costProvenance, 'MEASURED'); assert.equal(f.ice.partialCostCoverage, false);
    assert.equal(f.ev.costStatus, 'INSUFFICIENT_COST_DATA'); assert.equal(f.ev.cost, null);
    assert.equal(f.ice.quality, 'LIMITED'); assert.equal(calculate(data, { includeTest: true }).fleet.totalEligibleKm, 450);
    assert.doesNotMatch(JSON.stringify(r), /READY_FOR_ANALYSIS|replacement|ROI/);
    for (const powertrain of ['EV', 'ICE']) {
      const only = calculate(input(powertrain)).fleet;
      assert.equal(only.totalEligibleKm, 300); assert.equal(only[powertrain === 'EV' ? 'evSharePercent' : 'iceSharePercent'], 100);
    }
  });
  run('fleet unknown distance stays null and measured stationary distance remains zero', () => {
    for (const assignments of [[], [assignment({ endOdometer: null })], [assignment(), assignment()]]) {
      const f = calculate(input('ICE', { assignments })).fleet;
      assert.equal(f.totalEligibleKm, null); assert.equal(f.ice.eligibleDistanceKm, null);
      assert.equal(f.evSharePercent, null); assert.equal(f.ice.costPerKm, null);
      assert.equal(f.ice.distanceProvenance, 'INSUFFICIENT_DATA');
    }
    const f = calculate(input('ICE', { assignments: [assignment({ endOdometer: 0 })] })).fleet;
    assert.equal(f.totalEligibleKm, 0); assert.equal(f.ice.distanceProvenance, 'MEASURED'); assert.equal(f.iceSharePercent, null);
  });
  run('partial cost metadata uses cost-covered km only; unknown price is not zero', () => {
    const data = input(); data.assignments.push(assignment({ id: 'b', startedAt: at(5), endedAt: at(6), startOdometer: 300, endOdometer: 400 }));
    let f = calculate(data).fleet.ice;
    assert.equal(f.distanceKm, 400); assert.equal(f.costCoverageKm, 300); assert.equal(f.costPerKm, 2); assert.equal(f.partialCostCoverage, true);
    data.refuels[1].fuelCost = null; f = calculate(data).fleet.ice;
    assert.equal(f.cost, null); assert.equal(f.costPerKm, null); assert.equal(f.costProvenance, 'INSUFFICIENT_DATA');
    const ev = calculate(input('EV', { assignments: [assignment({ endChargePercent: 80 })], sessions: [charge({ endChargePercent: 90 })] })).fleet.ev;
    assert.equal(ev.cost, 24); assert.equal(ev.costCoverageKm, 300); assert.equal(ev.costPerKm, 24 / 300); assert.equal(ev.costProvenance, 'MEASURED');
  });
  for (const period of ['30', '90', 'ALL']) run(`fleet ${period} metadata inherits exact whole-interval boundaries`, () => {
    const from = period === 'ALL' ? 0 : now - Number(period) * 86400000;
    const a = assignment({ startedAt: new Date(from).toISOString(), endedAt: new Date(from + 3600000).toISOString() });
    const data = input('EV', { assignments: [a] });
    let f = calculate(data, { period }).fleet.ev;
    assert.equal(f.eligibleDistanceKm, 300); assert.equal(f.period, period); assert.equal(f.periodStart, a.startedAt); assert.equal(f.periodEnd, new Date(now).toISOString());
    if (period !== 'ALL') { a.startedAt = new Date(from - 1).toISOString(); assert.equal(calculate(data, { period }).fleet.ev.eligibleDistanceKm, null); }
  });
  run('conflicting timestamps and reversed assignment chronology are rejected', () => {
    const r = fills(); r[1].date = r[2].date;
    assert.equal(calculate(input('ICE', { refuels: r })).vehicles[0].economy.value, null);
    const v = calculate(input('EV', { assignments: [assignment(), assignment({ id: 'backwards', startedAt: at(-5), endedAt: at(-1), startOdometer: 300, endOdometer: 500 })] })).vehicles[0];
    assert.equal(v.distanceKm, 0); assert.equal(v.unknownAssignments, 2);
  });
  run('overlapping reported meters are not summed, even without usable capacity', () => {
    const v = calculate(input('EV', { assignments: [assignment({ usableCapacitySnapshot: null })], sessions: [charge(), charge({ id: 'copy' })] })).vehicles[0];
    assert.equal(v.chargerEnergy.valueKWh, null);
  });
  run('unlocatable or boundary-spanning charge ownership cannot silently disappear', () => {
    for (const fields of [{ assignmentId: 'unknown', startedAt: null }, { assignmentId: 'other', startedAt: at(-1), endedAt: at(1) }]) {
      const v = calculate(input('EV', { sessions: [charge(fields)] })).vehicles[0];
      assert.equal(v.economy.value, null); assert.equal(v.cost.status, 'INSUFFICIENT_COST_DATA');
    }
  });
  run('fleet rates use covered-distance weighting and preserve fractional precision', () => {
    const data = input('EV', { assignments: [assignment({ endOdometer: 100 }), assignment({ id: 'b', vehicleId: 'v2', endOdometer: 300, endChargePercent: 43.7 })] });
    data.vehicles.push({ id: 'v2', vehicleType: 'EV' });
    const r = calculate(data);
    assert.equal(r.fleet.ev.distanceKm, 400);
    assert.ok(Math.abs(r.fleet.ev.quantity - 28.15) < 1e-12);
    assert.ok(Math.abs(r.fleet.ev.per100Km - 7.0375) < 1e-12);
    assert.equal(r.fleet.ev.costPerKm, null);
    assert.equal(r.vehicles[0].distanceProvenance, 'MEASURED');
  });
  run('full-to-full includes intervening partial litres and costs, excludes opening fill', () => {
    const v = calculate(input()).vehicles[0];
    assert.equal(v.distanceKm, 300); assert.equal(v.economy.quantity, 30); assert.equal(v.economy.value, 10);
    assert.equal(v.cost.amount, 600); assert.equal(v.cost.value, 2); assert.equal(v.economy.provenance, 'MEASURED');
    assert.equal(v.economy.coverageKm, 300); assert.equal(v.economy.sampleCount, 1); assert.equal(v.economy.quality, 'LIMITED');
  });
  for (const bad of [{ fillLevel: undefined }, { fillLevel: 'UNKNOWN' }, { recordStatus: undefined }, { recordStatus: 'CANCELLED' },
    { recordStatus: 'SUPERSEDED' }, { recordStatus: 'DUPLICATE' }, { litresFilled: null }, { litresFilled: -1 }, { driverId: 'other' }, { captureVersion: undefined }]) {
    run('unsafe refuel breaks chain: ' + JSON.stringify(bad), () => {
      const r = fills(); r[1] = { ...r[1], ...bad }; const v = calculate(input('ICE', { refuels: r })).vehicles[0];
      assert.equal(v.economy.value, null); assert.equal(v.cost.status, 'INSUFFICIENT_COST_DATA');
    });
  }
  run('duplicate submit IDs and duplicate odometers invalidate full boundaries', () => {
    for (const duplicate of [{ ...fills()[2], id: 'copy' }, { ...fills()[2], id: 'copy', clientRequestId: 'other' }]) {
      assert.equal(calculate(input('ICE', { refuels: [...fills(), duplicate] })).vehicles[0].economy.value, null);
    }
  });
  run('unknown refuel date cannot be silently located outside a valid chain', () => {
    assert.equal(calculate(input('ICE', { refuels: [...fills(), { ...fills()[1], id: 'undated', date: null }] })).vehicles[0].economy.value, null);
  });
  run('missing fuel cost keeps consumption but not cost, explicit zero remains zero', () => {
    const r = fills(); r[1].fuelCost = null; let v = calculate(input('ICE', { refuels: r })).vehicles[0];
    assert.equal(v.economy.value, 10); assert.equal(v.cost.value, null);
    r[1].fuelCost = 0; r[2].fuelCost = 0; v = calculate(input('ICE', { refuels: r })).vehicles[0]; assert.equal(v.cost.value, 0);
  });
  run('multiple assignments cover distance without shift-level cross-vehicle subtraction', () => {
    const data = input('ICE', { assignments: [assignment({ endOdometer: 100, endedAt: at(1) }), assignment({ id: 'b', startOdometer: 100, startedAt: at(1) }),
      assignment({ id: 'c', vehicleId: 'other', startOdometer: 50000, endOdometer: 50050 })] });
    data.vehicles.push({ id: 'other', vehicleType: 'EV', registration: 'OTHER' });
    const r = calculate(data); assert.equal(r.fleet.ice.distanceKm, 300); assert.equal(r.fleet.ev.distanceKm, 50);
    assert.equal(r.fleet.evSharePercent, 50 / 350 * 100);
  });
  for (const fields of [{ endOdometer: null }, { endOdometer: -1 }, { status: 'ACTIVE' }, { endOdometer: Infinity }]) run('invalid assignment endpoints/status remain unknown: ' + JSON.stringify(fields), () => {
    const v = calculate(input('ICE', { assignments: [assignment(fields)] })).vehicles[0]; assert.equal(v.distanceKm, 0); assert.equal(v.unknownAssignments, 1); assert.equal(v.economy.value, null);
  });
  run('zero distance is valid distance but never a denominator', () => {
    const v = calculate(input('EV', { assignments: [assignment({ endOdometer: 0 })] })).vehicles[0]; assert.equal(v.distanceSampleCount, 1); assert.equal(v.distanceKm, 0); assert.equal(v.economy.value, null);
  });
  run('overlap, gaps and duplicate assignment records cannot create covered consumption', () => {
    assert.equal(m.coveredDistance(0, 300, [assignment({ endOdometer: 90 }), assignment({ startOdometer: 100 })]), false);
    const v = calculate(input('ICE', { assignments: [assignment(), assignment({ id: 'duplicate' })] })).vehicles[0]; assert.equal(v.distanceKm, 0); assert.equal(v.economy.value, null);
  });
  run('SOC-only estimate preserves explicit usable capacity and provenance', () => {
    const v = calculate(input('EV', { assignments: [assignment({ endOdometer: 100 })] })).vehicles[0];
    assert.equal(v.economy.quantity, 10); assert.equal(v.economy.value, 10); assert.equal(v.economy.provenance, 'ESTIMATED');
    assert.deepEqual(v.evidence[0].capacityUsed, capacity); assert.equal(v.cost.value, null);
  });
  for (const fields of [{ usableCapacitySnapshot: undefined, batteryCapacityKwh: 60 }, { usableCapacitySnapshot: { valueKWh: 50 } },
    { endChargePercent: null }, { endChargePercent: 101 }, { energyCaptureVersion: undefined }]) run('EV unknown remains unknown: ' + JSON.stringify(fields), () => {
    const v = calculate(input('EV', { assignments: [assignment(fields)] })).vehicles[0]; assert.equal(v.economy.value, null); assert.equal(v.economy.provenance, 'INSUFFICIENT_DATA');
  });
  run('one and multiple mid-shift charges use energy balance, not charger delivered energy', () => {
    let v = calculate(input('EV', { sessions: [charge()] })).vehicles[0]; assert.equal(v.economy.quantity, 20); assert.equal(v.chargerEnergy.valueKWh, 12);
    v = calculate(input('EV', { sessions: [charge(), charge({ id: 'second', startedAt: at(2.5), endedAt: at(3), startChargePercent: 40, endChargePercent: 60 })] })).vehicles[0];
    assert.equal(v.economy.quantity, 30); assert.equal(v.chargerEnergy.valueKWh, 24);
  });
  run('metered input remains separate and available without usable capacity', () => {
    const v = calculate(input('EV', { assignments: [assignment({ usableCapacitySnapshot: null })], sessions: [charge()] })).vehicles[0];
    assert.equal(v.economy.value, null); assert.equal(v.chargerEnergy.valueKWh, 12); assert.equal(v.cost.value, null);
  });
  for (const fields of [{ status: 'OPEN' }, { driverId: 'wrong' }, { vehicleId: 'wrong' }, { recordStatus: undefined }, { endedAt: at(5) },
    { usableCapacitySnapshot: { ...capacity, valueKWh: 60 } }]) run('invalid charge invalidates energy balance: ' + JSON.stringify(fields), () => {
    assert.equal(calculate(input('EV', { sessions: [charge(fields)] })).vehicles[0].economy.value, null);
  });
  run('unknown SOC gains outside a charging record are rejected', () => {
    assert.equal(calculate(input('EV', { sessions: [charge({ startChargePercent: 90, endChargePercent: 100 })] })).vehicles[0].economy.value, null);
  });
  run('EV costs require closed equal-SOC replenishment with metered energy and known cost', () => {
    const data = input('EV', { assignments: [assignment({ endOdometer: 100, endChargePercent: 80 })], sessions: [charge({ startChargePercent: 60, endChargePercent: 80 })] });
    let v = calculate(data).vehicles[0]; assert.equal(v.cost.value, 0.24); assert.equal(v.economy.quantity, 10);
    data.sessions[0].chargeCost = null; v = calculate(data).vehicles[0]; assert.equal(v.cost.value, null);
    data.sessions[0].chargeCost = 0; assert.equal(calculate(data).vehicles[0].cost.value, 0);
    data.sessions[0].chargerEnergyDeliveredKWh = null; assert.equal(calculate(data).vehicles[0].cost.value, null);
  });
  run('return charging is excluded even with SOC change, tariff and final cost', () => {
    const data = input('EV', { chargingEvents: [{ vehicleId: 'v', returnDriverId: 'd', returnedAt: at(0), returnChargePercent: 10, pickupChargePercent: 100, finalCost: 1000, lifecycleStatus: 'CLOSED' }] });
    const v = calculate(data).vehicles[0]; assert.equal(v.economy.quantity, 10); assert.equal(v.chargerEnergy.valueKWh, null); assert.equal(v.cost.value, null); assert.equal(v.excludedReturnEvents, 1);
  });
  for (const target of ['drivers', 'vehicles', 'assignments']) run('TEST exclusion and opt-in: ' + target, () => {
    const data = input(); data[target][0].isTestData = true; assert.equal(calculate(data).fleet.ice.distanceKm, 0);
    assert.equal(calculate(data, { includeTest: true }).fleet.ice.distanceKm, 300);
  });
  run('TEST fuel or charging cannot be subtracted away to manufacture genuine consumption', () => {
    const ice = input(); ice.refuels[1].isTestData = true; assert.equal(calculate(ice).vehicles[0].economy.value, null);
    const ev = input('EV', { sessions: [charge({ isTestData: true })] }); assert.equal(calculate(ev).vehicles[0].economy.value, null);
  });
  run('quality and measured/estimated/mixed provenance are explicit', () => {
    assert.equal(m.quality(0, 0), 'INSUFFICIENT'); assert.equal(m.quality(1, 10), 'LIMITED');
    assert.equal(m.quality(300, 30000), 'LIMITED'); // Volume alone cannot manufacture a GOOD/confidence rating.
    assert.equal(m.combineProvenance(['MEASURED', 'ESTIMATED']), 'MIXED'); assert.equal(m.combineProvenance(['INSUFFICIENT_DATA']), 'INSUFFICIENT_DATA');
  });
  run('periods exclude crossing intervals and do not substitute manual manufacturer/current values', () => {
    const data = input('EV'); Object.assign(data.vehicles[0], { currentEnergyConsumption: 1, baselineEnergyConsumption: 1, batteryCapacityKwh: 99 });
    data.assignments[0].usableCapacitySnapshot = null;
    const v = calculate(data).vehicles[0]; assert.equal(v.economy.value, null); assert.equal(v.manufacturerReference, 15);
    assert.equal(calculate(input(), { now: start + 100 * 86400000 }).fleet.ice.distanceKm, 0);
    assert.equal(calculate(input(), { now: start + 100 * 86400000, period: 'ALL' }).fleet.ice.distanceKm, 300);
  });
  run('capacity snapshot never falls back to ambiguous batteryCapacityKwh', () => {
    assert.equal(m.usableCapacitySnapshot({ batteryCapacityKwh: 60 }, at(0)), null);
    assert.deepEqual(m.usableCapacitySnapshot({ usableBatteryCapacityKWh: 50, usableBatteryCapacitySource: 'Source' }, at(0)), { valueKWh: 50, source: 'Source', recordedAt: at(0) });
  });
}
