// Deterministic fixture seeder for the isolated Johannesburg FleetWise stack.
//
// Default mode is a local dry run. The only write-capable modes are:
//   node scripts/seed-jhb-test-fixtures.mjs --apply
//   node scripts/seed-jhb-test-fixtures.mjs --cleanup
//
// Safety properties:
//   - Firestore is always initialized with the named database fleetwise-jhb-test.
//   - The script fails closed if the project or database ID is not the expected value.
//   - Storage is never imported or initialized.
//   - Only the three exact deterministic document paths in FIXTURES are read or written.
//   - Existing documents are never overwritten or deleted unless they carry this
//     seeder's exact ownership marker and isTestData === true.

import { createRequire } from 'node:module';

const PROJECT_ID = 'fleetwise-9ab3a';
const DATABASE_ID = 'fleetwise-jhb-test';
const APP_NAME = 'fleetwise-jhb-test-fixture-seeder';
const FIXTURE_OWNER = 'fleetwise-jhb-test-fixture-seeder-v1';
const FIXTURE_VERSION = 1;

const TEST_PIN = '2468';
const TEST_PIN_HASH = '$2a$10$JhbFleetWiseSeedSalt0uE7vBUMxgrq53t7PXYB9b4QTF/RYH3gi';

const DRIVER_ID = 'jhb-test-driver';
const EV_ID = 'jhb-test-ev';
const ICE_ID = 'jhb-test-ice';

const FIXTURES = Object.freeze([
  Object.freeze({
    collection: 'users',
    id: DRIVER_ID,
    data: Object.freeze({
      firstName: 'Test',
      surname: 'Test',
      role: 'driver',
      employmentStatus: 'Active',
      orgId: 'default',
      area: 'Johannesburg',
      department: 'FleetWise Test',
      allowedVehicles: Object.freeze([EV_ID, ICE_ID]),
      pinHash: TEST_PIN_HASH,
      isTestData: true,
      fixtureOwner: FIXTURE_OWNER,
      fixtureVersion: FIXTURE_VERSION,
    }),
  }),
  Object.freeze({
    collection: 'vehicles',
    id: EV_ID,
    data: Object.freeze({
      registration: 'TEST EV',
      alias: 'JHB TEST EV',
      make: 'FleetWise',
      model: 'Deterministic EV',
      year: 2026,
      colour: 'White',
      status: 'Active',
      vehicleType: 'EV',
      fuelType: 'Electric',
      batteryCapacityKwh: 60,
      currentOdometer: 10000,
      isTestData: true,
      fixtureOwner: FIXTURE_OWNER,
      fixtureVersion: FIXTURE_VERSION,
    }),
  }),
  Object.freeze({
    collection: 'vehicles',
    id: ICE_ID,
    data: Object.freeze({
      registration: 'TEST ICE',
      alias: 'JHB TEST ICE',
      make: 'FleetWise',
      model: 'Deterministic ICE',
      year: 2026,
      colour: 'White',
      status: 'Active',
      vehicleType: 'ICE',
      fuelType: 'Petrol',
      currentOdometer: 20000,
      isTestData: true,
      fixtureOwner: FIXTURE_OWNER,
      fixtureVersion: FIXTURE_VERSION,
    }),
  }),
]);

function fail(message) {
  throw new Error(`REFUSING TO RUN: ${message}`);
}

function printUsage() {
  console.log(`Usage:
  node scripts/seed-jhb-test-fixtures.mjs [--dry-run]
  node scripts/seed-jhb-test-fixtures.mjs --apply
  node scripts/seed-jhb-test-fixtures.mjs --cleanup [--dry-run]

Modes:
  default / --dry-run   Print the exact seed plan; perform no Firebase access.
  --apply               Seed or reset only the three owned fixture documents.
  --cleanup             Delete only the three owned fixture documents.
  --cleanup --dry-run   Print the exact cleanup plan; perform no Firebase access.

Isolated test login:
  driverId: ${DRIVER_ID}
  PIN: ${TEST_PIN} (JHB named-database test use only)`);
}

function parseMode(argv) {
  const supported = new Set(['--apply', '--cleanup', '--dry-run', '--help']);
  const unknown = argv.filter((value) => !supported.has(value));
  if (unknown.length > 0) fail(`unsupported argument(s): ${unknown.join(', ')}`);

  if (argv.includes('--help')) return 'help';
  if (argv.includes('--apply') && argv.includes('--cleanup')) {
    fail('--apply and --cleanup are mutually exclusive');
  }
  if (argv.includes('--apply') && argv.includes('--dry-run')) {
    fail('--apply and --dry-run are mutually exclusive');
  }
  if (argv.includes('--cleanup') && !argv.includes('--dry-run')) return 'cleanup';
  if (argv.includes('--apply')) return 'seed';
  return argv.includes('--cleanup') ? 'cleanup-dry-run' : 'seed-dry-run';
}

