// WP8R guarded remediation script for the 2026-08-20 automation side effects.
// Default mode is DRY RUN. Firestore writes require --apply AND --confirm-antigravity-remediation.
// Safe output only: never prints PINs, pinHash values, session tokens, or token hashes.
//
// Primary execution path uses the Firebase Admin SDK when application credentials are available.
// If Admin SDK credentials are unavailable, DRY RUN falls back to the web SDK for read-only
// inventory so the incident can still be reviewed locally. APPLY mode never falls back.
//
// CANONICAL REVOCATION SEMANTICS (must match functions/src/index.ts exactly):
//   requireDriverSession() and revokeActiveDriverSessions() treat a session as revoked
//   if and only if `isRevoked === true`. `revokedAt` is legacy/informational metadata,
//   never the authority. This script mirrors that contract everywhere.
//
// ATOMICITY: session revocations and the shift/assignment/vehicle/driver pointer repair
// are performed in ONE Firestore transaction. Total write count for this incident is
// ~35 session updates + 4 pointer/status updates = ~39 writes, far below Firestore's
// per-transaction limit of 500 writes, so a single transaction is both preferred and
// technically appropriate — no batching workaround is required.
//
// Zihaan Van Neel's PIN, pinHash, and requiresPinChange are NEVER written by this script,
// in any mode. driverChangePin and adminSetDriverPin are never invoked. PIN remediation
// remains a separate, explicitly authorised admin action.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp as initializeWebApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocs, terminate } from 'firebase/firestore';

const require = createRequire(import.meta.url);

const INCIDENT = Object.freeze({
  id: 'antigravity-2026-08-20',
  zihaan: Object.freeze({
    id: '5Zqvdsy9hBDtAGL4g3Rk',
    firstName: 'Zihaan',
    surname: 'Van Neel',
  }),
  testDriver: Object.freeze({
    id: '3MBpEbymKURd7sKQURpk',
    firstName: 'Test',
    surname: 'Test',
  }),
  testEv: Object.freeze({
    id: 'CHFLNpC1lmVWMMkOdGRx',
    registration: 'TEST EV',
  }),
  activeShiftId: 'igNZZ90k8oka3RApLBwX',
  activeAssignmentId: 'WNwA0DiGkqNSHoKug7mG',
  preserveCompletedShiftId: 'q8Jq5ZX3mCCBVmT9Dq5h',
  // FILTER A window — exact, per authorisation. Do not broaden.
  pinCheckWindowStart: '2026-08-20T07:58:20.000Z',
  pinCheckWindowEnd: '2026-08-20T07:59:11.999Z',
  // FILTER B window — exact, per authorisation. Do not broaden. Zihaan-only.
  zihaanObsWindowStart: '2026-08-20T08:05:25.000Z',
  zihaanObsWindowEnd: '2026-08-20T08:10:46.999Z',
  remediationReason: 'AUTOMATION_SIDE_EFFECT_REMEDIATION',
  remediationAssignmentStatus: 'CANCELLED',
  remediationShiftStatus: 'Completed',
});

const APPLY_MODE = process.argv.includes('--apply');
const CONFIRM_FLAG = process.argv.includes('--confirm-antigravity-remediation');
const DRY_RUN = !APPLY_MODE;

// ---------------------------------------------------------------------------
// Second apply confirmation gate. This runs before ANY Firestore access.
// --apply alone must never be sufficient to mutate.
// ---------------------------------------------------------------------------
if (APPLY_MODE && !CONFIRM_FLAG) {
  console.error('');
  console.error('============================================================');
  console.error('REFUSING TO RUN — MISSING SECOND CONFIRMATION FLAG');
  console.error('============================================================');
  console.error('--apply was supplied without --confirm-antigravity-remediation.');
  console.error('Both flags are required to perform any Firestore write.');
  console.error('');
  console.error('  node scripts/remediate-antigravity-side-effects.mjs --apply --confirm-antigravity-remediation');
  console.error('');
  console.error('No reads or writes were attempted. Exiting non-zero.');
  process.exit(1);
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));

function iso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    const millis = (value._seconds * 1000) + Math.floor((value._nanoseconds || 0) / 1e6);
    return new Date(millis).toISOString();
  }
  return null;
}

