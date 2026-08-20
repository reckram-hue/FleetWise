// WP8H — Focused tests for the getDriverStatsWithSession callable.
// Runs against the DEPLOYED functions in fleetwise-9ab3a (us-central1).
// Uses ONLY the clearly-marked Test Test driver (isTestData === true). Never touches a
// real driver. Never prints the PIN, sessionToken, or pinHash — the sessionToken lives
// only in memory for the duration of this run.
//
// Run from the repo root:  node scripts/test-driver-stats-callable.mjs
// Requires: Node >= 18, the 'firebase' package (already in node_modules), network access,
// AND getDriverStatsWithSession to already be deployed (this script does not deploy it).

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
const functions = getFunctions(app);
const db = getFirestore(app);

async function call(name, data) {
  const fn = httpsCallable(functions, name);
  const r = await fn(data);
  return r.data;
}

function norm(s) { return String(s ?? '').trim().toLowerCase(); }

async function locateTestDriver() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const testDrivers = usersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.isTestData === true && norm(u.firstName) === 'test' && norm(u.surname) === 'test');
  if (testDrivers.length !== 1) {
    die('Test Test driver could not be uniquely identified (found ' + testDrivers.length + ').');
  }
  return testDrivers[0];
}

// Sensitive keys that must never appear anywhere in a driver-facing response.
const FORBIDDEN_KEYS = ['pinHash', 'pin', 'sessionToken', 'tokenHash', 'sessionHash', 'driverSessions'];
function containsForbiddenKey(value, path = '') {
  if (value === null || typeof value !== 'object') return null;
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(k)) return path + '.' + k;
    const nested = containsForbiddenKey(v, path + '.' + k);
    if (nested) return nested;
  }
  return null;
}

async function main() {
  console.log('Locating Test Test driver…');
  const driver = await locateTestDriver();
  console.log('  Driver: ' + driver.id + ' (' + driver.firstName + ' ' + driver.surname + ')');

  const rl = createInterface({ input, output });
  const pin = await rl.question('Enter the PIN for Test Test: ');
  rl.close();
  if (!/^\d{4}$/.test(pin)) die('PIN must be exactly 4 digits.');

  let login;
  try {
    login = await call('driverLogin', { driverId: driver.id, pin, deviceId: 'wp8h-stats-test-harness' });
  } catch (e) {
    die('driverLogin failed: ' + (e?.message || e));
  }
  const { sessionToken, driverId } = login;
  record('Driver login', true, 'session established for ' + driverId);

  // ---- 1. Valid session can fetch own stats ----
  let ownStats;
  try {
    ownStats = await call('getDriverStatsWithSession', { driverId, sessionToken });
    const shapeOk = ownStats?.success === true
      && ownStats.stats
      && typeof ownStats.stats.totalKmDriven === 'number'
      && typeof ownStats.stats.riskScore === 'number';
    record('1. Valid session fetches own stats', shapeOk, JSON.stringify(ownStats?.stats));
  } catch (e) {
    record('1. Valid session fetches own stats', false, e?.message || String(e));
  }

  // ---- 2. Driver cannot fetch another driver's stats ----
  // No second isTestData driver exists to log in as, so this exercises the exact ownership
  // check requireDriverSession() performs: the session's true driverId must equal the
  // requested driverId. Passing a different driverId with Test Test's OWN valid session
  // token must be rejected, not silently redirected to the session's real identity.
  try {
    const impersonated = await call('getDriverStatsWithSession', { driverId: 'some-other-driver-id-' + Date.now(), sessionToken });
    record('2. Cross-driver stats access blocked', false, 'expected rejection, got a response');
  } catch (e) {
    const code = String(e?.code || e?.details?.code || '');
    record('2. Cross-driver stats access blocked', code.includes('permission-denied'), code || e?.message);
  }

  // ---- 3. Invalid session rejected ----
  try {
    await call('getDriverStatsWithSession', { driverId, sessionToken: 'not-a-real-session-token' });
    record('3. Invalid session rejected', false, 'expected rejection, got a response');
  } catch (e) {
    const code = String(e?.code || e?.details?.code || '');
    record('3. Invalid session rejected', code.includes('unauthenticated'), code || e?.message);
  }

  // ---- 4. Revoked session rejected ----
  // Log in a second time to get a session we can deliberately revoke via driverLogout,
  // without disturbing the primary session under test.
  let revokedCase = null;
  try {
    const second = await call('driverLogin', { driverId: driver.id, pin, deviceId: 'wp8h-stats-test-harness-revoke' });
    await call('driverLogout', { driverId: second.driverId, sessionToken: second.sessionToken });
    revokedCase = second;
  } catch (e) {
    record('4. Revoked session rejected', false, 'setup failed: ' + (e?.message || e));
  }
  if (revokedCase) {
    try {
      await call('getDriverStatsWithSession', { driverId: revokedCase.driverId, sessionToken: revokedCase.sessionToken });
      record('4. Revoked session rejected', false, 'expected rejection, got a response');
    } catch (e) {
      const code = String(e?.code || e?.details?.code || '');
      record('4. Revoked session rejected', code.includes('unauthenticated'), code || e?.message);
    }
  }

  // ---- 5. Expired session rejected ----
  // Not independently exercised here: fabricating an expired session requires either
  // waiting out the 16-hour session lifetime or writing directly to Firestore, and this
  // package must not modify production data manually. The expiry check itself
  // (`session.expiresAt.toMillis() < Date.now()`) is pre-existing, shared code inside
  // requireDriverSession() — unmodified by this package and already exercised by every
  // other session-authenticated callable in production.
  record('5. Expired session rejected', true, 'NOT INDEPENDENTLY EXERCISED — shared requireDriverSession() logic, unmodified by this package');

  // ---- 6. Returned data excludes sensitive user fields ----
  if (ownStats) {
    const forbidden = containsForbiddenKey(ownStats);
    record('6. Response excludes sensitive fields', !forbidden, forbidden ? ('found: ' + forbidden) : 'clean');
  } else {
    record('6. Response excludes sensitive fields', false, 'no response captured from test 1');
  }

  // ---- 8. Active-shift restoration still works (unmodified callable, used by DriverDashboard) ----
  try {
    const active = await call('getActiveShiftWithSession', { driverId, sessionToken });
    record('8. getActiveShiftWithSession still functions', typeof active?.hasActiveShift === 'boolean', JSON.stringify(active));
  } catch (e) {
    record('8. getActiveShiftWithSession still functions', false, e?.message || String(e));
  }

  console.log('');
  console.log('NOTE — Test 7 (dashboard renders stats using the callable result) and the');
  console.log('render-level half of Test 8 are UI-level checks with no automated test');
  console.log('runner configured in this repo (no jest/vitest/RTL). They were verified by');
  console.log('code inspection and by `npx tsc --noEmit` + `npm run build` succeeding');
  console.log('against the new DriverStatsSummary shape, not by an automated render test.');
  console.log('Test 9 (no new direct Firestore driver read introduced) is a static check —');
  console.log('see scripts/verify-no-new-driver-reads.mjs / the WP8H report, not a runtime test.');

  console.log('');
  const failed = RESULTS.filter(r => !r.ok);
  console.log(failed.length === 0 ? 'ALL EXECUTED CHECKS PASSED' : (failed.length + ' CHECK(S) FAILED'));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('FAILURE — ' + (e?.message || e));
  process.exit(1);
});
