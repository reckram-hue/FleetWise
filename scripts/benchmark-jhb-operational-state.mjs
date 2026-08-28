// Local client-style benchmark for the authenticated JHB operational-state callable.
// The driver session token remains in memory and is never logged.

import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { deleteApp, initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const EXPECTED_PROJECT_ID = 'fleetwise-9ab3a';
const REGION = 'africa-south1';
const LOGIN_CALLABLE_NAME = 'driverLoginJhb';
const STATE_CALLABLE_NAME = 'getDriverOperationalStateJhb';
const TEST_DRIVER_ID = 'jhb-test-driver';
const TEST_DRIVER_PIN = '2468';
const DEVICE_ID = 'jhb-operational-state-benchmark';
const RUN_COUNT = 5;

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadFirebaseConfig() {
  const repositoryEnv = new URL('../.env', import.meta.url);
  if (!existsSync(repositoryEnv)) throw new Error('Missing repository .env file.');

  const values = parseEnv(readFileSync(repositoryEnv, 'utf8'));
  const localEnv = new URL('../.env.local', import.meta.url);
  if (existsSync(localEnv)) Object.assign(values, parseEnv(readFileSync(localEnv, 'utf8')));

  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ]) {
    if (process.env[key]) values[key] = process.env[key];
    if (!values[key]) throw new Error(`Missing ${key} in the repository Firebase configuration.`);
  }

  if (values.VITE_FIREBASE_PROJECT_ID !== EXPECTED_PROJECT_ID) {
    throw new Error('Firebase configuration does not target the expected FleetWise project.');
  }

  return {
    apiKey: values.VITE_FIREBASE_API_KEY,
    authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: values.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: values.VITE_FIREBASE_APP_ID,
  };
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function timingSummary(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = samples.reduce((sum, value) => sum + value, 0);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];

  return {
    min: roundMs(sorted[0]),
    max: roundMs(sorted[sorted.length - 1]),
    average: roundMs(total / samples.length),
    median: roundMs(median),
  };
}

function safeStateSummary(data) {
  return {
    hasActiveShift: data?.hasActiveShift === true,
    hasActiveAssignment: data?.hasActiveAssignment === true,
    hasVehicle: data?.vehicle != null,
    inspectionCount: Array.isArray(data?.inspections) ? data.inspections.length : 0,
  };
}

async function main() {
  const app = initializeApp(loadFirebaseConfig(), 'fleetwise-jhb-operational-state-benchmark');
  const functions = getFunctions(app, REGION);
  const driverLogin = httpsCallable(functions, LOGIN_CALLABLE_NAME);
  const getOperationalState = httpsCallable(functions, STATE_CALLABLE_NAME);

  try {
    const loginStartedAt = performance.now();
    let loginResponse;
    try {
      loginResponse = await driverLogin({
        driverId: TEST_DRIVER_ID,
        pin: TEST_DRIVER_PIN,
        deviceId: DEVICE_ID,
      });
    } catch {
      console.log(JSON.stringify({
        loginElapsedMs: roundMs(performance.now() - loginStartedAt),
        success: false,
      }));
      throw new Error('driverLoginJhb authentication failed.');
    }

    const loginElapsedMs = performance.now() - loginStartedAt;
    const sessionToken = loginResponse.data?.sessionToken;
    if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
      throw new Error('driverLoginJhb returned no usable session.');
    }
    if (loginResponse.data?.driverId !== TEST_DRIVER_ID) {
      throw new Error('driverLoginJhb returned an unexpected driver.');
    }

    console.log(JSON.stringify({
      loginElapsedMs: roundMs(loginElapsedMs),
      success: true,
    }));

    const elapsedSamples = [];
    let failedRuns = 0;

    for (let run = 1; run <= RUN_COUNT; run += 1) {
      const startedAt = performance.now();
      let success = false;
      let state = null;

      try {
        const response = await getOperationalState({
          driverId: TEST_DRIVER_ID,
          sessionToken,
        });
        success = response.data?.success === true;
        state = safeStateSummary(response.data);
      } catch {
        failedRuns += 1;
      }

      const elapsedMs = performance.now() - startedAt;
      elapsedSamples.push(elapsedMs);
      console.log(JSON.stringify({
        run,
        elapsedMs: roundMs(elapsedMs),
        success,
        state,
      }));
    }

    console.log(JSON.stringify(timingSummary(elapsedSamples), null, 2));
    if (failedRuns > 0) throw new Error(`${failedRuns} operational-state call(s) failed.`);
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Benchmark failed.');
  process.exitCode = 1;
});
