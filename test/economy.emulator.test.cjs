const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const clients = []; after(async () => Promise.all(clients.map(db => db.terminate())));
for (const backend of ['functions', 'functions-prod-jhb']) {
  const req = createRequire(resolve(backend, 'package.json'));
  const { Firestore } = req('firebase-admin/firestore');
  const db = new Firestore({ projectId: 'demo-economy-' + backend + '-' + randomBytes(4).toString('hex') }); clients.push(db);
  const { requireActiveAdmin } = req('./lib/adminAuthorization');
  const { createEconomyHandler } = req('./lib/economyApi');
  const { persistRefuel } = req('./lib/refuelCapture');
  const api = createEconomyHandler({ db, now: () => Date.parse('2026-09-10T00:00:00Z'), requireAdmin: c => requireActiveAdmin(c.auth, uid => db.collection('users').doc(uid).get()) });
  const context = { auth: { uid: 'admin' } }, deny = (p, code) => assert.rejects(p, e => e.code === code);
  test(`${backend}: active-admin authorization before any metrics read`, async () => {
    await db.collection('users').doc('admin').set({ role: 'admin', employmentStatus: 'Active' });
    await db.collection('users').doc('driver').set({ role: 'driver', employmentStatus: 'Active', pinHash: 'NEVER_SERIALIZE' });
    await deny(api({}, {}), 'unauthenticated'); await deny(api({}, { auth: { uid: 'driver' } }), 'permission-denied');
    await db.collection('users').doc('admin').update({ employmentStatus: 'Inactive' }); await deny(api({}, context), 'permission-denied');
    await db.collection('users').doc('admin').update({ employmentStatus: 'Active' }); await deny(api({ period: '7' }, context), 'invalid-argument');
  });
  test(`${backend}: real collection joins calculate separate fleet totals and exclude TEST parents`, async () => {
    const a = { driverId: 'driver', shiftId: 'same-shift', status: 'COMPLETED', startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-09-01T04:00:00Z', startOdometer: 0, endOdometer: 100 };
    await db.collection('vehicles').doc('ice').set({ registration: 'ICE REG', vehicleType: 'ICE' });
    await db.collection('vehicles').doc('ev').set({ registration: 'EV REG', vehicleType: 'EV', isTestData: true });
    await db.collection('vehicleAssignments').doc('ice-a').set({ ...a, vehicleId: 'ice' });
    await db.collection('vehicleAssignments').doc('ev-a').set({ ...a, vehicleId: 'ev', startOdometer: 50000, endOdometer: 50050 });
    for (const [id, odo, time, litres] of [['first', 0, '00', 50], ['last', 100, '04', 10]]) {
      await db.collection('refuelRecords').doc(id).set({ vehicleId: 'ice', driverId: 'driver', shiftId: 'same-shift', assignmentId: 'ice-a',
        date: `2026-09-01T${time}:00:00Z`, fillLevel: 'FULL', clientRequestId: id, captureVersion: 1, recordStatus: 'ACTIVE', odometer: odo, litresFilled: litres, fuelCost: 200, currency: 'ZAR' });
    }
    const before = (await db.collection('vehicleAssignments').doc('ice-a').get()).data();
    let r = await api({}, context); assert.equal(r.fleet.ice.distanceKm, 100); assert.equal(r.fleet.ev.distanceKm, 0); assert.equal(r.fleet.ice.per100Km, 10); assert.equal(r.fleet.ice.costPerKm, 2);
    r = await api({ includeTest: true }, context); assert.equal(r.fleet.ev.distanceKm, 50); assert.equal(r.fleet.evSharePercent, 50 / 150 * 100);
    assert.doesNotMatch(JSON.stringify(r), /NEVER_SERIALIZE|pinHash/);
    assert.deepEqual((await db.collection('vehicleAssignments').doc('ice-a').get()).data(), before);
    await db.collection('users').doc('driver').update({ isTestData: true }); r = await api({}, context); assert.equal(r.fleet.ice.distanceKm, 0);
  });
  test(`${backend}: immutable refuel request is idempotent under concurrent retry and rejects changed payload`, async () => {
    const data = { vehicleId: 'refuel-vehicle', driverId: 'driver', assignmentId: 'capture-assignment', shiftId: 'same-shift', date: '2026-09-01T00:00:00Z', odometer: 10, litresFilled: 5, fuelCost: 100, fillLevel: 'PARTIAL' };
    const [a, b] = await Promise.all([persistRefuel(db, data, 'same-request'), persistRefuel(db, data, 'same-request')]);
    assert.equal(a.id, b.id); assert.equal(a.fillLevel, 'PARTIAL'); assert.equal(a.recordStatus, 'ACTIVE');
    const matches = await db.collection('refuelRecords').where('assignmentId', '==', data.assignmentId).get(); assert.equal(matches.size, 1);
    await deny(persistRefuel(db, { ...data, litresFilled: 9 }, 'same-request'), 'already-exists');
    const legacy = await persistRefuel(db, { ...data, fillLevel: 'UNKNOWN' }); assert.equal(legacy.recordStatus, 'UNVERIFIED'); assert.equal(legacy.clientRequestId, null);
  });
}
