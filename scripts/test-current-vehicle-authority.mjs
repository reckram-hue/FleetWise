// WP8B — Focused tests for current-vehicle authority after a mid-shift vehicle swap.
// Runs against the DEPLOYED functions in fleetwise-9ab3a (us-central1).
// Uses ONLY the clearly-marked Test Test driver + TEST EV/TEST ICE vehicles
// (isTestData === true). Never touches a real driver. Never prints the PIN,
// sessionToken, or pinHash — the sessionToken lives only in memory for this run.
//
// Scenarios 5 (client cannot report a defect for TEST EV while the active assignment is
// TEST ICE) requires the WP8B backend fix to reportDefectWithSession (server-side vehicle
// ownership check) to be DEPLOYED. If run before that deploy, scenario 5 will legitimately
// FAIL — that failure demonstrates the pre-fix vulnerability, not a bug in this script.
//
// Run from the repo root:  node scripts/test-current-vehicle-authority.mjs

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const RESULTS = [];
function record(name, ok, detail = '') {
  RESULTS.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
}
function die(msg) { console.error('STOP — ' + msg); process.exit(1); }

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
for (const k of required) { if (!env[k]) die('Missing ' + k + ' in .env'); }

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const functions = getFunctions(app);
const db = getFirestore(app);
const CLEANUP_ONLY = process.argv.includes('--cleanup-only');
const EMULATOR_MODE = process.argv.includes('--emulator');

const WP8B = Object.freeze({
  driverId: '3MBpEbymKURd7sKQURpk',
  shiftId: 'BGf8IVzifr5Iy6GCp76h',
  assignmentId: 'ORSOLbl7yd9NnQkuxtLR',
  testEvId: 'CHFLNpC1lmVWMMkOdGRx',
  testIceId: 'VZExr8elHqnoGaud6huU',
  deviceId: 'wp8b-authority-test-harness',
});

async function call(name, data) {
  const fn = httpsCallable(functions, name);
  const r = await fn(data);
  return r.data;
}
function norm(s) { return String(s ?? '').trim().toLowerCase(); }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

async function expectInvalidArgument(name, operation) {
  try {
    await operation();
    record(name, false, 'call unexpectedly succeeded');
    return false;
  } catch (e) {
    const code = String(e?.code || e?.details?.code || '');
    const rejected = code.includes('invalid-argument');
    record(name, rejected, code || e?.message || String(e));
    return rejected;
  }
}

/**
 * WP C/WP D regression mode deliberately uses an isolated Firestore emulator. It does not prompt
 * for a PIN or call production: the test session is a locally seeded opaque session.
 */
