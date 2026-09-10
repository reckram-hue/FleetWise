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
    delete: async () => { throw new Error('WP2 must not delete possibly referenced evidence'); },
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
  async function fixture(odo = 80000, isTestData = true, vehicleOverrides = {}) {
    const driverId = id(), vehicleId = id(), locationId = id();
    await db.collection('users').doc(driverId).set({ role: 'driver', employmentStatus: 'Active', firstName: 'Synthetic', surname: 'WP2',
      isTestData, pinHash: await req('bcryptjs').hash('2468', 4) });
    await db.collection('vehicles').doc(vehicleId).set({ status: 'Active', vehicleType: 'EV', registration: 'SYNTHETIC-WP2',
      currentOdometer: odo, batteryCapacityKwh: 60, isTestData, ...vehicleOverrides });
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

  test(`${backend}: maintenance dispatch follows actual custody through start A, return A, same-shift pickup B`, async () => {
    const f=await fixture(), actor=id(), provider=id(), serviceId=id(), day=new Date().toISOString().slice(0,10);
    await db.collection('users').doc(actor).set({role:'admin',employmentStatus:'Active'});
    await db.collection('serviceProviders').doc(provider).set({name:'TEST workshop',isActive:true});
    const adminCall=(name,p)=>api[name](p,{auth:{uid:actor}});
    await adminCall('saveScheduledServiceAdmin',{serviceId,vehicleId:f.vehicleId,serviceType:'TEST repair',dueDate:day,dueOdometer:f.odo+1000,bookedDate:day,bookedTime:'09:00',serviceProviderId:provider,linkedDefectIds:[]});
    const dispatch={serviceId,vehicleId:f.vehicleId,sentDate:day};
    await expectCode(adminCall('dispatchServiceAdmin',dispatch));
    await inspect(f,'PICKUP');const values=draft(f,{transitionReason:'VEHICLE_SWAP'});await inspect(f,'RETURN',values);await end(f,values);
    const other=id();await db.collection('vehicles').doc(other).set({status:'Active',vehicleType:'EV',currentOdometer:1000,isTestData:true});
    const next=await f.call('startVehicleAssignment',{shiftId:f.shiftId,vehicleId:other,startOdometer:1000,startChargePercent:80,startPredictedRangeKm:300,transitionReason:'VEHICLE_SWAP'});
    const shift=await read('shifts',f.shiftId);assert.equal(shift.status,'Active');assert.equal(shift.vehicleId,f.vehicleId);assert.equal(shift.activeAssignmentId,next.assignmentId);
    const returned=await read('vehicles',f.vehicleId);assert.equal(returned.activeAssignmentId,undefined);assert.equal(returned.activeShiftId,undefined);
    await db.collection('shifts').doc(f.shiftId).update({activeAssignmentId:'missing-stale-assignment'});await expectCode(adminCall('dispatchServiceAdmin',dispatch));
    await db.collection('shifts').doc(f.shiftId).update({activeAssignmentId:next.assignmentId});
    await db.collection('vehicles').doc(f.vehicleId).update({activeShiftId:f.shiftId});await expectCode(adminCall('dispatchServiceAdmin',dispatch));
    await db.collection('vehicles').doc(f.vehicleId).update({activeShiftId:FieldValue.delete()});
    await adminCall('dispatchServiceAdmin',dispatch);
    assert.equal((await read('vehicles',f.vehicleId)).status,'In Service');assert.equal((await read('vehicleAssignments',next.assignmentId)).status,'ACTIVE');
    assert.equal((await read('vehicles',other)).activeAssignmentId,next.assignmentId);
  });

  test(`${backend}: economy captures explicit usable capacity once and never promotes legacy capacity`, async () => {
    for (const explicit of [false, true]) {
      const f = await fixture(80000, true, explicit ? { usableBatteryCapacityKWh: 50, usableBatteryCapacitySource: 'Synthetic usable specification' } : {});
      const a = await read('vehicleAssignments', f.assignmentId);
      assert.equal(a.energyCaptureVersion, 1);
      assert.equal(a.usableCapacitySnapshot?.valueKWh ?? null, explicit ? 50 : null);
      await db.collection('vehicles').doc(f.vehicleId).update({ usableBatteryCapacityKWh: 90, usableBatteryCapacitySource: 'Later specification' });
      await inspect(f, 'PICKUP');
      const result = await charge(f);
      const chargingSessionId = result.chargingSessionId;
      await endCharge(f, chargingSessionId);
      const s = await read('chargingSessions', chargingSessionId);
      assert.deepEqual(s.usableCapacitySnapshot, a.usableCapacitySnapshot);
      assert.equal(s.estimatedBatteryEnergyAddedKWh, explicit ? 25 : null);
      assert.equal(s.batteryEnergyProvenance, explicit ? 'ESTIMATED' : 'INSUFFICIENT_DATA');
      assert.equal(s.costProvenance, 'UNKNOWN'); assert.equal(s.chargerEnergyProvenance, 'UNKNOWN');
    }
  });

  test(`${backend}: refuel callable preserves explicit fill state and deduplicates concurrent retries`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP');
    await db.collection('vehicles').doc(f.vehicleId).update({ vehicleType: 'ICE' });
    const payload = { assignmentId: f.assignmentId, odometer: f.odo + 10, litresFilled: 20, fuelCost: 400, fillLevel: 'FULL', clientRequestId: randomUUID() };
    const [one, two] = await Promise.all([f.call('logRefuelWithSession', payload), f.call('logRefuelWithSession', payload)]);
    assert.deepEqual(one, two);
    let records = await db.collection('refuelRecords').where('assignmentId', '==', f.assignmentId).get();
    assert.equal(records.size, 1); assert.equal(records.docs[0].data().fillLevel, 'FULL');
    assert.equal(records.docs[0].data().recordStatus, 'ACTIVE');
    await f.call('logRefuelWithSession', { assignmentId: f.assignmentId, odometer: f.odo + 20, litresFilled: 10, fuelCost: 200 });
    records = await db.collection('refuelRecords').where('assignmentId', '==', f.assignmentId).get();
    assert.equal(records.size, 2);
    const legacy = records.docs.map(d => d.data()).find(r => r.odometer === f.odo + 20);
    assert.equal(legacy.fillLevel, 'UNKNOWN'); assert.equal(legacy.recordStatus, 'UNVERIFIED');
  });

  test(`${backend}: return damage atomically links one defect across concurrent/lost-response retries`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP');
    const inspectionId = await prepare(f, 'RETURN', draft(f));
    const payload = { vehicleId: f.vehicleId, sourceInspectionId: inspectionId, category: 'Other', urgency: 'Medium', description: 'Scratch' };
    const [one, two] = await Promise.all([f.call('reportDefectWithSession', payload), f.call('reportDefectWithSession', payload)]);
    assert.equal(one.defectId, two.defectId);
    const defect = await read('defects', one.defectId);
    for (const key of ['driverId', 'vehicleId', 'shiftId', 'assignmentId']) assert.equal(defect[key], f[key]);
    assert.equal(defect.sourceInspectionId, inspectionId); assert.equal(defect.photos, undefined);
    await expectCode(f.call('completeVehicleInspection', { inspectionId, hasDamage: false }));
    const done = await f.call('completeVehicleInspection', { inspectionId, hasDamage: true });
    assert.equal(done.inspection.damageDescription, null); assert.equal(done.inspection.hasDamage, true);
    assert.equal(done.inspection.linkedDefectId, one.defectId);
    assert.equal(done.inspection.retentionClass, 'EVIDENCE'); assert.equal(done.inspection.expiresAt, null);
    assert.equal((await f.call('reportDefectWithSession', payload)).defectId, one.defectId);
    await f.call('completeVehicleInspection', { inspectionId, hasDamage: true });
    await end(f); assert.equal((await db.collection('defects').where('driverId', '==', f.driverId).get()).size, 1);
  });
  test(`${backend}: return defect rejects pickup and foreign inspections`, async () => {
    const f = await fixture(); const other = await fixture();
    for (const inspectionId of [await prepare(f, 'PICKUP'), await prepare(other, 'RETURN', draft(other))]) {
      await expectCode(f.call('reportDefectWithSession', { vehicleId: f.vehicleId, sourceInspectionId: inspectionId,
        category: 'Other', urgency: 'Medium', description: 'Scratch' }), 'permission-denied');
    }
  });

  for (const boundaryType of ['PICKUP', 'RETURN']) for (const hasDamage of [false, true]) {
    test(`${backend}: ${boundaryType} damage=${hasDamage} retains correct evidence policy without creating defects`, async () => {
      const f = await fixture();
      const inspectionId = await prepare(f, boundaryType, boundaryType === 'RETURN' ? draft(f) : undefined);
      const before = Date.now();
      await f.call('completeVehicleInspection', { inspectionId, hasDamage, ...(hasDamage ? { damageDescription: 'Synthetic damage' } : {}) });
      const stored = await read('vehicleInspections', inspectionId);
      assert.equal(stored.status, 'COMPLETED');
      assert.equal(stored.hasDamage, hasDamage);
      assert.equal(stored.damageDescription, hasDamage ? 'Synthetic damage' : null);
      if (boundaryType === 'PICKUP' || hasDamage) {
        assert.equal(stored.retentionClass, 'EVIDENCE'); assert.equal(stored.expiresAt, null);
      } else {
        assert.equal(stored.retentionClass, 'ROUTINE');
        const expiry = stored.expiresAt.toMillis(), sevenDays = 7 * 24 * 60 * 60 * 1000;
        assert.ok(expiry >= before + sevenDays && expiry <= Date.now() + sevenDays);
      }
      assert.equal((await db.collection('defects').where('driverId', '==', f.driverId).get()).size, 0);
      await f.call('completeVehicleInspection', { inspectionId, hasDamage: !hasDamage, damageDescription: 'Retry must not rewrite' });
      assert.deepEqual(await read('vehicleInspections', inspectionId), stored);
    });
  }

  for (const [first, second] of [[80000, 11900], [11900, 80000]]) {
    test(`${backend}: multi-vehicle ${first} -> ${second} yields 200 km in stats and leaderboard`, async () => {
      // Explicit non-test provenance exercises production exclusion logic in the DEMO database only.
      const f = await fixture(first, false);
      await inspect(f, 'PICKUP');
      const ret = draft(f, { transitionReason: 'VEHICLE_SWAP' });
      await inspect(f, 'RETURN', ret); await end(f, ret);
      const otherVehicle = id();
      await db.collection('vehicles').doc(otherVehicle).set({ status: 'Active', vehicleType: 'EV', currentOdometer: second, isTestData: false });
      const { assignmentId } = await f.call('startVehicleAssignment', { shiftId: f.shiftId, vehicleId: otherVehicle,
        startOdometer: second, startChargePercent: 80, startPredictedRangeKm: 300, transitionReason: 'VEHICLE_SWAP' });
      const g = { ...f, assignmentId, vehicleId: otherVehicle, odo: second };
      await inspect(g, 'PICKUP'); await inspect(g, 'RETURN', draft(g)); await end(g);
      await g.call('endShiftWithSession', { shiftId: f.shiftId, endOdometer: second + 100 });
      const closed = await read('shifts', f.shiftId);
      assert.equal(closed.status, 'Completed'); assert.equal(closed.endOdometer, null);
      await g.call('endShiftWithSession', { shiftId: f.shiftId });
      assert.deepEqual(await read('shifts', f.shiftId), closed);
      const { stats } = await f.call('getDriverStatsWithSession');
      assert.equal(stats.totalKmDriven, 200); assert.equal(stats.unknownDistanceIntervals, 0);
      const { leaderboard } = await f.call('getLeaderboard');
      assert.equal(leaderboard.find(e => e.driver.id === f.driverId).totalKmDriven, 200);
    });
  }

  test(`${backend}: OPEN charging blocks return even without pointer; closing charge permits return`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP'); await inspect(f, 'RETURN', draft(f));
    const { chargingSessionId } = await charge(f);
    await expectCode(end(f));
    await db.collection('vehicles').doc(f.vehicleId).update({ activeChargingSessionId: FieldValue.delete() });
    await expectCode(end(f)); // authoritative session still blocks without guard
    await expectCode(api.endChargingSession({ ...f.credentials, driverId: 'wrong', chargingSessionId, endChargePercent: 80, endPredictedRangeKm: 300 }, {}), 'permission-denied');
    await endCharge(f, chargingSessionId); await end(f);
    assert.equal((await read('vehicleAssignments', f.assignmentId)).status, 'COMPLETED');
  });

  test(`${backend}: concurrent charge-start / return never creates OPEN on completed assignment`, async () => {
    for (let run = 0; run < 3; run++) {
      const f = await fixture(); await inspect(f, 'PICKUP'); await inspect(f, 'RETURN', draft(f));
      const results = await Promise.allSettled([charge(f), end(f)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const a = await read('vehicleAssignments', f.assignmentId);
      const sessions = await db.collection('chargingSessions').where('assignmentId', '==', f.assignmentId).get();
      assert.ok(!(a.status === 'COMPLETED' && sessions.docs.some(d => d.data().status === 'OPEN')));
      if (results[0].status === 'fulfilled') { await endCharge(f, results[0].value.chargingSessionId); await end(f); }
      await expectCode(charge(f)); // no stale pretransaction assignment can start after return
    }
  });

  test(`${backend}: durable interrupted return, lost response retry and pickup close exactly one charging event`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP');
    const values = draft(f, { leftForCharging: true, chargingLocationId: f.locationId, transitionReason: 'VEHICLE_SWAP' });
    await inspect(f, 'RETURN', values);
    // Fail finalization after evidence persisted, then re-resolve as after browser refresh.
    await db.collection('chargingLocations').doc(f.locationId).update({ active: false });
    await expectCode(end(f, values));
    const state = await f.call('getDriverOperationalState');
    const ret = state.inspections.find(i => i.boundaryType === 'RETURN');
    assert.equal(ret.status, 'COMPLETED'); assert.deepEqual(ret.returnFinalization, values);
    assert.equal(ret.returnFinalizationStatus, 'PENDING');
    await db.collection('chargingLocations').doc(f.locationId).update({ active: true });
    // Client need not reconstruct transient readings; saved draft is authoritative.
    await end(f, { transitionReason: 'VEHICLE_SWAP' });
    const a = await read('vehicleAssignments', f.assignmentId);
    const pointer = (await read('vehicles', f.vehicleId)).openChargingEventId;
    assert.ok(pointer);
    const event = await read('chargingEvents', pointer);
    assert.equal(event.lifecycleStatus, 'OPEN'); assert.equal(event.isTestData, true);
    await end(f, values); assert.deepEqual(await read('vehicleAssignments', f.assignmentId), a);
    assert.equal((await db.collection('chargingEvents').where('returnAssignmentId', '==', f.assignmentId).get()).size, 1);
    const pickup = { ...f.startPayload, startOdometer: values.endOdometer, transitionReason: 'VEHICLE_SWAP' };
    const next = await f.call('startVehicleAssignment', pickup);
    assert.equal((await f.call('startVehicleAssignment', pickup)).assignmentId, next.assignmentId);
    const closed = await read('chargingEvents', pointer);
    assert.equal(closed.lifecycleStatus, 'CLOSED'); assert.equal(closed.pickupAssignmentId, next.assignmentId);
    assert.equal(closed.chargingOutcome, 'UNKNOWN'); assert.equal(closed.financialStatus, event.financialStatus);
    assert.equal(closed.pickupChargePercent, 80); assert.equal(closed.returnOdometer, values.endOdometer);
    assert.equal((await read('vehicles', f.vehicleId)).openChargingEventId, undefined);
    // An old return retry cannot clear a NEW assignment or reopen its event.
    await end(f, values);
    assert.equal((await read('vehicles', f.vehicleId)).activeAssignmentId, next.assignmentId);
    assert.deepEqual(await read('chargingEvents', pointer), closed);
  });

  test(`${backend}: exceptional stale pointer requires active admin, exact compare and audited recovery`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP'); await inspect(f, 'RETURN', draft(f)); await end(f);
    const missingId = id(), adminId = id();
    await db.collection('vehicles').doc(f.vehicleId).update({ openChargingEventId: missingId });
    const payload = { vehicleId: f.vehicleId, expectedEventId: missingId, reason: 'Synthetic stale pointer recovery' };
    await expectCode(api.recoverReturnChargingEvent(payload, {}), 'unauthenticated');
    await db.collection('users').doc(adminId).set({ role: 'admin', employmentStatus: 'Inactive' });
    await expectCode(api.recoverReturnChargingEvent(payload, { auth: { uid: adminId } }), 'permission-denied');
    await db.collection('users').doc(adminId).update({ employmentStatus: 'Active' });
    await expectCode(api.recoverReturnChargingEvent({ ...payload, expectedEventId: id() }, { auth: { uid: adminId } }));
    assert.equal((await api.recoverReturnChargingEvent(payload, { auth: { uid: adminId } })).repaired, true);
    assert.equal((await api.recoverReturnChargingEvent(payload, { auth: { uid: adminId } })).repaired, false);
    const audit = await db.collection('chargingEventRecoveries').where('vehicleId', '==', f.vehicleId).get();
    assert.equal(audit.size, 1); assert.equal(audit.docs[0].data().adminUid, adminId);
    assert.equal(audit.docs[0].data().eventExisted, false);
  });

  test(`${backend}: concurrent deterministic creation and duplicate completion preserve first evidence`, async () => {
    const f = await fixture();
    const payload = { assignmentId: f.assignmentId, boundaryType: 'PICKUP' };
    const creates = await Promise.all([f.call('createVehicleInspection', payload), f.call('createVehicleInspection', payload)]);
    assert.equal(creates[0].inspection.id, creates[1].inspection.id);
    const inspectionId = await prepare(f, 'PICKUP');
    const results = await Promise.all([
      f.call('completeVehicleInspection', { inspectionId, hasDamage: false }),
      f.call('completeVehicleInspection', { inspectionId, hasDamage: true, damageDescription: 'Synthetic damage' }),
    ]);
    assert.equal(results[0].inspection.hasDamage, results[1].inspection.hasDamage);
    const frozen = await read('vehicleInspections', inspectionId);
    await f.call('createVehicleInspection', payload);
    await f.call('completeVehicleInspection', { inspectionId, hasDamage: !frozen.hasDamage, damageDescription: 'Must not replace evidence' });
    assert.deepEqual(await read('vehicleInspections', inspectionId), frozen);
    await expectCode(f.call('uploadInspectionPhoto', { ...payload, photoRole: 'EXTERIOR', imageDataUrl: png }));
  });

  test(`${backend}: draft survives pending upload interruption and completion refuses a concurrently changed draft`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP');
    const values = draft(f);
    const payload = { assignmentId: f.assignmentId, boundaryType: 'RETURN', returnIntent: 'SHIFT_END', returnFinalization: values };
    await f.call('createVehicleInspection', payload);
    await expectCode(f.call('uploadInspectionPhoto', { assignmentId: f.assignmentId, boundaryType: 'RETURN', photoRole: 'EXTERIOR', imageDataUrl: 'invalid' }), 'invalid-argument');
    const restored = await f.call('getDriverOperationalState');
    assert.deepEqual(restored.inspections.find(i => i.boundaryType === 'RETURN').returnFinalization, values);
    const inspectionId = await prepare(f, 'RETURN', values);
    const verifying = deferred(), resume = deferred();
    existsHook = async () => { verifying.resolve(); await resume.promise; };
    const completion = f.call('completeVehicleInspection', { inspectionId, hasDamage: false });
    try {
      await verifying.promise;
      await f.call('createVehicleInspection', { ...payload, returnFinalization: { ...values, endOdometer: values.endOdometer + 1 } });
      resume.resolve(); await expectCode(completion);
      existsHook = null;
      const done = await f.call('completeVehicleInspection', { inspectionId, hasDamage: false });
      assert.equal(done.inspection.returnFinalization.endOdometer, values.endOdometer + 1);
    } finally { existsHook = null; resume.resolve(); }
  });

  test(`${backend}: recovery closes only matching OPEN event and preserves billing and other vehicles' events`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP'); await inspect(f, 'RETURN', draft(f)); await end(f);
    const uid = id(), eventId = id();
    await db.collection('users').doc(uid).set({ role: 'admin', employmentStatus: 'Active' });
    const event = { vehicleId: f.vehicleId, lifecycleStatus: 'OPEN', financialStatus: 'KNOWN', finalCost: 99, returnOdometer: f.odo + 100 };
    await db.collection('chargingEvents').doc(eventId).set(event);
    await db.collection('vehicles').doc(f.vehicleId).update({ openChargingEventId: eventId });
    const payload = { vehicleId: f.vehicleId, expectedEventId: eventId, reason: 'Synthetic verified exceptional handover' };
    await api.recoverReturnChargingEvent(payload, { auth: { uid } });
    const closed = await read('chargingEvents', eventId);
    assert.equal(closed.lifecycleStatus, 'CLOSED'); assert.equal(closed.financialStatus, 'KNOWN'); assert.equal(closed.finalCost, 99);
    assert.ok(closed.recoveryId); assert.ok(closed.closedAt);
    const otherEventId = id(), otherEvent = { ...event, vehicleId: id() };
    await db.collection('chargingEvents').doc(otherEventId).set(otherEvent);
    await db.collection('vehicles').doc(f.vehicleId).update({ openChargingEventId: otherEventId });
    await api.recoverReturnChargingEvent({ ...payload, expectedEventId: otherEventId }, { auth: { uid } });
    assert.deepEqual(await read('chargingEvents', otherEventId), otherEvent);
  });

  test(`${backend}: late upload cannot mutate completed metadata or delete selected evidence`, async () => {
    const f = await fixture(); const inspectionId = await prepare(f, 'PICKUP');
    const saved = deferred(), resume = deferred();
    saveHook = async () => { saved.resolve(); await resume.promise; };
    const upload = f.call('uploadInspectionPhoto', { assignmentId: f.assignmentId, boundaryType: 'PICKUP', photoRole: 'EXTERIOR', imageDataUrl: png });
    try {
      await saved.promise;
      await f.call('completeVehicleInspection', { inspectionId, hasDamage: false });
      const frozen = await read('vehicleInspections', inspectionId);
      resume.resolve(); await expectCode(upload);
      assert.deepEqual(await read('vehicleInspections', inspectionId), frozen);
      assert.ok(objects.has(frozen.exteriorPhotoPath)); assert.ok(objects.has(frozen.interiorPhotoPath));
    } finally { saveHook = null; resume.resolve(); }
  });

  test(`${backend}: completion rejects stale verified paths and succeeds on reload`, async () => {
    const f = await fixture(); const inspectionId = await prepare(f, 'PICKUP');
    const verifying = deferred(), resume = deferred();
    existsHook = async () => { verifying.resolve(); await resume.promise; };
    const completion = f.call('completeVehicleInspection', { inspectionId, hasDamage: false });
    try {
      await verifying.promise;
      const uploaded = await f.call('uploadInspectionPhoto', { assignmentId: f.assignmentId, boundaryType: 'PICKUP', photoRole: 'EXTERIOR', imageDataUrl: png });
      resume.resolve(); await expectCode(completion);
      existsHook = null;
      assert.equal((await read('vehicleInspections', inspectionId)).status, 'PENDING');
      const done = await f.call('completeVehicleInspection', { inspectionId, hasDamage: false });
      assert.equal(done.inspection.exteriorPhotoPath, uploaded.photoPath);
    } finally { existsHook = null; resume.resolve(); }
  });

  test(`${backend}: return draft freezes with evidence; legacy completed return attaches first draft only`, async () => {
    const f = await fixture(); await inspect(f, 'PICKUP'); await inspect(f, 'RETURN');
    const values = draft(f);
    const payload = { assignmentId: f.assignmentId, boundaryType: 'RETURN', returnIntent: 'SHIFT_END', returnFinalization: values };
    const before = await read('vehicleInspections', f.assignmentId + '_RETURN');
    await f.call('createVehicleInspection', payload);
    const saved = await read('vehicleInspections', f.assignmentId + '_RETURN');
    assert.equal(saved.exteriorPhotoPath, before.exteriorPhotoPath); assert.deepEqual(saved.completedAt, before.completedAt);
    await f.call('createVehicleInspection', { ...payload, returnFinalization: { ...values, endOdometer: values.endOdometer + 500 } });
    assert.deepEqual(await read('vehicleInspections', f.assignmentId + '_RETURN'), saved);
    await end(f, { transitionReason: 'SHIFT_END' });
    assert.equal((await read('vehicleAssignments', f.assignmentId)).endOdometer, values.endOdometer);
  });

  test(`${backend}: missing assignment readings are unknown, never shift fallback; test intervals excluded`, () => {
    const { driverDistance, intervalDistance } = req('./lib/assignmentDistance.js');
    const shift = { id: 's', driverId: 'd', status: 'Completed', startOdometer: 1, endOdometer: 900001 };
    const a = { shiftId: 's', driverId: 'd', status: 'COMPLETED', startOdometer: 50, endOdometer: null };
    assert.deepEqual(driverDistance([shift], [a]), { totalKmDriven: 0, unknownDistanceIntervals: 1 });
    assert.deepEqual(driverDistance([shift], [{ ...a, endOdometer: 150, isTestData: true }], true), { totalKmDriven: 0, unknownDistanceIntervals: 0 });
    assert.equal(driverDistance([shift], []).totalKmDriven, 900000); // explicitly legacy-only
    assert.equal(intervalDistance({ startOdometer: 50, endOdometer: 49 }), null);
    assert.equal(intervalDistance({ startOdometer: 0, endOdometer: 0 }), 0);
  });
}
