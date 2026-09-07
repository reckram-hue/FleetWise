import type { DefectReport } from '../types';

export function defectSeverityClasses(urgency: string): string {
  switch (urgency) {
    case 'Low': return 'border-amber-300 bg-amber-50 text-amber-950';
    case 'Medium': return 'border-orange-400 bg-orange-100 text-orange-950';
    case 'High': return 'border-red-400 bg-red-50 text-red-950';
    case 'Critical': return 'border-red-700 bg-red-100 text-red-950 ring-1 ring-red-700';
    default: return 'border-gray-300 bg-gray-50 text-gray-900';
  }
}

// A QR code selects only from the session-authorized, currently available list.
// Never follow a scanned URL or accept an arbitrary vehicle ID.
export function findScannedVehicle<T extends { id: string }>(vehicles: T[], text: string): T | undefined {
  return vehicles.find(vehicle => vehicle.id === text.trim());
}

export function outstandingDefects(defects: DefectReport[]): DefectReport[] {
  return defects.filter(defect => defect.status !== 'Resolved' && defect.status !== 'Duplicate');
}