async function runWpCEmulatorRegression() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('--emulator requires FIRESTORE_EMULATOR_HOST. Run it via firebase emulators:exec.');
  }

  const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
  const callables = functionsRequire('./lib/index.js');
  const admin = functionsRequire('firebase-admin');
  const adminDb = admin.firestore();
  const fixtureShiftId = 'wpc-regression-shift';
  const fixtureSessionToken = 'wpc-regression-session-token';
  const fixtureSessionId = createHash('sha256').update(fixtureSessionToken).digest('hex');
  const createdAssignmentIds = new Set();
  const createdChargingEventIds = new Set();
  const activeLocationId = 'wpd-active-public-location';
  const inactiveLocationId = 'wpd-inactive-location';
  const auth = { driverId: WP8B.driverId, sessionToken: fixtureSessionToken };

  const callLocal = async (name, data) => {
    const callable = callables[name];
    if (!callable?.run) throw new Error(`Local callable ${name} is unavailable.`);
    return callable.run(data, {});
  };

  const expectLocalInvalidArgument = async (name, operation) => {
    try {
      await operation();
      record(name, false, 'call unexpectedly succeeded');
      return false;
    } catch (error) {
      const code = String(error?.code || '');
      const rejected = code.includes('invalid-argument');
      record(name, rejected, code || error?.message || String(error));
      return rejected;
    }
  };

  const expectLocalFailure = async (name, expectedCode, operation) => {
    try {
      await operation();
      record(name, false, 'call unexpectedly succeeded');
      return false;
    } catch (error) {
      const code = String(error?.code || '');
      const rejected = code.includes(expectedCode);
      record(name, rejected, code || error?.message || String(error));
      return rejected;
    }
  };

  const addCompletedInspections = async (assignmentId, vehicleId) => {
    const base = { driverId: WP8B.driverId, shiftId: fixtureShiftId, vehicleId, status: 'COMPLETED' };
    const batch = adminDb.batch();
    batch.set(adminDb.collection('vehicleInspections').doc(`${assignmentId}_PICKUP`), { ...base, boundaryType: 'PICKUP' });
    batch.set(adminDb.collection('vehicleInspections').doc(`${assignmentId}_RETURN`), { ...base, boundaryType: 'RETURN' });
    await batch.commit();
  };

  const startEvAssignment = async (startOdometer) => {
    const result = await callLocal('startVehicleAssignment', {
      ...auth, shiftId: fixtureShiftId, vehicleId: WP8B.testEvId, startOdometer,
      startChargePercent: 80, startPredictedRangeKm: 300, transitionReason: 'VEHICLE_SWAP',
    });
    createdAssignmentIds.add(result.assignmentId);
    await addCompletedInspections(result.assignmentId, WP8B.testEvId);
    return result.assignmentId;
  };

  const cleanupFixtures = async () => {
    const refs = [
      adminDb.collection('users').doc(WP8B.driverId),
      adminDb.collection('driverSessions').doc(fixtureSessionId),
      adminDb.collection('shifts').doc(fixtureShiftId),
      adminDb.collection('vehicles').doc(WP8B.testEvId),
      adminDb.collection('vehicles').doc(WP8B.testIceId),
      adminDb.collection('chargingLocations').doc(activeLocationId),
      adminDb.collection('chargingLocations').doc(inactiveLocationId),
      ...[...createdChargingEventIds].map((eventId) => adminDb.collection('chargingEvents').doc(eventId)),
      ...[...createdAssignmentIds].flatMap((assignmentId) => [
        adminDb.collection('vehicleAssignments').doc(assignmentId),
        adminDb.collection('vehicleInspections').doc(`${assignmentId}_PICKUP`),
        adminDb.collection('vehicleInspections').doc(`${assignmentId}_RETURN`),
      ]),
    ];
    await Promise.all(refs.map((ref) => ref.delete()));
    const remaining = await Promise.all(refs.map((ref) => ref.get()));
    record('WP C emulator fixtures cleaned up', remaining.every((snapshot) => !snapshot.exists));
  };

  const future = admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  const now = admin.firestore.Timestamp.now();
  const seed = adminDb.batch();
  seed.set(adminDb.collection('users').doc(WP8B.driverId), {
    firstName: 'Test', surname: 'Test', role: 'driver', employmentStatus: 'Active', isTestData: true, orgId: 'default',
  });
  seed.set(adminDb.collection('driverSessions').doc(fixtureSessionId), {
    driverId: WP8B.driverId, orgId: 'default', deviceId: 'wpc-emulator-test', isRevoked: false,
    createdAt: now, lastSeenAt: now, expiresAt: future,
  });
  seed.set(adminDb.collection('shifts').doc(fixtureShiftId), {
    driverId: WP8B.driverId, status: 'Active', startOdometer: 1000,
  });
  seed.set(adminDb.collection('vehicles').doc(WP8B.testEvId), {
    registration: 'TEST EV', vehicleType: 'EV', status: 'Active', currentOdometer: 1000, isTestData: true,
  });
  seed.set(adminDb.collection('vehicles').doc(WP8B.testIceId), {
    registration: 'TEST ICE', vehicleType: 'ICE', status: 'Active', currentOdometer: 2000, isTestData: true,
  });
  seed.set(adminDb.collection('chargingLocations').doc(activeLocationId), {
    orgId: 'default', name: 'Public Test Charger', type: 'PUBLIC_THIRD_PARTY', active: true,
    provider: 'Test Charge Co', chargerType: 'CCS', tariffMethod: 'PER_KWH', tariffRate: 3.5, costOwner: 'DRIVER',
  });
  seed.set(adminDb.collection('chargingLocations').doc(inactiveLocationId), {
    orgId: 'default', name: 'Inactive Test Charger', type: 'OFFICE', active: false,
    tariffMethod: 'FREE', costOwner: 'COMPANY',
  });
  await seed.commit();

  try {
    await expectLocalInvalidArgument('WP C lower EV pickup odometer rejected', () => callLocal('startVehicleAssignment', {
      ...auth, shiftId: fixtureShiftId, vehicleId: WP8B.testEvId, startOdometer: 999,
      startChargePercent: 80, startPredictedRangeKm: 300, transitionReason: 'SHIFT_START',
    }));
    const failedPickupAssignments = await adminDb.collection('vehicleAssignments').where('shiftId', '==', fixtureShiftId).get();
    record('WP C lower-odometer pickup created no assignment', failedPickupAssignments.empty);

    await expectLocalInvalidArgument('WP C EV pickup without predicted range rejected', () => callLocal('startVehicleAssignment', {
      ...auth, shiftId: fixtureShiftId, vehicleId: WP8B.testEvId, startOdometer: 1000,
      startChargePercent: 80, transitionReason: 'SHIFT_START',
    }));
    const evStart = await callLocal('startVehicleAssignment', {
      ...auth, shiftId: fixtureShiftId, vehicleId: WP8B.testEvId, startOdometer: 1000,
      startChargePercent: 80, startPredictedRangeKm: 300, transitionReason: 'SHIFT_START',
    });
    createdAssignmentIds.add(evStart.assignmentId);
    record('WP C EV pickup predicted range persisted',
      (await adminDb.collection('vehicleAssignments').doc(evStart.assignmentId).get()).data()?.startPredictedRangeKm === 300);

    await addCompletedInspections(evStart.assignmentId, WP8B.testEvId);
    await expectLocalInvalidArgument('WP C EV return without predicted range rejected', () => callLocal('endVehicleAssignment', {
      ...auth, assignmentId: evStart.assignmentId, endOdometer: 1010, endChargePercent: 70, transitionReason: 'VEHICLE_SWAP',
    }));
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: evStart.assignmentId, endOdometer: 1010, endChargePercent: 70,
      endPredictedRangeKm: 250, leftForCharging: false, transitionReason: 'VEHICLE_SWAP',
    });
    record('WP C EV return predicted range persisted',
      (await adminDb.collection('vehicleAssignments').doc(evStart.assignmentId).get()).data()?.endPredictedRangeKm === 250);
    const chargingEvents = await adminDb.collection('chargingEvents').get();
    record('WP C EV flow created no chargingEvents documents', chargingEvents.empty, `count=${chargingEvents.size}`);

    const iceStart = await callLocal('startVehicleAssignment', {
      ...auth, shiftId: fixtureShiftId, vehicleId: WP8B.testIceId, startOdometer: 2000, transitionReason: 'VEHICLE_SWAP',
    });
    createdAssignmentIds.add(iceStart.assignmentId);
    record('WP C ICE pickup remains range-free',
      (await adminDb.collection('vehicleAssignments').doc(iceStart.assignmentId).get()).data()?.startPredictedRangeKm == null);
    await addCompletedInspections(iceStart.assignmentId, WP8B.testIceId);
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: iceStart.assignmentId, endOdometer: 2010, transitionReason: 'SHIFT_END',
    });
    record('WP C ICE return remains range-free',
      (await adminDb.collection('vehicleAssignments').doc(iceStart.assignmentId).get()).data()?.endPredictedRangeKm == null);

    // WP D A/C/D: a normal EV return opens nothing, and invalid charging requests never
    // partially complete an assignment or set the vehicle pointer.
    const noChargeVehicle = await adminDb.collection('vehicles').doc(WP8B.testEvId).get();
    record('WP D EV no-charge return creates no event or pointer',
      (await adminDb.collection('chargingEvents').get()).empty && !noChargeVehicle.data()?.openChargingEventId);

    const missingLocationAssignment = await startEvAssignment(1010);
    await expectLocalInvalidArgument('WP D EV charging return without location rejected', () => callLocal('endVehicleAssignment', {
      ...auth, assignmentId: missingLocationAssignment, endOdometer: 1020, endChargePercent: 70,
      endPredictedRangeKm: 250, leftForCharging: true, transitionReason: 'VEHICLE_SWAP',
    }));
    const missingLocationAssignmentDoc = await adminDb.collection('vehicleAssignments').doc(missingLocationAssignment).get();
    const missingLocationVehicle = await adminDb.collection('vehicles').doc(WP8B.testEvId).get();
    record('WP D missing-location rejection leaves no partial event or pointer',
      missingLocationAssignmentDoc.data()?.status === 'ACTIVE'
      && !missingLocationVehicle.data()?.openChargingEventId
      && (await adminDb.collection('chargingEvents').get()).empty);
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: missingLocationAssignment, endOdometer: 1020, endChargePercent: 70,
      endPredictedRangeKm: 250, leftForCharging: false, transitionReason: 'VEHICLE_SWAP',
    });

    const inactiveLocationAssignment = await startEvAssignment(1020);
    await expectLocalFailure('WP D inactive charging location rejected', 'failed-precondition', () => callLocal('endVehicleAssignment', {
      ...auth, assignmentId: inactiveLocationAssignment, endOdometer: 1030, endChargePercent: 70,
      endPredictedRangeKm: 240, leftForCharging: true, chargingLocationId: inactiveLocationId, transitionReason: 'VEHICLE_SWAP',
    }));
    const inactiveLocationAssignmentDoc = await adminDb.collection('vehicleAssignments').doc(inactiveLocationAssignment).get();
    const inactiveLocationVehicle = await adminDb.collection('vehicles').doc(WP8B.testEvId).get();
    record('WP D inactive-location rejection leaves no event or pointer',
      inactiveLocationAssignmentDoc.data()?.status === 'ACTIVE'
      && !inactiveLocationVehicle.data()?.openChargingEventId
      && (await adminDb.collection('chargingEvents').get()).empty);
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: inactiveLocationAssignment, endOdometer: 1030, endChargePercent: 70,
      endPredictedRangeKm: 240, leftForCharging: false, transitionReason: 'VEHICLE_SWAP',
    });

    // WP D B: opening an event snapshots the location and derives all identity from the
    // server-authoritative assignment, vehicle, and shift.
    const chargingAssignment = await startEvAssignment(1030);
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: chargingAssignment, endOdometer: 1040, endChargePercent: 65,
      endPredictedRangeKm: 220, leftForCharging: true, chargingLocationId: activeLocationId,
      publicChargeReference: 'receipt-123', publicChargeCost: 45.5, chargingNotes: 'Leave on bay 2', transitionReason: 'VEHICLE_SWAP',
    });
    const openedEvents = await adminDb.collection('chargingEvents').where('returnAssignmentId', '==', chargingAssignment).get();
    const openedEvent = openedEvents.docs[0];
    if (openedEvent) createdChargingEventIds.add(openedEvent.id);
    const openedVehicle = await adminDb.collection('vehicles').doc(WP8B.testEvId).get();
    const opened = openedEvent?.data();
    record('WP D EV charging return creates exactly one OPEN event and pointer',
      openedEvents.size === 1 && opened?.lifecycleStatus === 'OPEN' && openedVehicle.data()?.openChargingEventId === openedEvent?.id);
    record('WP D event derives return identity and preserves location snapshot',
      opened?.vehicleId === WP8B.testEvId && opened?.returnDriverId === WP8B.driverId
      && opened?.returnShiftId === fixtureShiftId && opened?.returnAssignmentId === chargingAssignment
      && opened?.returnOdometer === 1040 && opened?.returnChargePercent === 65 && opened?.returnPredictedRangeKm === 220
      && opened?.locationSnapshot?.name === 'Public Test Charger' && opened?.locationSnapshot?.provider === 'Test Charge Co'
      && opened?.locationSnapshot?.chargerType === 'CCS' && opened?.locationSnapshot?.costOwner === 'DRIVER'
      && opened?.financialStatus === 'KNOWN' && opened?.finalCost === 45.5);

    // WP D E/I: pickup-side closure is intentionally absent. A second charging return is
    // blocked by the authoritative vehicle pointer, not by a collection query.
    const duplicateAssignment = await startEvAssignment(1040);
    const eventBeforeDuplicate = await adminDb.collection('chargingEvents').doc(openedEvent.id).get();
    record('WP D pickup-side event close is not implemented',
      eventBeforeDuplicate.data()?.lifecycleStatus === 'OPEN' && (await adminDb.collection('vehicles').doc(WP8B.testEvId).get()).data()?.openChargingEventId === openedEvent.id);
    await expectLocalFailure('WP D duplicate OPEN event rejected by vehicle pointer', 'failed-precondition', () => callLocal('endVehicleAssignment', {
      ...auth, assignmentId: duplicateAssignment, endOdometer: 1050, endChargePercent: 60,
      endPredictedRangeKm: 200, leftForCharging: true, chargingLocationId: activeLocationId, transitionReason: 'VEHICLE_SWAP',
    }));
    record('WP D duplicate rejection creates no second event',
      (await adminDb.collection('chargingEvents').get()).size === 1);
    // Test-only isolation cleanup: WP D intentionally has no production close path yet.
    await adminDb.collection('chargingEvents').doc(openedEvent.id).delete();
    await adminDb.collection('vehicles').doc(WP8B.testEvId).update({ openChargingEventId: admin.firestore.FieldValue.delete() });
    createdChargingEventIds.delete(openedEvent.id);
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: duplicateAssignment, endOdometer: 1050, endChargePercent: 60,
      endPredictedRangeKm: 200, leftForCharging: false, transitionReason: 'VEHICLE_SWAP',
    });

    // WP D F: ICE assignments reject charging intent and cannot create an event.
    const iceChargingAttempt = await callLocal('startVehicleAssignment', {
      ...auth, shiftId: fixtureShiftId, vehicleId: WP8B.testIceId, startOdometer: 2010, transitionReason: 'VEHICLE_SWAP',
    });
    createdAssignmentIds.add(iceChargingAttempt.assignmentId);
    await addCompletedInspections(iceChargingAttempt.assignmentId, WP8B.testIceId);
    await expectLocalInvalidArgument('WP D ICE charging intent rejected', () => callLocal('endVehicleAssignment', {
      ...auth, assignmentId: iceChargingAttempt.assignmentId, endOdometer: 2020,
      leftForCharging: true, chargingLocationId: activeLocationId, transitionReason: 'SHIFT_END',
    }));
    record('WP D ICE charging intent creates no event', (await adminDb.collection('chargingEvents').get()).empty);
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: iceChargingAttempt.assignmentId, endOdometer: 2020, transitionReason: 'SHIFT_END',
    });

    // WP D H: return inspection enforcement remains intact.
    const inspectionGateStart = await callLocal('startVehicleAssignment', {
      ...auth, shiftId: fixtureShiftId, vehicleId: WP8B.testEvId, startOdometer: 1050,
      startChargePercent: 75, startPredictedRangeKm: 250, transitionReason: 'VEHICLE_SWAP',
    });
    createdAssignmentIds.add(inspectionGateStart.assignmentId);
    const pickupOnly = { driverId: WP8B.driverId, shiftId: fixtureShiftId, vehicleId: WP8B.testEvId, status: 'COMPLETED', boundaryType: 'PICKUP' };
    await adminDb.collection('vehicleInspections').doc(`${inspectionGateStart.assignmentId}_PICKUP`).set(pickupOnly);
    await expectLocalFailure('WP D RETURN inspection gate remains enforced', 'failed-precondition', () => callLocal('endVehicleAssignment', {
      ...auth, assignmentId: inspectionGateStart.assignmentId, endOdometer: 1060, endChargePercent: 70,
      endPredictedRangeKm: 230, leftForCharging: false, transitionReason: 'SHIFT_END',
    }));
    await adminDb.collection('vehicleInspections').doc(`${inspectionGateStart.assignmentId}_RETURN`).set({ ...pickupOnly, boundaryType: 'RETURN' });
    await callLocal('endVehicleAssignment', {
      ...auth, assignmentId: inspectionGateStart.assignmentId, endOdometer: 1060, endChargePercent: 70,
      endPredictedRangeKm: 230, leftForCharging: false, transitionReason: 'SHIFT_END',
    });

    const [shift, ev, ice] = await Promise.all([
      adminDb.collection('shifts').doc(fixtureShiftId).get(),
      adminDb.collection('vehicles').doc(WP8B.testEvId).get(),
      adminDb.collection('vehicles').doc(WP8B.testIceId).get(),
    ]);
    record('WP C assignment pointers cleared after returns',
      !shift.data()?.activeAssignmentId && !ev.data()?.activeAssignmentId && !ev.data()?.activeShiftId
      && !ice.data()?.activeAssignmentId && !ice.data()?.activeShiftId);
  } finally {
    await cleanupFixtures();
  }

  const failed = RESULTS.filter((result) => !result.ok);
  if (failed.length) throw new Error(`${failed.length} emulator assertion(s) failed.`);
}

