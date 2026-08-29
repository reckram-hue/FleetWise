// src/lib/firebase.ts  — FULL DROP-IN
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  memoryLocalCache, // fallback if IndexedDB blocked
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";

// Read from Vite env
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured =
  !!cfg.apiKey && !!cfg.authDomain && !!cfg.projectId && !!cfg.appId;

const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(cfg);

// On restrictive networks, the default streaming transport can hang.
// Force long polling and disable fetch streams; also set a cache provider that works everywhere.
const useMemoryCache = false; // set true only if IndexedDB is broken in your browser profile
initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: useMemoryCache ? memoryLocalCache() : persistentLocalCache(),
});

// Exports
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
const functionsRegion = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";
export const functions = getFunctions(app, functionsRegion);

// Temporary performance instrumentation for the driver journeys. The correlation ID is
// random and opaque; it is never derived from credentials, users, or business data.
const DRIVER_PERF_CALLABLES = new Set([
  'driverLogin',
  'driverLogout',
  'listDriversSafe',
  'getActiveShiftWithSession',
  'getDriverOperationalState',
  'getActiveVehicleAssignment',
  'listVehiclesForSession',
  'getVehicleForSession',
  'getVehicleDefectsForSession',
  'startShift',
  'startVehicleAssignment',
  'createVehicleInspection',
  'uploadInspectionPhoto',
  'completeVehicleInspection',
  'getAssignmentInspections',
  'endVehicleAssignment',
  'endShiftWithSession',
]);

const performanceCallCounts = new Map<string, number>();

type CallablePerformanceMetadata = {
  compressedBytes?: number;
};

function createPerformanceRequestId(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `fwperf-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
}

function currentRoute(): string {
  return window.location.hash || window.location.pathname || '/';
}

function logCallablePerformance(
  callable: string,
  callNumber: number,
  correlationId: string,
  startedAtIso: string,
  elapsedMs: number,
  success: boolean,
  metadata?: CallablePerformanceMetadata,
): void {
  // Keep the structured payload deliberately free of request data and credentials.
  console.info(`[FW-PERF] ${callable} call #${callNumber}`, {
    callable,
    elapsedMs: Math.round(elapsedMs * 10) / 10,
    route: currentRoute(),
    correlationId,
    success,
    timestamp: startedAtIso,
    ...(typeof metadata?.compressedBytes === 'number'
      ? { compressedBytes: metadata.compressedBytes }
      : {}),
  });
}

// Helper to call a Firebase callable Cloud Function.
export async function callFunction<T = any>(
  name: string,
  data?: unknown,
  performanceMetadata?: CallablePerformanceMetadata,
): Promise<T> {
  const fn = httpsCallable(functions, name);
  const shouldMeasure = DRIVER_PERF_CALLABLES.has(name) && !!data && typeof data === 'object' && !Array.isArray(data);
  const startedAt = performance.now();
  const startedAtIso = new Date().toISOString();
  const correlationId = shouldMeasure ? createPerformanceRequestId() : '';
  const callKey = `${currentRoute()}|${name}`;
  const callNumber = shouldMeasure ? (performanceCallCounts.get(callKey) || 0) + 1 : 0;
  if (shouldMeasure) performanceCallCounts.set(callKey, callNumber);

  // The server treats performanceRequestId as logging-only metadata. Existing callers
  // remain compatible because functions without instrumentation ignore unknown fields.
  const payload = shouldMeasure
    ? { ...(data as Record<string, unknown>), performanceRequestId: correlationId }
    : data;

  try {
    const result = await fn(payload);
    if (shouldMeasure) {
      logCallablePerformance(name, callNumber, correlationId, startedAtIso, performance.now() - startedAt, true, performanceMetadata);
    }
    return result.data as T;
  } catch (error) {
    if (shouldMeasure) {
      logCallablePerformance(name, callNumber, correlationId, startedAtIso, performance.now() - startedAt, false, performanceMetadata);
    }
    throw error;
  }
}
