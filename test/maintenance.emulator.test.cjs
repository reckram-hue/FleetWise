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
    const savedLifecycle = new Map();
    const call = async (name,p) => {
      // Existing workflow tests open a fresh review per call. Concurrency tests
      // below supply explicit snapshots and bypass this convenience entirely.
      if (name === 'changeVehicleLifecycleAdmin' && p.expectedLifecycleRevision === undefined) {
        const v = await get('vehicles',vehicleId);
        p = { ...p, ...(savedLifecycle.get(p.requestId) || { expectedLifecycleRevision:v.lifecycleRevision || 0, expectedHoldId:v.maintenanceHold?.id || null }) };
      }
      const result = await api[name](p,{ auth: { uid: actor } });
      if(name === 'changeVehicleLifecycleAdmin') savedLifecycle.set(p.requestId,{expectedLifecycleRevision:p.expectedLifecycleRevision,expectedHoldId:p.expectedHoldId});
      return result;
    };
    await call('saveScheduledServiceAdmin',booking);
    const dispatch = { serviceId, vehicleId, sentDate: day };
    const complete = { serviceId, vehicleId, returnDate: day, odometer: 1100, actualCost: 123.45, serviceNotes: 'Work inspected and complete', resolvedDefectIds: defectIds };
    const release = { vehicleId, requestId: uid(), status: 'Active', notes: 'Inspected for operational release', clearManualHold: false };
    return { vehicleId, actor, provider, serviceId, booking, dispatch, complete, release, call, defectIds };
  }
  const run = (name, fn) => test(`${backend}: ${name}`, fn);
  const review = async f => { const v=await get('vehicles',f.vehicleId); return {expectedLifecycleRevision:v.lifecycleRevision || 0,expectedHoldId:v.maintenanceHold?.id || null}; };
  run('legacy completed service cannot own unrelated Repairs; explicit current legacy confirmation is safe',async()=>{
    const f=await fixture({status:'Repairs',statusNotes:'New brake failure'});
    await db.collection('scheduledServices').doc(f.serviceId).update({sentForService:true,returnedFromService:true,sentDate:'2020-01-01',returnDate:'2020-01-02'});
    const context=await review(f);
    await deny(f.call('changeVehicleLifecycleAdmin',{...f.release,...context}));
    await deny(f.call('changeVehicleLifecycleAdmin',{...f.release,...context,releaseServiceId:f.serviceId,clearManualHold:true}));
    assert.equal((await get('vehicles',f.vehicleId)).status,'Repairs');
    await f.call('changeVehicleLifecycleAdmin',{...f.release,...context,clearManualHold:true});
    assert.equal((await get('vehicles',f.vehicleId)).status,'Active');
    assert.equal((await get('scheduledServices',f.serviceId)).releasedAt,undefined);
  });
  run('legacy dispatched work completes under an explicit manual hold and releases with confirmation',async()=>{
    const f=await fixture({status:'In Service'});
    await db.collection('scheduledServices').doc(f.serviceId).update({sentForService:true,sentDate:day});
    await f.call('completeServiceAdmin',f.complete);
    const v=await get('vehicles',f.vehicleId); assert.equal(v.maintenanceHold.source,'MANUAL');
    const p={...f.release,...await review(f),releaseServiceId:f.serviceId};
    await deny(f.call('changeVehicleLifecycleAdmin',p));
    await f.call('changeVehicleLifecycleAdmin',{...p,clearManualHold:true});
    assert.ok((await get('scheduledServices',f.serviceId)).releasedAt);
  });
  run('stale FIRST submission and stale hold creation reject; successful replay preserves a newer brake hold',async()=>{
    const f=await fixture();
    await f.call('changeVehicleLifecycleAdmin',{...f.release,...await review(f),status:'Repairs',notes:'Hold A'});
    const stale={...f.release,requestId:uid(),clearManualHold:true,...await review(f)};
    await f.call('changeVehicleLifecycleAdmin',{...stale,requestId:uid(),status:'Repairs',notes:'Hold B brakes'});
    await deny(f.call('changeVehicleLifecycleAdmin',stale));
    await deny(f.call('changeVehicleLifecycleAdmin',{...stale,requestId:uid(),status:'In Service'}));
    assert.equal((await get('vehicles',f.vehicleId)).maintenanceHold.reason,'Hold B brakes');
    const current={...stale,requestId:uid(),...await review(f)};
    await f.call('changeVehicleLifecycleAdmin',current);
    await f.call('changeVehicleLifecycleAdmin',{...current,requestId:uid(),...await review(f),status:'Repairs',notes:'Hold C'});
    await f.call('changeVehicleLifecycleAdmin',current);
    assert.equal((await get('vehicles',f.vehicleId)).maintenanceHold.reason,'Hold C');
    const {expectedHoldId,expectedLifecycleRevision,...missing}=current;
    await deny(api.changeVehicleLifecycleAdmin({...missing,expectedHoldId:null},{auth:{uid:f.actor}}),'invalid-argument');
  });
  run('old service release cannot clear a newer authoritative hold even with refreshed context',async()=>{
    const f=await fixture(); await f.call('dispatchServiceAdmin',f.dispatch); await f.call('completeServiceAdmin',f.complete);
    await f.call('changeVehicleLifecycleAdmin',{...f.release,status:'Repairs',notes:'New brake hold'});
    await deny(f.call('changeVehicleLifecycleAdmin',{...f.release,requestId:uid(),...await review(f),releaseServiceId:f.serviceId,clearManualHold:true}));
    assert.equal((await get('vehicles',f.vehicleId)).status,'Repairs');
  });
  run('same-hold dispatch/completion invalidate review; concurrent replacement and release have one winner',async()=>{
    const f=await fixture();await f.call('dispatchServiceAdmin',f.dispatch);await f.call('completeServiceAdmin',f.complete);
    const stale={...f.release,...await review(f)};
    const second={...f.booking,serviceId:uid()};await f.call('saveScheduledServiceAdmin',second);
    await f.call('dispatchServiceAdmin',{...f.dispatch,serviceId:second.serviceId});
    await f.call('completeServiceAdmin',{...f.complete,serviceId:second.serviceId});
    assert.equal((await get('vehicles',f.vehicleId)).maintenanceHold.id,stale.expectedHoldId);
    await deny(f.call('changeVehicleLifecycleAdmin',stale));
    const current={...stale,...await review(f)};
    const results=await Promise.allSettled([f.call('changeVehicleLifecycleAdmin',current),f.call('changeVehicleLifecycleAdmin',{...current,requestId:uid(),status:'Repairs',notes:'Concurrent brake hold'})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await get('vehicles',f.vehicleId)).status,results[0].status==='fulfilled'?'Active':'Repairs');
  });
  for(const [sourceUrgency,targetUrgency] of [['Critical','Low'],['Critical','Critical'],['Low','Low']]) run(`duplicate ${sourceUrgency} to ${targetUrgency} keeps effective original and evidence`,async()=>{
    const f=await fixture(); await f.call('dispatchServiceAdmin',f.dispatch); await f.call('completeServiceAdmin',f.complete);
    const source=uid(),target=uid();
    for(const [id,urgency] of [[source,sourceUrgency],[target,targetUrgency]]) await db.collection('defects').doc(id).set({vehicleId:f.vehicleId,status:'Open',urgency,photos:['original'],description:'Unchanged TEST evidence'});
    await f.call('transitionDefectAdmin',{defectId:source,requestId:uid(),expectedStatus:'Open',status:'Duplicate',duplicateOf:target,notes:'Same issue'});
    const d=await get('defects',source); assert.equal(d.urgency,sourceUrgency);assert.deepEqual(d.photos,['original']);assert.equal(d.duplicateOf,target);
    assert.equal((await db.collection('defects').where('vehicleId','==',f.vehicleId).get()).docs.filter(d=>d.data().status==='Open').length,1);
    if(sourceUrgency==='Critical') await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    await deny(f.call('transitionDefectAdmin',{defectId:source,requestId:uid(),expectedStatus:'Duplicate',status:'Resolved',notes:'Cannot erase propagated severity'}));
    await f.call('transitionDefectAdmin',{defectId:target,requestId:uid(),expectedStatus:'Open',status:'Resolved',notes:'Effective issue repaired'});
    await f.call('changeVehicleLifecycleAdmin',f.release);
    assert.equal((await get('vehicles',f.vehicleId)).status,'Active');
  });
  run('duplicate chains retain Critical severity; cycles/missing originals fail closed; reopening restores an independent blocker',async()=>{
    const f=await fixture();await f.call('dispatchServiceAdmin',f.dispatch);await f.call('completeServiceAdmin',f.complete);
    const a=uid(),b=uid(),c=uid();for(const [id,urgency] of [[a,'Critical'],[b,'Low'],[c,'Low']]) await db.collection('defects').doc(id).set({vehicleId:f.vehicleId,status:'Open',urgency});
    const duplicate=(id,target)=>f.call('transitionDefectAdmin',{defectId:id,requestId:uid(),expectedStatus:'Open',status:'Duplicate',duplicateOf:target,notes:'Same reported condition'});
    await duplicate(a,b);await duplicate(b,c);await deny(duplicate(c,a));await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    await db.collection('defects').doc(c).update({status:'Duplicate',duplicateOf:a});await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    await db.collection('defects').doc(c).update({status:'Duplicate',duplicateOf:uid()});await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    await db.collection('defects').doc(c).update({status:'Resolved',duplicateOf:FieldValue.delete()});
    await f.call('transitionDefectAdmin',{defectId:a,requestId:uid(),expectedStatus:'Duplicate',status:'Open',notes:'Independent safety issue after repair'});
    await deny(f.call('changeVehicleLifecycleAdmin',f.release));
    await f.call('transitionDefectAdmin',{defectId:a,requestId:uid(),expectedStatus:'Open',status:'Resolved',notes:'Independent repair verified'});
    await f.call('changeVehicleLifecycleAdmin',f.release);
  });
  run('dated historical maintenance inserts between evidence without changing current or newer service state',async()=>{
    const f=await fixture({currentOdometer:1500,lastServiceOdometer:1400,lastServiceDate:'2025-06-01'});
    await db.collection('refuelRecords').doc(uid()).set({vehicleId:f.vehicleId,date:Timestamp.fromDate(new Date('2025-01-01T10:00:00Z')),odometer:900});
    await db.collection('maintenanceRecords').doc(uid()).set({vehicleId:f.vehicleId,date:'2025-06-01',odometer:1400});
    const p={vehicleId:f.vehicleId,requestId:uid(),date:'2025-03-01',odometer:1000,serviceType:'Backdated service',cost:0,notes:'Actual historic invoice'};
    for(const patch of [{odometer:800},{odometer:1450},{date:'2099-01-01'}]) await deny(f.call('addMaintenanceRecordAdmin',{...p,...patch}));
    await f.call('addMaintenanceRecordAdmin',p);await f.call('addMaintenanceRecordAdmin',p);
    const v=await get('vehicles',f.vehicleId);assert.equal(v.currentOdometer,1500);assert.equal(v.lastServiceOdometer,1400);assert.equal(v.lastServiceDate,'2025-06-01');
    const history=await db.collection('maintenanceRecords').where('vehicleId','==',f.vehicleId).get();assert.equal(history.size,2);assert.ok(history.docs.some(d=>d.data().date===p.date&&d.data().odometer===1000));
  });
  run('historical chronology handles unknown dates, same-day ambiguity and dated last-service advancement conservatively',async()=>{
    const f=await fixture({currentOdometer:1500,lastServiceOdometer:900,lastServiceDate:'2024-01-01'});
    const p={vehicleId:f.vehicleId,requestId:uid(),date:'2025-01-01',odometer:1000,serviceType:'Historical',cost:10,notes:'Verified invoice'};
    const unknown=db.collection('refuelRecords').doc(uid());await unknown.set({vehicleId:f.vehicleId,odometer:1100});await deny(f.call('addMaintenanceRecordAdmin',p));
    await unknown.update({date:'2025-01-01'});await f.call('addMaintenanceRecordAdmin',p);
    let v=await get('vehicles',f.vehicleId);assert.equal(v.currentOdometer,1500);assert.equal(v.lastServiceOdometer,1000);assert.equal(v.lastServiceDate,p.date);
    await f.call('addMaintenanceRecordAdmin',{...p,requestId:uid(),odometer:1050});v=await get('vehicles',f.vehicleId);assert.equal(v.lastServiceOdometer,1000);
    const legacy=await fixture({currentOdometer:1500,lastServiceOdometer:900});
    await f.call('addMaintenanceRecordAdmin',{...p,vehicleId:legacy.vehicleId,requestId:uid()});assert.equal((await get('vehicles',legacy.vehicleId)).lastServiceOdometer,900);
  });
  run('dated service baseline constrains historical inserts without canonical history; charging boundaries retain their dates',async()=>{
    const f=await fixture({currentOdometer:1500,lastServiceOdometer:1200,lastServiceDate:'2025-03-01'});
    const p={vehicleId:f.vehicleId,requestId:uid(),date:'2025-04-01',odometer:1000,serviceType:'Historical',cost:0,notes:'TEST invoice'};
    await deny(f.call('addMaintenanceRecordAdmin',p));
    await deny(f.call('addMaintenanceRecordAdmin',{...p,date:'2025-02-01',odometer:1300}));
    await db.collection('chargingEvents').doc(uid()).set({vehicleId:f.vehicleId,lifecycleStatus:'CLOSED',returnedAt:Timestamp.fromDate(new Date('2025-01-01T10:00:00Z')),returnOdometer:900,closedAt:Timestamp.fromDate(new Date('2025-01-03T10:00:00Z')),pickupOdometer:900});
    await deny(f.call('addMaintenanceRecordAdmin',{...p,date:'2025-01-02',odometer:1000}));
    await f.call('addMaintenanceRecordAdmin',{...p,date:'2025-02-01',odometer:1000});
    const v=await get('vehicles',f.vehicleId);assert.equal(v.currentOdometer,1500);assert.equal(v.lastServiceOdometer,1200);
  });
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