// A minimal 1x1 JPEG, used to satisfy the inspection photo requirement without needing a
// real camera in this non-interactive harness.
const MIN_JPEG_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

async function locateTestRecords() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const testDrivers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.isTestData === true && norm(u.firstName) === 'test' && norm(u.surname) === 'test');
  if (testDrivers.length !== 1) die('Test Test driver could not be uniquely identified (found ' + testDrivers.length + ').');
  const driver = testDrivers[0];

  const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
  const vehicles = vehiclesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const match = (v, label) => v.isTestData === true && norm(v.registration).includes(norm(label));
  const evs = vehicles.filter(v => match(v, 'TEST EV'));
  const ices = vehicles.filter(v => match(v, 'TEST ICE'));
  if (evs.length !== 1) die('TEST EV could not be uniquely identified (found ' + evs.length + ').');
  if (ices.length !== 1) die('TEST ICE could not be uniquely identified (found ' + ices.length + ').');
  return { driver, ev: evs[0], ice: ices[0] };
}

async function doInspection(auth, assignmentId, boundaryType, returnIntent) {
  await call('createVehicleInspection', { ...auth, assignmentId, boundaryType, returnIntent });
  await call('uploadInspectionPhoto', { ...auth, assignmentId, boundaryType, photoRole: 'EXTERIOR', imageDataUrl: MIN_JPEG_DATA_URL });
  await call('uploadInspectionPhoto', { ...auth, assignmentId, boundaryType, photoRole: 'INTERIOR', imageDataUrl: MIN_JPEG_DATA_URL });
  const inspections = await call('getAssignmentInspections', { ...auth, assignmentId });
  const insp = inspections.inspections.find(i => i.boundaryType === boundaryType);
  return await call('completeVehicleInspection', { ...auth, inspectionId: insp.id, hasDamage: false });
}

