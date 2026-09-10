const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const { fixture } = require('./evidenceFixtures.cjs');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const clients = []; after(async () => Promise.all(clients.map(db => db.terminate())));
test('review collection and immutable history deny direct client access under existing rules', async () => {
  const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
  const { readFileSync } = require('node:fs');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({ projectId: 'demo-review-rules-' + randomBytes(4).toString('hex'), firestore: { host, port: Number(port), rules: readFileSync(resolve('firestore.rules'), 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async c => { await c.firestore().doc('users/admin').set({ role: 'admin', employmentStatus: 'Active' }); });
    const db = env.authenticatedContext('admin').firestore();
    for (const path of ['vehicleEvidenceReviews/scope', 'vehicleEvidenceReviews/scope/history/revision']) {
      await assertFails(db.doc(path).set({ normalDutyConfirmed: true })); await assertFails(db.doc(path).get());
    }
  } finally { await env.cleanup(); }
});
for (const backend of ['functions', 'functions-prod-jhb']) {
  const req = createRequire(resolve(backend, 'package.json'));
  const { Firestore } = req('firebase-admin/firestore');
  const db = new Firestore({ projectId: 'demo-evidence-' + randomBytes(5).toString('hex') }); clients.push(db);
  const { requireActiveAdmin } = req('./lib/adminAuthorization');
  const { createEconomyHandler, createEvidenceReviewHandler } = req('./lib/economyApi');
  const deps = { db, requireAdmin: c => requireActiveAdmin(c.auth, uid => db.collection('users').doc(uid).get()) };
  const get = createEconomyHandler(deps), save = createEvidenceReviewHandler(deps), ctx = { auth: { uid: 'admin' } };
  const deny = (p, code) => assert.rejects(p, e => e.code === code);
  const payload = v => ({ vehicleId: 'v', purpose: 'ICE_CONSUMPTION', period: '90', includeTest: false, fingerprint: v.readiness.consumption.fingerprint,
    methodologyVersion: 'v1', normalDutyConfirmed: true, recordingCompletenessConfirmed: true, configurationComparableConfirmed: true,
    notes: 'Synthetic reviewed scope', overrideSoftTriggers: false, softOverrideReason: '' });
  test(`${backend}: review auth, persisted audit, server identity, stale evidence, purpose, QA and org isolation`, async () => {
    await db.collection('users').doc('admin').set({ role: 'admin', employmentStatus: 'Active' });
    await db.collection('users').doc('driver').set({ role: 'driver', employmentStatus: 'Active' });
    const input = fixture();
    for (const [key, collection] of [['vehicles', 'vehicles'], ['assignments', 'vehicleAssignments'], ['refuels', 'refuelRecords']]) {
      for (const { id, ...record } of input[key]) await db.collection(collection).doc(id).set(record);
    }
    let v = (await get({}, ctx)).vehicles[0], p = payload(v);
    await deny(save(p, {}), 'unauthenticated'); await deny(save(p, { auth: { uid: 'driver' } }), 'permission-denied');
    await deny(save({ ...p, reviewedBy: 'spoof' }, ctx), 'invalid-argument'); await deny(save({ ...p, orgId: 'spoof' }, ctx), 'invalid-argument');
    await deny(save({ ...p, methodologyVersion: 'v2' }, ctx), 'invalid-argument');
    await deny(save({ ...p, overrideSoftTriggers: true }, ctx), 'invalid-argument');
    const before = (await db.collection('vehicleAssignments').doc('a').get()).data();
    const saved = await save(p, ctx), doc = (await db.collection('vehicleEvidenceReviews').doc(saved.reviewId).get()).data();
    assert.equal(doc.reviewedBy, 'admin'); assert.equal(doc.orgId, 'default'); assert.equal(doc.methodologyVersion, 'v1'); assert.ok(doc.reviewedAt.toMillis());
    assert.equal((await db.collection('vehicleEvidenceReviews').doc(saved.reviewId).collection('history').get()).size, 1);
    v = (await get({}, ctx)).vehicles[0]; assert.equal(v.readiness.consumption.state, 'SUFFICIENT_FOR_ANALYSIS'); assert.equal(v.readiness.cost.state, 'LIMITED_EVIDENCE');
    assert.equal((await get({ period: '30' }, ctx)).vehicles[0].readiness.consumption.review, null);
    await save({ ...payload(v), normalDutyConfirmed: false }, ctx);
    v = (await get({}, ctx)).vehicles[0]; assert.equal(v.readiness.consumption.state, 'LIMITED_EVIDENCE');
    assert.equal((await db.collection('vehicleEvidenceReviews').doc(saved.reviewId).collection('history').get()).size, 2);
    await db.collection('refuelRecords').doc('r1').update({ fuelCost: 401 });
    await deny(save(p, ctx), 'failed-precondition');
    v = (await get({}, ctx)).vehicles[0]; assert.equal(v.readiness.consumption.review.current, false);
    await db.collection('vehicleAssignments').doc('bad').set({ vehicleId: 'v', driverId: 'd', status: 'COMPLETED' });
    v = (await get({}, ctx)).vehicles[0]; await save({ ...payload(v), overrideSoftTriggers: true, softOverrideReason: 'Hard gate must remain blocked' }, ctx);
    assert.equal((await get({}, ctx)).vehicles[0].readiness.consumption.state, 'LIMITED_EVIDENCE');
    await db.collection('vehicles').doc('v').update({ isTestData: true });
    assert.equal((await get({}, ctx)).vehicles.length, 0); await deny(save(p, ctx), 'not-found');
    const qa = (await get({ includeTest: true }, ctx)).vehicles[0]; assert.equal(qa.isTestData, true);
    const qaSave = await save({ ...payload(qa), includeTest: true }, ctx);
    assert.equal((await db.collection('vehicleEvidenceReviews').doc(qaSave.reviewId).get()).data().isTestData, true);
    assert.equal((await get({}, ctx)).fleet.totalEligibleKm, null);
    assert.deepEqual((await db.collection('vehicleAssignments').doc('a').get()).data(), before);
    await db.collection('users').doc('admin').update({ employmentStatus: 'Inactive' }); await deny(save(p, ctx), 'permission-denied');
    await db.collection('users').doc('admin').update({ employmentStatus: 'Active', orgId: 'different' }); await deny(get({}, ctx), 'permission-denied');
    await db.collection('users').doc('admin').update({ orgId: 'default' });
    await db.collection('vehicles').doc('foreign').set({ orgId: 'different', vehicleType: 'ICE' }); await deny(get({}, ctx), 'failed-precondition');
  });
}
