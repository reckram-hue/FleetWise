// Real compiled handlers + real Firestore transactions. No cloud Auth or Storage access.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const clients = [];
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

for (const backend of ['functions', 'functions-prod-jhb']) {
  const req = Module.createRequire(resolve(backend, 'package.json'));
  const { Firestore, Timestamp, FieldValue } = req('firebase-admin/firestore');
  const { HttpsError } = req('firebase-functions/v2/https');
  const db = new Firestore({ projectId: 'demo-fleetwise-wp2-test' });
  clients.push(db);
  const objects = new Map();
  let saveHook = null, existsHook = null;
  const bucket = { name: 'demo-wp2-in-memory', file: path => ({
    save: async (bytes, options) => { objects.set(path, { bytes: Buffer.from(bytes), ...options }); if (saveHook) await saveHook(path); },
    exists: async () => { if (existsHook) await existsHook(path); return [objects.has(path)]; },
    getSignedUrl: async () => ['https://synthetic.invalid/evidence'],
    delete: async () => { throw new Error('Evidence must not be deleted'); },
  }) };
  const filename = resolve(backend, 'lib/index.js');
  const loaded = new Module(filename, module);
  const realRequire = Module.createRequire(filename);
  const https = { HttpsError, onCall: handler => handler };
  loaded.require = name => {
    if (name === 'firebase-admin') return {
      initializeApp: options => ({ options }),
      app: () => ({ options: { storageBucket: 'demo-wp2-in-memory' } }),
      firestore: Object.assign(() => db, { Timestamp, FieldValue }),
      auth: () => { throw new Error('Cloud Auth forbidden'); }, storage: () => ({ bucket: name => ({ ...bucket, name }) }),
    };
    if (name === 'firebase-functions') return { https, runWith: () => ({ https }) };
    if (name === 'firebase-functions/v2/https') return { HttpsError, onCall: (_options, handler) => (data, context) => handler({ ...context, data }) };
    return realRequire(name);
  };
  loaded._compile(readFileSync(filename, 'utf8'), filename);
  const api = loaded.exports;
  const id = () => backend + '-' + randomUUID();
  const read = async (collection, id) => (await db.collection(collection).doc(id).get()).data();
  const expectCode = (promise, code = 'failed-precondition') => assert.rejects(promise, e => e.code === code);
  async function fixture(odo = 80000, isTestData = true) {
    const driverId = id(), vehicleId = id(), locationId = id();
    await db.collection('users').doc(driverId).set({ role: 'driver', employmentStatus: 'Active', firstName: 'Synthetic', surname: 'WP2',
      isTestData, pinHash: await req('bcryptjs').hash('2468', 4) });
    await db.collection('vehicles').doc(vehicleId).set({ status: 'Active', vehicleType: 'EV', registration: 'SYNTHETIC-WP2',
      currentOdometer: odo, batteryCapacityKwh: 60, isTestData });
    await db.collection('chargingLocations').doc(locationId).set({ active: true, orgId: 'default', name: 'Synthetic office', type: 'OFFICE', costOwner: 'COMPANY' });
    const login = await api.driverLogin({ driverId, pin: '2468', deviceId: 'wp2-emulator' }, {});
    const credentials = { driverId, sessionToken: login.sessionToken };
    const call = (name, payload = {}, context = {}) => api[name]({ ...credentials, ...payload }, context);
    const { shiftId } = await call('startShift', { vehicleId, startOdometer: odo, startChargePercent: 80 });
    const startPayload = { shiftId, vehicleId, startOdometer: odo, startChargePercent: 80, startPredictedRangeKm: 300, transitionReason: 'SHIFT_START' };
    const { assignmentId } = await call('startVehicleAssignment', startPayload);
    return { driverId, vehicleId, locationId, shiftId, assignmentId, call, credentials, odo, startPayload };
  }
  const draft = (f, overrides = {}) => ({ endOdometer: f.odo + 100, endChargePercent: 40, endPredictedRangeKm: 150,
    leftForCharging: false, transitionReason: 'SHIFT_END', ...overrides });
  async function prepare(f, boundaryType, returnFinalization) {
    const { inspection } = await f.call('createVehicleInspection', { assignmentId: f.assignmentId, boundaryType,
      ...(boundaryType === 'RETURN' ? { returnIntent: returnFinalization?.transitionReason || 'SHIFT_END', returnFinalization } : {}) });
    for (const photoRole of ['EXTERIOR', 'INTERIOR']) await f.call('uploadInspectionPhoto', { assignmentId: f.assignmentId, boundaryType, photoRole, imageDataUrl: png });
    return inspection.id;
  }
  async function inspect(f, boundaryType, returnFinalization) {
    const inspectionId = await prepare(f, boundaryType, returnFinalization);
    return f.call('completeVehicleInspection', { inspectionId, hasDamage: false });
  }
  const end = (f, values = draft(f)) => f.call('endVehicleAssignment', { assignmentId: f.assignmentId, ...values });
  const charge = f => f.call('startChargingSession', { assignmentId: f.assignmentId, startOdometer: f.odo + 50,
    startChargePercent: 30, startPredictedRangeKm: 100, chargingLocationId: f.locationId, chargingType: 'COMPANY_AC' });
  const endCharge = (f, chargingSessionId) => f.call('endChargingSession', { chargingSessionId, endChargePercent: 80, endPredictedRangeKm: 300 });


  const reportFields = { accidentAt: '2026-09-08T05:00:00.000Z', locationDescription: 'Synthetic intersection', narrative: 'Synthetic report', injuries: 'UNKNOWN', incompleteDetailsAcknowledged: true };
  async function create(f) { return f.call('createAccidentReportDraft', { assignmentId: f.assignmentId, requestId: id() }); }
  async function save(f, report, fields = reportFields, mutationId = id()) { return f.call('updateAccidentReportDraft', { reportId: report.id, revision: report.revision, mutationId, fields }); }
  const submit = (f, r) => f.call('submitAccidentReport', { reportId: r.id, revision: r.revision });
  const photo = (f, r, extra = {}) => f.call('uploadAccidentPhoto', { reportId: r.id, uploadId: id(), imageDataUrl: png, ...extra });
  async function adminContext(active = true, role = 'admin') {
    const uid = id(); await db.collection('users').doc(uid).set({ role, employmentStatus: active ? 'Active' : 'Inactive' }); return { auth: { uid } };
  }
  test(`${backend}: active driver draft binds authoritative context; duplicate create and saves recover`, async () => {
    const f = await fixture(); const requestId = id();
    const request = { assignmentId: f.assignmentId, requestId, vehicleId: 'forged', orgId: 'forged', isTestData: false };
    const [one, two] = await Promise.all([f.call('createAccidentReportDraft', request), f.call('createAccidentReportDraft', request)]);
    assert.equal(one.id, two.id); for (const key of ['driverId', 'assignmentId', 'vehicleId', 'shiftId']) assert.equal(one[key], f[key]);
    assert.equal(one.orgId, 'default'); assert.equal(one.createdByDriverId, f.driverId); assert.equal(one.isTestData, true);
    assert.equal((await create(f)).id, one.id); // another window finds the single draft
    const mutationId = id(); const saved = await save(f, one, { narrative: 'Partial draft', policeAttended: 'UNKNOWN' }, mutationId);
    assert.equal(saved.revision, 1); assert.equal((await save(f, one, { narrative: 'Partial draft' }, mutationId)).revision, 1);
    const loaded = await f.call('getAccidentReportForDriver', { reportId: one.id }); assert.equal(loaded.fields.narrative, 'Partial draft');
    assert.equal(loaded.fields.policeAttended, 'UNKNOWN'); assert.equal((await f.call('getAccidentReportForDriver', { assignmentId: f.assignmentId })).length, 1);
    assert.equal((await read('vehicleAssignments', f.assignmentId)).status, 'ACTIVE');
    assert.equal((await db.collection('defects').where('driverId', '==', f.driverId).get()).size, 0);
  });
  test(`${backend}: inactive/foreign drivers and wrong assignment access denied`, async () => {
    const f = await fixture(), other = await fixture(), r = await create(f);
    await expectCode(other.call('createAccidentReportDraft', { assignmentId: f.assignmentId, requestId: id() }), 'permission-denied');
    for (const [name, data] of [
      ['getAccidentReportForDriver', { reportId: r.id }], ['getAccidentReportForDriver', { assignmentId: f.assignmentId }],
      ['updateAccidentReportDraft', { reportId: r.id, revision: 0, mutationId: id(), fields: {} }],
      ['submitAccidentReport', { reportId: r.id, revision: 0 }], ['uploadAccidentPhoto', { reportId: r.id, uploadId: id(), imageDataUrl: png }],
      ['getAccidentPhoto', { reportId: r.id, photoId: id() }],
    ]) await expectCode(other.call(name, data), 'permission-denied');
    await db.collection('users').doc(f.driverId).update({ employmentStatus: 'Inactive' });
    await expectCode(create(f), 'permission-denied'); await expectCode(save(f, r), 'permission-denied');
  });
  test(`${backend}: minimum submission requirements; optional police/insurance/witness/photos absent; submitted immutable`, async () => {
    const f = await fixture(); let r = await create(f);
    await expectCode(submit(f, r), 'invalid-argument');
    r = await save(f, r); const [a, b] = await Promise.all([submit(f, r), submit(f, r)]);
    assert.equal(a.id, b.id); assert.equal(a.submittedAt.toMillis(), b.submittedAt.toMillis());
    assert.equal(a.status, 'SUBMITTED'); assert.equal(a.fields.injuries, 'UNKNOWN');
    assert.equal(a.fields.policeReference, undefined); assert.equal(a.fields.insurer, undefined); assert.deepEqual(a.fields.witnesses, []); assert.deepEqual(a.photos, []);
    await expectCode(save(f, a)); await expectCode(photo(f, a));
    const again = await submit(f, a); assert.equal(again.submittedAt.toMillis(), a.submittedAt.toMillis());
    assert.deepEqual(await read('accidentReports', a.id), await read('accidentReports', b.id));
    // A distinct, deliberate later incident may have its own report on the same assignment.
    assert.notEqual((await create(f)).id, a.id);
  });
  test(`${backend}: concurrent revision saves conflict safely and cannot mutate identity`, async () => {
    const f = await fixture(), r = await create(f);
    const results = await Promise.allSettled([save(f, r, { narrative: 'A' }), save(f, r, { narrative: 'B' })]);
    assert.equal(results.filter(v => v.status === 'fulfilled').length, 1);
    assert.equal(results.find(v => v.status === 'rejected').reason.code, 'aborted');
    const stored = await read('accidentReports', r.id); assert.equal(stored.revision, 1); assert.equal(stored.status, 'DRAFT'); assert.equal(stored.driverId, f.driverId);
    await expectCode(save(f, { ...r, revision: 1 }, { driverId: 'forged' }), 'invalid-argument');
  });
  test(`${backend}: photo MIME/size/content validation, idempotency, metadata and private viewing`, async () => {
    const f = await fixture(), r = await create(f), uploadId = id();
    const p = await photo(f, r, { uploadId, caption: 'Scene' }); const retry = await photo(f, r, { uploadId });
    assert.equal(p.path, retry.path); assert.match(p.path, new RegExp('^accident-reports/default/' + r.id + '/'));
    assert.equal(objects.get(p.path).metadata.metadata.driverId, f.driverId);
    assert.equal(objects.get(p.path).preconditionOpts.ifGenerationMatch, 0);
    assert.equal((await read('accidentReports', r.id)).photos.length, 1);
    assert.equal((await f.call('getAccidentPhoto', { reportId: r.id, photoId: p.id })).url, 'https://synthetic.invalid/evidence');
    await expectCode(photo(f, r, { imageDataUrl: 'data:image/gif;base64,R0lG' }), 'invalid-argument');
    await expectCode(photo(f, r, { imageDataUrl: 'data:image/png;base64,YWJj' }), 'invalid-argument');
    await expectCode(photo(f, r, { imageDataUrl: 'data:image/png;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }), 'invalid-argument');
    const updated = await save(f, r); const submitted = await submit(f, updated);
    assert.equal(submitted.photos[0].path, p.path); await expectCode(photo(f, submitted, { uploadId }));
  });
  test(`${backend}: upload/submission race freezes submitted evidence, losing upload never attaches`, async () => {
    const f = await fixture(); const r = await save(f, await create(f)); const started = deferred(), release = deferred();
    saveHook = async path => { if (path.includes(r.id)) { started.resolve(); await release.promise; } };
    const uploading = photo(f, r); const checked = expectCode(uploading);
    try { await started.promise; const submitted = await submit(f, r); release.resolve(); await checked;
      assert.deepEqual(submitted.photos, []); assert.deepEqual((await read('accidentReports', r.id)).photos, []);
    } finally { release.resolve(); saveHook = null; }
  });
  test(`${backend}: active admin review, filters test data, rejects non-admin and includes context`, async () => {
    const real = await fixture(80000, false), qa = await fixture(); const realReport = await create(real), qaReport = await create(qa);
    const context = await adminContext();
    const all = async includeTest => { let cursor, rows = []; do { const page = await api.listAccidentReportsAdmin({ includeTest, ...(cursor ? { cursor } : {}) }, context);
      rows.push(...page.reports); cursor = page.nextCursor; } while(cursor); return rows; };
    assert.ok((await all(false)).some(r => r.id === realReport.id)); assert.ok(!(await all(false)).some(r => r.id === qaReport.id));
    assert.ok((await all(true)).some(r => r.id === qaReport.id && r.isTestData));
    const detail = await api.getAccidentReportAdmin({ reportId: qaReport.id }, context);
    for (const k of ['driverId', 'vehicleId', 'assignmentId', 'shiftId']) assert.equal(detail[k], qa[k]);
    assert.equal(detail.vehicleRegistration, 'SYNTHETIC-WP2');
    for (const denied of [{}, await adminContext(false), await adminContext(true, 'driver')]) {
      await expectCode(api.listAccidentReportsAdmin({}, denied), denied.auth ? 'permission-denied' : 'unauthenticated');
      await expectCode(api.getAccidentReportAdmin({ reportId: qaReport.id }, denied), denied.auth ? 'permission-denied' : 'unauthenticated');
    }
    const p = await photo(qa, qaReport); assert.equal((await api.getAccidentPhoto({ reportId: qaReport.id, photoId: p.id }, context)).url, 'https://synthetic.invalid/evidence');
  });
  test(`${backend}: other-party, insurance, witness, GPS and damage fields persist without fake defaults`, async () => {
    const f = await fixture(); const fields = { ...reportFields, otherDriverName: 'Synthetic', otherDriverSurname: 'Other', otherDriverPhone: '0123456789',
      otherDriverEmail: 'synthetic@example.invalid', otherDriverLicence: 'TEST-LICENCE', otherDriverLicenceExpiry: '2027-01-01', otherDriverJurisdiction: 'ZA',
      otherVehicleRegistration: 'TEST-OTHER', otherVehicleMake: 'Synthetic', otherVehicleModel: 'Test', otherVehicleColour: 'Blue', otherVehicleType: 'Car',
      ownerName: 'Synthetic owner', ownerContact: '0123456789', ownerRelationship: 'Employer', insurer: 'Synthetic insurer', policyNumber: 'TEST-POLICY',
      claimReference: null, insuredParty: 'Synthetic owner', witnesses: [{ name: 'Witness', phone: '0123456789', email: null, notes: 'Synthetic statement' }],
      gps: { latitude: -26.204103, longitude: 28.047305 }, emergencyAttended: 'UNKNOWN', policeAttended: 'NO', policeAgency: null,
      fleetDamage: 'Dent', otherVehicleDamage: 'Scratch', propertyDamage: null, vehicleDriveable: 'NO', towingRequired: 'YES', vehicleMotion: 'PARKED' };
    const r = await save(f, await create(f), fields); const done = await submit(f, r);
    assert.deepEqual(done.fields, fields); assert.equal(done.fields.policeReference, undefined);
  });
  for (const endShift of [false, true]) {
    test(`${backend}: historical draft survives return, ${endShift ? 'shift end and later login' : 'vehicle swap'}`, async () => {
      const f = await fixture(); let r = await save(f, await create(f), { narrative: 'Roadside draft' });
      await inspect(f, 'PICKUP');
      const values = draft(f, { transitionReason: endShift ? 'SHIFT_END' : 'VEHICLE_SWAP' });
      await inspect(f, 'RETURN', values); await end(f, values);
      if (endShift) {
        await f.call('endShiftWithSession', { shiftId: f.shiftId });
        const login = await api.driverLogin({ driverId: f.driverId, pin: '2468', deviceId: 'later-login' }, {});
        f.call = (name, payload = {}) => api[name]({ driverId: f.driverId, sessionToken: login.sessionToken, ...payload }, {});
      } else {
        const replacement = id();
        await db.collection('vehicles').doc(replacement).set({ status: 'Active', vehicleType: 'EV', registration: 'REPLACEMENT', currentOdometer: 12000, isTestData: true });
        await f.call('startVehicleAssignment', { ...f.startPayload, vehicleId: replacement, startOdometer: 12000, transitionReason: 'VEHICLE_SWAP' });
      }
      const discovered = await f.call('getAccidentReportForDriver');
      assert.ok(discovered.some(v => v.id === r.id));
      assert.equal((await f.call('getAccidentReportForDriver', { reportId: r.id })).fields.narrative, 'Roadside draft');
      const other = await fixture();
      assert.ok(!(await other.call('getAccidentReportForDriver')).some(v => v.id === r.id));
      await expectCode(other.call('getAccidentReportForDriver', { reportId: r.id }), 'permission-denied');
      await expectCode(save(other, r), 'permission-denied');
      await expectCode(photo(other, r), 'permission-denied');
      await expectCode(submit(other, r), 'permission-denied');
      await expectCode(create(f), 'permission-denied');
      await expectCode(save(f, r, { assignmentId: other.assignmentId }), 'invalid-argument');
      r = await save(f, r); const evidence = await photo(f, r); const done = await submit(f, r);
      for (const key of ['driverId', 'vehicleId', 'shiftId', 'assignmentId']) assert.equal(done[key], f[key]);
      assert.equal(done.orgId, r.orgId); assert.equal(done.isTestData, r.isTestData);
      assert.equal(done.photos[0].path, evidence.path);
      assert.match(evidence.path, new RegExp('^accident-reports/' + r.orgId + '/' + r.id + '/'));
      await expectCode(save(f, done)); await expectCode(photo(f, done));
      const retry = await f.call('submitAccidentReport', { reportId: done.id, revision: done.revision, fields: { narrative: 'Changed' }, vehicleId: other.vehicleId });
      assert.equal(retry.submittedAt.toMillis(), done.submittedAt.toMillis());
      assert.deepEqual(retry.fields, done.fields); assert.equal(retry.vehicleId, done.vehicleId);
      assert.ok(!(await f.call('getAccidentReportForDriver')).some(v => v.id === r.id));
    });
  }
  test(`${backend}: historical draft rejects inactive owner and changed original linkage`, async () => {
    const f = await fixture(), r = await create(f);
    await db.collection('vehicleAssignments').doc(f.assignmentId).update({ status: 'COMPLETED' });
    await db.collection('users').doc(f.driverId).update({ employmentStatus: 'Inactive' });
    await expectCode(save(f, r), 'permission-denied'); await expectCode(submit(f, r), 'permission-denied');
    await expectCode(f.call('getAccidentReportForDriver'), 'permission-denied');
    await db.collection('users').doc(f.driverId).update({ employmentStatus: 'Active' });
    await db.collection('vehicleAssignments').doc(f.assignmentId).update({ vehicleId: id() });
    await expectCode(save(f, r)); await expectCode(photo(f, r)); await expectCode(submit(f, r));
  });
  test(`${backend}: mixed test provenance is retained`, async () => {
    for (const driverTest of [false, true]) {
      const f = await fixture(80000, driverTest);
      await db.collection('vehicles').doc(f.vehicleId).update({ isTestData: !driverTest });
      assert.equal((await create(f)).isTestData, true);
    }
  });
}
