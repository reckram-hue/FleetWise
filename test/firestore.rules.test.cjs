// Firestore rules unit-test harness for canonical firestore.rules.
// Run with the Firestore emulator, for example:
//   firebase emulators:exec --only firestore "node --test test/firestore.rules.test.cjs"

const { readFileSync } = require('fs');
const { describe, test, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const rules = readFileSync('firestore.rules', 'utf8');

describe('FleetWise canonical Firestore rules', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'fleetwise-rules-test',
      firestore: { rules },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await db.collection('users').doc('admin-active').set({
        role: 'admin',
        employmentStatus: 'Active',
      });
      await db.collection('users').doc('admin-inactive').set({
        role: 'admin',
        employmentStatus: 'Inactive',
      });
      // Mirrors a real production admin document that predates the employmentStatus
      // field. isAdmin() must deny it (fail closed) rather than erroring or allowing.
      await db.collection('users').doc('admin-no-status').set({
        role: 'admin',
      });
      await db.collection('users').doc('driver-uid').set({
        role: 'driver',
        employmentStatus: 'Active',
        pinHash: '$2b$10$redacted',
      });

      await db.collection('vehicles').doc('vehicle-1').set({
        registration: 'TEST-001',
        status: 'Active',
        vehicleType: 'ICE',
      });
      await db.collection('shifts').doc('shift-1').set({
        driverId: 'driver-uid',
        vehicleId: 'vehicle-1',
        status: 'Completed',
        startOdometer: 1000,
        endOdometer: 1100,
      });
      await db.collection('defects').doc('defect-1').set({
        vehicleId: 'vehicle-1',
        driverId: 'driver-uid',
        status: 'Open',
        isVisibleToDriver: true,
      });
      await db.collection('refuelRecords').doc('refuel-1').set({
        vehicleId: 'vehicle-1',
        litresFilled: 10,
      });
      await db.collection('chargeRecords').doc('charge-1').set({
        vehicleId: 'vehicle-1',
        kwhAdded: 20,
      });
      await db.collection('chargingLocations').doc('charging-location-1').set({
        name: 'HQ Basement Chargers',
        type: 'OFFICE',
        active: true,
        tariffMethod: 'FREE',
        costOwner: 'COMPANY',
      });
      await db.collection('chargingEvents').doc('charging-event-1').set({
        vehicleId: 'vehicle-1',
        lifecycleStatus: 'OPEN',
      });
      await db.collection('driverSessions').doc('session-1').set({
        isRevoked: false,
      });
      await db.collection('rateLimits').doc('limit-1').set({
        attempts: 1,
      });
      await db.collection('vehicleAssignments').doc('assignment-1').set({
        status: 'ACTIVE',
      });
      await db.collection('vehicleInspections').doc('inspection-1').set({
        status: 'PENDING',
      });
      await db.collection('odometerDiscrepancies').doc('disc-1').set({
        vehicleId: 'vehicle-1',
        driverId: 'driver-uid',
        expectedOdometer: 6300,
        actualPickupOdometer: 6350,
        unaccountedKm: 50,
        status: 'OPEN',
      });
      await db.collection('fw_health').doc('probe').set({
        ok: true,
      });
      await db.collection('costs').doc('cost-1').set({
        vehicleId: 'vehicle-1',
        cost: 100,
      });
      await db.collection('maintenanceRecords').doc('maintenance-1').set({
        vehicleId: 'vehicle-1',
      });
      await db.collection('scheduledServices').doc('service-1').set({
        vehicleId: 'vehicle-1',
      });
      await db.collection('driverFines').doc('fine-1').set({
        driverId: 'driver-uid',
        amount: 100,
      });
      await db.collection('vehicleDamages').doc('damage-1').set({
        driverId: 'driver-uid',
        vehicleId: 'vehicle-1',
      });
      await db.collection('serviceProviders').doc('provider-1').set({
        name: 'Provider',
      });
      await db.collection('settings').doc('settings-1').set({
        companyName: 'FleetWise',
      });
      await db.collection('fuelEconomyAlerts').doc('alert-1').set({
        vehicleId: 'vehicle-1',
      });
    });
  });

  const unauth = () => testEnv.unauthenticatedContext().firestore();
  const activeAdmin = () => testEnv.authenticatedContext('admin-active').firestore();
  const inactiveAdmin = () => testEnv.authenticatedContext('admin-inactive').firestore();
  const noStatusAdmin = () => testEnv.authenticatedContext('admin-no-status').firestore();
  const nonAdmin = () => testEnv.authenticatedContext('driver-uid').firestore();
  // A Firebase Auth user with no users/{uid} document at all.
  const orphanAuth = () => testEnv.authenticatedContext('no-such-user').firestore();

  test('A: unauthenticated read users -> DENY', async () => {
    await assertFails(unauth().collection('users').doc('driver-uid').get());
  });

  test('B: unauthenticated write users -> DENY', async () => {
    await assertFails(unauth().collection('users').doc('x').set({ role: 'driver' }));
  });

  test('C: authenticated non-admin read admin-only data -> DENY', async () => {
    await assertFails(nonAdmin().collection('costs').doc('cost-1').get());
  });

  test('D: authenticated non-admin write vehicles -> DENY', async () => {
    await assertFails(nonAdmin().collection('vehicles').doc('vehicle-1').update({ registration: 'HACK' }));
  });

  test('E: active admin read vehicles -> ALLOW', async () => {
    await assertSucceeds(activeAdmin().collection('vehicles').doc('vehicle-1').get());
  });

  test('F: active admin write vehicles -> ALLOW', async () => {
    await assertSucceeds(activeAdmin().collection('vehicles').doc('vehicle-1').update({ registration: 'UPDATED' }));
  });

  test('G: inactive admin read/write admin-only data -> DENY', async () => {
    await assertFails(inactiveAdmin().collection('vehicles').doc('vehicle-1').get());
    await assertFails(inactiveAdmin().collection('vehicles').doc('vehicle-1').update({ registration: 'NOPE' }));
  });

  test('H: driver custom session but no Firebase Auth direct-write shifts -> DENY', async () => {
    await assertFails(unauth().collection('shifts').doc('shift-2').set({ status: 'Active' }));
  });

  test('I: driver direct-write vehicleAssignments -> DENY', async () => {
    await assertFails(unauth().collection('vehicleAssignments').doc('assignment-2').set({ status: 'ACTIVE' }));
  });

  test('J: driver direct-write vehicleInspections -> DENY', async () => {
    await assertFails(unauth().collection('vehicleInspections').doc('inspection-2').set({ status: 'PENDING' }));
  });

  test('K: unauthenticated read shifts -> DENY', async () => {
    await assertFails(unauth().collection('shifts').doc('shift-1').get());
  });

  test('L: unauthenticated read defects -> DENY', async () => {
    await assertFails(unauth().collection('defects').doc('defect-1').get());
  });

  test('M: unauthenticated read refuelRecords -> DENY', async () => {
    await assertFails(unauth().collection('refuelRecords').doc('refuel-1').get());
  });

  test('N: unauthenticated read chargeRecords -> DENY', async () => {
    await assertFails(unauth().collection('chargeRecords').doc('charge-1').get());
  });

  test('O: unknown collection -> DENY', async () => {
    await assertFails(unauth().collection('unknownCollection').doc('x').get());
  });

  test('P: direct rateLimits read/write -> DENY', async () => {
    await assertFails(unauth().collection('rateLimits').doc('limit-1').get());
    await assertFails(activeAdmin().collection('rateLimits').doc('limit-1').set({ attempts: 2 }));
  });

  test('Q: admin defect update -> ALLOW', async () => {
    await assertSucceeds(activeAdmin().collection('defects').doc('defect-1').update({ status: 'Acknowledged' }));
  });

  test('R: non-admin defect update -> DENY', async () => {
    await assertFails(nonAdmin().collection('defects').doc('defect-1').update({ status: 'Resolved' }));
  });

  test('S: direct driverSessions read -> DENY', async () => {
    await assertFails(unauth().collection('driverSessions').doc('session-1').get());
    await assertFails(activeAdmin().collection('driverSessions').doc('session-1').get());
  });

  test('T: vehicle read policy is admin-only direct access', async () => {
    await assertFails(unauth().collection('vehicles').doc('vehicle-1').get());
    await assertFails(nonAdmin().collection('vehicles').doc('vehicle-1').get());
    await assertSucceeds(activeAdmin().collection('vehicles').doc('vehicle-1').get());
  });

  test('admin direct reads/writes remain available for operational collections', async () => {
    await assertSucceeds(activeAdmin().collection('shifts').doc('shift-1').get());
    await assertSucceeds(activeAdmin().collection('defects').doc('defect-1').get());
    await assertSucceeds(activeAdmin().collection('refuelRecords').doc('refuel-1').get());
    await assertSucceeds(activeAdmin().collection('chargeRecords').doc('charge-1').get());
    await assertSucceeds(activeAdmin().collection('costs').doc('cost-1').get());
    await assertSucceeds(activeAdmin().collection('maintenanceRecords').doc('maintenance-1').get());
    await assertSucceeds(activeAdmin().collection('scheduledServices').doc('service-1').get());
    await assertSucceeds(activeAdmin().collection('driverFines').doc('fine-1').get());
    await assertSucceeds(activeAdmin().collection('vehicleDamages').doc('damage-1').get());
    await assertSucceeds(activeAdmin().collection('serviceProviders').doc('provider-1').get());
    await assertSucceeds(activeAdmin().collection('settings').doc('settings-1').get());
    await assertSucceeds(activeAdmin().collection('fuelEconomyAlerts').doc('alert-1').get());
    await assertSucceeds(activeAdmin().collection('fw_health').doc('probe').set({ ok: true }));
  });

  test('direct users access remains fully blocked even for admins', async () => {
    await assertFails(activeAdmin().collection('users').doc('driver-uid').get());
    await assertFails(activeAdmin().collection('users').doc('driver-uid').update({ firstName: 'Nope' }));
  });

  // --- WP8I additions ---

  test('U: admin document missing employmentStatus -> DENY (fails closed)', async () => {
    await assertFails(noStatusAdmin().collection('vehicles').doc('vehicle-1').get());
    await assertFails(noStatusAdmin().collection('vehicles').doc('vehicle-1').update({ registration: 'NOPE' }));
    await assertFails(noStatusAdmin().collection('costs').doc('cost-1').get());
  });

  test('V: authenticated user with no users/{uid} document -> DENY', async () => {
    await assertFails(orphanAuth().collection('vehicles').doc('vehicle-1').get());
    await assertFails(orphanAuth().collection('costs').doc('cost-1').get());
  });

  test('W: refuel/charge records are admin-readable but write-denied for everyone', async () => {
    await assertSucceeds(activeAdmin().collection('refuelRecords').doc('refuel-1').get());
    await assertSucceeds(activeAdmin().collection('chargeRecords').doc('charge-1').get());
    // No live write path exists; writes are denied even to an active admin.
    await assertFails(activeAdmin().collection('refuelRecords').doc('refuel-2').set({ litresFilled: 5 }));
    await assertFails(activeAdmin().collection('chargeRecords').doc('charge-2').set({ kwhAdded: 5 }));
    await assertFails(activeAdmin().collection('refuelRecords').doc('refuel-1').update({ litresFilled: 99 }));
    await assertFails(unauth().collection('refuelRecords').doc('refuel-3').set({ litresFilled: 1 }));
  });

  test('X: shifts remain write-denied even for an active admin', async () => {
    await assertFails(activeAdmin().collection('shifts').doc('shift-1').update({ status: 'Active' }));
    await assertFails(activeAdmin().collection('shifts').doc('shift-2').set({ status: 'Active' }));
  });

  test('Y: defect direct create is denied even for an active admin', async () => {
    await assertFails(activeAdmin().collection('defects').doc('defect-2').set({ vehicleId: 'vehicle-1' }));
  });

  test('Z: server-only collections are denied to active admins too', async () => {
    await assertFails(activeAdmin().collection('vehicleAssignments').doc('assignment-1').get());
    await assertFails(activeAdmin().collection('vehicleInspections').doc('inspection-1').get());
    await assertFails(activeAdmin().collection('rateLimits').doc('limit-1').get());
    await assertFails(activeAdmin().collection('driverSessions').doc('session-1').get());
  });

  test('AA: inactive admin is denied across all operational collections', async () => {
    await assertFails(inactiveAdmin().collection('costs').doc('cost-1').get());
    await assertFails(inactiveAdmin().collection('shifts').doc('shift-1').get());
    await assertFails(inactiveAdmin().collection('defects').doc('defect-1').update({ status: 'Resolved' }));
    await assertFails(inactiveAdmin().collection('settings').doc('settings-1').get());
    await assertFails(inactiveAdmin().collection('fw_health').doc('probe').set({ ok: false }));
  });

  test('AB: odometerDiscrepancies is admin-readable and updateable, but direct create is denied', async () => {
    await assertSucceeds(activeAdmin().collection('odometerDiscrepancies').doc('disc-1').get());
    await assertSucceeds(activeAdmin().collection('odometerDiscrepancies').doc('disc-1').update({ status: 'RESOLVED' }));
    await assertFails(activeAdmin().collection('odometerDiscrepancies').doc('disc-2').set({ status: 'OPEN' }));
    await assertFails(nonAdmin().collection('odometerDiscrepancies').doc('disc-1').get());
    await assertFails(nonAdmin().collection('odometerDiscrepancies').doc('disc-1').update({ status: 'RESOLVED' }));
    await assertFails(unauth().collection('odometerDiscrepancies').doc('disc-1').get());
  });

  test('AC: unauthenticated chargingLocations read/write -> DENY', async () => {
    await assertFails(unauth().collection('chargingLocations').doc('charging-location-1').get());
    await assertFails(unauth().collection('chargingLocations').doc('charging-location-2').set({ name: 'Hack' }));
  });

  test('AD: non-admin direct chargingLocations read/write -> DENY', async () => {
    await assertFails(nonAdmin().collection('chargingLocations').doc('charging-location-1').get());
    await assertFails(nonAdmin().collection('chargingLocations').doc('charging-location-1').update({ active: false }));
  });

  test('AE: active admin direct chargingLocations access remains denied (callable-only)', async () => {
    await assertFails(activeAdmin().collection('chargingLocations').doc('charging-location-1').get());
    await assertFails(activeAdmin().collection('chargingLocations').doc('charging-location-1').update({ active: false }));
    await assertFails(activeAdmin().collection('chargingLocations').doc('charging-location-2').set({ name: 'HQ' }));
  });

  test('AF: chargingEvents are server-only for every client identity', async () => {
    await assertFails(unauth().collection('chargingEvents').doc('charging-event-1').get());
    await assertFails(nonAdmin().collection('chargingEvents').doc('charging-event-1').get());
    await assertFails(activeAdmin().collection('chargingEvents').doc('charging-event-1').get());
    await assertFails(unauth().collection('chargingEvents').doc('charging-event-2').set({ lifecycleStatus: 'OPEN' }));
    await assertFails(nonAdmin().collection('chargingEvents').doc('charging-event-2').set({ lifecycleStatus: 'OPEN' }));
    await assertFails(activeAdmin().collection('chargingEvents').doc('charging-event-2').set({ lifecycleStatus: 'OPEN' }));
  });
});
