// Guarded admin-access cleanup script.
// Default mode is DRY RUN. Firestore writes require --apply AND --confirm-admin-cleanup.
// Scope is intentionally narrow:
//   - reads only users with role == 'admin'
//   - keeps exactly one admin by email: reckram@gmail.com
//   - proposes setting every other admin user's employmentStatus to 'Inactive'
//   - never deletes records
//   - never touches drivers, vehicles, shifts, inspections, sessions, or Storage

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const KEEP_ADMIN_EMAIL = 'reckram@gmail.com';
const APPLY_MODE = process.argv.includes('--apply');
const CONFIRM_FLAG = process.argv.includes('--confirm-admin-cleanup');
const DRY_RUN = !APPLY_MODE;

if (APPLY_MODE && !CONFIRM_FLAG) {
  console.error('');
  console.error('============================================================');
  console.error('REFUSING TO RUN — MISSING SECOND CONFIRMATION FLAG');
  console.error('============================================================');
  console.error('--apply was supplied without --confirm-admin-cleanup.');
  console.error('Both flags are required to perform any Firestore write.');
  console.error('');
  console.error('  node scripts/admin-access-cleanup.mjs --apply --confirm-admin-cleanup');
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
  return `${user?.firstName || ''} ${user?.surname || ''}`.trim() || null;
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

function abort(message) {
  throw new Error(message);
}

function assertCondition(condition, message) {
  if (!condition) abort(message);
}

async function buildAdminContext() {
  const admin = require('../functions/node_modules/firebase-admin');
  let app = null;

  try {
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
      try { await app.delete(); } catch { /* best effort */ }
    }
    throw error;
  }
}

async function main() {
  console.log('Admin access cleanup mode:', DRY_RUN ? 'DRY RUN' : 'APPLY');
  console.log('Writes enabled:', APPLY_MODE ? 'YES (confirmed)' : 'NO');
  console.log('Keeper email:', KEEP_ADMIN_EMAIL);

  const { admin, db, app } = await buildAdminContext();

  try {
    const snapshot = await db.collection('users').where('role', '==', 'admin').get();
    const admins = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const keepers = admins.filter((user) => String(user.email || '').toLowerCase() === KEEP_ADMIN_EMAIL);
    assertCondition(keepers.length === 1, `Expected exactly one keeper admin with email ${KEEP_ADMIN_EMAIL}, found ${keepers.length}`);

    const keeperId = keepers[0].id;
    const plan = admins.map((user) => {
      const currentStatus = Object.prototype.hasOwnProperty.call(user, 'employmentStatus')
        ? user.employmentStatus
        : 'ABSENT';

      let action = 'KEEP_UNCHANGED';
      if (user.id !== keeperId) {
        action = currentStatus === 'Inactive' ? 'ALREADY_INACTIVE' : 'SET_INACTIVE';
      }

      return {
        id: user.id,
        name: displayName(user),
        email: user.email || null,
        role: user.role || null,
        currentEmploymentStatus: currentStatus,
        action,
        updatedAt: iso(user.updatedAt),
      };
    });

    const updates = plan.filter((entry) => entry.action === 'SET_INACTIVE');

    printHeading('ADMIN ACCESS INVENTORY');
    printJson('Admin cleanup plan:', {
      keeperAdminId: keeperId,
      keeperEmail: KEEP_ADMIN_EMAIL,
      totalAdmins: plan.length,
      proposedInactiveCount: updates.length,
      plan,
    });

    if (!APPLY_MODE) {
      printHeading('DRY RUN RESULT');
      console.log('DRY RUN COMPLETE — no Firestore changes were made.');
      return;
    }

    printHeading('APPLY');
    console.log(`Applying employmentStatus = "Inactive" to ${updates.length} admin record(s).`);

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const entry of updates) {
      const ref = db.collection('users').doc(entry.id);
      batch.update(ref, {
        employmentStatus: 'Inactive',
        updatedAt: now,
        adminAccessCleanupAt: now,
        adminAccessCleanupReason: 'ADMIN_ACCESS_CONSOLIDATION',
      });
    }

    await batch.commit();

    printHeading('APPLY RESULT');
    console.log(`Updated ${updates.length} admin record(s).`);
  } finally {
    try { await app.delete(); } catch { /* best effort */ }
  }
}

main().catch((error) => {
  console.error('');
  console.error('FAILURE —', error?.message || error);
  process.exit(1);
});
