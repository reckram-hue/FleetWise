import { createHash } from 'crypto';
import type { calculateEconomy, EconomyInput } from './economyMetrics';

export const READINESS_VERSION = 'v1';
export const REVIEW_ORG = 'default'; // Existing single-tenant deployment; never accept client org context.
export type Purpose = 'ICE_CONSUMPTION' | 'EV_CONSUMPTION' | 'OPERATING_COST';
type Vehicle = ReturnType<typeof calculateEconomy>['vehicles'][number];
type Sample = Vehicle['diagnosticSamples'][number];
export type Review = {
  orgId: string; vehicleId: string; purpose: Purpose; period: string; methodologyVersion: string;
  fingerprint: string; scopeDay: string; reviewedBy: string; reviewedAt: string;
  normalDutyConfirmed: boolean; recordingCompletenessConfirmed: boolean; configurationComparableConfirmed: boolean;
  notes: string; softOverrideReason: string; isTestData: boolean; includeTest: boolean;
};
export const TRIGGERS = { coveredKm: 1000, iceCycles: 6, evIntervals: 20, evDays: 10, spanDays: 60, weeks: 6, coveragePercent: 90, recentDays: 30 } as const;
const dayMs = 86400000;
const date = (t: number) => new Date(t).toISOString().slice(0, 10);
function canonical(value: any): any {
  if (value?.toMillis instanceof Function) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function reviewFingerprint(input: EconomyInput, vehicle: Vehicle, period: string, includeTest: boolean, now: number) {
  const assignments = input.assignments.filter(a => a.vehicleId === vehicle.vehicleId);
  const ids = new Set(assignments.map(a => a.id));
  // All same-vehicle source history, plus conflicting ownership and parent TEST markers.
  // Conservative invalidation also covers changed exclusions and references, not just rounded totals.
  return digest({ version: READINESS_VERSION, org: REVIEW_ORG, period, includeTest, scopeDay: date(now),
    vehicle: input.vehicles.find(v => v.id === vehicle.vehicleId), assignments,
    refuels: input.refuels.filter(r => r.vehicleId === vehicle.vehicleId || ids.has(r.assignmentId)),
    sessions: input.sessions.filter(r => r.vehicleId === vehicle.vehicleId || ids.has(r.assignmentId)),
    events: input.chargingEvents.filter(r => r.vehicleId === vehicle.vehicleId), drivers: input.drivers,
    diagnosticSamples: vehicle.diagnosticSamples, unknownAssignments: vehicle.unknownAssignments });
}
export function temporalDiagnostics(samples: Sample[], now: number) {
  const activity = samples.flatMap(s => s.activity);
  const days = new Set(activity.map(date));
  const weeks = new Set(activity.map(t => { const d = new Date(date(t)); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return date(d.getTime()); }));
  const start = samples.length ? Math.min(...samples.map(s => s.start)) : null;
  const end = samples.length ? Math.max(...samples.map(s => s.end)) : null;
  return { spanDays: start === null || end === null ? null : (end - start) / dayMs,
    operatingDays: days.size, distinctWeeks: weeks.size,
    firstObservation: start === null ? null : new Date(start).toISOString(), latestObservation: end === null ? null : new Date(end).toISOString(),
    ageDays: end === null ? null : (now - end) / dayMs };
}
export function manufacturerComparison(powertrain: string, unit: string, observed: number | null, reference: number | null) {
  if (powertrain === 'EV') return { variancePercent: null, message: 'Reference energy basis not verified' };
  if (powertrain !== 'ICE' || unit !== 'L/100 km') return { variancePercent: null, message: 'Reference and observed units are not compatible' };
  if (observed === null || !Number.isFinite(observed) || observed <= 0) return { variancePercent: null, message: 'Observed consumption is unavailable' };
  if (reference === null || !Number.isFinite(reference) || reference <= 0) return { variancePercent: null, message: 'Manufacturer reference is unavailable' };
  return { variancePercent: (observed - reference) / reference * 100, message: 'Factual observation versus manufacturer reference; operating conditions may differ' };
}
export function evaluateEvidence(v: Vehicle, purpose: Purpose, review: Review | undefined, fingerprint: string, period: string, includeTest: boolean, now: number) {
  const isCost = purpose === 'OPERATING_COST';
  const samples = isCost ? v.diagnosticSamples.filter(s => s.cost !== null) : v.diagnosticSamples;
  const coveredKm = isCost ? v.cost.coverageKm : v.economy.coverageKm;
  const coveragePercent = v.distanceKm > 0 ? coveredKm / v.distanceKm * 100 : null;
  const temporal = temporalDiagnostics(samples, now);
  const hard: string[] = [], soft: string[] = [];
  const value = isCost ? v.cost.value : v.economy.value;
  if (v.testProvenanceAmbiguous) hard.push('TEST provenance contains unsupported markers and must be resolved');
  if (!(v.distanceKm > 0) || !(coveredKm > 0) || value === null || !Number.isFinite(value)) hard.push('No valid covered metric and authoritative distance denominator');
  if (!['ICE', 'EV'].includes(v.powertrain) || (!isCost && purpose !== `${v.powertrain}_CONSUMPTION`)) hard.push('Consumption methodology is not supported for this purpose');
  if (v.unknownAssignments > 0) hard.push('Unresolved invalid or unknown assignment activity prevents a complete evidence review');
  if (v.reasons.some(r => ['UNKNOWN_INVALID_OR_DUPLICATE_REFUEL', 'REFUEL_DATE_UNKNOWN_CANNOT_BOUND_INTERVALS', 'NON_INCREASING_REFUEL_ODOMETER', 'ASSIGNMENT_DISTANCE_GAP_OR_OVERLAP', 'INCOMPLETE_CONFLICTING_OR_UNKNOWN_CHARGE', 'UNKNOWN_ENERGY_CAPTURE_PROVENANCE'].includes(r))) hard.push('Unresolved capture, ownership or correction ambiguity needs review');
  const capacities = new Set(samples.filter(s => s.capacity).map(s => digest(s.capacity && { value: s.capacity.valueKWh, source: s.capacity.source })));
  const capacityCount = samples.filter(s => s.capacity && s.capacity.valueKWh > 0 && s.capacity.source.trim() && Number.isFinite(Date.parse(s.capacity.recordedAt))).length;
  if (v.powertrain === 'EV' && capacityCount !== samples.length) hard.push('Usable battery capacity is not verified for every included estimate');
  if (capacities.size > 1) hard.push('Different usable-capacity configurations are pooled; select comparable evidence before review');
  if (isCost && (v.cost.coverageKm !== v.distanceKm || v.excludedReturnEvents > 0)) hard.push('Complete-period operating cost is not reconciled; the rate applies only to covered intervals');
  if (coveredKm < TRIGGERS.coveredKm) soft.push(`Covered distance review trigger not met: ${coveredKm.toFixed(1)} / ${TRIGGERS.coveredKm} km`);
  const count = v.powertrain === 'ICE' ? TRIGGERS.iceCycles : TRIGGERS.evIntervals;
  if (samples.length < count) soft.push(`Valid ${v.powertrain === 'ICE' ? 'full-to-full cycles' : 'energy-balance intervals'}: ${samples.length} / ${count}`);
  if (v.powertrain === 'EV' && temporal.operatingDays < TRIGGERS.evDays) soft.push(`Recorded operating days: ${temporal.operatingDays} / ${TRIGGERS.evDays}`);
  if (temporal.spanDays === null || temporal.spanDays < TRIGGERS.spanDays) soft.push(`Observation span: ${temporal.spanDays?.toFixed(1) ?? 'unavailable'} / ${TRIGGERS.spanDays} days`);
  if (temporal.distinctWeeks < TRIGGERS.weeks) soft.push(`Recorded activity weeks: ${temporal.distinctWeeks} / ${TRIGGERS.weeks}`);
  if (coveragePercent === null || coveragePercent < TRIGGERS.coveragePercent) soft.push(`Coverage of eligible recorded distance: ${coveragePercent?.toFixed(1) ?? 'unavailable'}% / ${TRIGGERS.coveragePercent}%`);
  if (temporal.ageDays === null || temporal.ageDays > TRIGGERS.recentDays) soft.push('Latest qualifying observation is unavailable or older than 30 days');
  const current = !!review && review.orgId === REVIEW_ORG && review.vehicleId === v.vehicleId && review.purpose === purpose && review.period === period
    && review.methodologyVersion === READINESS_VERSION && review.fingerprint === fingerprint && review.scopeDay === date(now)
    && review.includeTest === includeTest && review.isTestData === v.isTestData && Number.isFinite(Date.parse(review.reviewedAt)) && Date.parse(review.reviewedAt) <= now;
  const confirmation: string[] = [];
  if (!current) confirmation.push(review ? 'Previous review is stale or scoped to different evidence; review this selection again' : 'Normal duty, recording completeness and configuration comparability have not been reviewed');
  else {
    if (!review.normalDutyConfirmed) confirmation.push('Normal duty has not been confirmed');
    if (!review.recordingCompletenessConfirmed) confirmation.push('Recording completeness has not been confirmed');
    if (!review.configurationComparableConfirmed) confirmation.push('Configuration comparability has not been confirmed');
  }
  const softAccepted = soft.length === 0 || (current && !!review?.softOverrideReason.trim());
  const state = value === null || !(coveredKm > 0) ? 'INSUFFICIENT_DATA' : !hard.length && !confirmation.length && softAccepted ? 'SUFFICIENT_FOR_ANALYSIS' : 'LIMITED_EVIDENCE';
  const totalQ = samples.reduce((n, s) => n + (isCost ? s.cost! : s.quantity), 0);
  const base = coveredKm > 0 ? totalQ / coveredKm : null;
  const rates = samples.filter(s => coveredKm > s.distanceKm).map(s => (totalQ - (isCost ? s.cost! : s.quantity)) / (coveredKm - s.distanceKm));
  return { purpose, state, hard, soft, confirmation, fingerprint, methodologyVersion: READINESS_VERSION,
    scopeDay: date(now), period, D: v.distanceSampleCount ? v.distanceKm : null, E: v.economy.coverageKm, C: v.cost.coverageKm,
    coveragePercent, sampleCount: samples.length, ...temporal,
    capacityEvidencePercent: v.powertrain === 'EV' && samples.length ? capacityCount / samples.length * 100 : null,
    unknownAssignments: v.unknownAssignments, excludedReturnEvents: v.excludedReturnEvents,
    excludedEnergyAssignments: v.powertrain === 'EV' ? Math.max(0, v.distanceSampleCount - v.diagnosticSamples.length) : null,
    provenance: isCost ? v.cost.provenance : v.economy.provenance,
    influence: base !== null && base !== 0 && rates.length ? { maxChangePercent: Math.max(...rates.map(r => Math.abs((r - base) / base * 100))) } : null,
    review: review ? { ...review, current } : null };
}
export function attachReadiness(report: ReturnType<typeof calculateEconomy>, input: EconomyInput, reviews: Review[], now: number) {
  return { ...report, readinessMethodVersion: READINESS_VERSION, vehicles: report.vehicles.map(v => {
    const fingerprint = reviewFingerprint(input, v, report.period, report.includeTest, now);
    const find = (purpose: Purpose) => reviews.find(r => r.vehicleId === v.vehicleId && r.purpose === purpose && r.period === report.period && r.includeTest === report.includeTest);
    const purpose: Purpose = v.powertrain === 'ICE' ? 'ICE_CONSUMPTION' : 'EV_CONSUMPTION';
    return { ...v, readiness: {
      consumption: evaluateEvidence(v, purpose, find(purpose), fingerprint, report.period, report.includeTest, now),
      cost: evaluateEvidence(v, 'OPERATING_COST', find('OPERATING_COST'), fingerprint, report.period, report.includeTest, now) },
      manufacturerComparison: manufacturerComparison(v.powertrain, v.economy.unit, v.economy.value, v.manufacturerReference) };
  }) };
}
