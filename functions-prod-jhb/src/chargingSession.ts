import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Pure, Firestore-independent decision logic for mid-shift EV charging sessions
 * (startChargingSession / endChargingSession in index.ts). Extracted the same way
 * adminAuthorization.ts extracts requireActiveAdmin — so the authorization/validation rules
 * can be unit tested without a live or emulated Firestore.
 */

export type ChargingType = 'COMPANY_AC' | 'COMPANY_DC' | 'PUBLIC_AC' | 'PUBLIC_DC';

export type AssignmentLike = {
  driverId: string;
  status: string;
};

export type VehicleLike = {
  vehicleType: string;
  activeChargingSessionId?: string | null;
};

export type ChargingLocationLike = {
  active: boolean;
  orgId?: string | null;
};

export type ChargingSessionLike = {
  driverId: string;
  status: string;
};

/**
 * Validate the assignment/vehicle/location context for starting a mid-shift charging
 * session. Throws HttpsError on any violation; returns nothing on success.
 */
export function assertCanStartChargingSession(
  driverId: string,
  assignment: AssignmentLike,
  vehicle: VehicleLike,
  location: ChargingLocationLike | null,
  requestOrgId: string,
): void {
  if (assignment.driverId !== driverId) {
    throw new HttpsError('permission-denied', 'Assignment does not belong to this driver.');
  }
  if (assignment.status !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', 'The assignment is no longer active.');
  }
  if (vehicle.vehicleType !== 'EV') {
    throw new HttpsError('failed-precondition', 'Mid-shift charging is only available for EV vehicles.');
  }
  if (vehicle.activeChargingSessionId) {
    throw new HttpsError('failed-precondition', 'This vehicle already has an open mid-shift charging session.');
  }
  if (!location) {
    throw new HttpsError('not-found', 'Charging location not found.');
  }
  if (location.active !== true) {
    throw new HttpsError('failed-precondition', 'Charging location is inactive.');
  }
  if (location.orgId && location.orgId !== requestOrgId) {
    throw new HttpsError('permission-denied', 'Charging location does not belong to this organisation.');
  }
}

/**
 * Validate that an OPEN charging session may be ended by this driver. Throws HttpsError
 * otherwise; returns nothing on success.
 */
export function assertCanEndChargingSession(driverId: string, session: ChargingSessionLike): void {
  if (session.driverId !== driverId) {
    throw new HttpsError('permission-denied', 'You can only end your own charging session.');
  }
  if (session.status !== 'OPEN') {
    throw new HttpsError('failed-precondition', 'This charging session is not open.');
  }
}

/**
 * Whether the vehicle's guard pointer should be cleared when closing a session — only if it
 * still points to THIS session (idempotency safety, matching the same pattern
 * endVehicleAssignment uses for shift/vehicle pointers).
 */
export function shouldClearVehicleChargingGuard(
  vehicle: { activeChargingSessionId?: string | null },
  chargingSessionId: string,
): boolean {
  return vehicle.activeChargingSessionId === chargingSessionId;
}

/**
 * Server-derived battery-energy estimate from usable battery capacity x SOC delta — never
 * fabricated. Returns null when capacity is unknown or the SOC didn't actually increase.
 * Deliberately independent of charger-metered/billed energy: battery energy gained and
 * charger energy supplied/billed are separate concepts (business rules 7 and 12) and this
 * function has no charger-energy input at all.
 */
export function estimateBatteryEnergyAddedKWh(
  batteryCapacityKwh: number | null | undefined,
  startChargePercent: number | null | undefined,
  endChargePercent: number,
): number | null {
  const capacity = typeof batteryCapacityKwh === 'number' && batteryCapacityKwh > 0 ? batteryCapacityKwh : null;
  const start = typeof startChargePercent === 'number' ? startChargePercent : null;
  if (capacity === null || start === null) return null;
  const socDeltaPercent = endChargePercent - start;
  if (socDeltaPercent <= 0) return null;
  return Math.round((capacity * socDeltaPercent / 100) * 100) / 100;
}

/**
 * Test-data isolation: a charging session counts as test data if either the reporting
 * driver or the vehicle is marked as test data — matching every other driver-session
 * write in this file (startShift, reportDefectWithSession, etc.).
 */
export function resolveChargingSessionIsTestData(driverIsTestData: boolean, vehicleIsTestData: boolean): boolean {
  return driverIsTestData || vehicleIsTestData === true;
}
