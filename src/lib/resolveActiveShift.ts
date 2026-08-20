// src/lib/resolveActiveShift.ts — Authoritative active-shift + active-assignment resolution.
// The server remains authoritative: this NEVER invents a vehicle-selection path on its own.
// When the assignment lookup fails (e.g. an inconsistent shift.activeAssignmentId pointer),
// the error is propagated so callers fail closed into a retryable state.
import { getDriverSession, isSessionLocallyExpired } from '../store/session';
import { ActiveShiftState } from '../store/shift';
import { User, Vehicle } from '../types';
import api from '../services/firebaseApi';

async function safeGetVehicle(driverId: string, sessionToken: string, vehicleId: string): Promise<Vehicle | null> {
  try {
    return await api.getVehicleForSession(driverId, sessionToken, vehicleId);
  } catch {
    return null;
  }
}

/**
 * Resolve the authoritative active-shift state (shift + active VehicleAssignment) for a driver.
 * Returns null when the driver has no active shift. Throws when the server state is
 * inconsistent or the session is invalid so callers can surface a retry state.
 */
export async function resolveActiveShiftState(driver: User): Promise<ActiveShiftState | null> {
  const session = getDriverSession();
  if (!session || isSessionLocallyExpired(session)) {
    return null;
  }
  const shift = await api.getActiveShiftWithSession(session.driverId, session.sessionToken);
  if (!shift) return null;

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
  };

  // Resolve the active assignment for this shift. A throw here is intentional: fail closed.
  const assignment = await api.getActiveVehicleAssignment(session.driverId, session.sessionToken, shift.id);

  if (assignment) {
    const vehicle = await safeGetVehicle(session.driverId, session.sessionToken, assignment.vehicleId);
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
  } else if (shift.vehicleId) {
    // Legacy shift: no assignment yet, but the shift still references its original vehicle.
    // Keep it as a "continue with" suggestion (no assignmentId).
    const vehicle = await safeGetVehicle(session.driverId, session.sessionToken, shift.vehicleId);
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
