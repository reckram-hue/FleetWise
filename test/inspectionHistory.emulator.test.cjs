const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const clients = [];
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');

for (const backend of ['functions', 'functions-prod-jhb']) {
  const req = createRequire(resolve(backend, 'package.json'));
  const { Firestore, Timestamp } = req('firebase-admin/firestore');
  const db = new Firestore({ projectId: 'demo-inspection-' + backend }); clients.push(db);
  const { requireActiveAdmin } = req('./lib/adminAuthorization');
  const { createInspectionHistoryHandlers } = req('./lib/inspectionHistory');
  const objects = new Map(); let reads = 0;
  const bucket = { file: path => ({
    getMetadata: async () => { reads++; if (!objects.has(path)) throw { code: 404 }; return [{ size: png.length, contentType: 'image/png', generation: '1' }]; },
    createReadStream: () => Readable.from([png]),
    getSignedUrl: () => assert.fail('No public/signed URL generation'), save: () => assert.fail('No evidence writes'), delete: () => assert.fail('No evidence deletion'),
  }) };
  const api = createInspectionHistoryHandlers({ db, bucket: () => bucket,
    requireAdmin: context => requireActiveAdmin(context.auth, uid => db.collection('users').doc(uid).get()) });
  const id = () => randomUUID();
  const deny = (promise, code) => assert.rejects(promise, e => e.code === code);
  async function fixture({ isTest = false, marker = undefined, time = 1700000000000, boundaryType = 'PICKUP' } = {}) {
    const adminId = id(), driverId = id(), vehicleId = id(), assignmentId = id(), shiftId = id(), inspectionId = id();
    await db.collection('users').doc(adminId).set({ role: 'admin', employmentStatus: 'Active' });
    await db.collection('users').doc(driverId).set({ role: 'driver', employmentStatus: 'Active', firstName: 'Sample', surname: 'Driver', isTestData: isTest, pinHash: 'NEVER_RETURN' });
    await db.collection('vehicles').doc(vehicleId).set({ registration: 'CA CURRENT', make: 'Sample', model: 'EV', isTestData: isTest });
    await db.collection('vehicleAssignments').doc(assignmentId).set({ vehicleId, driverId, shiftId, startOdometer: 100, endOdometer: 120, startChargePercent: 80, endChargePercent: 60 });
    const path = `vehicle-inspections/default/${assignmentId}/${boundaryType}/exterior-${id()}.png`; objects.set(path, true);
    const record = { orgId: 'default', vehicleId, driverId, assignmentId, shiftId, boundaryType, status: 'COMPLETED', createdAt: Timestamp.fromMillis(time), completedAt: Timestamp.fromMillis(time + 1000), capturedAt: Timestamp.fromMillis(time), exteriorPhotoPath: path, hasDamage: boundaryType === 'RETURN', damageDescription: 'Original isiXhosa / English statement', retentionClass: 'EVIDENCE', vehicleRegistrationSnapshot: 'CA HISTORIC' };
    if (marker !== undefined) record.isTestData = marker;
    await db.collection('vehicleInspections').doc(inspectionId).set(record);
    return { inspectionId, record, path, adminId, driverId, vehicleId, assignmentId, shiftId, context: { auth: { uid: adminId } } };
  }
  test(`${backend}: all inspection operations require authenticated active admin`, async () => {
    const f = await fixture();
    for (const [name, data] of [['listVehicleInspectionsAdmin', {}], ['getVehicleInspectionAdmin', { inspectionId: f.inspectionId }], ['getInspectionPhotoAdmin', { inspectionId: f.inspectionId, photoRole: 'EXTERIOR' }]]) {
      await deny(api[name](data, {}), 'unauthenticated');
      await deny(api[name](data, { auth: { uid: f.driverId } }), 'permission-denied');
      await db.collection('users').doc(f.adminId).update({ employmentStatus: 'Inactive' });
      await deny(api[name](data, f.context), 'permission-denied');
      await db.collection('users').doc(f.adminId).update({ employmentStatus: 'Active' });
    }
  });
  test(`${backend}: detail is registration-first, contextual, whitelist-only and read-only`, async () => {
    const f = await fixture({ boundaryType: 'RETURN' });
    const before = (await db.collection('vehicleInspections').doc(f.inspectionId).get()).data();
    const r = await api.getVehicleInspectionAdmin({ inspectionId: f.inspectionId }, f.context);
    assert.equal(r.vehicleRegistration, 'CA HISTORIC'); assert.equal(r.identitySource, 'snapshot'); assert.equal(r.driverName, 'Sample Driver');
    assert.equal(r.odometer, 120); assert.equal(r.chargePercent, 60); assert.equal(r.boundaryType, 'RETURN'); assert.equal(r.retentionClass, 'EVIDENCE');
    assert.equal(r.damageDescription, before.damageDescription); assert.equal(r.completedAt, before.completedAt.toDate().toISOString());
    assert.equal(r.photos.exterior, true); assert.equal(r.photos.interior, false); assert.equal(r.exteriorPhotoPath, undefined); assert.doesNotMatch(JSON.stringify(r), /NEVER_RETURN|vehicle-inspections\//);
    assert.deepEqual((await db.collection('vehicleInspections').doc(f.inspectionId).get()).data(), before);
  });
  test(`${backend}: TEST exclusion uses parent markers even on historical records`, async () => {
    for (const marker of [undefined, false, true]) {
      const f = await fixture({ isTest: true, marker });
      assert.equal((await api.listVehicleInspectionsAdmin({ vehicleId: f.vehicleId }, f.context)).inspections.length, 0);
      const r = await api.listVehicleInspectionsAdmin({ vehicleId: f.vehicleId, includeTest: true }, f.context);
      assert.equal(r.inspections.length, 1); assert.equal(r.inspections[0].isTestData, true);
    }
  });
  test(`${backend}: vehicle, driver, boundary, assignment, shift and date filters combine`, async () => {
    const f = await fixture({ boundaryType: 'RETURN', time: 1600000000000 });
    const filters = { vehicleId: f.vehicleId, driverId: f.driverId, boundaryType: 'RETURN', assignmentId: f.assignmentId, shiftId: f.shiftId, from: new Date(1600000000000).toISOString(), until: new Date(1600000000001).toISOString() };
    assert.deepEqual((await api.listVehicleInspectionsAdmin(filters, f.context)).inspections.map(r => r.id), [f.inspectionId]);
    for (const change of [{ driverId: id() }, { vehicleId: id() }, { boundaryType: 'PICKUP' }, { assignmentId: id() }, { shiftId: id() }, { until: filters.from, from: new Date(1599999999000).toISOString() }]) {
      assert.equal((await api.listVehicleInspectionsAdmin({ ...filters, ...change }, f.context)).inspections.length, 0);
    }
    await deny(api.listVehicleInspectionsAdmin({ from: filters.until, until: filters.from }, f.context), 'invalid-argument');
  });
  test(`${backend}: pagination survives empty filtered pages and same-timestamp records`, async () => {
    const a = await fixture({ time: 1900000000000 }), b = await fixture({ time: 1900000000000, isTest: true });
    let cursor, seen = [], pages = 0;
    do {
      const r = await api.listVehicleInspectionsAdmin({ from: new Date(1900000000000).toISOString(), limit: 1, ...(cursor ? { cursor } : {}) }, a.context);
      seen.push(...r.inspections.map(r => r.id)); cursor = r.nextCursor; assert.ok(++pages < 6);
    } while (cursor);
    assert.deepEqual(seen, [a.inspectionId]); assert.ok(pages >= 3); assert.ok(!seen.includes(b.inspectionId));
  });
  test(`${backend}: exact attached role photo is privately read; arbitrary/cross-owned paths denied`, async () => {
    const f = await fixture(); const before = (await db.collection('vehicleInspections').doc(f.inspectionId).get()).data();
    assert.equal((await api.getInspectionPhotoAdmin({ inspectionId: f.inspectionId, photoRole: 'EXTERIOR' }, f.context)).imageDataUrl, 'data:image/png;base64,' + png.toString('base64'));
    await deny(api.getInspectionPhotoAdmin({ inspectionId: f.inspectionId, photoRole: 'EXTERIOR', path: f.path }, f.context), 'invalid-argument');
    for (const path of [f.path.replace(f.assignmentId, id()), f.path.replace('/default/', '/another/'), f.path.replace('/PICKUP/', '/RETURN/'), f.path.replace('/exterior-', '/interior-'), f.path.replace('/exterior-', '/../exterior-'), 'https://example.com/photo.png']) {
      await db.collection('vehicleInspections').doc(f.inspectionId).update({ exteriorPhotoPath: path }); const count = reads;
      await deny(api.getInspectionPhotoAdmin({ inspectionId: f.inspectionId, photoRole: 'EXTERIOR' }, f.context), 'permission-denied'); assert.equal(reads, count);
    }
    await db.collection('vehicleInspections').doc(f.inspectionId).set(before);
    objects.delete(f.path); await deny(api.getInspectionPhotoAdmin({ inspectionId: f.inspectionId, photoRole: 'EXTERIOR' }, f.context), 'not-found');
    await deny(api.getInspectionPhotoAdmin({ inspectionId: f.inspectionId, photoRole: 'INTERIOR' }, f.context), 'not-found');
    assert.deepEqual((await db.collection('vehicleInspections').doc(f.inspectionId).get()).data(), before);
  });
  test(`${backend}: historical canonical filenames work and unrelated assignment readings do not leak`, async () => {
    const f = await fixture(); const path = `vehicle-inspections/default/${f.assignmentId}/PICKUP/exterior.jpg`; objects.set(path, true);
    await db.collection('vehicleInspections').doc(f.inspectionId).update({ exteriorPhotoPath: path, vehicleRegistrationSnapshot: null });
    await db.collection('vehicleAssignments').doc(f.assignmentId).update({ driverId: id() });
    const r = await api.getVehicleInspectionAdmin({ inspectionId: f.inspectionId }, f.context);
    assert.equal(r.odometer, null); assert.equal(r.vehicleRegistration, 'CA CURRENT');
    assert.match((await api.getInspectionPhotoAdmin({ inspectionId: f.inspectionId, photoRole: 'EXTERIOR' }, f.context)).imageDataUrl, /^data:image\/png/);
    await deny(api.getVehicleInspectionAdmin({ inspectionId: id() }, f.context), 'not-found');
  });
}
