import { intervalDistance } from './assignmentDistance';

type Row = Record<string, any>;
export type Provenance = 'MEASURED' | 'ESTIMATED' | 'MIXED' | 'INSUFFICIENT_DATA';
export type CapacitySnapshot = { valueKWh: number; source: string; recordedAt: string };
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
const soc = (v: unknown): v is number => finite(v) && v >= 0 && v <= 100;
export const millis = (v: any): number => v?.toMillis instanceof Function ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : NaN;
export function usableCapacitySnapshot(vehicle: Row, recordedAt: string): CapacitySnapshot | null {
  return positive(vehicle.usableBatteryCapacityKWh) && typeof vehicle.usableBatteryCapacitySource === 'string' && vehicle.usableBatteryCapacitySource.trim()
    ? { valueKWh: vehicle.usableBatteryCapacityKWh, source: vehicle.usableBatteryCapacitySource.trim(), recordedAt } : null;
}
const validCapacity = (v: any): v is CapacitySnapshot => !!v && positive(v.valueKWh) && typeof v.source === 'string' && !!v.source.trim() && finite(millis(v.recordedAt));
export function combineProvenance(values: Provenance[]): Provenance {
  const known = new Set(values.filter(v => v !== 'INSUFFICIENT_DATA'));
  return !known.size ? 'INSUFFICIENT_DATA' : known.size > 1 || known.has('MIXED') ? 'MIXED' : [...known][0];
}
export function quality(samples: number, coverageKm: number): 'LIMITED' | 'INSUFFICIENT' {
  // A GOOD/confidence threshold needs an agreed methodology; sample volume alone is not proof.
  return samples === 0 || coverageKm <= 0 ? 'INSUFFICIENT' : 'LIMITED';
}
const validAssignment = (a: Row) => a.status === 'COMPLETED' && intervalDistance(a) !== null && finite(millis(a.startedAt)) && finite(millis(a.endedAt)) && millis(a.endedAt) >= millis(a.startedAt);
const ownerMatches = (r: Row, a: Row) => r.vehicleId === a.vehicleId && r.driverId === a.driverId && r.shiftId === a.shiftId && r.assignmentId === a.id;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** An odometer interval is usable only if completed assignments cover it exactly once.
 * Gaps, overlap, missing endpoints and reversed chronology are never silently repaired. */
export function coveredDistance(start: number, end: number, assignments: Row[]): boolean {
  if (!finite(start) || !finite(end) || end <= start) return false;
  const spans = assignments.filter(a => finite(a.startOdometer) && finite(a.endOdometer) && a.endOdometer > start && a.startOdometer < end)
    .sort((a, b) => a.startOdometer - b.startOdometer);
  let next = start;
  for (const a of spans) {
    if (!validAssignment(a)) return false;
    const lo = Math.max(start, a.startOdometer), hi = Math.min(end, a.endOdometer);
    if (lo !== next || hi < lo) return false;
    next = hi;
  }
  return next === end;
}

