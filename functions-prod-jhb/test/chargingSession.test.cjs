const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { describe, test } = require('node:test');
const {
  assertCanStartChargingSession,
  assertCanEndChargingSession,
  shouldClearVehicleChargingGuard,
  estimateBatteryEnergyAddedKWh,
  resolveChargingSessionIsTestData,
} = require('../lib/chargingSession.js');

const source = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf8');

function activeAssignment(overrides = {}) {
  return { driverId: 'driver-1', status: 'ACTIVE', ...overrides };
}
function evVehicle(overrides = {}) {
  return { vehicleType: 'EV', activeChargingSessionId: null, ...overrides };
}
function activeLocation(overrides = {}) {
  return { active: true, orgId: 'org-1', ...overrides };
}
function openSession(overrides = {}) {
  return { driverId: 'driver-1', status: 'OPEN', ...overrides };
}

function assertThrowsHttpsError(fn, expectedCode) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

describe('assertCanStartChargingSession', () => {
  test('start succeeds for active assigned EV with a valid, active, same-org charging location', () => {
    assert.doesNotThrow(() => assertCanStartChargingSession(
      'driver-1',
      activeAssignment(),
      evVehicle(),
      activeLocation(),
      'org-1',
    ));
  });

  test('start fails when the assignment does not belong to the requesting driver (wrong vehicle/assignment)', () => {
    assertThrowsHttpsError(
      () => assertCanStartChargingSession(
        'driver-1',
        activeAssignment({ driverId: 'someone-else' }),
        evVehicle(),
        activeLocation(),
        'org-1',
      ),
      'permission-denied',
    );
  });

  test('start fails without an active assignment', () => {
    assertThrowsHttpsError(
      () => assertCanStartChargingSession(
        'driver-1',
        activeAssignment({ status: 'COMPLETED' }),
        evVehicle(),
        activeLocation(),
        'org-1',
      ),
      'failed-precondition',
    );
  });

  test('start fails for an ICE vehicle', () => {
    assertThrowsHttpsError(
      () => assertCanStartChargingSession(
        'driver-1',
        activeAssignment(),
        evVehicle({ vehicleType: 'ICE' }),
        activeLocation(),
        'org-1',
      ),
      'failed-precondition',
    );
  });

  test('start fails when the charging location does not exist', () => {
    assertThrowsHttpsError(
      () => assertCanStartChargingSession('driver-1', activeAssignment(), evVehicle(), null, 'org-1'),
      'not-found',
    );
  });

  test('start fails when the charging location is inactive', () => {
    assertThrowsHttpsError(
      () => assertCanStartChargingSession(
        'driver-1',
        activeAssignment(),
        evVehicle(),
        activeLocation({ active: false }),
        'org-1',
      ),
      'failed-precondition',
    );
  });

  test('start fails when the charging location belongs to a different organisation', () => {
    assertThrowsHttpsError(
      () => assertCanStartChargingSession(
        'driver-1',
        activeAssignment(),
        evVehicle(),
        activeLocation({ orgId: 'org-2' }),
        'org-1',
      ),
      'permission-denied',
    );
  });

  test('a duplicate OPEN charging session on the vehicle fails', () => {
    assertThrowsHttpsError(
      () => assertCanStartChargingSession(
        'driver-1',
        activeAssignment(),
        evVehicle({ activeChargingSessionId: 'existing-session' }),
        activeLocation(),
        'org-1',
      ),
      'failed-precondition',
    );
  });
});

describe('assertCanEndChargingSession', () => {
  test('end succeeds for the owning driver on an OPEN session', () => {
    assert.doesNotThrow(() => assertCanEndChargingSession('driver-1', openSession()));
  });

  test('end fails for a different driver', () => {
    assertThrowsHttpsError(
      () => assertCanEndChargingSession('driver-1', openSession({ driverId: 'someone-else' })),
      'permission-denied',
    );
  });

  test('end fails for an already-closed session', () => {
    assertThrowsHttpsError(
      () => assertCanEndChargingSession('driver-1', openSession({ status: 'CLOSED' })),
      'failed-precondition',
    );
  });
});

