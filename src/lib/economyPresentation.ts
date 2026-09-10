// UI labels only. Calculation statuses and evidence remain unchanged.
const statusLabels = new Map<string, string>([
    ['INSUFFICIENT_DATA', 'Insufficient data'],
    ['INSUFFICIENT_COST_DATA', 'Insufficient cost data'],
    ['INSUFFICIENT', 'Insufficient data'],
    ['LIMITED', 'Limited data'],
    ['MEASURED', 'Measured'],
    ['ESTIMATED', 'Estimated'],
    ['MIXED', 'Mixed data'],
    ['UNKNOWN', 'Not available'],
    ['LIMITED_EVIDENCE', 'Limited evidence'],
    ['SUFFICIENT_FOR_ANALYSIS', 'Sufficient for analysis'],
]);

export const formatEconomyStatus = (status: string | null | undefined): string =>
    statusLabels.get(status ?? 'UNKNOWN') ?? 'Not available';

// Keep diagnostic identifiers out of user-facing copy, including future unknown codes.
const reasonLabels = new Map<string, string>([
    ['REFUEL_DATE_UNKNOWN_CANNOT_BOUND_INTERVALS', 'Missing refuel dates prevent a reliable interval'],
    ['UNKNOWN_INVALID_OR_DUPLICATE_REFUEL', 'Some refuels have missing or conflicting details'],
    ['NON_INCREASING_REFUEL_ODOMETER', 'Refuel odometer readings are out of sequence'],
    ['ASSIGNMENT_DISTANCE_GAP_OR_OVERLAP', 'Driving intervals have gaps or overlaps'],
    ['NO_DEFENSIBLE_FULL_TO_FULL_INTERVAL', 'No qualifying full-to-full refuel interval'],
    ['INVALID_OR_ZERO_DISTANCE', 'No qualifying driving distance'],
    ['NO_VERIFIED_USABLE_CAPACITY_SNAPSHOT', 'Usable battery capacity is not documented for this interval'],
    ['MISSING_OR_INVALID_SOC', 'Battery charge readings are missing or invalid'],
    ['UNKNOWN_ENERGY_CAPTURE_PROVENANCE', 'Energy evidence is not sufficient for this interval'],
    ['INCOMPLETE_CONFLICTING_OR_UNKNOWN_CHARGE', 'Charging records are incomplete or conflicting'],
    ['SOC_GAIN_OUTSIDE_RECORDED_CHARGE', 'Battery charge increased outside recorded charging'],
    ['NON_POSITIVE_ENERGY_BALANCE', 'The energy balance cannot support a consumption estimate'],
    ['UNKNOWN_INVALID_OR_OVERLAPPING_ASSIGNMENTS', 'Some driving intervals are incomplete, invalid or overlapping'],
    ['UNKNOWN_POWERTRAIN', 'Vehicle powertrain is not available'],
    ['RETURN_CHARGING_ENERGY_AND_COST_NOT_RECONCILED', 'Return charging has no reconciled energy or cost evidence'],
    ['INSUFFICIENT_COST_DATA', 'Not enough attributable cost data'],
]);

export const formatEconomyReason = (reason: string): string =>
    reasonLabels.get(reason) ?? 'Additional evidence is needed';
