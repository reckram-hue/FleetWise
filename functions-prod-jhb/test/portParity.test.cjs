const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, test } = require('node:test');

const source = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');

const expectedCallables = [
  'saveScheduledServiceAdmin', 'dispatchServiceAdmin', 'completeServiceAdmin', 'changeVehicleLifecycleAdmin', 'addMaintenanceRecordAdmin', 'transitionDefectAdmin',
  'saveVehicleEvidenceReviewAdmin',
  'listVehicleInspectionsAdmin', 'getVehicleInspectionAdmin', 'getInspectionPhotoAdmin', 'getFleetEconomySummaryAdmin',
  'createAccidentReportDraft', 'updateAccidentReportDraft', 'getAccidentReportForDriver', 'uploadAccidentPhoto',
  'submitAccidentReport', 'listAccidentReportsAdmin', 'getAccidentReportAdmin', 'getAccidentPhoto', 'getDefectPhotoAdmin',
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
  'recoverReturnChargingEvent',
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
  test('WP2 production handler bodies remain identical across the two backends', () => {
    const ts = require('typescript');
    const mirrored = readFileSync(join(__dirname, '..', '..', 'functions', 'src', 'index.ts'), 'utf8');
    function bodies(text) {
      const ast = ts.createSourceFile('index.ts', text, ts.ScriptTarget.Latest, true);
      const result = new Map();
      for (const statement of ast.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
          const handler = declaration.initializer.arguments.find(ts.isArrowFunction);
          if (handler) result.set(declaration.name.getText(ast), handler.body.getText(ast).replace(/\r\n/g, '\n'));
        }
      }
      return result;
    }
    const a = bodies(source), b = bodies(mirrored);
    for (const name of ['startShift', 'reportDefectWithSession', 'startVehicleAssignment', 'endVehicleAssignment', 'endShiftWithSession', 'startChargingSession', 'endChargingSession', 'logRefuelWithSession',
      'createVehicleInspection', 'uploadInspectionPhoto', 'completeVehicleInspection', 'getDriverStatsWithSession',
      'getLeaderboard', 'recoverReturnChargingEvent']) {
      assert.ok(a.has(name), name); assert.equal(a.get(name), b.get(name), name);
    }
  });

  test('assignment distance helpers are identical across production backends', () => {
    const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(read(join(__dirname, '..', 'src', 'assignmentDistance.ts')),
      read(join(__dirname, '..', '..', 'functions', 'src', 'assignmentDistance.ts')));
  });

  test('economy engine, read API and idempotent capture remain identical across backends', () => {
    const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    for (const name of ['economyMetrics.ts', 'economyApi.ts', 'evidenceReadiness.ts', 'refuelCapture.ts', 'maintenance.ts', 'vehicleCustody.ts']) {
      assert.equal(read(join(__dirname, '..', 'src', name)), read(join(__dirname, '..', '..', 'functions', 'src', name)), name);
    }
  });

  test('exports exactly the expected production callable names through v2 adapters', () => {
    const exports = [...source.matchAll(/^export const (\w+) = (onProdCall|onMeasuredCall)\(/gm)]
      .map((match) => match[1])
      .sort();

    assert.equal(exports.length, expectedCallables.length);
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