function displayName(user) {
  return `${user?.firstName || ''} ${user?.surname || ''}`.trim();
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function startsWith(value, prefix) {
  return typeof value === 'string' && value.startsWith(prefix);
}

function inRange(isoString, startIso, endIso) {
  if (!isoString) return false;
  const time = Date.parse(isoString);
  return Number.isFinite(time)
    && time >= Date.parse(startIso)
    && time <= Date.parse(endIso);
}

/** Canonical revocation authority — MUST match functions/src/index.ts. Never use revokedAt. */
function isCanonicallyRevoked(session) {
  return session?.isRevoked === true;
}

function safeLastUsedMetadata(session) {
  const keys = ['lastUsedAt', 'lastSeenAt', 'lastAccessedAt', 'updatedAt'];
  const out = {};
  for (const key of keys) {
    if (hasOwn(session, key) && session[key] != null) {
      out[key] = iso(session[key]) || session[key];
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * FILTER A: automation pin_check_ sweep (any driver).
 * FILTER B: Zihaan-only device_obs_test_ window.
 * Missing deviceId / createdAt / driverId simply fail to match — never throws.
 */
function matchesFilterA(session, createdAtIso) {
  return startsWith(session.deviceId, 'pin_check_')
    && inRange(createdAtIso, INCIDENT.pinCheckWindowStart, INCIDENT.pinCheckWindowEnd);
}

function matchesFilterB(session, createdAtIso) {
  return session.driverId === INCIDENT.zihaan.id
    && startsWith(session.deviceId, 'device_obs_test_')
    && inRange(createdAtIso, INCIDENT.zihaanObsWindowStart, INCIDENT.zihaanObsWindowEnd);
}

function classifySession(session, createdAtIso) {
  if (matchesFilterA(session, createdAtIso)) return 'AUTOMATION-SUSPECT';
  if (matchesFilterB(session, createdAtIso)) return 'AUTOMATION-SUSPECT';
  return 'NORMAL/UNKNOWN';
}

function revocationFilterDescription() {
  return {
    incident: INCIDENT.id,
    mode: 'NARROW_OR',
    canonicalRevokedField: 'isRevoked',
    filters: [
      {
        label: 'FILTER_A_pin_check_window',
        deviceIdPrefix: 'pin_check_',
        createdAtGte: INCIDENT.pinCheckWindowStart,
        createdAtLte: INCIDENT.pinCheckWindowEnd,
        isRevokedMustNotBeTrue: true,
      },
      {
        label: 'FILTER_B_zihaan_device_obs_window',
        driverId: INCIDENT.zihaan.id,
        deviceIdPrefix: 'device_obs_test_',
        createdAtGte: INCIDENT.zihaanObsWindowStart,
        createdAtLte: INCIDENT.zihaanObsWindowEnd,
        isRevokedMustNotBeTrue: true,
      },
    ],
  };
}

function printHeading(title) {
  console.log('');
  console.log('============================================================');
  console.log(title);
  console.log('============================================================');
}

function printJson(label, value) {
  console.log(label);
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Raised for any assertion/precondition failure that occurs AFTER Firebase resources may
 * already exist. Thrown (never process.exit) so the caller's try/finally can run cleanup
 * before the process exits. The pre-Firebase-init confirmation-flag guard above is the only
 * exit path that still calls process.exit() directly, since no resources exist yet there.
 */
function abort(message) {
  throw new Error(message);
}

function assertCondition(condition, message) {
  if (!condition) abort(message);
}

/** Same assertion semantics, but throws (for use inside a Firestore transaction). */
function transactionAssert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Web SDK read-only fallback context. Returns both the Firestore instance AND the
 * underlying FirebaseApp so the caller can run the SDK's documented shutdown sequence
 * (terminate(db) then deleteApp(app)) instead of leaving open network/IndexedDB handles
 * that keep the Node process alive.
 */
function buildWebContext() {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ];
  for (const key of required) {
    assertCondition(env[key], `Missing ${key} in .env`);
  }

  const app = initializeWebApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });

  return { app, db: getFirestore(app) };
}

/**
 * Admin SDK context. Tracks the FirebaseApp so it can be deleted on shutdown (Admin SDK
 * keeps gRPC channels open otherwise, which is the same class of "process never exits"
 * problem as the Web SDK fallback). Also cleans up a partially-initialized app if the
 * post-init connectivity probe fails, so a failed attempt never leaks a handle either.
 */
async function tryBuildAdminContext() {
  let app = null;
  try {
    const admin = require('../functions/node_modules/firebase-admin');
    if (admin.apps.length) {
      app = admin.app();
    } else {
      const options = {
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      };

      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        options.credential = admin.credential.cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON));
      } else {
        options.credential = admin.credential.applicationDefault();
      }

      app = admin.initializeApp(options);
    }

    const db = admin.firestore();
    await db.collection('users').limit(1).get();
    return { admin, db, app };
  } catch (error) {
    if (app) {
      try { await app.delete(); } catch { /* best-effort — app may not have finished initializing */ }
    }
    return { admin: null, db: null, app: null, error };
  }
}

/**
 * Centralized, idempotent shutdown for whichever Firebase resources this run created.
 * Safe to call with a resources object where some/all fields are still null (e.g. an
 * early failure before any context was built) and safe to call more than once.
 */