export function iceIntervals(refuels: Row[], assignments: Row[]) {
  const intervals: { start: number; end: number; distanceKm: number; litres: number; cost: number | null; refs: string[] }[] = [];
  const reasons = new Set<string>();
  if (refuels.some(r => !finite(millis(r.date)))) return { intervals, reasons: ['REFUEL_DATE_UNKNOWN_CANNOT_BOUND_INTERVALS'] };
  const ordered = [...refuels].sort((a, b) => millis(a.date) - millis(b.date) || String(a.id).localeCompare(String(b.id)));
  let boundary: Row | null = null, fills: Row[] = [], previousOdo: number | null = null;
  const identities = new Map<string, number>(), odometers = new Map<number, number>(), dates = new Map<number, number>();
  for (const r of ordered) {
    if (r.clientRequestId) identities.set(r.clientRequestId, (identities.get(r.clientRequestId) || 0) + 1);
    if (finite(r.odometer)) odometers.set(r.odometer, (odometers.get(r.odometer) || 0) + 1);
    dates.set(millis(r.date), (dates.get(millis(r.date)) || 0) + 1);
  }
  for (const r of ordered) {
    const a = assignments.find(a => a.id === r.assignmentId);
    const valid = !r.excluded && r.recordStatus === 'ACTIVE' && r.captureVersion === 1 && typeof r.clientRequestId === 'string'
      && identities.get(r.clientRequestId) === 1 && odometers.get(r.odometer) === 1 && dates.get(millis(r.date)) === 1
      && positive(r.litresFilled) && finite(r.odometer) && r.odometer >= 0 && ['FULL', 'PARTIAL'].includes(r.fillLevel)
      && a && validAssignment(a) && ownerMatches(r, a) && r.odometer >= a.startOdometer && r.odometer <= a.endOdometer
      && millis(r.date) >= millis(a.startedAt) && millis(r.date) <= millis(a.endedAt);
    if (!valid) { reasons.add('UNKNOWN_INVALID_OR_DUPLICATE_REFUEL'); boundary = null; fills = []; previousOdo = null; continue; }
    if (previousOdo !== null && r.odometer <= previousOdo) { reasons.add('NON_INCREASING_REFUEL_ODOMETER'); boundary = null; fills = []; }
    previousOdo = r.odometer;
    if (boundary) fills.push(r);
    if (r.fillLevel !== 'FULL') continue;
    if (boundary) {
      const km = r.odometer - boundary.odometer;
      if (coveredDistance(boundary.odometer, r.odometer, assignments)) {
        const costKnown = fills.every(f => finite(f.fuelCost) && f.fuelCost >= 0 && f.currency === 'ZAR');
        intervals.push({ start: millis(boundary.date), end: millis(r.date), distanceKm: km, litres: sum(fills.map(f => f.litresFilled)),
          cost: costKnown ? sum(fills.map(f => f.fuelCost)) : null, refs: [boundary.id, ...fills.map(f => f.id)] });
      } else reasons.add('ASSIGNMENT_DISTANCE_GAP_OR_OVERLAP');
    }
    boundary = r; fills = [];
  }
  if (!intervals.length) reasons.add('NO_DEFENSIBLE_FULL_TO_FULL_INTERVAL');
  return { intervals, reasons: [...reasons] };
}

export function evInterval(a: Row, sessions: Row[]) {
  const fail = (reason: string) => ({ batteryEnergyKWh: null, chargerEnergyKWh: null, cost: null, capacity: null, reason, provenance: 'INSUFFICIENT_DATA' as Provenance });
  if (!validAssignment(a) || !(intervalDistance(a)! > 0)) return fail('INVALID_OR_ZERO_DISTANCE');
  if (!validCapacity(a.usableCapacitySnapshot)) return fail('NO_VERIFIED_USABLE_CAPACITY_SNAPSHOT');
  if (!soc(a.startChargePercent) || !soc(a.endChargePercent)) return fail('MISSING_OR_INVALID_SOC');
  if (a.energyCaptureVersion !== 1) return fail('UNKNOWN_ENERGY_CAPTURE_PROVENANCE');
  const cap = a.usableCapacitySnapshot;
  const ordered = [...sessions].sort((x, y) => millis(x.startedAt) - millis(y.startedAt));
  let previousEnd = millis(a.startedAt), previousSoc = a.startChargePercent, added = 0;
  const ids = new Set<string>();
  for (const s of ordered) {
    if (s.excluded || ids.has(s.id) || !ownerMatches(s, a) || s.status !== 'CLOSED' || s.economyCaptureVersion !== 1 || s.recordStatus !== 'ACTIVE'
      || !validCapacity(s.usableCapacitySnapshot) || s.usableCapacitySnapshot.valueKWh !== cap.valueKWh || s.usableCapacitySnapshot.source !== cap.source
      || !soc(s.startChargePercent) || !soc(s.endChargePercent) || s.endChargePercent < s.startChargePercent
      || !finite(millis(s.startedAt)) || !finite(millis(s.endedAt)) || millis(s.startedAt) < previousEnd || millis(s.endedAt) < millis(s.startedAt)
      || millis(s.endedAt) > millis(a.endedAt) || !finite(s.startOdometer) || s.startOdometer < a.startOdometer || s.startOdometer > a.endOdometer) return fail('INCOMPLETE_CONFLICTING_OR_UNKNOWN_CHARGE');
    if (s.startChargePercent > previousSoc) return fail('SOC_GAIN_OUTSIDE_RECORDED_CHARGE');
    previousSoc = s.endChargePercent;
    ids.add(s.id); previousEnd = millis(s.endedAt);
    added += cap.valueKWh * (s.endChargePercent - s.startChargePercent) / 100;
  }
  if (a.endChargePercent > previousSoc) return fail('SOC_GAIN_OUTSIDE_RECORDED_CHARGE');
  const energy = cap.valueKWh * (a.startChargePercent - a.endChargePercent) / 100 + added;
  if (!positive(energy)) return fail('NON_POSITIVE_ENERGY_BALANCE');
  const metered = sessions.length > 0 && sessions.every(s => positive(s.chargerEnergyDeliveredKWh) && s.chargerEnergyProvenance === 'REPORTED_METER');
  // Cost is a replenishment expense, not battery-consumed energy valued at an invented price.
  // Only equal SOC inventory boundaries and complete recorded metered/cost evidence qualify.
  const costKnown = a.startChargePercent === a.endChargePercent && metered && sessions.every(s => finite(s.chargeCost) && s.chargeCost >= 0 && s.currency === 'ZAR' && s.costProvenance === 'REPORTED');
  return { batteryEnergyKWh: energy, chargerEnergyKWh: metered ? sum(sessions.map(s => s.chargerEnergyDeliveredKWh)) : null,
    cost: costKnown ? sum(sessions.map(s => s.chargeCost)) : null, capacity: cap, reason: null, provenance: 'ESTIMATED' as Provenance };
}

