// ONE-OFF guarded script: mark exactly three Firestore documents isTestData=true.
// Authorised ONLY by the current work package. Additive single-field merge only.
// Never prints PIN/pinHash/session tokens. Never name-searches before writing.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const getEnv = n => { const l = envText.split(/\r?\n/).find(x => x.trim().startsWith(n + '=')); return l ? l.substring(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : undefined; };
const app = initializeApp({
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID'),
});
const db = getFirestore(app);

const TARGETS = [
  { coll: 'users', id: '3MBpEbymKURd7sKQURpk', label: 'Test Test (PIN-enabled)',
    check: d => d.firstName === 'Test' && d.surname === 'Test' && d.role === 'driver' },
  { coll: 'vehicles', id: 'CHFLNpC1lmVWMMkOdGRx', label: 'TEST EV',
    check: d => d.registration === 'TEST EV' && d.vehicleType === 'EV' },
  { coll: 'vehicles', id: 'VZExr8elHqnoGaud6huU', label: 'TEST ICE',
    check: d => d.registration === 'TEST ICE' && d.vehicleType === 'ICE' },
];
const DUPLICATE = { coll: 'users', id: 'cZSJZBH6RpirZ4daIk4C', label: 'Duplicate Test Test' };

function testState(d) {
  return d.isTestData === true ? 'true' : (d.isTestData === undefined || d.isTestData === null ? 'ABSENT' : JSON.stringify(d.isTestData));
}

// ---- PHASE 1: pre-check all three + duplicate (no writes yet) ----
let allOk = true;
for (const t of TARGETS) {
  const snap = await getDoc(doc(db, t.coll, t.id));
  if (!snap.exists()) { console.error('STOP — ' + t.label + ' (' + t.id + ') does not exist'); allOk = false; continue; }
  const d = snap.data();
  if (!t.check(d)) { console.error('STOP — ' + t.label + ' (' + t.id + ') identity mismatch'); allOk = false; continue; }
  if (d.isTestData !== true && d.isTestData !== undefined && d.isTestData !== null) { console.error('STOP — ' + t.label + ' isTestData = ' + JSON.stringify(d.isTestData) + ' (not absent/true)'); allOk = false; continue; }
  console.log('PRE-CHECK OK — ' + t.label + ' (' + t.id + '): isTestData = ' + testState(d));
}
const dupSnap = await getDoc(doc(db, DUPLICATE.coll, DUPLICATE.id));
if (!dupSnap.exists()) { console.error('STOP — duplicate ' + DUPLICATE.id + ' not found'); allOk = false; }
else {
  const dd = dupSnap.data();
  if (dd.isTestData === true) { console.error('STOP — duplicate already true (unexpected)'); allOk = false; }
  else console.log('PRE-CHECK OK — duplicate ' + DUPLICATE.id + ' isTestData = ' + testState(dd) + ' (will remain untouched)');
}
if (!allOk) { console.error('ABORT — no writes performed'); process.exit(1); }

// ---- PHASE 2: additive single-field merge on the three authorised docs only ----
for (const t of TARGETS) {
  await updateDoc(doc(db, t.coll, t.id), { isTestData: true });
  console.log('WROTE isTestData:true -> ' + t.label + ' (' + t.id + ')');
}

// ---- PHASE 3: post-write verification ----
let verifyOk = true;
for (const t of TARGETS) {
  const snap = await getDoc(doc(db, t.coll, t.id));
  const d = snap.data();
  if (d.isTestData === true) console.log('VERIFY OK — ' + t.label + ' isTestData === true');
  else { console.error('VERIFY FAIL — ' + t.label + ' isTestData = ' + JSON.stringify(d.isTestData)); verifyOk = false; }
}
const dup2 = await getDoc(doc(db, DUPLICATE.coll, DUPLICATE.id));
const dd2 = dup2.data();
if (dd2.isTestData !== true) console.log('VERIFY OK — duplicate isTestData still not true (' + testState(dd2) + ')');
else { console.error('VERIFY FAIL — duplicate was marked true!'); verifyOk = false; }

console.log(verifyOk ? '\nRESULT: SUCCESS — exactly three isTestData fields set' : '\nRESULT: FAILURE');
process.exit(verifyOk ? 0 : 1);