describe('shouldClearVehicleChargingGuard', () => {
  test('clears the guard when it still points to the session being closed', () => {
    assert.equal(shouldClearVehicleChargingGuard({ activeChargingSessionId: 'session-1' }, 'session-1'), true);
  });

  test('leaves the guard alone when it points to a different (or already-cleared) session', () => {
    assert.equal(shouldClearVehicleChargingGuard({ activeChargingSessionId: 'session-2' }, 'session-1'), false);
    assert.equal(shouldClearVehicleChargingGuard({}, 'session-1'), false);
  });
});

describe('estimateBatteryEnergyAddedKWh', () => {
  test('estimates from usable battery capacity x SOC delta', () => {
    // 60 kWh battery, 40% -> 90% = 50% delta -> 30 kWh
    assert.equal(estimateBatteryEnergyAddedKWh(60, 40, 90), 30);
  });

  test('is left null when battery capacity is unavailable, rather than inventing a number', () => {
    assert.equal(estimateBatteryEnergyAddedKWh(null, 40, 90), null);
    assert.equal(estimateBatteryEnergyAddedKWh(undefined, 40, 90), null);
    assert.equal(estimateBatteryEnergyAddedKWh(0, 40, 90), null);
  });

  test('is left null when the SOC did not actually increase', () => {
    assert.equal(estimateBatteryEnergyAddedKWh(60, 90, 40), null);
    assert.equal(estimateBatteryEnergyAddedKWh(60, 50, 50), null);
  });

  test('is computed independently of any charger-metered/billed energy figure', () => {
    // The function has no charger-energy parameter at all: the same inputs always produce
    // the same estimate regardless of what a driver later reports as chargerEnergyDeliveredKWh.
    assert.equal(estimateBatteryEnergyAddedKWh.length, 3);
    assert.equal(estimateBatteryEnergyAddedKWh(60, 40, 90), 30);
  });
});

describe('resolveChargingSessionIsTestData', () => {
  test('test-data flag propagates from the driver', () => {
    assert.equal(resolveChargingSessionIsTestData(true, false), true);
  });

  test('test-data flag propagates from the vehicle', () => {
    assert.equal(resolveChargingSessionIsTestData(false, true), true);
  });

  test('is false only when neither party is test data', () => {
    assert.equal(resolveChargingSessionIsTestData(false, false), false);
  });

  test('is true when both parties are test data', () => {
    assert.equal(resolveChargingSessionIsTestData(true, true), true);
  });
});

describe('endChargingSession source invariants', () => {
  test('never mutates shifts or vehicleAssignments — the same assignment stays active', () => {
    const match = source.match(/export const endChargingSession = onMeasuredCall\('endChargingSession',[\s\S]*?\n}\);/);
    assert.ok(match, 'endChargingSession export not found in source');
    const body = match[0];
    assert.doesNotMatch(body, /db\.collection\('vehicleAssignments'\)/);
    assert.doesNotMatch(body, /db\.collection\('shifts'\)/);
  });

  test('startChargingSession never mutates shifts or vehicleAssignments either', () => {
    const match = source.match(/export const startChargingSession = onMeasuredCall\('startChargingSession',[\s\S]*?\n}\);/);
    assert.ok(match, 'startChargingSession export not found in source');
    const body = match[0];
    assert.doesNotMatch(body, /transaction\.(update|set)\(.*vehicleAssignments/);
    assert.doesNotMatch(body, /transaction\.(update|set)\(.*shiftDoc\.ref|shiftRef/);
  });

  test('chargerEnergyDeliveredKWh and estimatedBatteryEnergyAddedKWh are written as separate fields, neither derived from the other', () => {
    const match = source.match(/export const endChargingSession = onMeasuredCall\('endChargingSession',[\s\S]*?\n}\);/);
    assert.ok(match, 'endChargingSession export not found in source');
    const body = match[0];
    assert.match(body, /chargerEnergyDeliveredKWh:\s*chargerEnergyDeliveredKWh\s*\?\?\s*null/);
    assert.match(body, /estimatedBatteryEnergyAddedKWh:\s*resultEstimatedBatteryEnergyAddedKWh/);
    // The estimate is computed via estimateBatteryEnergyAddedKWh(...), which never takes
    // chargerEnergyDeliveredKWh as an input — see the estimateBatteryEnergyAddedKWh describe
    // block above, which asserts its arity is exactly 3 (capacity, startPercent, endPercent).
    assert.doesNotMatch(body, /estimateBatteryEnergyAddedKWh\([^)]*chargerEnergyDeliveredKWh/);
  });
});
