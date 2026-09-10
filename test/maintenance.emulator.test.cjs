const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const clients = [];
after(async () => { await Promise.all(clients.map(db => db.terminate())); });
for (const backend of ['functions', 'functions-prod-jhb']) {
  const req = Module.createRequire(resolve(backend, 'package.json'));
  const { Firestore, Timestamp, FieldValue } = req('firebase-admin/firestore');
  const { HttpsError } = req('firebase-functions/v2/https');
  const db = new Firestore({ projectId: 'demo-fleetwise-maintenance' }); clients.push(db);
  const filename = resolve(backend, 'lib/index.js'), loaded = new Module(filename, module), realRequire = Module.createRequire(filename);
  const https = { HttpsError, onCall: handler => handler };
  loaded.require = name => {
    if (name === 'firebase-admin') return {
      initializeApp: options => ({ options }), app: () => ({ options: { storageBucket: 'synthetic' } }),
      firestore: Object.assign(() => db, { Timestamp, FieldValue }),
      auth: () => { throw Error('Cloud Auth forbidden'); }, storage: () => ({ bucket: () => { throw Error('Cloud Storage forbidden'); } }),
    };
    if (name === 'firebase-functions') return { https, runWith: () => ({ https }) };
    if (name === 'firebase-functions/v2/https') return { HttpsError, onCall: (_opts, handler) => (data, context) => handler({ ...context, data }) };
    return realRequire(name);
  };
  loaded._compile(readFileSync(filename, 'utf8'), filename);
  const api = loaded.exports, uid = () => randomUUID(), day = new Date().toISOString().slice(0,10);
  const get = async (c,id) => (await db.collection(c).doc(id).get()).data();
  const deny = (promise, code = 'failed-precondition') => assert.rejects(promise, e => e.code === code);
  async function fixture(over = {}, linked = []) {
    const vehicleId = uid(), actor = uid(), provider = uid(), serviceId = uid();
    await db.collection('users').doc(actor).set({ role: 'admin', employmentStatus: 'Active' });
    await db.collection('vehicles').doc(vehicleId).set({ registration: 'SYNTHETIC TEST', vehicleType: 'ICE', status: 'Active', currentOdometer: 1000, lastServiceOdometer: 900, isTestData: true, ...over });
    await db.collection('serviceProviders').doc(provider).set({ name: 'Synthetic workshop', isActive: true });
    const defectIds = [];
    for (const urgency of linked) { const id = uid(); defectIds.push(id); await db.collection('defects').doc(id).set({ vehicleId, status: 'Open', urgency, description: 'Original statement', photos: ['unchanged-evidence'], isVisibleToDriver: true }); }
    const booking = { serviceId, vehicleId, serviceType: 'Actual service', dueDate: day, dueOdometer: 2000, bookedDate: day, bookedTime: '09:00', serviceProviderId: provider, notes: '', linkedDefectIds: defectIds };
    const call = (name,p) => api[name](p,{ auth: { uid: actor } });
    await call('saveScheduledServiceAdmin',booking);
    const dispatch = { serviceId, vehicleId, sentDate: day };
    const complete = { serviceId, vehicleId, returnDate: day, odometer: 1100, actualCost: 123.45, serviceNotes: 'Work inspected and complete', resolvedDefectIds: defectIds };
    const release = { vehicleId, requestId: uid(), status: 'Active', notes: 'Inspected for operational release', clearManualHold: false };
    return { vehicleId, actor, provider, serviceId, booking, dispatch, complete, release, call, defectIds };
  }
  const run = (name, fn) => test(`${backend}: ${name}`, fn);
  run('dispatch, actual completion, canonical reload and explicit release', async () => {
    const f=await fixture(); await f.call('dispatchServiceAdmin',f.dispatch);
    let v=await get('vehicles',f.vehicleId); assert.equal(v.status,'In Service'); assert.ok(v.unavailableSince);
    let s=await f.call('completeServiceAdmin',f.complete); assert.equal(s.actualCost,123.45); assert.equal(s.completionOdometer,1100); assert.ok(s.completedAt); assert.equal(s.completedBy,f.actor);
    assert.equal((await get('vehicles',f.vehicleId)).status,'In Service');
    const records=await db.collection('maintenanceRecords').where('vehicleId','==',f.vehicleId).get(); assert.equal(records.size,1);
    assert.equal(records.docs[0].data().odometer,1100); assert.notEqual(records.docs[0].data().odometer,f.booking.dueOdometer); assert.equal(records.docs[0].data().isTestData,true);
    await f.call('changeVehicleLifecycleAdmin',f.release); v=await get('vehicles',f.vehicleId); assert.equal(v.status,'Active'); assert.equal(v.unavailableSince,null);
    s=await get('scheduledServices',f.serviceId); assert.ok(s.releasedAt); assert.ok(s.dispatchedAt); assert.equal(s.releasedBy,f.actor);
    assert.equal((await db.collection('scheduledServices').doc(f.serviceId).collection('history').get()).size,4);
  });
  for (const pointer of ['activeAssignmentId','activeShiftId','activeChargingSessionId','openChargingEventId']) run(`dispatch rejects ${pointer}`, async () => {
    const f=await fixture({[pointer]:'existing'}); await deny(f.call('dispatchServiceAdmin',f.dispatch)); assert.equal((await get('vehicles',f.vehicleId)).status,'Active');
  });
  for (const [collection,status] of [['vehicleAssignments','ACTIVE'],['shifts','Active'],['chargingSessions','OPEN']]) run(`dispatch rejects orphan ${collection} without pointer`, async()=>{
    const f=await fixture(); await db.collection(collection).doc(uid()).set({vehicleId:f.vehicleId,status}); await deny(f.call('dispatchServiceAdmin',f.dispatch));
  });
  run('concurrent identical dispatch/completion replay retains actor/time and single history/cost',async()=>{
    const f=await fixture(); await Promise.all([f.call('dispatchServiceAdmin',f.dispatch), f.call('dispatchServiceAdmin',f.dispatch)]);
    const before=await get('scheduledServices',f.serviceId); await f.call('dispatchServiceAdmin',f.dispatch); assert.deepEqual((await get('scheduledServices',f.serviceId)).dispatchedAt,before.dispatchedAt);
    await deny(f.call('dispatchServiceAdmin',{...f.dispatch,sentDate:'2020-01-01'}),'already-exists');
    await Promise.all([f.call('completeServiceAdmin',f.complete),f.call('completeServiceAdmin',f.complete)]);
    const completed=await get('scheduledServices',f.serviceId); await f.call('completeServiceAdmin',f.complete); assert.deepEqual((await get('scheduledServices',f.serviceId)).completedAt,completed.completedAt);
    await deny(f.call('completeServiceAdmin',{...f.complete,actualCost:999}),'already-exists');
    assert.equal((await db.collection('maintenanceRecords').where('vehicleId','==',f.vehicleId).get()).size,1);
    assert.equal((await db.collection('costs').where('vehicleId','==',f.vehicleId).get()).size,0);
  });
  run('completion validates actual date, odometer, notes, cost and ownership',async()=>{
    const f=await fixture(); await f.call('dispatchServiceAdmin',f.dispatch);
    for(const patch of [{odometer:999},{returnDate:'2020-01-01'},{returnDate:'2099-01-01'},{vehicleId:uid()}]) await deny(f.call('completeServiceAdmin',{...f.complete,...patch}));
    for(const patch of [{odometer:null},{actualCost:-1},{serviceNotes:''},{returnDate:'2026-02-30'}]) await deny(f.call('completeServiceAdmin',{...f.complete,...patch}),'invalid-argument');
    assert.equal((await db.collection('maintenanceRecords').where('vehicleId','==',f.vehicleId).get()).size,0);
  });
  run('completion cannot lower a refuel reading even when vehicle odometer is stale',async()=>{
    const f=await fixture(); await f.call('dispatchServiceAdmin',f.dispatch);
    await db.collection('refuelRecords').doc(uid()).set({vehicleId:f.vehicleId,odometer:1200});
    await deny(f.call('completeServiceAdmin',f.complete));
    await f.call('completeServiceAdmin',{...f.complete,odometer:1200});
    assert.equal((await get('vehicles',f.vehicleId)).currentOdometer,1200);
  });
  run('replayed completion cannot re-resolve a subsequently reopened defect',async()=>{
    const f=await fixture({},['Low']); await f.call('dispatchServiceAdmin',f.dispatch); await f.call('completeServiceAdmin',f.complete);
    await f.call('transitionDefectAdmin',{defectId:f.defectIds[0],requestId:uid(),expectedStatus:'Resolved',status:'Open',notes:'Repair not successful'});
    await f.call('completeServiceAdmin',f.complete);
    assert.equal((await get('defects',f.defectIds[0])).status,'Open'); await deny(f.call('changeVehicleLifecycleAdmin',f.release));
  });
  run('completion resolves only selected links, retains evidence, and reopening is audited',async()=>{
    const f=await fixture({},['Low','High']); const [one,two]=f.defectIds;
    const other=uid(); await db.collection('defects').doc(other).set({vehicleId:f.vehicleId,status:'Open',urgency:'Low',photos:['original']});
    await f.call('dispatchServiceAdmin',f.dispatch);
    await deny(f.call('completeServiceAdmin',{...f.complete,resolvedDefectIds:[other]}));
    await f.call('completeServiceAdmin',{...f.complete,resolvedDefectIds:[one]});
    assert.equal((await get('defects',one)).status,'Resolved'); assert.equal((await get('defects',two)).status,'Open'); assert.equal((await get('defects',other)).status,'Open');
    assert.deepEqual((await get('defects',one)).photos,['unchanged-evidence']);
    await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    const reopen={defectId:one,requestId:uid(),expectedStatus:'Resolved',status:'Open',notes:'Repair failed inspection'};
    await f.call('transitionDefectAdmin',reopen); await f.call('transitionDefectAdmin',reopen);
    assert.equal((await get('defects',one)).resolvedDateTime,undefined);
    const history=await db.collection('defects').doc(one).collection('history').get(); assert.equal(history.size,2); assert.ok(history.docs.some(d=>d.data().action==='REOPENED'));
  });
  run('another dispatched service and unrelated Critical defect each block release',async()=>{
    const f=await fixture(); await f.call('dispatchServiceAdmin',f.dispatch);
    const second={...f.booking,serviceId:uid()}; await f.call('saveScheduledServiceAdmin',second); await f.call('dispatchServiceAdmin',{...f.dispatch,serviceId:second.serviceId});
    await f.call('completeServiceAdmin',f.complete); await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    await f.call('completeServiceAdmin',{...f.complete,serviceId:second.serviceId});
    const d=uid(); await db.collection('defects').doc(d).set({vehicleId:f.vehicleId,status:'Open',urgency:'Critical'}); await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    await f.call('transitionDefectAdmin',{defectId:d,requestId:uid(),expectedStatus:'Open',status:'Resolved',notes:'Separate repair verified'});
    await f.call('changeVehicleLifecycleAdmin',f.release); assert.equal((await get('vehicles',f.vehicleId)).status,'Active');
  });
  run('release replay cannot undo a later manual hold and conflicting replay fails',async()=>{
    const f=await fixture(); await f.call('dispatchServiceAdmin',f.dispatch); await f.call('completeServiceAdmin',f.complete); await f.call('changeVehicleLifecycleAdmin',f.release);
    await f.call('changeVehicleLifecycleAdmin',{...f.release,requestId:uid(),status:'Repairs',notes:'New separate hold'});
    await f.call('changeVehicleLifecycleAdmin',f.release); assert.equal((await get('vehicles',f.vehicleId)).status,'Repairs');
    await deny(f.call('changeVehicleLifecycleAdmin',{...f.release,notes:'Different request'}),'already-exists');
    await deny(f.call('changeVehicleLifecycleAdmin',{...f.release,requestId:uid()}));
    await f.call('changeVehicleLifecycleAdmin',{...f.release,requestId:uid(),clearManualHold:true});
  });
  for(const status of ['Sold','End of Life']) run(`${status} cannot be released`,async()=>{
    const f=await fixture(); await db.collection('vehicles').doc(f.vehicleId).update({status}); await deny(f.call('changeVehicleLifecycleAdmin',{...f.release,clearManualHold:true}));
  });
  run('all maintenance mutations require active admin',async()=>{
    const f=await fixture();
    for(const [name,p] of [['saveScheduledServiceAdmin',f.booking],['dispatchServiceAdmin',f.dispatch],['completeServiceAdmin',f.complete],['changeVehicleLifecycleAdmin',f.release],['addMaintenanceRecordAdmin',{requestId:uid(),vehicleId:f.vehicleId,date:day,odometer:1000,serviceType:'Manual',cost:0,notes:'Actual work'}],['transitionDefectAdmin',{defectId:uid(),requestId:uid(),expectedStatus:'Open',status:'Resolved',notes:'test'}]]) {
      await deny(api[name](p,{}),'unauthenticated');
      await db.collection('users').doc(f.actor).update({employmentStatus:'Inactive'}); await deny(f.call(name,p),'permission-denied');
      await db.collection('users').doc(f.actor).update({employmentStatus:'Active'});
    }
  });
  run('manual history is idempotent and cannot duplicate an outstanding service',async()=>{
    const f=await fixture(), p={vehicleId:f.vehicleId,requestId:uid(),date:day,odometer:1000,serviceType:'Manual',cost:0,notes:'Actual work'};
    await f.call('addMaintenanceRecordAdmin',p); await f.call('addMaintenanceRecordAdmin',p);
    assert.equal((await db.collection('maintenanceRecords').where('vehicleId','==',f.vehicleId).get()).size,1);
    await f.call('dispatchServiceAdmin',f.dispatch); await deny(f.call('addMaintenanceRecordAdmin',{...p,requestId:uid()}));
  });
  run('real assignment callable rejects dispatched vehicle and permits released vehicle',async()=>{
    const f=await fixture(), driverId=uid(), shiftId=uid();
    await db.collection('users').doc(driverId).set({role:'driver',employmentStatus:'Active',isTestData:true,pinHash:await req('bcryptjs').hash('2468',4)});
    const login=await api.driverLogin({driverId,pin:'2468',deviceId:'synthetic'},{});
    await db.collection('shifts').doc(shiftId).set({driverId,status:'Active',vehicleId:uid()});
    const p={driverId,sessionToken:login.sessionToken,shiftId,vehicleId:f.vehicleId,startOdometer:1100,transitionReason:'VEHICLE_SWAP'};
    await f.call('dispatchServiceAdmin',f.dispatch); await deny(api.startVehicleAssignment(p,{}));
    await f.call('completeServiceAdmin',f.complete); await f.call('changeVehicleLifecycleAdmin',f.release);
    const result=await api.startVehicleAssignment(p,{}); assert.ok(result.assignmentId); await deny(f.call('dispatchServiceAdmin',{...f.dispatch,serviceId:uid()}));
  });
  run('concurrent pickup and dispatch cannot both succeed',async()=>{
    const f=await fixture(), driverId=uid(), shiftId=uid();
    await db.collection('users').doc(driverId).set({role:'driver',employmentStatus:'Active',isTestData:true,pinHash:await req('bcryptjs').hash('2468',4)});
    const login=await api.driverLogin({driverId,pin:'2468',deviceId:'synthetic'},{});
    await db.collection('shifts').doc(shiftId).set({driverId,status:'Active',vehicleId:uid()});
    const results=await Promise.allSettled([f.call('dispatchServiceAdmin',f.dispatch),api.startVehicleAssignment({driverId,sessionToken:login.sessionToken,shiftId,vehicleId:f.vehicleId,startOdometer:1000,transitionReason:'VEHICLE_SWAP'}, {})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  });
}