function assertStaticConfiguration() {
  if (PROJECT_ID !== 'fleetwise-9ab3a') fail(`unexpected project ID ${PROJECT_ID}`);
  if (DATABASE_ID !== 'fleetwise-jhb-test' || DATABASE_ID === '(default)') {
    fail(`unexpected Firestore database ID ${DATABASE_ID}`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    fail('FIRESTORE_EMULATOR_HOST is set; this script targets only the named JHB database');
  }

  for (const envName of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    const value = process.env[envName];
    if (value && value !== PROJECT_ID) {
      fail(`${envName} points to ${value}, not ${PROJECT_ID}`);
    }
  }

  const paths = new Set();
  for (const fixture of FIXTURES) {
    const path = `${fixture.collection}/${fixture.id}`;
    if (paths.has(path)) fail(`duplicate fixture path ${path}`);
    paths.add(path);
    if (fixture.data.isTestData !== true) fail(`${path} is not marked isTestData=true`);
    if (fixture.data.fixtureOwner !== FIXTURE_OWNER) fail(`${path} has the wrong fixture owner`);
  }
}

function printableFixture(fixture) {
  const data = { ...fixture.data };
  if ('pinHash' in data) data.pinHash = '<deterministic bcrypt hash omitted>';
  return { path: `${fixture.collection}/${fixture.id}`, data };
}

function printPlan(mode) {
  const cleanup = mode.startsWith('cleanup');
  const dryRun = mode.endsWith('dry-run');
  console.log('FleetWise Johannesburg deterministic fixture seeder');
  console.log(`Mode: ${cleanup ? 'CLEANUP' : 'SEED'}${dryRun ? ' DRY RUN' : ''}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Firestore database: ${DATABASE_ID}`);
  console.log('Default Firestore database allowed: NO');
  console.log('Storage initialized: NO');
  console.log(`Fixture owner: ${FIXTURE_OWNER}`);
  console.log(`Test PIN: ${TEST_PIN} (isolated JHB test use only)`);
  console.log(cleanup ? 'Exact document paths eligible for deletion:' : 'Exact deterministic fixtures:');
  console.log(JSON.stringify(
    cleanup
      ? FIXTURES.map(({ collection, id }) => `${collection}/${id}`)
      : FIXTURES.map(printableFixture),
    null,
    2,
  ));
  if (dryRun) console.log('DRY RUN COMPLETE — no Firebase client was initialized; no reads or writes occurred.');
}

function assertOwnedFixture(snapshot, fixture) {
  if (!snapshot.exists) return;
  const current = snapshot.data();
  const path = `${fixture.collection}/${fixture.id}`;
  if (
    current.isTestData !== true
    || current.fixtureOwner !== FIXTURE_OWNER
    || current.fixtureVersion !== FIXTURE_VERSION
  ) {
    fail(`${path} already exists without this seeder's exact ownership markers`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function exactDataMatches(actual, expected) {
  return JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(expected));
}

function buildCredential(adminApp) {
  const credentialJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credentialJson) return adminApp.applicationDefault();

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(credentialJson);
  } catch {
    fail('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON');
  }
  if (serviceAccount.project_id !== PROJECT_ID) {
    fail('GOOGLE_APPLICATION_CREDENTIALS_JSON belongs to a different project');
  }
  return adminApp.cert(serviceAccount);
}

async function openNamedDatabase() {
  const functionsRequire = createRequire(new URL('../functions-jhb/package.json', import.meta.url));
  const adminApp = functionsRequire('firebase-admin/app');
  const adminFirestore = functionsRequire('firebase-admin/firestore');
  const bcrypt = functionsRequire('bcryptjs');

  if (!bcrypt.compareSync(TEST_PIN, TEST_PIN_HASH)) {
    fail('embedded test PIN hash is invalid');
  }

  const app = adminApp.initializeApp(
    { projectId: PROJECT_ID, credential: buildCredential(adminApp) },
    APP_NAME,
  );
  const db = adminFirestore.getFirestore(app, DATABASE_ID);

  if (app.options.projectId !== PROJECT_ID) {
    await adminApp.deleteApp(app);
    fail(`Admin app resolved project ${app.options.projectId}`);
  }
  if (db.databaseId !== DATABASE_ID || db.databaseId === '(default)') {
    await adminApp.deleteApp(app);
    fail(`Firestore client resolved database ${db.databaseId}`);
  }

  console.log(`Runtime target verified: projects/${PROJECT_ID}/databases/${db.databaseId}`);
  console.log('Storage client initialized: NO');
  return { app, db, deleteApp: adminApp.deleteApp };
}

async function seedFixtures(db) {
  const refs = FIXTURES.map((fixture) => db.collection(fixture.collection).doc(fixture.id));

  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    snapshots.forEach((snapshot, index) => assertOwnedFixture(snapshot, FIXTURES[index]));
    refs.forEach((ref, index) => transaction.set(ref, FIXTURES[index].data));
  });

  const verified = await Promise.all(refs.map((ref) => ref.get()));
  verified.forEach((snapshot, index) => {
    const fixture = FIXTURES[index];
    if (!snapshot.exists || !exactDataMatches(snapshot.data(), fixture.data)) {
      fail(`post-seed verification failed for ${fixture.collection}/${fixture.id}`);
    }
  });

  console.log('SEED COMPLETE — exactly three deterministic fixture documents verified.');
}

async function cleanupFixtures(db) {
  const refs = FIXTURES.map((fixture) => db.collection(fixture.collection).doc(fixture.id));
  const deleted = await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    snapshots.forEach((snapshot, index) => assertOwnedFixture(snapshot, FIXTURES[index]));

    const removed = [];
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) return;
      transaction.delete(refs[index]);
      removed.push(`${FIXTURES[index].collection}/${FIXTURES[index].id}`);
    });
    return removed;
  });

  const remaining = await Promise.all(refs.map((ref) => ref.get()));
  if (remaining.some((snapshot) => snapshot.exists)) {
    fail('post-cleanup verification found a remaining deterministic fixture document');
  }

  console.log(`CLEANUP COMPLETE — deleted ${deleted.length} owned fixture document(s).`);
  deleted.forEach((path) => console.log(`Deleted: ${path}`));
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === 'help') {
    printUsage();
    return;
  }

  assertStaticConfiguration();
  printPlan(mode);
  if (mode.endsWith('dry-run')) return;

  const { app, db, deleteApp } = await openNamedDatabase();
  try {
    if (mode === 'seed') await seedFixtures(db);
    else await cleanupFixtures(db);
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
