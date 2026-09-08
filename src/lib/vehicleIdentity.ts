export interface VehicleIdentity {
    id?: string; vehicleId?: string; registration?: string | null; vehicleRegistration?: string | null;
    vehicleRegistrationSnapshot?: string | null; vehicleDisplayNameSnapshot?: string | null;
    vehicleDisplayName?: string | null; make?: string; model?: string; alias?: string; name?: string;
}
export function formatVehicleIdentity(record: VehicleIdentity, live?: VehicleIdentity) {
    const clean = (v?: string | null) => v?.trim() || '';
    const vehicle = live || record;
    const registration = clean(record.vehicleRegistrationSnapshot) || clean(record.vehicleRegistration) || clean(vehicle.registration);
    const secondary = clean(record.vehicleDisplayNameSnapshot) || clean(record.vehicleDisplayName)
        || [vehicle.make, vehicle.model, vehicle.alias].map(clean).filter(Boolean).join(' ');
    const id = record.vehicleId || record.id;
    return { primary: registration || clean(vehicle.name) || secondary || (id ? `Vehicle reference ${id.slice(0, 8)}…` : 'Vehicle unavailable'),
        secondary: registration ? secondary : '' };
}