async function fetchWp8bState() {
  const refs = {
    driver: doc(db, 'users', WP8B.driverId),
    shift: doc(db, 'shifts', WP8B.shiftId),
    assignment: doc(db, 'vehicleAssignments', WP8B.assignmentId),
    ev: doc(db, 'vehicles', WP8B.testEvId),
    ice: doc(db, 'vehicles', WP8B.testIceId),
  };
  const out = {};
  for (const [key, ref] of Object.entries(refs)) {
    const snap = await getDoc(ref);
    out[key] = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  return out;
}

function assertWp8bCleanupState(state) {
  if (!state.driver || state.driver.id !== WP8B.driverId) die('Cleanup target driver is missing or mismatched.');
  if (!state.shift || state.shift.id !== WP8B.shiftId) die('Cleanup target shift is missing or mismatched.');
  if (!state.assignment || state.assignment.id !== WP8B.assignmentId) die('Cleanup target assignment is missing or mismatched.');
  if (!state.ev || state.ev.id !== WP8B.testEvId) die('Cleanup target TEST EV is missing or mismatched.');
  if (!state.ice || state.ice.id !== WP8B.testIceId) die('Cleanup target TEST ICE is missing or mismatched.');

  if (state.driver.isTestData !== true) die('Cleanup target driver is not marked isTestData=true.');
  if (state.ev.isTestData !== true) die('Cleanup target TEST EV is not marked isTestData=true.');
  if (state.ice.isTestData !== true) die('Cleanup target TEST ICE is not marked isTestData=true.');

  if (state.driver.role && state.driver.role !== 'driver') die('Cleanup target driver is not a driver.');
  if (norm(state.driver.firstName) !== 'test' || norm(state.driver.surname) !== 'test') {
    die('Cleanup target driver identity mismatch.');
  }

  if (state.shift.driverId !== WP8B.driverId) die('Shift does not belong to Test Test.');
  if (state.assignment.driverId !== WP8B.driverId) die('Assignment does not belong to Test Test.');
  if (state.assignment.shiftId !== WP8B.shiftId) die('Assignment does not belong to the known WP8B shift.');
  if (state.assignment.vehicleId !== WP8B.testIceId) die('Assignment is not the known final TEST ICE assignment.');

  if (state.driver.activeShiftId !== WP8B.shiftId) die('Test Test activeShiftId does not point to the known WP8B shift.');
  if (state.shift.status !== 'Active') die('Known WP8B shift is not Active; refusing cleanup-only mode.');
  if (state.shift.activeAssignmentId) die('Known WP8B shift still has an activeAssignmentId; cleanup-only mode expects assignment cleanup to be done already.');
  if (state.assignment.status !== 'COMPLETED') die('Known WP8B assignment is not already COMPLETED; refusing cleanup-only mode.');
}

function computeSafeShiftEndOdometer(...candidates) {
  const nums = candidates
    .map(num)
    .filter(v => v !== null);
  if (!nums.length) die('Could not derive a safe shift-end odometer.');
  return Math.max(...nums);
}

async function cleanupKnownWp8bShift(auth) {
  const state = await fetchWp8bState();
  assertWp8bCleanupState(state);

  const safeEndOdometer = computeSafeShiftEndOdometer(
    state.shift.startOdometer,
    state.shift.endOdometer,
    state.assignment.startOdometer,
    state.assignment.endOdometer,
    state.ev.currentOdometer,
    state.ice.currentOdometer
  );

  await call('endShiftWithSession', {
    ...auth,
    shiftId: WP8B.shiftId,
    endOdometer: safeEndOdometer,
    deviceId: WP8B.deviceId,
  });

  return { state, safeEndOdometer };
}

async function main() {
  if (EMULATOR_MODE) {
    await runWpCEmulatorRegression();
    return;
  }

  console.log('Locating test records (Test Test, TEST EV, TEST ICE)…');
  const { driver, ev, ice } = await locateTestRecords();
  console.log('  Driver: ' + driver.id + '   TEST EV: ' + ev.id + '   TEST ICE: ' + ice.id);

  if (driver.id !== WP8B.driverId || ev.id !== WP8B.testEvId || ice.id !== WP8B.testIceId) {
    die('Resolved test records do not match the authorised WP8B test-only IDs.');
  }

  // Hard precondition: driver must have no active shift, and neither test vehicle may be
  // currently pointed to a shift/assignment — otherwise this run would collide with existing
  // test state instead of exercising a clean swap scenario.
  const freshDriverDoc = await getDoc(doc(db, 'users', driver.id));
  const existingActiveShiftId = freshDriverDoc.exists() ? freshDriverDoc.data().activeShiftId : null;

  if (CLEANUP_ONLY) {
    if (existingActiveShiftId !== WP8B.shiftId) {
      die('Cleanup-only mode requires the known WP8B shift ' + WP8B.shiftId + ' to be the active Test Test shift.');
    }
  } else if (existingActiveShiftId) {
    die('Test Test already has an active shift (' + freshDriverDoc.data().activeShiftId + '). Clean up before running.');
  }
  if (!CLEANUP_ONLY) {
    if (ev.activeShiftId || ev.activeAssignmentId) die('TEST EV already has an active pointer. Clean up before running.');
    if (ice.activeShiftId || ice.activeAssignmentId) die('TEST ICE already has an active pointer. Clean up before running.');
    record('Preconditions clean', true, 'no active shift/assignment on Test Test, TEST EV, or TEST ICE');
  }

  const rl = createInterface({ input, output });
  const pin = await rl.question('Enter the PIN for Test Test: ');
  rl.close();
  if (!/^\d{4}$/.test(pin)) die('PIN must be exactly 4 digits.');

  const login = await call('driverLogin', { driverId: driver.id, pin, deviceId: WP8B.deviceId });
  const auth = { driverId: login.driverId, sessionToken: login.sessionToken };
  record('Driver login', true, 'session established');

  if (CLEANUP_ONLY) {
    const { safeEndOdometer } = await cleanupKnownWp8bShift(auth);
    record('Cleanup-only shift end', true, 'shift ' + WP8B.shiftId + ' ended with endOdometer=' + safeEndOdometer);
    console.log('');
    console.log('CLEANUP-ONLY COMPLETE');
    process.exit(0);
  }

  // ---- 1. Start Test Test shift with TEST EV ----
  let shiftId, evAssignmentId;
  try {
    const startRes = await call('startShift', { ...auth, vehicleId: ev.id, startOdometer: Number(ev.currentOdometer ?? 0), deviceId: WP8B.deviceId, startChargePercent: 80 });
    shiftId = startRes.shiftId;
    await expectInvalidArgument('1a. EV pickup without predicted range rejected', () => call('startVehicleAssignment', {
      ...auth, shiftId, vehicleId: ev.id, startOdometer: Number(ev.currentOdometer ?? 0), startChargePercent: 80, transitionReason: 'SHIFT_START',
    }));
    const asgRes = await call('startVehicleAssignment', {
      ...auth, shiftId, vehicleId: ev.id, startOdometer: Number(ev.currentOdometer ?? 0), startChargePercent: 80,
      startPredictedRangeKm: 300, transitionReason: 'SHIFT_START',
    });
    evAssignmentId = asgRes.assignmentId;
    record('1. Start Test Test shift with TEST EV', true, 'shift ' + shiftId + ', assignment ' + evAssignmentId);
    const assignment = (await getDoc(doc(db, 'vehicleAssignments', evAssignmentId))).data();
    record('1b. EV pickup predicted range persisted', assignment?.startPredictedRangeKm === 300);
  } catch (e) {
    record('1. Start Test Test shift with TEST EV', false, e?.message || String(e));
    die('Cannot continue without an active shift.');
  }

  // ---- 2. Complete TEST EV pickup ----
  try {
    await doInspection(auth, evAssignmentId, 'PICKUP');
    record('2. Complete TEST EV pickup', true);
  } catch (e) {
    record('2. Complete TEST EV pickup', false, e?.message || String(e));
  }

  // ---- 3. Swap from TEST EV to TEST ICE ----
  let iceAssignmentId;
  try {
    await call('createVehicleInspection', { ...auth, assignmentId: evAssignmentId, boundaryType: 'RETURN', returnIntent: 'VEHICLE_SWAP' });
    await doInspection(auth, evAssignmentId, 'RETURN', 'VEHICLE_SWAP');
    await expectInvalidArgument('3a. EV return without predicted range rejected', () => call('endVehicleAssignment', {
      ...auth, assignmentId: evAssignmentId, endOdometer: Number(ev.currentOdometer ?? 0), endChargePercent: 70, transitionReason: 'VEHICLE_SWAP',
    }));
    await call('endVehicleAssignment', {
      ...auth, assignmentId: evAssignmentId, endOdometer: Number(ev.currentOdometer ?? 0), endChargePercent: 70,
      endPredictedRangeKm: 250, transitionReason: 'VEHICLE_SWAP',
    });
    const endedEvAssignment = (await getDoc(doc(db, 'vehicleAssignments', evAssignmentId))).data();
    record('3b. EV return predicted range persisted', endedEvAssignment?.endPredictedRangeKm === 250);

    const asgRes = await call('startVehicleAssignment', { ...auth, shiftId, vehicleId: ice.id, startOdometer: Number(ice.currentOdometer ?? 0), transitionReason: 'VEHICLE_SWAP' });
    iceAssignmentId = asgRes.assignmentId;
    const iceAssignment = (await getDoc(doc(db, 'vehicleAssignments', iceAssignmentId))).data();
    record('3c. ICE pickup remains range-free', iceAssignment?.startPredictedRangeKm == null && iceAssignment?.endPredictedRangeKm == null);
    await doInspection(auth, iceAssignmentId, 'PICKUP');

    const active = await call('getActiveVehicleAssignment', { ...auth, shiftId });
    const ok = active.hasActiveAssignment && active.assignment.vehicleId === ice.id;
    record('3. Swap from TEST EV to TEST ICE', ok, 'active assignment vehicleId=' + active.assignment?.vehicleId);
  } catch (e) {
    record('3. Swap from TEST EV to TEST ICE', false, e?.message || String(e));
  }

  // ---- 6. Returned TEST EV becomes available again ----
  try {
    const evDoc = await getDoc(doc(db, 'vehicles', ev.id));
    const evData = evDoc.data();
    const available = !evData.activeShiftId && !evData.activeAssignmentId;
    record('6. Returned TEST EV becomes available again', available, 'activeShiftId=' + (evData.activeShiftId || 'absent') + ' activeAssignmentId=' + (evData.activeAssignmentId || 'absent'));
  } catch (e) {
    record('6. Returned TEST EV becomes available again', false, e?.message || String(e));
  }

  // ---- 7. Active TEST ICE remains unavailable while assigned ----
  try {
    const iceDoc = await getDoc(doc(db, 'vehicles', ice.id));
    const iceData = iceDoc.data();
    const unavailable = !!iceData.activeShiftId; // ShiftStart.tsx filters on activeShiftId
    record('7. Active TEST ICE remains unavailable while assigned', unavailable, 'activeShiftId=' + (iceData.activeShiftId || 'absent') + ' activeAssignmentId=' + (iceData.activeAssignmentId || 'absent'));
  } catch (e) {
    record('7. Active TEST ICE remains unavailable while assigned', false, e?.message || String(e));
  }

  // ---- 4. Report Fault derives TEST ICE as current vehicle (server-resolved) ----
  // ReportDefectForm itself is a React component and cannot be driven headlessly here;
  // this exercises the exact same authority path server-side: submitting vehicleId=TEST ICE
  // (the true current vehicle) while the active assignment is TEST ICE must succeed.
  try {
    const res = await call('reportDefectWithSession', {
      ...auth, vehicleId: ice.id, category: 'Other', urgency: 'Low',
      description: 'WP8B test: defect against current vehicle (should succeed).',
    });
    record('4. Defect against current vehicle (TEST ICE) succeeds', !!res.success, res.defectId);
  } catch (e) {
    record('4. Defect against current vehicle (TEST ICE) succeeds', false, e?.message || String(e));
  }

  // ---- 5. Client cannot report a defect for TEST EV while active assignment is TEST ICE ----
  // Requires the WP8B backend fix to be deployed. Pre-deploy, this call SUCCEEDS (the bug)
  // and this assertion will legitimately FAIL — that is the expected, honest pre-deploy result.
  try {
    await call('reportDefectWithSession', {
      ...auth, vehicleId: ev.id, category: 'Other', urgency: 'Low',
      description: 'WP8B test: defect against a non-current vehicle (should be REJECTED).',
    });
    record('5. Defect against non-current vehicle (TEST EV) rejected', false, 'call SUCCEEDED — backend fix not yet deployed, or a real regression');
  } catch (e) {
    const code = String(e?.code || e?.details?.code || '');
    record('5. Defect against non-current vehicle (TEST EV) rejected', code.includes('failed-precondition'), code || e?.message);
  }

  // ---- Cleanup: end the TEST ICE assignment + shift so the environment is left clean ----
  try {
    await call('createVehicleInspection', { ...auth, assignmentId: iceAssignmentId, boundaryType: 'RETURN', returnIntent: 'SHIFT_END' });
    await doInspection(auth, iceAssignmentId, 'RETURN', 'SHIFT_END');
    await call('endVehicleAssignment', { ...auth, assignmentId: iceAssignmentId, endOdometer: Number(ice.currentOdometer ?? 0), transitionReason: 'SHIFT_END' });
    const endedIceAssignment = (await getDoc(doc(db, 'vehicleAssignments', iceAssignmentId))).data();
    record('8a. ICE return remains range-free', endedIceAssignment?.startPredictedRangeKm == null && endedIceAssignment?.endPredictedRangeKm == null);

    // ---- 8. After assignment end, TEST ICE becomes available ----
    const iceDoc = await getDoc(doc(db, 'vehicles', ice.id));
    const iceData = iceDoc.data();
    const available = !iceData.activeShiftId && !iceData.activeAssignmentId;
    record('8. After assignment end, TEST ICE becomes available', available, 'activeShiftId=' + (iceData.activeShiftId || 'absent'));

    const safeShiftEndOdometer = computeSafeShiftEndOdometer(
      ev.currentOdometer,
      ice.currentOdometer,
      Number(ev.currentOdometer ?? 0),
      Number(ice.currentOdometer ?? 0),
      Number(iceData?.currentOdometer ?? 0),
      Number(shiftId ? (await getDoc(doc(db, 'shifts', shiftId))).data()?.startOdometer ?? 0 : 0)
    );
    await call('endShiftWithSession', { ...auth, shiftId, endOdometer: safeShiftEndOdometer, deviceId: WP8B.deviceId });
    console.log('Cleanup: shift ' + shiftId + ' ended, environment left clean for future runs.');
  } catch (e) {
    console.error('CLEANUP FAILED — manual cleanup of shift ' + shiftId + ' / assignment ' + iceAssignmentId + ' may be required: ' + (e?.message || e));
  }

  console.log('');
  console.log('NOTE — Scenarios 9, 10, 11 (TakeVehicleForm authority, DriverDashboard');
  console.log('authority, EV/ICE contextual button regression) are static/code-review');
  console.log('checks, not runtime tests — see the WP8B report for the exact grep');
  console.log('evidence. This repo has no automated UI test runner (no jest/vitest/RTL).');

  console.log('');
  const failed = RESULTS.filter(r => !r.ok);
  console.log(failed.length === 0 ? 'ALL EXECUTED CHECKS PASSED' : (failed.length + ' CHECK(S) FAILED'));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(e => { console.error('FAILURE — ' + (e?.message || e)); process.exit(1); });
