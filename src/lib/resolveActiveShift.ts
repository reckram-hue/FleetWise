// src/lib/resolveActiveShift.ts — Authoritative active-shift + active-assignment resolution.
// The server remains authoritative: this NEVER invents a vehicle-selection path on its own.
// When the assignment lookup fails (e.g. an inconsistent shift.activeAssignmentId pointer),
// the error is propagated so callers fail closed into a retryable state.
import { getDriverSession, isSessionLocallyExpired } from '../store/session';
import { ActiveShiftState } from '../store/shift';
import { DriverOperationalState, User } from '../types';
import api from '../services/firebaseApi';

const inFlightResolutions = new Map<string, Promise<ActiveShiftState | null>>();

/**
 * Resolve the authoritative active-shift state in one session-authenticated server call.
 * The response includes the active-assignment vehicle and inspection summaries, preventing
 * the mounted driver path from immediately recreating the former serial callable chain.
 */
export async function resolveActiveShiftState(driver: User): Promise<ActiveShiftState | null> {
  const session = getDriverSession();
  if (!session || isSessionLocallyExpired(session)) {
    return null;
  }

  // Login and dashboard mount can overlap. Share the one in-flight state lookup rather than
  // issuing duplicate calls with the same opaque session credential.
  const existing = inFlightResolutions.get(session.sessionToken);
  if (existing) return existing;
  const resolution = resolveDriverOperationalState(driver, session.driverId, session.sessionToken);
  inFlightResolutions.set(session.sessionToken, resolution);
  try {
    return await resolution;
  } finally {
    inFlightResolutions.delete(session.sessionToken);
  }
}

async function resolveDriverOperationalState(
  driver: User,
  driverId: string,
  sessionToken: string,
): Promise<ActiveShiftState | null> {
  const operationalState = await api.getDriverOperationalState(driverId, sessionToken);
  return toActiveShiftState(driver, operationalState);
}

export function toActiveShiftState(
  driver: User,
  operationalState: DriverOperationalState,
): ActiveShiftState | null {
  if (!operationalState.hasActiveShift || !operationalState.shift) return null;

  const { shift, assignment, vehicle, inspections } = operationalState;

  const startDate = new Date(shift.startTime as any);
  if (isNaN(startDate.getTime())) {
    throw new Error('Active shift has an unreadable startTime from the server');
  }

  const base: ActiveShiftState = {
    shiftId: shift.id,
    driverId: driver.id,
    driverName: `${driver.firstName} ${driver.surname}`,
    startAt: startDate.toISOString(),
    startOdo: shift.startOdometer,
    startChargePercent: shift.startChargePercent,
    inspections,
  };

  if (operationalState.hasActiveAssignment && assignment) {
    base.assignmentId = assignment.id;
    base.vehicleId = assignment.vehicleId;
    base.vehicle = {
      id: assignment.vehicleId,
      registration: vehicle?.registration || 'Unknown',
      alias: vehicle?.alias,
      vehicleType: vehicle?.vehicleType || 'ICE',
    };
    if (assignment.startOdometer != null) base.assignmentStartOdo = assignment.startOdometer;
    if (assignment.startChargePercent != null) base.assignmentStartChargePercent = assignment.startChargePercent;
  } else if (shift.vehicleId && vehicle) {
    // Legacy shift: no assignment yet, but the shift still references its original vehicle.
    // Keep it as a "continue with" suggestion (no assignmentId).
    base.vehicleId = shift.vehicleId;
    base.vehicle = {
      id: shift.vehicleId,
      registration: vehicle?.registration || 'Unknown',
      alias: vehicle?.alias,
      vehicleType: vehicle?.vehicleType || 'ICE',
    };
  }

  return base;
}
