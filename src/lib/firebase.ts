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
export const functions = getFunctions(app); // default region us-central1

// Helper to call a Firebase callable Cloud Function.
export async function callFunction<T = any>(name: string, data?: unknown): Promise<T> {
  const fn = httpsCallable(functions, name);
  const result = await fn(data);
  return result.data as T;
}
