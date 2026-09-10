const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text, button } = require('./uiHarness.cjs');
const { fixture, now } = require('./evidenceFixtures.cjs');
const { calculateEconomy } = require('../functions-prod-jhb/lib/economyMetrics');
const { attachReadiness } = require('../functions-prod-jhb/lib/evidenceReadiness');
const vehicle = (powertrain = 'ICE') => { const input = fixture(powertrain); return attachReadiness(calculateEconomy(input, { now, period: '90', includeTest: false }), input, [], now).vehicles[0]; };
for (const state of ['LIMITED_EVIDENCE', 'SUFFICIENT_FOR_ANALYSIS']) test(`evidence UI factual variance and ${state} presentation`, () => {
  const h = harness(), C = h.load('src/components/admin/VehicleEvidencePanel.tsx').default, v = vehicle(); v.readiness.consumption.state = state;
  const tree = h.render(C, { vehicle: v, period: '90', includeTest: false, onSaved() {} }), words = text(tree);
  assert.match(words, /11[,.]1% higher than manufacturer reference/); assert.match(words, /Consumption evidence: (Limited evidence|Sufficient for analysis)/);
  assert.match(words, /Hard data gates/); assert.match(words, /Soft review triggers/);
  assert.doesNotMatch(words, /LIMITED_EVIDENCE|SUFFICIENT_FOR_ANALYSIS|OPERATING_COST|ICE_CONSUMPTION|Replace now|\bROI\b|manufacturer is inaccurate/i);
  assert.equal(button(tree, 'Save scoped review').props.disabled, true);
});
test('EV variance is withheld while estimated evidence remains visible', () => {
  const h = harness(), C = h.load('src/components/admin/VehicleEvidencePanel.tsx').default;
  const words = text(h.render(C, { vehicle: vehicle('EV'), period: '90', includeTest: false, onSaved() {} }));
  assert.match(words, /Reference energy basis not verified/); assert.match(words, /Estimated/); assert.doesNotMatch(words, /higher than manufacturer/);
});
test('review confirmations are explicit, purpose reset, duplicate submission locked, and identity never sent', async () => {
  const calls = []; let finish, saved = 0;
  const h = harness({ economyApi: { saveReview: p => { calls.push(p); return new Promise(resolve => { finish = resolve; }); } } });
  const C = h.load('src/components/admin/VehicleEvidencePanel.tsx').default, v = vehicle();
  const render = () => h.render(C, { vehicle: v, period: '90', includeTest: false, onSaved() { saved++; } });
  let tree = render(); nodes(tree, n => n.type === 'select').slice(1).forEach(n => n.props.onChange({ target: { value: 'yes' } }));
  tree = render(); const save = button(tree, 'Save scoped review'); save.props.onClick(); save.props.onClick();
  assert.equal(calls.length, 1); assert.equal(calls[0].purpose, 'ICE_CONSUMPTION'); assert.equal(calls[0].fingerprint, v.readiness.consumption.fingerprint);
  assert.ok(!('reviewedBy' in calls[0])); assert.ok(!('orgId' in calls[0])); finish({}); await h.settle(); assert.equal(saved, 1);
  tree = render(); nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'cost' } });
  assert.equal(button(render(), 'Save scoped review').props.disabled, true);
});
test('stale review, reviewer date and hard gate are visible; soft override needs a reason', () => {
  const h = harness(), C = h.load('src/components/admin/VehicleEvidencePanel.tsx').default, v = vehicle();
  Object.assign(v.readiness.consumption, { hard: ['Unresolved assignment activity'], soft: ['Distance trigger not met'], review: { current: false, reviewedBy: 'admin-user', reviewedAt: '2026-09-09T10:00:00Z', methodologyVersion: 'v1', notes: 'Old review', softOverrideReason: '' } });
  const render = () => h.render(C, { vehicle: v, period: '90', includeTest: false, onSaved() {} });
  let tree = render(); assert.match(text(tree), /Stale review · Reviewer: admin-user · 2026-09-09/); assert.match(text(tree), /Unresolved assignment activity/);
  nodes(tree, n => n.type === 'select').slice(1).forEach(n => n.props.onChange({ target: { value: 'yes' } }));
  nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } });
  assert.equal(button(render(), 'Save scoped review').props.disabled, true);
});
