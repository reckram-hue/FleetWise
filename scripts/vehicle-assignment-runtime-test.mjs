// TEMPORARY LOCAL RUNTIME TEST HARNESS — VehicleAssignment callables (WP7B2)
// Runs against the DEPLOYED functions in fleetwise-9ab3a (us-central1).
// Uses ONLY clearly-marked test records: Test Test driver, TEST EV, TEST ICE.
// Never prints the PIN, sessionToken, or pinHash. The sessionToken lives only in memory.
//
// Run from the repo root:  node scripts/vehicle-assignment-runtime-test.mjs
// Requires: Node >= 18, the 'firebase' package (already in node_modules), and network access.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const RESULTS = [];
function record(name, ok, detail = '') {
  RESULTS.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
}

function die(msg) {
  console.error('STOP — ' + msg);
  process.exit(1);
}

// ---- Load Firebase config from the repo root .env (public web config only) ----
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
const required = ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'];
for (const k of required) {
  if (!env[k]) die('Missing ' + k + ' in .env');
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const functions = getFunctions(app); // default region us-central1
const db = getFirestore(app);

async function call(name, data) {
  const fn = httpsCallable(functions, name);
  const r = await fn(data);
  return r.data;
}

function norm(s) { return String(s ?? '').trim().toLowerCase(); }

// ---- Locate + verify test records (hard safety gate) ----
async function locateTestRecords() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const testDrivers = usersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.isTestData === true && norm(u.firstName) === 'test' && norm(u.surname) === 'test');
  if (testDrivers.length !== 1) {
    die('Test Test driver could not be uniquely identified (found ' + testDrivers.length + ').');
  }
  const driver = testDrivers[0];

  const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
  const vehicles = vehiclesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const matchVeh = (v, label) => {
    const l = norm(label);
    return v.isTestData === true && (norm(v.registration).includes(l) || norm(v.alias).includes(l));
  };
  const evs = vehicles.filter(v => matchVeh(v, 'TEST EV'));
  const ices = vehicles.filter(v => matchVeh(v, 'TEST ICE'));
  if (evs.length !== 1) die('TEST EV could not be uniquely identified (found ' + evs.length + ').');
  if (ices.length !== 1) die('TEST ICE could not be uniquely identified (found ' + ices.length + ').');

  return { driver, ev: evs[0], ice: ices[0] };
}

