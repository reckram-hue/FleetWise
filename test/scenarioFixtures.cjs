const { fixture, now } = require('./evidenceFixtures.cjs');
const { calculateEconomy } = require('../functions-prod-jhb/lib/economyMetrics');
const { attachReadiness } = require('../functions-prod-jhb/lib/evidenceReadiness');
function scenarioReport(includeTest = true) {
  const ice = fixture(), ev = fixture('EV');
  ice.vehicles[0].registration = 'TEST ICE'; ice.vehicles[0].isTestData = true;
  ev.vehicles[0].id = 'ev'; ev.vehicles[0].registration = 'TEST EV'; ev.vehicles[0].isTestData = true;
  ev.assignments.forEach(a => { a.vehicleId = 'ev'; });
  ice.vehicles.push(...ev.vehicles); ice.assignments.push(...ev.assignments);
  const options = { period: '90', includeTest, now };
  const initial = attachReadiness(calculateEconomy(ice, options), ice, [], now);
  const reviews = initial.vehicles.flatMap(v => ['consumption', 'cost'].map(p => ({ orgId: 'default', vehicleId: v.vehicleId,
    purpose: v.readiness[p].purpose, period: '90', methodologyVersion: 'v1', fingerprint: v.readiness[p].fingerprint,
    scopeDay: new Date(now).toISOString().slice(0,10), reviewedAt: new Date(now).toISOString(), reviewedBy: 'synthetic-admin',
    normalDutyConfirmed: true, recordingCompletenessConfirmed: true, configurationComparableConfirmed: true,
    notes: 'Synthetic local test only', softOverrideReason: '', isTestData: true, includeTest })));
  return attachReadiness(calculateEconomy(ice, options), ice, reviews, now);
}
const planned = { sourceVehicleId: 'v', targetVehicleId: 'ev', distanceSource: 'PLANNED', annualKm: 25000,
  iceSource: 'USER_SCENARIO', iceLitresPer100Km: 10, fuelPricePerLitre: 24,
  evSource: 'USER_SCENARIO', evKWhPer100Km: 18, energyBoundary: 'BATTERY', chargingLossPercent: 10,
  tariffSource: 'CUSTOM', tariffPerKWh: 2.5, chargingLocationId: '' };
module.exports = { scenarioReport, planned, now };