async function cleanupResources(resources) {
  if (!resources || resources.cleaned) return;
  resources.cleaned = true;

  if (resources.webDb) {
    try { await terminate(resources.webDb); } catch { /* idempotent — ignore */ }
  }
  if (resources.webApp) {
    try { await deleteApp(resources.webApp); } catch { /* idempotent — ignore */ }
  }
  if (resources.adminApp) {
    try { await resources.adminApp.delete(); } catch { /* idempotent — e.g. already deleted */ }
  }
}

// ---------------------------------------------------------------------------
// Incident-state classification, shared by DRY RUN reporting and APPLY gating.
// ---------------------------------------------------------------------------
function classifyIncidentState({ shift, assignment, vehicle, testDriver, incidentSessionUniverse }) {
  const target = INCIDENT;

  const assignmentPristine = assignment?.status === 'ACTIVE';
  const assignmentRemediated = assignment?.status === target.remediationAssignmentStatus
    && assignment?.remediationIncidentId === target.id;

  const shiftPristine = shift?.status === 'Active';
  const shiftRemediated = shift?.status === target.remediationShiftStatus
    && shift?.remediationIncidentId === target.id
    && !hasOwn(shift, 'activeAssignmentId');

  const vehiclePristine = vehicle?.activeAssignmentId === target.activeAssignmentId
    && vehicle?.activeShiftId === target.activeShiftId;
  const vehicleRemediated = !hasOwn(vehicle, 'activeAssignmentId') && !hasOwn(vehicle, 'activeShiftId');

  const driverPristine = testDriver?.activeShiftId === target.activeShiftId;
  const driverRemediated = testDriver?.activeShiftId !== target.activeShiftId;

  const sessionsNoneRevoked = incidentSessionUniverse.length > 0
    && incidentSessionUniverse.every(s => !isCanonicallyRevoked(s.raw));
  const sessionsAllRevoked = incidentSessionUniverse.length > 0
    && incidentSessionUniverse.every(s => isCanonicallyRevoked(s.raw));

  const componentStates = {
    assignment: assignmentRemediated ? 'REMEDIATED' : (assignmentPristine ? 'PRISTINE' : 'UNEXPECTED'),
    shift: shiftRemediated ? 'REMEDIATED' : (shiftPristine ? 'PRISTINE' : 'UNEXPECTED'),
    vehicle: vehicleRemediated ? 'REMEDIATED' : (vehiclePristine ? 'PRISTINE' : 'UNEXPECTED'),
    driver: driverRemediated ? 'REMEDIATED' : (driverPristine ? 'PRISTINE' : 'UNEXPECTED'),
    sessions: sessionsAllRevoked ? 'REMEDIATED' : (sessionsNoneRevoked ? 'PRISTINE' : 'PARTIAL'),
  };

  const allRemediated = Object.values(componentStates).every(v => v === 'REMEDIATED');
  const allPristine = Object.values(componentStates).every(v => v === 'PRISTINE');

  let overall;
  if (allRemediated) overall = 'ALREADY_REMEDIATED';
  else if (allPristine) overall = 'FRESH_INCIDENT';
  else overall = 'INCONSISTENT_PARTIAL';

  return { overall, componentStates };
}

