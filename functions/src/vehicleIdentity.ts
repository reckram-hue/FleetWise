/** Only call with an authoritative vehicle document, never request data. */
export function vehicleIdentitySnapshot(vehicle: Record<string, any>) {
  const clean = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
  return {
    vehicleRegistrationSnapshot: clean(vehicle.registration),
    vehicleDisplayNameSnapshot: [clean(vehicle.make), clean(vehicle.model), clean(vehicle.alias)].filter(Boolean).join(' — ') || null,
  };
}
