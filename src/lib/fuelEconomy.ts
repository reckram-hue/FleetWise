import type { Vehicle } from '../types';
const measurement = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
const variance = (value: number | null, baseline: number | null) => value !== null && baseline !== null ? (value - baseline) / baseline * 100 : null;
export function fuelEconomyStatus(vehicle: Vehicle) {
    const ice = vehicle.vehicleType === 'ICE';
    const manufacturer = measurement(ice ? vehicle.manufacturerFuelConsumption : vehicle.manufacturerEnergyConsumption);
    const baseline = measurement(ice ? vehicle.baselineFuelConsumption : vehicle.baselineEnergyConsumption);
    const current = measurement(ice ? vehicle.currentFuelConsumption : vehicle.currentEnergyConsumption);
    const currentVsBaseline = variance(current, baseline);
    const hasSufficientData = currentVsBaseline !== null;
    const needsAttention = hasSufficientData && Math.abs(currentVsBaseline) > (vehicle.economyVarianceThreshold ?? 15);
    return { vehicle, manufacturer, baseline, current, hasSufficientData,
        manufacturerVsBaseline: variance(baseline, manufacturer), currentVsBaseline,
        currentVsManufacturer: variance(current, manufacturer), needsAttention,
        trend: hasSufficientData ? vehicle.economyTrendDirection || 'unknown' : 'unknown',
        recommendations: !hasSufficientData ? ['Insufficient data: current consumption and baseline are required.']
            : needsAttention ? ['Review measured consumption against the vehicle baseline.'] : [] };
}
export function fuelEconomyCounts(statuses: ReturnType<typeof fuelEconomyStatus>[], total: number) {
    const healthy = statuses.filter(s => s.hasSufficientData && !s.needsAttention).length;
    const attention = statuses.filter(s => s.hasSufficientData && s.needsAttention).length;
    return { healthy, attention, insufficient: Math.max(0, total - healthy - attention) };
}
