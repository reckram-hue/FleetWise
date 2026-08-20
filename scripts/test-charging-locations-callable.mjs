// WP Charging B — focused test harness for listChargingLocationsForSession.
// It uses only the dedicated Test Test driver. It never creates, updates, or deletes
// charging locations. Run only after the callable has been deployed:
//   node scripts/test-charging-locations-callable.mjs
// The test logs in through the normal driver path and revokes that test session at the end.

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const TEST_DRIVER_ID = '3MBpEbymKURd7sKQURpk';
const FORBIDDEN_KEYS = new Set([
  'active', 'orgId', 'tariffMethod', 'tariffRate', 'createdAt', 'createdBy',
  'updatedAt', 'updatedBy', 'pin', 'pinHash', 'sessionToken', 'tokenHash', 'sessionHash',
]);

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator > 0) out[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return out;
}

function fail(message) {
  console.error('FAIL  ' + message);
  process.exitCode = 1;
}

function record(name, ok) {
  if (ok) console.log('PASS  ' + name);
  else fail(name);
}

function hasForbiddenKey(value) {
  return value.some((location) => Object.keys(location).some((key) => FORBIDDEN_KEYS.has(key)));
}

const env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']) {
  if (!env[key]) throw new Error(`Missing ${key} in .env`);
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

async function call(name, data) {
  const result = await httpsCallable(functions, name)(data);
  return result.data;
}

async function main() {
  const readline = createInterface({ input, output });
  const pin = await readline.question('Enter the PIN for Test Test: ');
  readline.close();
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits.');

  let session;
  try {
    session = await call('driverLogin', {
      driverId: TEST_DRIVER_ID,
      pin,
      deviceId: 'charging-locations-callable-test',
    });

    const response = await call('listChargingLocationsForSession', {
      driverId: session.driverId,
      sessionToken: session.sessionToken,
    });
    const locations = response?.chargingLocations;
    const allowedKeys = ['id', 'name', 'type', 'description', 'provider', 'chargerType', 'costOwner'];
    const sorted = Array.isArray(locations) && locations.every((location, index) =>
      index === 0 || (locations[index - 1].name.localeCompare(location.name, 'en', { sensitivity: 'base' }) <= 0)
    );
    const shape = Array.isArray(locations)
      && locations.every((location) => Object.keys(location).every((key) => allowedKeys.includes(key)));

    record('Valid Test Test session returned a location array', Array.isArray(locations));
    record('Results are sorted by name', sorted);
    record('Response uses the driver-safe projection', shape && !hasForbiddenKey(locations));

    if (Array.isArray(locations) && locations.length === 0) {
      console.log('NOTE  No test charging locations exist; active-only filtering requires admin-created active/inactive test fixtures for live verification.');
    }

    try {
      await call('listChargingLocationsForSession', {
        driverId: session.driverId,
        sessionToken: 'not-a-real-session-token',
      });
      fail('Invalid session token was accepted');
    } catch (error) {
      const code = String(error?.code || '');
      if (code.includes('unauthenticated')) console.log('PASS  Invalid session token rejected');
      else fail('Invalid session token returned unexpected error: ' + code);
    }
  } finally {
    if (session?.driverId && session?.sessionToken) {
      await call('driverLogout', { driverId: session.driverId, sessionToken: session.sessionToken });
      try {
        await call('listChargingLocationsForSession', {
          driverId: session.driverId,
          sessionToken: session.sessionToken,
        });
        fail('Revoked session token was accepted');
      } catch (error) {
        const code = String(error?.code || '');
        if (code.includes('unauthenticated')) console.log('PASS  Revoked session token rejected');
        else fail('Revoked session token returned unexpected error: ' + code);
      }
    }
    await deleteApp(app);
  }
}

main().catch((error) => {
  fail(error?.message || String(error));
});
