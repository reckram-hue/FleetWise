const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const source = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');

const expectedCallables = [
  'adminSetDriverPin',
  'archiveDriver',
  'completeVehicleInspection',
  'createAdminUser',
  'createChargingLocation',
  'createDriver',
  'createVehicleInspection',
  'driverChangePin',
  'driverLogin',
  'driverLogout',
  'endChargingSession',
  'endShiftWithSession',
  'endVehicleAssignment',
  'getActiveShiftWithSession',
  'getActiveVehicleAssignment',
  'getAdminProfile',
  'getAssignmentInspections',
  'getDriverOperationalState',
  'getDriverStatsWithSession',
  'getLeaderboard',
  'getVehicleDefectsForSession',
  'getVehicleForSession',
  'listChargingLocationsAdmin',
  'listChargingLocationsForSession',
  'listDriversSafe',
  'listOdometerDiscrepancies',
  'listUsersAdmin',
  'listVehiclesForSession',
  'logRefuelWithSession',
  'reportDefectWithSession',
  'startChargingSession',
  'startShift',
  'startVehicleAssignment',
  'updateChargingLocation',
  'updateDriver',
  'updateEmploymentStatus',
  'updateOdometerDiscrepancyStatus',
  'uploadDefectPhoto',
  'uploadInspectionPhoto',
].sort();

describe('Johannesburg production port invariants', () => {
  test('exports exactly the 39 production callable names through v2 adapters', () => {
    const exports = [...source.matchAll(/^export const (\w+) = (onProdCall|onMeasuredCall)\(/gm)]
      .map((match) => match[1])
      .sort();

    assert.equal(exports.length, 39);
    assert.deepEqual(exports, expectedCallables);
    assert.equal((source.match(/onCallV2\(/g) || []).length, 1);
    assert.doesNotMatch(source, /functions\.https\.onCall|runWith\s*\(/);
  });

  test('pins all callables to africa-south1 with 256 MiB and no warm instances', () => {
    assert.match(source, /const REGION = 'africa-south1';/);
    assert.match(source, /region: REGION,/);
    assert.match(source, /memory: '256MiB' as const,/);
    assert.equal(source.includes(`min${'Instances'}`), false);
  });

  test('uses only the new project default Firestore and exact production bucket', () => {
    assert.match(source, /const PROJECT_ID = 'fleetwise-prod-jhb';/);
    assert.match(source, /const STORAGE_BUCKET = 'fleetwise-prod-jhb\.firebasestorage\.app';/);
    assert.match(source, /const db = admin\.firestore\(app\);/);
    assert.match(source, /admin\.storage\(app\)\.bucket\(STORAGE_BUCKET\)/);
    const forbiddenTargets = [
      `fleetwise-${'9ab3a'}`,
      `fleetwise-${'jhb-test'}`,
      `fleetwise-${'9ab3a'}-${'jhb-test'}`,
      `us-${'central1'}`,
    ];
    for (const forbiddenTarget of forbiddenTargets) {
      assert.equal(source.includes(forbiddenTarget), false);
    }
    assert.doesNotMatch(source, /getFirestore\s*\(|FIREBASE_CONFIG/);
  });

  test('introduces no background, scheduled, or raw HTTP triggers', () => {
    assert.doesNotMatch(
      source,
      /onSchedule\s*\(|onDocument(?:Created|Updated|Deleted|Written)?\s*\(|onRequest\s*\(|pubsub\.|scheduler\./,
    );
  });
});
