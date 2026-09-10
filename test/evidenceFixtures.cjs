const now = Date.parse('2026-09-10T12:00:00Z'), day = 86400000;
const at = d => new Date(now - (75 - d) * day).toISOString();
const cap = { valueKWh: 50, source: 'Synthetic explicit usable specification', recordedAt: at(-1) };
function fixture(powertrain = 'ICE') {
  const input = { vehicles: [{ id: 'v', registration: 'SYNTHETIC ' + powertrain, vehicleType: powertrain, manufacturerFuelConsumption: 9, manufacturerEnergyConsumption: 17 }],
    drivers: [{ id: 'd' }], assignments: [], refuels: [], sessions: [], chargingEvents: [] };
  if (powertrain === 'ICE') {
    input.assignments.push({ id: 'a', vehicleId: 'v', driverId: 'd', shiftId: 's', status: 'COMPLETED', startedAt: at(0), endedAt: at(72), startOdometer: 0, endOdometer: 1200 });
    for (let i = 0; i <= 6; i++) input.refuels.push({ id: 'r' + i, vehicleId: 'v', driverId: 'd', shiftId: 's', assignmentId: 'a', date: at(i * 12),
      odometer: i * 200, litresFilled: 20, fuelCost: 400, currency: 'ZAR', fillLevel: 'FULL', captureVersion: 1, recordStatus: 'ACTIVE', clientRequestId: 'request-' + i });
  } else for (let i = 0; i < 20; i++) input.assignments.push({ id: 'a' + i, vehicleId: 'v', driverId: 'd', shiftId: 's' + i, status: 'COMPLETED',
    startedAt: at(i * 3.7), endedAt: at(i * 3.7 + .1), startOdometer: i * 100, endOdometer: (i + 1) * 100,
    startChargePercent: 80, endChargePercent: 60, usableCapacitySnapshot: cap, energyCaptureVersion: 1 });
  return input;
}
module.exports = { now, day, at, cap, fixture };
