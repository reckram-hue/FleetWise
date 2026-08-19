// Firestore rules unit-test harness (proposed rules).
// RUN NOTE: requires Java, the Firestore emulator, and the npm package
// '@firebase/rules-unit-testing'. This file is authored but was NOT executed in the
// audit sandbox (no Java, no test package, network blocked for install/emulator).
//
//   npm install --save-dev @firebase/rules-unit-testing
//   firebase emulators:exec --only firestore "node test/firestore.rules.test.js"
const { readFileSync } = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const rules = readFileSync('firestore.rules.proposed', 'utf8');

describe('FleetWise proposed Firestore rules', () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'fleetwise-rules-test',
      firestore: { rules },
    });
  });

  afterAll(async () => { await testEnv.cleanup(); });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // Seed an admin identity (rules-internal get() reads users/{uid}.data.role).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('admin-uid').set({ role: 'admin' });
      await ctx.firestore().collection('users').doc('driver-uid').set({ role: 'driver', pinHash: '$2a$10$XXXX', employmentStatus: 'Active' });
      await ctx.firestore().collection('vehicles').doc('v1').set({ registration: 'TEST' });
      await ctx.firestore().collection('shifts').doc('s1').set({ driverId: 'd1', vehicleId: 'v1', status: 'Active' });
      await ctx.firestore().collection('defects').doc('d1').set({ vehicleId: 'v1', driverId: 'driver-uid', status: 'Open', isVisibleToDriver: true });
    });
  });

  const unauth = () => testEnv.unauthenticatedContext().firestore();
  const admin = () => testEnv.authenticatedContext('admin-uid').firestore();
  const nonAdmin = () => testEnv.authenticatedContext('random-uid').firestore();

  // ==================== UNAUTHENTICATED / PIN-DRIVER ====================
  // (request.auth == null for both unauthenticated browsers and PIN-authenticated drivers)

  test('unauthenticated cannot read users (pinHash protection)', async () => {
    await assertFails(unauth().collection('users').doc('driver-uid').get());
  });

  test('unauthenticated cannot list users collection', async () => {
    await assertFails(unauth().collection('users').get());
  });

  test('unauthenticated cannot create a user', async () => {
    await assertFails(unauth().collection('users').add({ firstName: 'Test', role: 'driver' }));
  });

  test('unauthenticated cannot update a user', async () => {
    await assertFails(unauth().collection('users').doc('driver-uid').update({ firstName: 'Hacked' }));
  });

  test('unauthenticated cannot create a shift', async () => {
    await assertFails(unauth().collection('shifts').add({ driverId: 'd1', vehicleId: 'v1', status: 'Active' }));
  });

  test('unauthenticated cannot write defects directly', async () => {
    await assertFails(unauth().collection('defects').add({ description: 'x' }));
  });

  test('unauthenticated cannot read rateLimits', async () => {
    await assertFails(unauth().collection('rateLimits').doc('x').get());
  });

  test('unauthenticated cannot access unknown collection', async () => {
    await assertFails(unauth().collection('does_not_exist').doc('x').get());
  });

  test('unauthenticated CAN read public fleet data (vehicles, shifts)', async () => {
    await assertSucceeds(unauth().collection('vehicles').doc('v1').get());
    await assertSucceeds(unauth().collection('shifts').doc('s1').get());
  });

  test('unauthenticated CAN read defects (driver visibility)', async () => {
    await assertSucceeds(unauth().collection('defects').doc('d1').get());
  });

  test('unauthenticated cannot write refuelRecords or chargeRecords', async () => {
    await assertFails(unauth().collection('refuelRecords').add({ vehicleId: 'v1' }));
    await assertFails(unauth().collection('chargeRecords').add({ vehicleId: 'v1' }));
  });

  // ==================== ADMIN ====================

  test('admin cannot read users directly (Cloud Function only)', async () => {
    // Even admin reads of users are blocked — all user operations go through callables
    await assertFails(admin().collection('users').doc('driver-uid').get());
  });

  test('admin cannot write users directly (Cloud Function only)', async () => {
    await assertFails(admin().collection('users').doc('driver-uid').update({ firstName: 'Admin Edit' }));
    await assertFails(admin().collection('users').add({ firstName: 'New', role: 'driver' }));
  });

  test('admin can write vehicles', async () => {
    await assertSucceeds(admin().collection('vehicles').doc('v9').set({ registration: 'NEW' }));
  });

  test('admin can update vehicles', async () => {
    await assertSucceeds(admin().collection('vehicles').doc('v1').update({ registration: 'UPDATED' }));
  });

  test('admin can delete vehicles', async () => {
    await assertSucceeds(admin().collection('vehicles').doc('v1').delete());
  });

  test('admin can write costs', async () => {
    await assertSucceeds(admin().collection('costs').add({ vehicleId: 'v1', cost: 10, date: new Date(), category: 'Fuel', description: 'x' }));
  });

  test('admin cannot write shifts directly (Cloud Function owns)', async () => {
    await assertFails(admin().collection('shifts').add({ driverId: 'd1', vehicleId: 'v1', status: 'Active' }));
    await assertFails(admin().collection('shifts').doc('s1').update({ status: 'Completed' }));
  });

  test('admin cannot create defects directly (Cloud Function owns)', async () => {
    await assertFails(admin().collection('defects').add({ description: 'Admin created', vehicleId: 'v1' }));
  });

  test('admin can update defects (status changes, assignment)', async () => {
    await assertSucceeds(admin().collection('defects').doc('d1').update({ status: 'Acknowledged' }));
  });

  test('admin can delete defects', async () => {
    await assertSucceeds(admin().collection('defects').doc('d1').delete());
  });

  test('admin can write operational collections', async () => {
    await assertSucceeds(admin().collection('maintenanceRecords').add({ vehicleId: 'v1' }));
    await assertSucceeds(admin().collection('scheduledServices').add({ vehicleId: 'v1' }));
    await assertSucceeds(admin().collection('driverFines').add({ driverId: 'd1' }));
    await assertSucceeds(admin().collection('vehicleDamages').add({ vehicleId: 'v1' }));
    await assertSucceeds(admin().collection('serviceProviders').add({ name: 'Test' }));
    await assertSucceeds(admin().collection('settings').add({ companyName: 'Test' }));
  });

  test('admin cannot write rateLimits (server-only)', async () => {
    await assertFails(admin().collection('rateLimits').doc('x').set({ attempts: 1 }));
  });

  test('admin can read/write fuelEconomyAlerts', async () => {
    await assertSucceeds(admin().collection('fuelEconomyAlerts').add({ vehicleId: 'v1', alertType: 'excess' }));
  });

  test('admin can read/write fw_health', async () => {
    await assertSucceeds(admin().collection('fw_health').doc('status').set({ ok: true }));
  });

  // ==================== NON-ADMIN AUTHENTICATED USER ====================

  test('non-admin authenticated user cannot read users', async () => {
    await assertFails(nonAdmin().collection('users').doc('driver-uid').get());
  });

  test('non-admin authenticated user cannot write vehicles', async () => {
    await assertFails(nonAdmin().collection('vehicles').doc('v9').set({ registration: 'HACK' }));
  });

  test('non-admin authenticated user cannot write operational collections', async () => {
    await assertFails(nonAdmin().collection('costs').add({ vehicleId: 'v1', cost: 999 }));
    await assertFails(nonAdmin().collection('settings').add({ companyName: 'Hack' }));
  });

  test('non-admin authenticated user cannot read admin-only operational collections', async () => {
    await assertFails(nonAdmin().collection('costs').get());
    await assertFails(nonAdmin().collection('maintenanceRecords').get());
    await assertFails(nonAdmin().collection('driverFines').get());
    await assertFails(nonAdmin().collection('fuelEconomyAlerts').get());
    await assertFails(nonAdmin().collection('fw_health').get());
  });

  test('non-admin authenticated user CAN read public data', async () => {
    await assertSucceeds(nonAdmin().collection('vehicles').doc('v1').get());
    await assertSucceeds(nonAdmin().collection('shifts').doc('s1').get());
    await assertSucceeds(nonAdmin().collection('defects').doc('d1').get());
  });

  // ==================== UNAUTHENTICATED — OPERATIONAL COLLECTIONS ====================

  test('unauthenticated cannot read admin-only operational collections', async () => {
    await assertFails(unauth().collection('costs').get());
    await assertFails(unauth().collection('maintenanceRecords').get());
    await assertFails(unauth().collection('scheduledServices').get());
    await assertFails(unauth().collection('driverFines').get());
    await assertFails(unauth().collection('vehicleDamages').get());
    await assertFails(unauth().collection('serviceProviders').get());
    await assertFails(unauth().collection('settings').get());
    await assertFails(unauth().collection('fuelEconomyAlerts').get());
    await assertFails(unauth().collection('fw_health').get());
  });
});
