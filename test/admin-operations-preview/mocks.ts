import { convertTimestamps } from '../../src/lib/convertTimestamps';
// Local-only middleware computes reports from synthetic fixtures; no Firebase calls.
export const economyApi = {
  get: async (period: '30' | '90' | 'ALL', includeTest: boolean) => {
    const response = await fetch(`/__fixture/economy?period=${period}&qa=${includeTest}`);
    if (!response.ok) throw Error('Synthetic report unavailable');
    return response.json();
  },
  saveReview: async (input: unknown) => {
    const response = await fetch('/__fixture/economy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!response.ok) throw Error('Synthetic review failed');
    return response.json();
  },
};
export const vehicle = { id: 'fixture-vehicle', registration: 'CA 123-456', make: 'Sample', model: 'EV', vehicleType: 'EV', status: 'Active' };
export const driver = { id: 'fixture-driver', firstName: 'Sample', surname: 'Driver', role: 'driver', employmentStatus: 'Active' };
const records = ['PICKUP', 'RETURN'].map((boundaryType, index) => ({
  id: 'fixture-' + boundaryType, vehicleId: vehicle.id, driverId: driver.id, assignmentId: 'fixture-assignment', shiftId: 'fixture-shift',
  vehicleRegistration: vehicle.registration, vehicleDisplayName: 'Sample EV', identitySource: 'snapshot', driverName: 'Sample Driver', boundaryType,
  status: 'COMPLETED', createdAt: '2026-09-01T10:00:00Z', capturedAt: '2026-09-01T10:01:00Z', completedAt: '2026-09-01T10:02:00Z',
  odometer: 12345 + index * 120, chargePercent: 80 - index * 20, predictedRangeKm: 300, hasDamage: !!index,
  damageDescription: index ? 'Original driver statement: a scratch on the left rear door.' : null,
  linkedDefectId: index ? 'fixture-defect' : null, retentionClass: 'EVIDENCE', expiresAt: null, photos: { exterior: true, interior: true }, isTestData: !!index,
}));
export const inspectionApi = {
  list: async (filters: any) => ({ inspections: records.filter(r => (filters.includeTest || !r.isTestData) && (!filters.boundaryType || r.boundaryType === filters.boundaryType)), nextCursor: null }),
  detail: async (id: string) => records.find(r => r.id === id),
  photo: async () => ({ imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=' }),
};
export const auth = {}; export const app = {}; export const db = {};
export const callFunction = async () => { throw Error('Cloud access is disabled in this fixture'); };
export const getDriverSession = () => ({ driverId: driver.id, sessionToken: 'local-fixture' });
export const clearDriverSession = () => {}; export const isSessionLocallyExpired = () => false;
// Display-only examples for navigation QA. These are literals, never persisted or sent to Firebase.
const uxVehicles = ['CA 123-456', 'CA 234-567', 'CA 345-678', 'CA 456-789', 'TEST UX'].map((registration, index) => ({
  ...vehicle, id: `ux-vehicle-${index}`, registration, model: index % 2 ? 'Hatchback' : 'EV', vehicleType: index % 2 ? 'ICE' : 'EV',
  status: index === 1 ? 'In Service' : index === 2 ? 'Repairs' : 'Active', isTestData: index === 4,
  currentOdometer: 12000, lastServiceOdometer: 10000, serviceIntervalKm: 10000, lifecycleRevision: 1,
  maintenanceHold: index === 1 || index === 2 ? { id: `ux-hold-${index}`, source: 'SERVICE', reason: 'Workshop repair awaiting review' } : null,
}));
const uxServices = uxVehicles.map((v, index) => ({
  id: `ux-service-${index}`, vehicleId: v.id, serviceType: index === 1 ? 'Brake repair' : 'Routine service',
  dueDate: '2026-09-11', dueOdometer: 20000, isBooked: true, bookedDate: '2026-09-11', bookedTime: '09:00',
  serviceProviderId: 'ux-workshop', serviceProvider: 'Sample workshop', sentForService: index >= 1 && index <= 3,
  sentDate: index >= 1 ? '2026-09-09' : null, returnedFromService: index === 2 || index === 3,
  returnDate: index === 2 || index === 3 ? '2026-09-10' : null, actualCost: index >= 2 ? 1250 : undefined,
  releasedAt: index === 3 ? '2026-09-10T12:00:00Z' : null, linkedDefectIds: index === 1 ? ['ux-defect'] : [], isTestData: v.isTestData,
}));
const uxDefects = [{ id: 'ux-defect', vehicleId: uxVehicles[1].id, driverId: driver.id, description: 'Brake noise reported by driver',
  category: 'Mechanical', urgency: 'High', status: 'Open', reportedDateTime: new Date('2026-09-09T10:00:00Z'), defectRevision: 1, photos: [] }];
const uxReads: Record<string, (...args: any[]) => Promise<any>> = {
  getVehicles: async () => uxVehicles, getVehicle: async id => uxVehicles.find(v => v.id === id), getScheduledServices: async () => uxServices,
  getAllDefects: async () => uxDefects, getActiveDefects: async () => uxDefects,
  getServiceProviders: async () => [{ id: 'ux-workshop', name: 'Sample workshop', active: true, specializations: ['Mechanical'] }],
  getMaintenanceRecords: async vehicleId => [{ id: 'ux-history', vehicleId, date: '2026-08-20', serviceType: 'Routine service', odometer: 10000, cost: 950, notes: 'Synthetic example: oil and filter changed.' }],
};
export default new Proxy({ getVehicles: async () => [vehicle], getUsers: async () => [driver], getActiveDefects: async () => [],
  listChargingLocationsAdmin: async () => [{ id: 'test-charger', name: 'TEST company charger', active: true, tariffMethod: 'PER_KWH', tariffRate: 2.5 }],
  getScheduledServices: async () => [], getServicesNeedingReminders: async () => [], getVehiclesWithExpiredLicenses: async () => [],
  getVehicleDefectsForSession: async () => [], reportDefectWithSession: async () => ({ id: 'fixture-defect' }),
}, { get: (target, key) => {
  if (new URLSearchParams(location.search).has('maintenanceUx')) {
    if (uxReads[String(key)]) return uxReads[String(key)];
    if (String(key).startsWith('get')) return (target as any)[key] || (async () => []);
    return async () => { throw Error('Read-only navigation preview: no changes were saved.'); };
  }
  const methods = ['getVehicles','getVehicle','getScheduledServices','getAllDefects','getActiveDefects','getServiceProviders','getMaintenanceRecords','addMaintenanceRecord','saveScheduledServiceAdmin','dispatchServiceAdmin','completeServiceAdmin','changeVehicleLifecycleAdmin','transitionDefectAdmin'];
  if (new URLSearchParams(location.search).has('maintenance') && methods.includes(String(key))) return async (...args: unknown[]) => {
    const r = await fetch('/__fixture/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: key, args }) });
    const data = await r.json(); if (!r.ok) throw Error(data.error); return convertTimestamps(data);
  };
  return (target as any)[key] || (() => { throw Error('Unimplemented local fixture operation: ' + String(key)); });
} });
