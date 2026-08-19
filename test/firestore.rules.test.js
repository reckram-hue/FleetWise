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
      await ctx.firestore().collection('vehicles').doc('v1').set({ registration: 'TEST' });
      await ctx.firestore().collection('shifts').doc('s1').set({ driverId: 'd1', vehicleId: 'v1', status: 'Active' });
    });
  });

  const unauth = () => testEnv.unauthenticatedContext().firestore();
  const admin = () => testEnv.authenticatedContext('admin-uid').firestore();

  // UNAUTHENTICATED / PIN-driver (request.auth == null in both cases)
  test('unauthenticated cannot read users (pinHash protection)', async () => {
    await assertFails(unauth().collection('users').doc('driver1').get());
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

  // ADMIN
  test('admin can write vehicles', async () => {
    await assertSucceeds(admin().collection('vehicles').doc('v9').set({ registration: 'NEW' }));
  });
  test('admin can write costs', async () => {
    await assertSucceeds(admin().collection('costs').add({ vehicleId: 'v1', cost: 10, date: new Date(), category: 'Fuel', description: 'x' }));
  });
  test('admin cannot write shifts directly (Cloud Function owns)', async () => {
    await assertFails(admin().collection('shifts').add({ driverId: 'd1', vehicleId: 'v1', status: 'Active' }));
    await assertFails(admin().collection('shifts').doc('s1').update({ status: 'Completed' }));
  });
  test('admin cannot write rateLimits (server-only)', async () => {
    await assertFails(admin().collection('rateLimits').doc('x').set({ attempts: 1 }));
  });
});
