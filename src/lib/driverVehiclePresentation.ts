import type { DefectReport } from '../types';

// A QR code selects only from the session-authorized, currently available list.
// Never follow a scanned URL or accept an arbitrary vehicle ID.
export function findScannedVehicle<T extends { id: string }>(vehicles: T[], text: string): T | undefined {
  return vehicles.find(vehicle => vehicle.id === text.trim());
}

export function outstandingDefects(defects: DefectReport[]): DefectReport[] {
  return defects.filter(defect => defect.status !== 'Resolved' && defect.status !== 'Duplicate');
}
