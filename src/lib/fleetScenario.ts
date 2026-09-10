import type { EconomyReport } from '../services/economyApi';
import type { ChargingLocation, User } from '../types';

export const fleetScenarioMethodVersion = 'v1';
export type ScenarioVehicle = EconomyReport['vehicles'][number];
// A future cohort source must be added explicitly with its own evidence contract.
export type ConsumptionSource = 'OBSERVED_VEHICLE' | 'MANUFACTURER_REFERENCE' | 'USER_SCENARIO';
export type ScenarioInputs = {
    sourceVehicleId: string; targetVehicleId: string;
    distanceSource: 'PLANNED'; annualKm: number | null;
    iceSource: ConsumptionSource | 'OBSERVED_COST' | ''; iceLitresPer100Km: number | null; fuelPricePerLitre: number | null;
    evSource: ConsumptionSource | ''; evKWhPer100Km: number | null; energyBoundary: 'BATTERY' | 'GRID' | '';
    chargingLossPercent: number | null;
    tariffSource: 'CUSTOM' | 'LOCATION' | ''; tariffPerKWh: number | null; chargingLocationId: string;
};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const positive = (n: unknown): n is number => finite(n) && n > 0;
const nonnegative = (n: unknown): n is number => finite(n) && n >= 0;
export const parseScenarioNumber = (s: string): number | null => s.trim() && finite(Number(s)) ? Number(s) : null;
export const scenarioAdminAllowed = (user: Pick<User, 'role' | 'employmentStatus'> | null) => user?.role === 'admin' && user.employmentStatus === 'Active';
export const scenarioMoney = (n: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function observedScenarioAllowed(v: ScenarioVehicle, purpose: 'consumption' | 'cost', now = Date.now()) {
    const d = v.readiness?.[purpose];
    return d?.state === 'SUFFICIENT_FOR_ANALYSIS' && d.review?.current === true && d.scopeDay === new Date(now).toISOString().slice(0, 10)
        && d.hard.length === 0 && d.confirmation.length === 0;
}
export function locationTariff(location: ChargingLocation): number | null {
    // Per-session prices cannot be converted to energy prices; explicit FREE is evidenced zero.
    if (!location.active) return null;
    if (location.tariffMethod === 'FREE') return 0;
    return location.tariffMethod === 'PER_KWH' && nonnegative(location.tariffRate) ? location.tariffRate : null;
}

/** Uses existing observed metrics only; no interval reconstruction, writes or annualization. */
export function calculateFleetScenario(report: EconomyReport, input: ScenarioInputs, locations: ChargingLocation[] = [], now = Date.now()) {
    const errors: string[] = [];
    const source = report.vehicles.find(v => v.vehicleId === input.sourceVehicleId);
    const target = report.vehicles.find(v => v.vehicleId === input.targetVehicleId);
    if (!source || source.powertrain !== 'ICE' || (!report.includeTest && source.isTestData)) errors.push('Select an ICE vehicle from the current evidence selection.');
    if (!target || target.powertrain !== 'EV' || (!report.includeTest && target.isTestData)) errors.push('Select an EV from the current evidence selection.');
    if (input.distanceSource !== 'PLANNED') errors.push('Observed annualization has no approved methodology. Enter planned annual distance.');
    if (!positive(input.annualKm)) errors.push('Enter a positive planned annual distance.');
    let litres: number | null = null, iceCostPerKm: number | null = null;
    if (source) {
        if (input.iceSource === 'OBSERVED_COST') {
            if (!observedScenarioAllowed(source, 'cost', now) || !nonnegative(source.cost.value) || source.cost.currency !== 'ZAR') errors.push('Observed whole-period ICE cost evidence is not sufficient for this scenario.');
            else iceCostPerKm = source.cost.value;
            if (observedScenarioAllowed(source, 'consumption', now) && positive(source.economy.value)) litres = source.economy.value;
        } else {
            if (input.iceSource === 'OBSERVED_VEHICLE') {
                if (!observedScenarioAllowed(source, 'consumption', now) || source.economy.unit !== 'L/100 km') errors.push('Observed FleetWise ICE consumption evidence is insufficient for this scenario. Choose an explicit alternative.');
                else litres = source.economy.value;
            } else if (input.iceSource === 'MANUFACTURER_REFERENCE' && source.economy.unit === 'L/100 km') litres = source.manufacturerReference;
            else if (input.iceSource === 'USER_SCENARIO') litres = input.iceLitresPer100Km;
            else errors.push('Choose an ICE cost or consumption source.');
            if (!positive(litres)) errors.push('A positive ICE consumption input is required.');
            if (!nonnegative(input.fuelPricePerLitre)) errors.push('Enter an explicit nonnegative scenario fuel price in ZAR/L.');
            if (positive(litres) && nonnegative(input.fuelPricePerLitre)) iceCostPerKm = litres / 100 * input.fuelPricePerLitre;
        }
    }
    let energy: number | null = null, boundary = input.energyBoundary;
    if (input.evSource === 'OBSERVED_VEHICLE' && target) {
        if (!observedScenarioAllowed(target, 'consumption', now) || target.economy.unit !== 'kWh/100 km') errors.push('Observed FleetWise EV evidence is insufficient for this scenario. Choose user-supplied consumption.');
        else energy = target.economy.value;
        boundary = 'BATTERY'; // The existing economy engine explicitly returns battery energy.
    } else if (input.evSource === 'USER_SCENARIO') energy = input.evKWhPer100Km;
    else if (input.evSource === 'MANUFACTURER_REFERENCE') errors.push('EV manufacturer reference energy basis is not verified; it cannot be used in calculations.');
    else errors.push('Choose an EV consumption source.');
    if (!positive(energy)) errors.push('Enter positive EV consumption.');
    if (!['BATTERY', 'GRID'].includes(boundary)) errors.push('Choose whether EV consumption is battery energy or grid/billed energy.');
    if (boundary === 'BATTERY' && (!nonnegative(input.chargingLossPercent) || input.chargingLossPercent >= 100)) errors.push('Enter explicit charging losses from 0% to less than 100%.');
    let tariff: number | null = null, tariffName = 'Custom scenario tariff';
    if (input.tariffSource === 'CUSTOM') tariff = input.tariffPerKWh;
    else if (input.tariffSource === 'LOCATION') {
        const location = locations.find(l => l.id === input.chargingLocationId);
        if (location) { tariff = locationTariff(location); tariffName = location.name; }
    }
    if (!nonnegative(tariff)) errors.push('Choose a valid location energy tariff or enter an explicit nonnegative custom tariff.');
    if (errors.length) return { ok: false as const, errors };
    const annualKm = input.annualKm!, loss = boundary === 'BATTERY' ? input.chargingLossPercent! / 100 : null;
    const annualBatteryKWh = boundary === 'BATTERY' ? annualKm * energy! / 100 : null;
    const annualGridKWh = boundary === 'BATTERY' ? annualBatteryKWh! / (1 - loss!) : annualKm * energy! / 100;
    const annualIceLitres = litres === null ? null : annualKm * litres / 100;
    const annualIceFuelCost = input.iceSource === 'OBSERVED_COST' ? annualKm * iceCostPerKm! : annualIceLitres! * input.fuelPricePerLitre!;
    const annualEvEnergyCost = annualGridKWh * tariff!;
    const annualOperatingDifference = annualIceFuelCost - annualEvEnergyCost;
    const outputs = { annualKm, annualIceLitres, annualBatteryKWh, annualGridKWh, annualIceFuelCost, annualEvEnergyCost,
        iceCostPerKm: iceCostPerKm!, evCostPerKm: annualEvEnergyCost / annualKm, annualOperatingDifference,
        monthlyOperatingDifference: annualOperatingDifference / 12, perKmDifference: annualOperatingDifference / annualKm };
    if (Object.values(outputs).some(n => n !== null && !finite(n))) return { ok: false as const, errors: ['Inputs exceed the supported calculation range.'] };
    return { ok: true as const, errors: [], methodVersion: fleetScenarioMethodVersion, currency: 'ZAR', outputs,
        basis: { iceSource: input.iceSource, litresPer100Km: litres, fuelPricePerLitre: input.iceSource === 'OBSERVED_COST' ? null : input.fuelPricePerLitre,
            evSource: input.evSource, energyPer100Km: energy!, energyBoundary: boundary, chargingLossPercent: loss === null ? null : input.chargingLossPercent,
            tariffPerKWh: tariff!, tariffName, tariffSource: input.tariffSource },
        // In-memory trace only. No persistence/export protocol is implied.
        trace: { inputs: { ...input }, source, target, period: report.period, includeTest: report.includeTest, reportUpdatedAt: report.updatedAt,
            readinessMethodVersion: report.readinessMethodVersion, calculatedAt: new Date(now).toISOString() } };
}
