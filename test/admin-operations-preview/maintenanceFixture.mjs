import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const backendRequire = createRequire(new URL('../../functions-prod-jhb/package.json', import.meta.url));

// Opt-in, loopback-only real Firestore fixture. Never selects a live Firebase project.
export function maintenanceFixture() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) return { name: 'maintenance-fixture-disabled' };
  if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw Error('Local emulator required');
  const { Firestore, Timestamp } = backendRequire('firebase-admin/firestore');
  const { createMaintenanceHandlers } = require('../../functions-prod-jhb/lib/maintenance.js');
  const { requireActiveAdmin } = require('../../functions-prod-jhb/lib/adminAuthorization.js');
  const db = new Firestore({ projectId: 'demo-fleetwise-maintenance-preview' });
  const vehicleId = 'preview-maintenance-vehicle', actor = 'preview-maintenance-admin', serviceId = 'preview-maintenance-service';
  const collection = async (name, query = db.collection(name)) => (await query.get()).docs.map(d => ({ ...d.data(), id: d.id }));
  const handlers = createMaintenanceHandlers({ db, requireAdmin: context => requireActiveAdmin(context.auth, uid => db.collection('users').doc(uid).get()) });
  const ready = (async () => {
    if ((await db.collection('vehicles').doc(vehicleId).get()).exists) return;
    const day = new Date().toISOString().slice(0,10);
    await db.collection('users').doc(actor).set({ role: 'admin', employmentStatus: 'Active' });
    await db.collection('vehicles').doc(vehicleId).set({ registration: 'TEST MAINTENANCE', make: 'Synthetic', model: 'ICE', vehicleType: 'ICE', status: 'Active', currentOdometer: 1000, lastServiceOdometer: 900, isTestData: true });
    await db.collection('serviceProviders').doc('preview-workshop').set({ name: 'Synthetic Workshop', isActive: true, specializations: ['General'] });
    await db.collection('defects').doc('preview-linked-defect').set({ vehicleId, status: 'Open', urgency: 'Low', description: 'Synthetic service-linked fault', reportedDateTime: Timestamp.now(), isVisibleToDriver: true, isTestData: true });
    await handlers.saveScheduledServiceAdmin({ serviceId, vehicleId, serviceType: 'Scheduled synthetic repair', dueDate: day, dueOdometer: 2000,
      bookedDate: day, bookedTime: '09:00', serviceProviderId: 'preview-workshop', linkedDefectIds: ['preview-linked-defect'] }, { auth: { uid: actor } });
  })();
  return { name: 'real-emulator-maintenance-fixture', configureServer(server) {
    server.middlewares.use('/__fixture/maintenance', async (req,res) => {
      res.setHeader('Content-Type','application/json');
      try {
        await ready;
        let body=''; for await (const chunk of req) body+=chunk;
        const { method, args=[] }=JSON.parse(body || '{}');
        let value;
        if (handlers[method]) value=await handlers[method](args[0],{auth:{uid:actor}});
        else if (method==='getVehicles') value=await collection('vehicles');
        else if (method==='getVehicle') { const d=await db.collection('vehicles').doc(args[0]).get(); value={...d.data(),id:d.id}; }
        else if (method==='getScheduledServices') value=await collection('scheduledServices');
        else if (method==='getAllDefects' || method==='getActiveDefects') value=await collection('defects');
        else if (method==='getServiceProviders') value=await collection('serviceProviders');
        else if (method==='getMaintenanceRecords') value=await collection('maintenanceRecords',db.collection('maintenanceRecords').where('vehicleId','==',args[0]));
        else if (method==='addMaintenanceRecord') value=await handlers.addMaintenanceRecordAdmin({...args[0],requestId:args[1]},{auth:{uid:actor}});
        else throw Error('Unsupported synthetic operation');
        res.end(JSON.stringify(value));
      } catch(e) { res.statusCode=400;res.end(JSON.stringify({error:e.message})); }
    });
  } };
}