async function main() {
  console.log('WP8R incident:', INCIDENT.id);
  console.log('Mode:', DRY_RUN ? 'DRY RUN' : 'APPLY');
  console.log('Writes enabled:', APPLY_MODE ? 'YES (confirmed)' : 'NO');

  // Tracks whichever Firebase resources get created below so they can be shut down in
  // the `finally` block regardless of which path (success, early failure, or apply
  // verification failure) the run takes. See cleanupResources().
  const resources = { adminApp: null, webApp: null, webDb: null, cleaned: false };

  try {
  const adminContext = await tryBuildAdminContext();
  const adminAvailable = !!adminContext.db;
  if (adminAvailable) resources.adminApp = adminContext.app;

  if (!adminAvailable && APPLY_MODE) {
    // Apply mode never uses the web fallback, so this check runs before buildWebContext()
    // — no point creating a resource we are about to abort in front of.
    abort('APPLY mode requires working Admin SDK credentials. No writes were attempted.');
  }

  let webDb = null;
  if (!adminAvailable) {
    const webCtx = buildWebContext();
    resources.webApp = webCtx.app;
    resources.webDb = webCtx.db;
    webDb = webCtx.db;
  }
  const readBackend = adminAvailable ? 'admin-sdk' : 'web-sdk-readonly-fallback';

  if (!adminAvailable) {
    console.log('Admin SDK read unavailable; using read-only web SDK fallback for DRY RUN.');
    console.log('Admin SDK error:', String(adminContext.error?.message || adminContext.error || 'unknown error'));
  }

  async function readAll(name) {
    if (adminAvailable) {
      const snap = await adminContext.db.collection(name).get();
      return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    }
    const snap = await getDocs(collection(webDb, name));
    return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  const [users, vehicles, shifts, assignments, inspections, sessions] = await Promise.all([
    readAll('users'),
    readAll('vehicles'),
    readAll('shifts'),
    readAll('vehicleAssignments'),
    readAll('vehicleInspections'),
    readAll('driverSessions'),
  ]);

  const userById = new Map(users.map(user => [user.id, user]));
  const vehicleById = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]));
  const shiftById = new Map(shifts.map(shift => [shift.id, shift]));
  const assignmentById = new Map(assignments.map(assignment => [assignment.id, assignment]));

  const zihaan = userById.get(INCIDENT.zihaan.id);
  const testDriver = userById.get(INCIDENT.testDriver.id);
  const testEv = vehicleById.get(INCIDENT.testEv.id);
  const activeShift = shiftById.get(INCIDENT.activeShiftId);
  const activeAssignment = assignmentById.get(INCIDENT.activeAssignmentId);
  const preserveShift = shiftById.get(INCIDENT.preserveCompletedShiftId);

  assertCondition(zihaan, `Zihaan user document ${INCIDENT.zihaan.id} not found`);
  assertCondition(displayName(zihaan) === 'Zihaan Van Neel', 'Zihaan user identity mismatch');
  assertCondition(testDriver, `Test Test user document ${INCIDENT.testDriver.id} not found`);
  assertCondition(displayName(testDriver) === 'Test Test', 'Test Test user identity mismatch');
  assertCondition(testEv, `TEST EV vehicle document ${INCIDENT.testEv.id} not found`);
  assertCondition((testEv.registration || testEv.alias) === 'TEST EV', 'TEST EV identity mismatch');
  assertCondition(activeShift, `Incident shift ${INCIDENT.activeShiftId} not found`);
  assertCondition(activeAssignment, `Incident assignment ${INCIDENT.activeAssignmentId} not found`);
  assertCondition(preserveShift, `Preserve shift ${INCIDENT.preserveCompletedShiftId} not found`);

  // -------------------------------------------------------------------------
  // SECTION 1 — Zihaan sessions (always read-only, regardless of mode).
  // -------------------------------------------------------------------------
  const zihaanSessions = sessions
    .filter(session => session.driverId === INCIDENT.zihaan.id)
    .map(session => {
      const createdAt = iso(session.createdAt);
      return {
        sessionDocId: session.id,
        createdAt,
        expiresAt: iso(session.expiresAt),
        isRevoked: session.isRevoked === true,
        legacyRevokedAtPresent: hasOwn(session, 'revokedAt'),
        legacyRevokedAtOnlyNoIsRevoked: hasOwn(session, 'revokedAt') && session.isRevoked !== true,
        deviceId: session.deviceId || null,
        lastUsedMetadata: safeLastUsedMetadata(session),
        classification: classifySession(session, createdAt),
      };
    })
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const zihaanAutomationSuspects = zihaanSessions.filter(s => s.classification === 'AUTOMATION-SUSPECT');

  // -------------------------------------------------------------------------
  // SECTION 2 — pin_check_ inventory (FILTER A, all drivers).
  // -------------------------------------------------------------------------
  const pinCheckSessions = sessions
    .map(session => {
      const createdAt = iso(session.createdAt);
      const user = userById.get(session.driverId);
      return {
        sessionDocId: session.id,
        driverId: session.driverId,
        driverName: displayName(user),
        isTestData: user?.isTestData === true ? true : (hasOwn(user, 'isTestData') ? user.isTestData : 'ABSENT'),
        deviceId: session.deviceId || null,
        createdAt,
        expiresAt: iso(session.expiresAt),
        isRevoked: session.isRevoked === true,
        raw: session,
      };
    })
    .filter(session => matchesFilterA(session, session.createdAt))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const pinCheckSummary = {
    total: pinCheckSessions.length,
    belongingToTestTest: pinCheckSessions.filter(s => s.driverId === INCIDENT.testDriver.id).length,
    belongingToRealDrivers: pinCheckSessions.filter(s => s.isTestData !== true).length,
    alreadyRevoked: pinCheckSessions.filter(s => s.isRevoked).length,
    stillActive: pinCheckSessions.filter(s => !s.isRevoked).length,
  };

  // -------------------------------------------------------------------------
  // Build the full incident session universe (FILTER A OR FILTER B), used for
  // both the transaction target list and idempotency classification.
  // -------------------------------------------------------------------------
  const incidentSessionUniverse = sessions
    .map(session => {
      const createdAt = iso(session.createdAt);
      return {
        id: session.id,
        createdAt,
        matchesA: matchesFilterA(session, createdAt),
        matchesB: matchesFilterB(session, createdAt),
        raw: session,
      };
    })
    .filter(s => s.matchesA || s.matchesB);

  const unrevokedCandidates = incidentSessionUniverse.filter(s => !isCanonicallyRevoked(s.raw));

  // -------------------------------------------------------------------------
  // SECTION 3/4 — active test shift + TEST EV pointer inventory.
  // -------------------------------------------------------------------------
  const relatedActiveInspections = inspections
    .filter(inspection => inspection.assignmentId === INCIDENT.activeAssignmentId)
    .map(inspection => ({
      inspectionId: inspection.id,
      boundaryType: inspection.boundaryType || null,
      status: inspection.status || null,
      returnIntent: inspection.returnIntent || null,
      retentionClass: inspection.retentionClass || null,
      exteriorPhotoPath: inspection.exteriorPhotoPath ? 'PRESENT' : 'ABSENT',
      interiorPhotoPath: inspection.interiorPhotoPath ? 'PRESENT' : 'ABSENT',
      createdAt: iso(inspection.createdAt),
      completedAt: iso(inspection.completedAt),
    }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const activeShiftInventory = {
    shiftId: INCIDENT.activeShiftId,
    shiftStatus: activeShift.status || null,
    shiftDriverId: activeShift.driverId || null,
    shiftActiveAssignmentId: hasOwn(activeShift, 'activeAssignmentId') ? activeShift.activeAssignmentId : 'ABSENT',
    shiftVehicleId: activeShift.vehicleId || null,
    assignmentId: INCIDENT.activeAssignmentId,
    assignmentStatus: activeAssignment.status || null,
    assignmentDriverId: activeAssignment.driverId || null,
    assignmentVehicleId: activeAssignment.vehicleId || null,
    assignmentShiftId: activeAssignment.shiftId || null,
    testDriver: {
      id: testDriver.id,
      name: displayName(testDriver),
      isTestData: testDriver.isTestData === true,
      activeShiftId: hasOwn(testDriver, 'activeShiftId') ? testDriver.activeShiftId : 'ABSENT',
    },
    testVehicle: {
      id: testEv.id,
      registration: testEv.registration || null,
      isTestData: testEv.isTestData === true,
      activeAssignmentId: hasOwn(testEv, 'activeAssignmentId') ? testEv.activeAssignmentId : 'ABSENT',
      activeShiftId: hasOwn(testEv, 'activeShiftId') ? testEv.activeShiftId : 'ABSENT',
      status: testEv.status || null,
    },
    inspections: relatedActiveInspections,
  };

  // -------------------------------------------------------------------------
  // Idempotency / incident-state classification.
  // -------------------------------------------------------------------------
  const incidentState = classifyIncidentState({
    shift: activeShift,
    assignment: activeAssignment,
    vehicle: testEv,
    testDriver,
    incidentSessionUniverse,
  });

  const remediationPlan = {
    zihaanPin: {
      action: 'SEPARATE_AUTHORISED_ADMIN_RESET',
      procedure: [
        'Use an authorised admin path (e.g. adminSetDriverPin) to set a new temporary PIN for Zihaan Van Neel.',
        'That path already revokes Zihaan\'s existing sessions as part of the PIN reset — no separate session revocation call is required for Zihaan there.',
        'Communicate the temporary PIN to Zihaan through the approved operational channel.',
        'If the chosen admin path supports it, force a driver PIN change on next login.',
        'Do not attempt to reconstruct or reuse the pre-incident PIN.',
        'This script never performs any of the above — it is intentionally incapable of touching PIN, pinHash, or requiresPinChange.',
      ],
    },
    sessionRevocationFilter: revocationFilterDescription(),
    activeTestShift: {
      recommendedAssignmentTerminalState: INCIDENT.remediationAssignmentStatus,
      recommendedShiftTerminalState: INCIDENT.remediationShiftStatus,
      rationale: [
        'Assignment CANCELLED preserves the audit record without pretending a normal return occurred.',
        'Shift Completed is an existing supported inactive shift state and prevents the UI from treating it as active.',
        'Both records receive explicit remediation metadata naming this incident.',
        'Direct Admin SDK repair is required because no dedicated admin recovery callable exists for this state transition.',
      ],
    },
    transactionSafeguards: [
      'ONE Firestore transaction performs all session revocations AND all pointer/status repair together — no partial remediation is possible.',
      'Every session doc, the shift, the assignment, the vehicle, and the driver are re-read INSIDE the transaction (never trusted from the pre-transaction snapshot).',
      'Each candidate session is re-matched against FILTER A/FILTER B and re-checked for isRevoked !== true inside the transaction.',
      'Verify exact shift ID matches igNZZ90k8oka3RApLBwX.',
      'Verify exact assignment ID matches WNwA0DiGkqNSHoKug7mG.',
      'Verify Test Test driver document ID matches 3MBpEbymKURd7sKQURpk and isTestData === true.',
      'Verify TEST EV vehicle document ID matches CHFLNpC1lmVWMMkOdGRx and isTestData === true.',
      'Verify shift.driverId === Test Test and assignment.driverId === Test Test.',
      'Verify assignment.shiftId === shift.id and assignment.vehicleId === TEST EV.',
      'Verify shift.status === Active and assignment.status === ACTIVE before mutating.',
      'Verify shift.activeAssignmentId still equals the target assignment ID before clearing it.',
      'Verify TEST EV.activeAssignmentId still equals the target assignment ID before clearing it.',
      'Verify TEST EV.activeShiftId still equals the target shift ID before clearing it.',
      'Verify Test Test.activeShiftId still equals the target shift ID before clearing it.',
      'Fail closed (throw, whole transaction aborts, zero writes committed) if ANY assertion above fails.',
      'Never touch completed shift q8Jq5ZX3mCCBVmT9Dq5h or any other shift, assignment, vehicle, inspection, session, or storage object outside this incident.',
      'Total transaction write count is ~' + (unrevokedCandidates.length + 4) + ' (well under Firestore\'s 500-write transaction limit), so a single transaction is technically appropriate.',
    ],
  };

  const dryRunOutput = {
    incident: INCIDENT.id,
    mode: DRY_RUN ? 'DRY_RUN' : 'APPLY',
    readBackend,
    incidentState,
    zihaanSessions,
    zihaanAutomationSuspects,
    pinCheckSummary,
    pinCheckSessions: pinCheckSessions.map(({ raw, ...rest }) => rest),
    revocationFilter: remediationPlan.sessionRevocationFilter,
    incidentSessionCandidateCount: unrevokedCandidates.length,
    activeShiftInventory,
    preserveCompletedWorkflow: {
      shiftId: INCIDENT.preserveCompletedShiftId,
      status: preserveShift.status || null,
      disposition: 'PRESERVE_FOR_NOW',
    },
    remediationRecommendations: remediationPlan,
  };

  printHeading('SECTION 1 — ZIHAAN SESSIONS (READ ONLY, ALWAYS)');
  printJson('Zihaan sessions:', zihaanSessions);

  printHeading('SECTION 2 — PIN_CHECK SESSIONS (FILTER A)');
  printJson('pin_check summary:', pinCheckSummary);
  printJson('pin_check sessions:', pinCheckSessions.map(({ raw, ...rest }) => rest));

  printHeading('SECTION 3 — TEST TEST ACTIVE SHIFT');
  printJson('Active test shift inventory:', activeShiftInventory);

  printHeading('SECTION 4 — TEST EV POINTERS');
  printJson('TEST EV pointer view:', activeShiftInventory.testVehicle);

  printHeading('INCIDENT STATE CLASSIFICATION');
  printJson('Incident state:', incidentState);
  if (incidentState.overall === 'ALREADY_REMEDIATED') {
    console.log('');
    console.log('INCIDENT ALREADY REMEDIATED — every component is in its post-remediation state.');
    console.log('No further action is required or will be attempted.');
  } else if (incidentState.overall === 'INCONSISTENT_PARTIAL') {
    console.log('');
    console.log('STATE IS PARTIALLY REMEDIATED / INCONSISTENT — failing closed.');
    console.log('This script will NOT guess or attempt an automatic repair. Differences:');
    for (const [component, state] of Object.entries(incidentState.componentStates)) {
      console.log(`  ${component}: ${state}`);
    }
  }

  printHeading('SECTION 5 — PROPOSED REMEDIATION');
  printJson('Remediation plan:', remediationPlan);

  if (!APPLY_MODE) {
    printHeading('DRY RUN RESULT');
    printJson('Dry-run output:', dryRunOutput);
    console.log('');
    console.log('DRY RUN COMPLETE — no Firestore changes were made.');
    if (incidentState.overall === 'INCONSISTENT_PARTIAL') {
      process.exitCode = 1;
    }
    return;
  }

  // ===========================================================================
  // APPLY MODE — everything above this line was read-only, including in apply.
  // ===========================================================================

  if (incidentState.overall === 'ALREADY_REMEDIATED') {
    printHeading('APPLY SKIPPED — ALREADY REMEDIATED');
    console.log('Incident state is ALREADY_REMEDIATED. No writes were attempted.');
    return;
  }

  if (incidentState.overall === 'INCONSISTENT_PARTIAL') {
    abort(
      'Incident state is INCONSISTENT_PARTIAL (some components remediated, some not). ' +
      'Refusing to guess or auto-repair. See componentStates above. No writes were attempted.'
    );
  }

  // incidentState.overall === 'FRESH_INCIDENT' from here on.
  const admin = adminContext.admin;
  const db = adminContext.db;
  const FieldValue = admin.firestore.FieldValue;

  const candidateSessionIds = unrevokedCandidates.map(s => s.id);

  printHeading('APPLY — SINGLE ATOMIC TRANSACTION');
  console.log(`Candidate sessions to revoke: ${candidateSessionIds.length}`);
  console.log('Pointer/status targets: assignment, shift, TEST EV, Test Test driver.');
  console.log('All reads and re-validation occur INSIDE the transaction before any write.');

  await db.runTransaction(async transaction => {
    const shiftRef = db.collection('shifts').doc(INCIDENT.activeShiftId);
    const assignmentRef = db.collection('vehicleAssignments').doc(INCIDENT.activeAssignmentId);
    const driverRef = db.collection('users').doc(INCIDENT.testDriver.id);
    const vehicleRef = db.collection('vehicles').doc(INCIDENT.testEv.id);
    const sessionRefs = candidateSessionIds.map(id => db.collection('driverSessions').doc(id));

    // ---- ALL READS FIRST (Firestore transaction requirement) ----
    const [shiftSnap, assignmentSnap, driverSnap, vehicleSnap, ...sessionSnaps] = await Promise.all([
      transaction.get(shiftRef),
      transaction.get(assignmentRef),
      transaction.get(driverRef),
      transaction.get(vehicleRef),
      ...sessionRefs.map(ref => transaction.get(ref)),
    ]);

    // ---- REVALIDATE CORE DOCS ----
    transactionAssert(shiftSnap.exists, 'Target shift disappeared before apply');
    transactionAssert(assignmentSnap.exists, 'Target assignment disappeared before apply');
    transactionAssert(driverSnap.exists, 'Target test driver disappeared before apply');
    transactionAssert(vehicleSnap.exists, 'Target TEST EV disappeared before apply');

    const shift = shiftSnap.data();
    const assignment = assignmentSnap.data();
    const driver = driverSnap.data();
    const vehicle = vehicleSnap.data();

    transactionAssert(shiftSnap.id === INCIDENT.activeShiftId, 'Shift ref ID mismatch');
    transactionAssert(assignmentSnap.id === INCIDENT.activeAssignmentId, 'Assignment ref ID mismatch');
    transactionAssert(driverSnap.id === INCIDENT.testDriver.id, 'Driver ref ID mismatch');
    transactionAssert(vehicleSnap.id === INCIDENT.testEv.id, 'Vehicle ref ID mismatch');

    transactionAssert(driver.isTestData === true, 'Test Test is no longer marked isTestData === true');
    transactionAssert(vehicle.isTestData === true, 'TEST EV is no longer marked isTestData === true');

    transactionAssert(shift.driverId === INCIDENT.testDriver.id, 'Target shift no longer belongs to Test Test');
    transactionAssert(shift.status === 'Active', 'Target shift is no longer Active');
    transactionAssert(shift.activeAssignmentId === INCIDENT.activeAssignmentId, 'Shift.activeAssignmentId no longer matches the incident assignment');

    transactionAssert(assignment.driverId === INCIDENT.testDriver.id, 'Target assignment no longer belongs to Test Test');
    transactionAssert(assignment.shiftId === INCIDENT.activeShiftId, 'Target assignment no longer belongs to the incident shift');
    transactionAssert(assignment.vehicleId === INCIDENT.testEv.id, 'Target assignment no longer belongs to TEST EV');
    transactionAssert(assignment.status === 'ACTIVE', 'Target assignment is no longer ACTIVE');

    transactionAssert(vehicle.activeAssignmentId === INCIDENT.activeAssignmentId, 'Vehicle.activeAssignmentId no longer matches the incident assignment');
    transactionAssert(vehicle.activeShiftId === INCIDENT.activeShiftId, 'Vehicle.activeShiftId no longer matches the incident shift');

    transactionAssert(hasOwn(driver, 'activeShiftId'), 'Driver.activeShiftId is unexpectedly absent for an active shift');
    transactionAssert(driver.activeShiftId === INCIDENT.activeShiftId, 'Driver.activeShiftId no longer matches the incident shift');

    // ---- REVALIDATE EACH CANDIDATE SESSION ----
    for (let i = 0; i < sessionSnaps.length; i++) {
      const snap = sessionSnaps[i];
      const id = candidateSessionIds[i];
      transactionAssert(snap.exists, `Session ${id} disappeared before apply`);
      const s = snap.data();
      const createdAtIso = iso(s.createdAt);
      const stillMatches = matchesFilterA(s, createdAtIso) || matchesFilterB(s, createdAtIso);
      transactionAssert(stillMatches, `Session ${id} no longer matches FILTER A/B — aborting, no partial repair`);
      transactionAssert(s.isRevoked !== true, `Session ${id} was already isRevoked === true — aborting, no partial repair`);
    }

    // ---- WRITES (only after every read-side assertion above has passed) ----
    for (let i = 0; i < sessionRefs.length; i++) {
      transaction.update(sessionRefs[i], {
        isRevoked: true,
        revokedAt: FieldValue.serverTimestamp(),
        revokedReason: INCIDENT.remediationReason,
        remediationIncidentId: INCIDENT.id,
      });
    }

    transaction.update(assignmentRef, {
      status: INCIDENT.remediationAssignmentStatus,
      endedAt: FieldValue.serverTimestamp(),
      transitionReason: INCIDENT.remediationReason,
      remediationIncidentId: INCIDENT.id,
      remediationLabel: 'Antigravity automation side-effect repair',
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(shiftRef, {
      status: INCIDENT.remediationShiftStatus,
      endTime: FieldValue.serverTimestamp(),
      remediationIncidentId: INCIDENT.id,
      remediationLabel: 'Antigravity automation side-effect repair',
      activeAssignmentId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(vehicleRef, {
      activeAssignmentId: FieldValue.delete(),
      activeShiftId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.update(driverRef, {
      activeShiftId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  console.log('');
  console.log('ATOMIC TRANSACTION COMMITTED.');

  // ---------------------------------------------------------------------------
  // POST-APPLY VERIFICATION — fresh reads, independent of the transaction cache.
  // ---------------------------------------------------------------------------
  printHeading('POST-APPLY VERIFICATION');

  const [
    postShiftSnap, postAssignmentSnap, postVehicleSnap, postDriverSnap, postPreserveSnap,
    ...postSessionSnaps
  ] = await Promise.all([
    db.collection('shifts').doc(INCIDENT.activeShiftId).get(),
    db.collection('vehicleAssignments').doc(INCIDENT.activeAssignmentId).get(),
    db.collection('vehicles').doc(INCIDENT.testEv.id).get(),
    db.collection('users').doc(INCIDENT.testDriver.id).get(),
    db.collection('shifts').doc(INCIDENT.preserveCompletedShiftId).get(),
    ...candidateSessionIds.map(id => db.collection('driverSessions').doc(id).get()),
  ]);

  const verificationFailures = [];
  const verify = (ok, label, detail) => {
    console.log(`  [${ok ? 'OK  ' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) verificationFailures.push(label);
  };

  const postShift = postShiftSnap.data();
  const postAssignment = postAssignmentSnap.data();
  const postVehicle = postVehicleSnap.data();
  const postDriver = postDriverSnap.data();
  const postPreserve = postPreserveSnap.data();

  const revokedCount = postSessionSnaps.filter(s => s.exists && s.data().isRevoked === true).length;
  verify(revokedCount === candidateSessionIds.length,
    'all targeted sessions have isRevoked === true',
    `${revokedCount}/${candidateSessionIds.length}`);
  verify(postAssignment?.status === INCIDENT.remediationAssignmentStatus,
    'assignment status === CANCELLED', postAssignment?.status);
  verify(postShift?.status === INCIDENT.remediationShiftStatus,
    'shift status === Completed', postShift?.status);
  verify(!hasOwn(postShift, 'activeAssignmentId'),
    'shift has no activeAssignmentId');
  verify(!hasOwn(postVehicle, 'activeAssignmentId'),
    'TEST EV has no activeAssignmentId');
  verify(!hasOwn(postVehicle, 'activeShiftId'),
    'TEST EV has no activeShiftId');
  verify(postDriver?.activeShiftId !== INCIDENT.activeShiftId,
    'Test Test activeShiftId no longer references the target shift',
    hasOwn(postDriver, 'activeShiftId') ? postDriver.activeShiftId : 'ABSENT');
  verify(postPreserveSnap.exists && postPreserve?.status === preserveShift.status,
    'preserved completed shift still exists and status unchanged',
    postPreserve?.status);

  if (verificationFailures.length) {
    printHeading('POST-APPLY VERIFICATION FAILED');
    console.error('The transaction committed, but post-apply verification found discrepancies:');
    for (const f of verificationFailures) console.error(`  - ${f}`);
    console.error('');
    console.error('No second automatic repair pass will be attempted. Investigate manually.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('POST-APPLY VERIFICATION PASSED — all 8 checks OK.');
  console.log('APPLY COMPLETE — incident remediation writes were performed atomically.');
  } finally {
    // Runs on every path out of the try block above: normal dry-run completion, the
    // INCONSISTENT_PARTIAL early return, the ALREADY_REMEDIATED apply skip, the
    // post-apply verification failure return, and any thrown abort()/assertion error.
    // Closing these handles lets Node's event loop drain naturally — no process.exit()
    // is needed for the success path, and process.exitCode set earlier is preserved.
    await cleanupResources(resources);
  }
}

main().catch(error => {
  // By the time control reaches here, main()'s own try/finally has already run
  // cleanupResources() (cleanupResources is idempotent, so this is also safe if a
  // future edit ever caused it to run twice). This remains a process.exit(1) safety
  // net for genuinely unexpected errors, not the normal dry-run/apply exit path.
  console.error('');
  console.error('FAILURE —', error?.message || error);
  process.exit(1);
});