async function main() {
  console.log('Locating test records (users + vehicles)…');
  const { driver, ev, ice } = await locateTestRecords();
  console.log('  Driver: ' + driver.id + ' (' + driver.firstName + ' ' + driver.surname + ')');
  console.log('  TEST EV: ' + ev.id + ' (' + (ev.registration || ev.alias) + ')');
  console.log('  TEST ICE: ' + ice.id + ' (' + (ice.registration || ice.alias) + ')');

  // ---- Driver login (interactive PIN; never echoed/logged) ----
  const rl = createInterface({ input, output });
  const pin = await rl.question('Enter the PIN for Test Test: ');
  rl.close();
  if (!/^\d{4}$/.test(pin)) die('PIN must be exactly 4 digits.');

  let login;
  try {
    login = await call('driverLogin', { driverId: driver.id, pin, deviceId: 'runtime-test-harness' });
  } catch (e) {
    die('driverLogin failed: ' + (e?.message || e));
  }
  const { sessionToken, driverId } = login;
  record('Driver login', true);
  console.log('  (session established for driver ' + driverId + '; token held in memory only)');

  const auth = { driverId, sessionToken };

  // ---- Active shift precondition ----
  let activeShift;
  try {
    activeShift = await call('getActiveShiftWithSession', { driverId, sessionToken });
  } catch (e) {
    die('getActiveShiftWithSession failed: ' + (e?.message || e));
  }
  if (!activeShift.hasActiveShift || !activeShift.shift) {
    die('NO ACTIVE TEST SHIFT — START ONE IN THE APP FIRST');
  }
  const shiftId = activeShift.shift.id;
  record('Active shift found', true, 'shift ' + shiftId);

  // ---- Initial assignment state ----
  const initial = await call('getActiveVehicleAssignment', { driverId, sessionToken, shiftId });
  if (initial.hasActiveAssignment && initial.assignment) {
    die('An active assignment already exists (assignment ' + initial.assignment.id + '). Clean up before running.');
  }
  record('Initial assignment state', true, 'no active assignment');

  const evStartOdo = Number(ev.currentOdometer ?? ev.odometer ?? 0);
  const iceStartOdo = Number(ice.currentOdometer ?? ice.odometer ?? 0);

  // A. Start TEST EV assignment
  let evAssignmentId;
  try {
    const r = await call('startVehicleAssignment', {
      driverId, sessionToken, shiftId, vehicleId: ev.id,
      startOdometer: evStartOdo, startChargePercent: 80, transitionReason: 'SHIFT_START',
    });
    evAssignmentId = r.assignmentId;
    record('TEST EV assignment start', true, 'assignment ' + evAssignmentId);
  } catch (e) {
    record('TEST EV assignment start', false, e?.message || String(e));
  }

  // B. Get active assignment
  try {
    const r = await call('getActiveVehicleAssignment', { driverId, sessionToken, shiftId });
    const ok = r.hasActiveAssignment && r.assignment &&
      r.assignment.id === evAssignmentId &&
      r.assignment.shiftId === shiftId &&
      r.assignment.vehicleId === ev.id &&
      r.assignment.driverId === driverId &&
      r.assignment.status === 'ACTIVE';
    record('Active assignment lookup', ok, r.assignment ? ('assignment ' + r.assignment.id + ', vehicle ' + r.assignment.vehicleId) : '');
  } catch (e) {
    record('Active assignment lookup', false, e?.message || String(e));
  }

  // C. Double assignment block (TEST ICE while EV assignment active)
  try {
    await call('startVehicleAssignment', {
      driverId, sessionToken, shiftId, vehicleId: ice.id,
      startOdometer: iceStartOdo, transitionReason: 'VEHICLE_SWAP',
    });
    record('Second assignment blocked', false, 'unexpectedly succeeded');
  } catch (e) {
    const code = String(e?.code || '');
    if (code.includes('failed-precondition')) {
      record('Second assignment blocked', true, 'failed-precondition as expected');
    } else {
      record('Second assignment blocked', false, e?.message || String(e));
    }
  }

  // D. End TEST EV assignment
  try {
    await call('endVehicleAssignment', {
      driverId, sessionToken, assignmentId: evAssignmentId,
      endOdometer: evStartOdo + 1, endChargePercent: 79, transitionReason: 'VEHICLE_SWAP',
    });
    record('TEST EV assignment end', true);
  } catch (e) {
    record('TEST EV assignment end', false, e?.message || String(e));
  }

  // E. Verify no active assignment
  try {
    const r = await call('getActiveVehicleAssignment', { driverId, sessionToken, shiftId });
    record('No active assignment after EV end', !r.hasActiveAssignment);
  } catch (e) {
    record('No active assignment after EV end', false, e?.message || String(e));
  }

  // F. Start TEST ICE assignment
  let iceAssignmentId;
  try {
    const r = await call('startVehicleAssignment', {
      driverId, sessionToken, shiftId, vehicleId: ice.id,
      startOdometer: iceStartOdo, transitionReason: 'VEHICLE_SWAP',
    });
    iceAssignmentId = r.assignmentId;
    record('TEST ICE assignment start', true, 'assignment ' + iceAssignmentId);
  } catch (e) {
    record('TEST ICE assignment start', false, e?.message || String(e));
  }

  // G. End shift blocked while ICE assignment active
  let shiftEnded = false;
  try {
    await call('endShiftWithSession', {
      driverId, sessionToken, shiftId, endOdometer: iceStartOdo + 1,
    });
    shiftEnded = true;
  } catch (e) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (code.includes('failed-precondition') && /vehicle assigned/i.test(msg)) {
      record('End shift blocked while assignment active', true);
    } else {
      record('End shift blocked while assignment active', false, e?.message || String(e));
    }
  }
  if (shiftEnded) {
    die('CRITICAL FAILURE — the shift was unexpectedly ended during the guard test.');
  }

  // H. End TEST ICE assignment
  try {
    await call('endVehicleAssignment', {
      driverId, sessionToken, assignmentId: iceAssignmentId,
      endOdometer: iceStartOdo + 1, transitionReason: 'SHIFT_END',
    });
    record('TEST ICE assignment end', true);
  } catch (e) {
    record('TEST ICE assignment end', false, e?.message || String(e));
  }

  // I. Verify no active assignment
  try {
    const r = await call('getActiveVehicleAssignment', { driverId, sessionToken, shiftId });
    record('Final no-active-assignment', !r.hasActiveAssignment);
  } catch (e) {
    record('Final no-active-assignment', false, e?.message || String(e));
  }

  // J. Leave the work shift Active intentionally.
  record('Work shift left Active intentionally', true);

  console.log('\n==== SUMMARY ====');
  for (const r of RESULTS) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name);
  }
  const failed = RESULTS.filter(r => !r.ok);
  console.log('\nResult: ' + (failed.length === 0 ? 'ALL PASS' : failed.length + ' FAILED'));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('Harness error:', e?.message || e);
  process.exit(1);
});
