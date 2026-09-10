const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { fixture, now, day } = require('./evidenceFixtures.cjs');
for (const backend of ['functions', 'functions-prod-jhb']) {
  const m = require(resolve(backend, 'lib/economyMetrics'));
  const r = require(resolve(backend, 'lib/evidenceReadiness'));
  const report = (input = fixture(), reviews = [], options = {}) => { const opts = { now, period: '90', includeTest: false, ...options }; return r.attachReadiness(m.calculateEconomy(input, opts), input, reviews, opts.now); };
  const reviewed = (v, purpose = 'ICE_CONSUMPTION', changes = {}) => ({ orgId: 'default', vehicleId: 'v', purpose, period: '90', methodologyVersion: 'v1',
    fingerprint: v.readiness.consumption.fingerprint, scopeDay: '2026-09-10', reviewedBy: 'admin', reviewedAt: new Date(now).toISOString(),
    normalDutyConfirmed: true, recordingCompletenessConfirmed: true, configurationComparableConfirmed: true, notes: '', softOverrideReason: '', isTestData: false, includeTest: false, ...changes });
  const run = (name, fn) => test(`${backend}: ${name}`, fn);
  run('actual ICE cycles meet triggers without certifying normal duty; scoped review permits consumption and cost independently', () => {
    const v = report().vehicles[0]; assert.equal(v.readiness.consumption.state, 'LIMITED_EVIDENCE'); assert.deepEqual(v.readiness.consumption.soft, []);
    assert.equal(v.readiness.consumption.spanDays, 72); assert.equal(v.readiness.consumption.sampleCount, 6); assert.ok(v.readiness.consumption.distinctWeeks >= 6);
    const withReview = report(fixture(), [reviewed(v)]).vehicles[0]; assert.equal(withReview.readiness.consumption.state, 'SUFFICIENT_FOR_ANALYSIS'); assert.equal(withReview.readiness.cost.state, 'LIMITED_EVIDENCE');
    assert.equal(report(fixture(), [reviewed(v, 'OPERATING_COST')]).vehicles[0].readiness.cost.state, 'SUFFICIENT_FOR_ANALYSIS');
  });
  for (const [name, change, match] of [
    ['distance', v => { v.economy.coverageKm = 999; }, /Covered distance/],
    ['cycles', v => { v.diagnosticSamples.pop(); }, /cycles/],
    ['span', v => { v.diagnosticSamples.forEach(s => { s.start = now - day * 31; s.end = now - day; }); }, /Observation span/],
    ['weeks', v => { v.diagnosticSamples.forEach(s => { s.activity = [now - day]; }); }, /activity weeks/],
    ['coverage', v => { v.distanceKm = 2000; }, /Coverage of/],
    ['recency', v => { v.diagnosticSamples.forEach(s => { s.start -= day * 40; s.end -= day * 40; s.activity = s.activity.map(t => t - day * 40); }); }, /older than 30/],
  ]) run(`ICE soft ${name} diagnostic and explicit exception`, () => {
    const v = report().vehicles[0]; change(v);
    const review = reviewed(v); const d = r.evaluateEvidence(v, 'ICE_CONSUMPTION', review, review.fingerprint, '90', false, now);
    assert.match(d.soft.join(' '), match); assert.equal(d.state, 'LIMITED_EVIDENCE');
    assert.equal(r.evaluateEvidence(v, 'ICE_CONSUMPTION', { ...review, softOverrideReason: 'Reviewed low-use duty and observed coverage explicitly' }, review.fingerprint, '90', false, now).state, 'SUFFICIENT_FOR_ANALYSIS');
  });
  run('supported estimated EV meets triggers and review; missing capacity and pooled configurations cannot be overridden', () => {
    const v = report(fixture('EV')).vehicles[0]; assert.deepEqual(v.readiness.consumption.soft, []); assert.equal(v.readiness.consumption.provenance, 'ESTIMATED');
    const review = reviewed(v, 'EV_CONSUMPTION'); assert.equal(report(fixture('EV'), [review]).vehicles[0].readiness.consumption.state, 'SUFFICIENT_FOR_ANALYSIS');
    for (const change of [v => { v.diagnosticSamples[0].capacity = null; }, v => { v.diagnosticSamples[0].capacity = { ...v.diagnosticSamples[0].capacity, valueKWh: 60 }; }]) {
      const copy = structuredClone(v); change(copy); const d = r.evaluateEvidence(copy, 'EV_CONSUMPTION', { ...review, softOverrideReason: 'Cannot override hard gate' }, review.fingerprint, '90', false, now);
      assert.equal(d.state, 'LIMITED_EVIDENCE'); assert.ok(d.hard.length);
    }
    const raw = fixture('EV'); delete raw.assignments[0].usableCapacitySnapshot;
    assert.equal(report(raw).vehicles[0].readiness.consumption.sampleCount, 19);
  });
  run('EV count/day/coverage diagnostics do not classify estimation as inherently invalid', () => {
    const v = report(fixture('EV')).vehicles[0]; v.diagnosticSamples = v.diagnosticSamples.slice(0, 9).map(s => ({ ...s, activity: [s.start] })); v.distanceKm = 4000;
    const d = r.evaluateEvidence(v, 'EV_CONSUMPTION', undefined, 'fingerprint', '90', false, now);
    assert.match(d.soft.join(' '), /energy-balance intervals/); assert.match(d.soft.join(' '), /operating days/); assert.match(d.soft.join(' '), /Coverage of/);
  });
  run('partial cost is limited even with confirmed review; missing cost cannot appear sufficient', () => {
    const data = fixture(); data.refuels[1].fuelCost = null;
    const v = report(data).vehicles[0]; const review = reviewed(v, 'OPERATING_COST', { softOverrideReason: 'Reviewed' });
    const d = report(data, [review]).vehicles[0].readiness.cost;
    assert.equal(d.C, 1000); assert.equal(d.state, 'LIMITED_EVIDENCE'); assert.match(d.hard.join(' '), /Complete-period/);
    data.refuels.forEach(f => { f.fuelCost = null; }); assert.equal(report(data).vehicles[0].readiness.cost.state, 'INSUFFICIENT_DATA');
  });
  for (const changes of [{ period: '30' }, { purpose: 'OPERATING_COST' }, { methodologyVersion: 'v2' }, { scopeDay: '2026-09-09' },
    { fingerprint: 'different' }, { includeTest: true }, { vehicleId: 'other' }, { orgId: 'other' }, { reviewedAt: new Date(now + 1).toISOString() }]) run(`review mismatch ignored ${JSON.stringify(changes)}`, () => {
    const v = report().vehicles[0]; const review = reviewed(v, 'ICE_CONSUMPTION', changes);
    assert.equal(report(fixture(), [review]).vehicles[0].readiness.consumption.state, 'LIMITED_EVIDENCE');
  });
  run('changed raw data and parent TEST evidence invalidate review; QA never contaminates default totals', () => {
    const input = fixture(), v = report(input).vehicles[0], review = reviewed(v);
    input.refuels[1].fuelCost++; assert.equal(report(input, [review]).vehicles[0].readiness.consumption.review.current, false);
    input.vehicles[0].isTestData = true; assert.equal(report(input).vehicles.length, 0);
    assert.equal(report(input, [], { includeTest: true }).vehicles.length, 1);
    assert.equal(report(input).fleet.totalEligibleKm, null);
  });
  run('hard invalid activity cannot be overridden and declined confirmation remains limited', () => {
    const v = report().vehicles[0], review = reviewed(v); v.unknownAssignments = 1;
    assert.equal(r.evaluateEvidence(v, 'ICE_CONSUMPTION', { ...review, softOverrideReason: 'Exception' }, review.fingerprint, '90', false, now).state, 'LIMITED_EVIDENCE');
    assert.equal(report(fixture(), [reviewed(report().vehicles[0], 'ICE_CONSUMPTION', { normalDutyConfirmed: false })]).vehicles[0].readiness.consumption.state, 'LIMITED_EVIDENCE');
  });
  run('ambiguous TEST marker is a non-overridable hard gate', () => {
    const input = fixture(); input.refuels[1].isTestData = 'unknown'; const v = report(input).vehicles[0];
    const result = report(input, [reviewed(v, 'ICE_CONSUMPTION', { softOverrideReason: 'Cannot bypass provenance' })]).vehicles[0].readiness.consumption;
    assert.equal(result.state, 'LIMITED_EVIDENCE'); assert.match(result.hard.join(' '), /TEST provenance/);
  });
  run('manufacturer variance positive negative equal absent incompatible and EV basis suppression', () => {
    assert.ok(Math.abs(r.manufacturerComparison('ICE', 'L/100 km', 10.4, 9).variancePercent - 15.5555555556) < 1e-6);
    assert.equal(r.manufacturerComparison('ICE', 'L/100 km', 9, 10).variancePercent, -10);
    assert.equal(r.manufacturerComparison('ICE', 'L/100 km', 9, 9).variancePercent, 0);
    for (const args of [['ICE', 'L/100 km', null, 9], ['ICE', 'L/100 km', 9, null], ['ICE', 'kWh/100 km', 9, 9], ['ICE', 'L/100 km', NaN, 9], ['EV', 'kWh/100 km', 18, 17]]) assert.equal(r.manufacturerComparison(...args).variancePercent, null);
    assert.equal(r.manufacturerComparison('EV', 'kWh/100 km', 18, 17).message, 'Reference energy basis not verified');
  });
  run('activity dates do not invent intervening daily use; sensitivity does not trim samples', () => {
    const v = report().vehicles[0], before = structuredClone(v.diagnosticSamples);
    assert.equal(v.readiness.consumption.operatingDays, 7); assert.deepEqual(v.diagnosticSamples, before);
    assert.ok(v.readiness.consumption.influence); assert.equal(v.readiness.consumption.influence.maxChangePercent, 0);
  });
}
