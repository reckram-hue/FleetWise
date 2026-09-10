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
export default new Proxy({ getVehicles: async () => [vehicle], getUsers: async () => [driver], getActiveDefects: async () => [],
  listChargingLocationsAdmin: async () => [{ id: 'test-charger', name: 'TEST company charger', active: true, tariffMethod: 'PER_KWH', tariffRate: 2.5 }],
  getScheduledServices: async () => [], getServicesNeedingReminders: async () => [], getVehiclesWithExpiredLicenses: async () => [],
  getVehicleDefectsForSession: async () => [], reportDefectWithSession: async () => ({ id: 'fixture-defect' }),
}, { get: (target, key) => (target as any)[key] || (() => { throw Error('Unimplemented local fixture operation: ' + String(key)); }) });