export type EconomyInput = { vehicles: Row[]; drivers: Row[]; assignments: Row[]; refuels: Row[]; sessions: Row[]; chargingEvents: Row[] };
export function calculateEconomy(input: EconomyInput, options: { period: '30' | '90' | 'ALL'; includeTest: boolean; now: number }) {
  const from = options.period === 'ALL' ? 0 : options.now - Number(options.period) * 86400000;
  const inPeriod = (start: unknown, end: unknown) => finite(millis(start)) && finite(millis(end)) && millis(start) >= from && millis(end) <= options.now;
  const vehicleMap = new Map(input.vehicles.map(v => [v.id, v])), driverMap = new Map(input.drivers.map(d => [d.id, d]));
  const assignmentMap = new Map(input.assignments.map(a => [a.id, a]));
  const test = (r: Row) => r.isTestData === true || vehicleMap.get(r.vehicleId)?.isTestData === true || driverMap.get(r.driverId)?.isTestData === true
    || assignmentMap.get(r.assignmentId)?.isTestData === true || driverMap.get(assignmentMap.get(r.assignmentId)?.driverId)?.isTestData === true;
  const vehicles = input.vehicles.filter(v => options.includeTest || v.isTestData !== true).map(vehicle => {
    const reasons = new Set<string>();
    const all = input.assignments.filter(a => a.vehicleId === vehicle.id && (options.includeTest || !test(a)));
    const periodAssignments = all.filter(a => inPeriod(a.startedAt, a.endedAt));
    const valid = periodAssignments.filter(validAssignment);
    // Reject both overlapping intervals, not just the second: neither has an authoritative allocation.
    const overlaps = new Set(valid.filter((a, i) => valid.some((b, j) => i !== j && (a.id === b.id
      || Math.max(a.startOdometer, b.startOdometer) < Math.min(a.endOdometer, b.endOdometer)
      || Math.max(millis(a.startedAt), millis(b.startedAt)) < Math.min(millis(a.endedAt), millis(b.endedAt))
      || (millis(a.endedAt) <= millis(b.startedAt) && a.endOdometer > b.startOdometer)
      || (millis(b.endedAt) <= millis(a.startedAt) && b.endOdometer > a.startOdometer)))).map(a => a.id));
    const usable = valid.filter(a => !overlaps.has(a.id));
    const unknownAssignments = all.filter(a => !validAssignment(a) && (!finite(millis(a.startedAt)) || millis(a.startedAt) <= options.now)
      && (!finite(millis(a.endedAt)) || millis(a.endedAt) >= from)).length + overlaps.size;
    if (unknownAssignments) reasons.add('UNKNOWN_INVALID_OR_OVERLAPPING_ASSIGNMENTS');
    const distanceKm = sum(usable.map(a => intervalDistance(a)!));
    const samples: { distanceKm: number; quantity: number; cost: number | null; refs: string[]; capacity?: CapacitySnapshot }[] = [];
    let chargerEnergyKWh = 0, chargerSampleCount = 0, chargerCoverageKm = 0;
    const chargerRecordIds: string[] = [];
    if (vehicle.vehicleType === 'ICE') {
      const refuels = input.refuels.filter(r => r.vehicleId === vehicle.id && (!finite(millis(r.date)) || millis(r.date) <= options.now))
        .map(r => ({ ...r, excluded: !options.includeTest && test(r) }));
      const ice = iceIntervals(refuels, usable);
      for (const reason of ice.reasons) reasons.add(reason);
      for (const i of ice.intervals) if (i.start >= from && i.end <= options.now) samples.push({ distanceKm: i.distanceKm, quantity: i.litres, cost: i.cost, refs: i.refs });
    } else if (vehicle.vehicleType === 'EV') {
      for (const a of usable) {
        // Include conflicting claimed ownership so bad joins invalidate rather than disappear.
        const charges: Row[] = input.sessions.filter(s => s.assignmentId === a.id || (s.vehicleId === vehicle.id
          && (!finite(millis(s.startedAt)) || !finite(millis(s.endedAt))
            ? !finite(millis(s.startedAt)) || millis(s.startedAt) <= millis(a.endedAt)
            : millis(s.startedAt) < millis(a.endedAt) && millis(s.endedAt) > millis(a.startedAt))))
          .map(s => ({ ...s, excluded: !options.includeTest && test(s) }));
        const result = evInterval(a, charges);
        if (result.batteryEnergyKWh !== null) samples.push({ distanceKm: intervalDistance(a)!, quantity: result.batteryEnergyKWh, cost: result.cost, refs: [a.id, ...charges.map(s => s.id)], capacity: result.capacity! });
        else if (result.reason) reasons.add(result.reason);
        // Meter-reported input remains useful even when usable capacity/consumption is unknown.
        const meters = charges.filter(s => !s.excluded && ownerMatches(s, a) && s.status === 'CLOSED' && s.recordStatus === 'ACTIVE'
          && s.economyCaptureVersion === 1 && s.chargerEnergyProvenance === 'REPORTED_METER' && positive(s.chargerEnergyDeliveredKWh)
          && finite(millis(s.startedAt)) && finite(millis(s.endedAt)) && millis(s.startedAt) >= millis(a.startedAt)
          && millis(s.endedAt) >= millis(s.startedAt) && millis(s.endedAt) <= millis(a.endedAt));
        const ambiguous = meters.some(s => charges.some(other => {
          if (other === s) return false;
          return s.id === other.id || (finite(millis(other.startedAt)) && finite(millis(other.endedAt))
            && Math.max(millis(s.startedAt), millis(other.startedAt)) < Math.min(millis(s.endedAt), millis(other.endedAt)));
        }));
        if (meters.length && !ambiguous) {
          chargerEnergyKWh += sum(meters.map(s => s.chargerEnergyDeliveredKWh)); chargerSampleCount += meters.length;
          chargerCoverageKm += intervalDistance(a)!; chargerRecordIds.push(...meters.map(s => s.id));
        }
      }
    } else reasons.add('UNKNOWN_POWERTRAIN');
    const coverageKm = sum(samples.map(s => s.distanceKm)), quantity = samples.length ? sum(samples.map(s => s.quantity)) : null;
    const costSamples = samples.filter(s => s.cost !== null), costCoverageKm = sum(costSamples.map(s => s.distanceKm));
    const cost = costSamples.length ? sum(costSamples.map(s => s.cost!)) : null;
    const provenance: Provenance = samples.length ? vehicle.vehicleType === 'EV' ? 'ESTIMATED' : 'MEASURED' : 'INSUFFICIENT_DATA';
    const excludedReturnEvents = input.chargingEvents.filter(e => e.vehicleId === vehicle.id && inPeriod(e.returnedAt, e.returnedAt)
      && (options.includeTest || !(e.isTestData === true || vehicle.isTestData === true || driverMap.get(e.returnDriverId)?.isTestData === true || driverMap.get(e.pickupDriverId)?.isTestData === true))).length;
    if (excludedReturnEvents) reasons.add('RETURN_CHARGING_ENERGY_AND_COST_NOT_RECONCILED');
    if (costCoverageKm < distanceKm || cost === null) reasons.add('INSUFFICIENT_COST_DATA');
    return {
      vehicleId: vehicle.id, registration: vehicle.registration || null, powertrain: vehicle.vehicleType, isTestData: vehicle.isTestData === true,
      periodStart: from ? new Date(from).toISOString() : usable.length ? new Date(Math.min(...usable.map(a => millis(a.startedAt)))).toISOString() : null,
      periodEnd: new Date(options.now).toISOString(), distanceKm, distanceSampleCount: usable.length, unknownAssignments,
      distanceProvenance: usable.length ? 'MEASURED' as Provenance : 'INSUFFICIENT_DATA' as Provenance,
      economy: { value: coverageKm > 0 && quantity !== null ? quantity / coverageKm * 100 : null, unit: vehicle.vehicleType === 'ICE' ? 'L/100 km' : 'kWh/100 km',
        quantity, coverageKm, sampleCount: samples.length, provenance, quality: quality(samples.length, coverageKm) },
      cost: { value: costCoverageKm > 0 && cost !== null ? cost / costCoverageKm : null, amount: cost, coverageKm: costCoverageKm, sampleCount: costSamples.length,
        status: costSamples.length ? 'AVAILABLE_FOR_COVERED_INTERVALS' : 'INSUFFICIENT_COST_DATA', provenance: costSamples.length ? 'MEASURED' as Provenance : 'INSUFFICIENT_DATA' as Provenance, currency: 'ZAR', method: 'RECORDED_REPLENISHMENT_EXPENSE' },
      chargerEnergy: { valueKWh: chargerSampleCount ? chargerEnergyKWh : null, sampleCount: chargerSampleCount, coverageKm: chargerCoverageKm,
        provenance: chargerSampleCount ? 'MEASURED' as Provenance : 'INSUFFICIENT_DATA' as Provenance,
        source: chargerSampleCount ? 'METERED_CHARGER_ENERGY' : 'UNKNOWN', recordIds: chargerRecordIds },
      manufacturerReference: positive(vehicle.vehicleType === 'ICE' ? vehicle.manufacturerFuelConsumption : vehicle.manufacturerEnergyConsumption)
        ? (vehicle.vehicleType === 'ICE' ? vehicle.manufacturerFuelConsumption : vehicle.manufacturerEnergyConsumption) : null,
      provenance: combineProvenance([usable.length ? 'MEASURED' : 'INSUFFICIENT_DATA', provenance]), reasons: [...reasons], excludedReturnEvents,
      evidence: samples.map(s => ({ recordIds: s.refs, capacityUsed: s.capacity || null, provenance })),
    };
  });
  const aggregate = (powertrain: string) => {
    const rows = vehicles.filter(v => v.powertrain === powertrain);
    const distanceKm = sum(rows.map(v => v.distanceKm)), coverageKm = sum(rows.map(v => v.economy.coverageKm));
    const costCoverageKm = sum(rows.map(v => v.cost.coverageKm));
    const quantities = rows.filter(v => v.economy.quantity !== null), costs = rows.filter(v => v.cost.amount !== null);
    const quantity = quantities.length ? sum(quantities.map(v => v.economy.quantity!)) : null, cost = costs.length ? sum(costs.map(v => v.cost.amount!)) : null;
    return { powertrain, distanceKm, coverageKm, sampleCount: sum(rows.map(v => v.economy.sampleCount)), quantity,
      per100Km: coverageKm > 0 && quantity !== null ? quantity / coverageKm * 100 : null, provenance: combineProvenance(rows.map(v => v.economy.provenance)),
      cost, costCoverageKm, costPerKm: costCoverageKm > 0 && cost !== null ? cost / costCoverageKm : null };
  };
  const ev = aggregate('EV'), ice = aggregate('ICE'), total = ev.distanceKm + ice.distanceKm;
  return { methodVersion: 1, period: options.period, includeTest: options.includeTest, updatedAt: new Date(options.now).toISOString(), vehicles,
    fleet: { ev, ice, evSharePercent: total > 0 ? ev.distanceKm / total * 100 : null, iceSharePercent: total > 0 ? ice.distanceKm / total * 100 : null,
      provenance: combineProvenance([ev.provenance, ice.provenance]) } };
}
