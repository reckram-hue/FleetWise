import type { Vehicle } from '../types';

// Deliberately shared in intent with the Firestore rules allow-list. Existing snapshots
// may contain custody/maintenance fields; ordinary edits must never resend those fields.
export const VEHICLE_DESCRIPTIVE_FIELDS = [
  'registration', 'alias', 'make', 'model', 'year', 'vin', 'engineNumber', 'bodyStyle', 'colour', 'fuelType', 'vehicleType',
  'batteryCapacityKwh', 'usableBatteryCapacityKWh', 'usableBatteryCapacitySource', 'serviceIntervalKm', 'freeServicesUntilKm',
  'manufacturerFuelConsumption', 'manufacturerEnergyConsumption', 'baselineFuelConsumption', 'baselineEnergyConsumption', 'economyVarianceThreshold',
  'financeCompany', 'financeAccountNumber', 'financeCost', 'financeEndDate', 'balloonPayment', 'financeContactName', 'financeContactEmail', 'financeContactPhone',
  'insuranceCompany', 'insurancePolicyNumber', 'insuranceFee', 'insuranceContactName', 'insuranceContactEmail', 'insuranceContactPhone',
  'trackingCompany', 'trackingAccountNumber', 'trackingFee', 'trackingContactName', 'trackingContactEmail', 'trackingContactPhone',
  'warrantyInsurer', 'warrantyPolicyNumber', 'warrantyInceptionDate', 'warrantyExpiryDate', 'warrantyMileageTo', 'warrantyContactName', 'warrantyContactEmail', 'warrantyContactPhone',
  'defaultServiceProviderId', 'warrantyServiceProviderId', 'licenseExpiryDate', 'licenseRenewalReminderDays', 'lastLicenseRenewalDate', 'licenseNumber', 'licenseDiscNumber',
] as const;
export function vehicleDescriptiveUpdate(vehicle: Partial<Vehicle>): Record<string, unknown> {
  return Object.fromEntries(VEHICLE_DESCRIPTIVE_FIELDS.filter(k => vehicle[k] !== undefined).map(k => [k, vehicle[k]]));
}
