import * as functions from 'firebase-functions';
import { z } from 'zod';
import { calculateEconomy } from './economyMetrics';
import { FieldValue } from 'firebase-admin/firestore';
import { attachReadiness, digest, READINESS_VERSION, REVIEW_ORG, Review } from './evidenceReadiness';

type Deps = { db: FirebaseFirestore.Firestore; requireAdmin: (context: functions.https.CallableContext) => Promise<any>; now?: () => number };
const selection = { period: z.enum(['30', '90', 'ALL']).default('90'), includeTest: z.boolean().default(false) };
const collections = ['vehicles', 'users', 'vehicleAssignments', 'refuelRecords', 'chargingSessions', 'chargingEvents', 'vehicleEvidenceReviews'];
function assertOrg(admin: any) {
  if (admin.data?.orgId && admin.data.orgId !== REVIEW_ORG) throw new functions.https.HttpsError('permission-denied', 'This reporting service is scoped to the current single organisation.');
}
async function load(deps: Deps, options: { period: '30' | '90' | 'ALL'; includeTest: boolean }, now: number, tx?: FirebaseFirestore.Transaction) {
  const pages = await Promise.all(collections.map(name => {
    const query = deps.db.collection(name).limit(5001);
    const selected = name === 'users' ? query.select('isTestData', 'orgId') : query;
    return tx ? tx.get(selected) : selected.get();
  }));
  if (pages.some(p => p.size > 5000)) throw new functions.https.HttpsError('resource-exhausted', 'Economy history exceeds the on-demand read limit. No partial totals were calculated.');
  const rows = pages.map(p => p.docs.map(d => ({ ...d.data(), id: d.id })));
  if (rows.flat().some((r: any) => r.orgId && r.orgId !== REVIEW_ORG)) throw new functions.https.HttpsError('failed-precondition', 'Conflicting organisation evidence requires resolution before reporting.');
  const [vehicles, drivers, assignments, refuels, sessions, chargingEvents, saved] = rows;
  const input = { vehicles, drivers, assignments, refuels, sessions, chargingEvents };
  const reviews: Review[] = saved.map((r: any) => ({ orgId: r.orgId, vehicleId: r.vehicleId, purpose: r.purpose, period: r.period,
    methodologyVersion: r.methodologyVersion, fingerprint: r.fingerprint, scopeDay: r.scopeDay,
    reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt?.toDate?.().toISOString() || '', normalDutyConfirmed: r.normalDutyConfirmed === true,
    recordingCompletenessConfirmed: r.recordingCompletenessConfirmed === true, configurationComparableConfirmed: r.configurationComparableConfirmed === true,
    notes: typeof r.notes === 'string' ? r.notes : '', softOverrideReason: typeof r.softOverrideReason === 'string' ? r.softOverrideReason : '',
    isTestData: r.isTestData === true, includeTest: r.includeTest === true }));
  return attachReadiness(calculateEconomy(input, { ...options, now }), input, reviews, now);
}

/** Bounded on-demand projection. No writes, scheduled jobs, or materialized baselines. */
export function createEconomyHandler(deps: Deps) {
  return async (data: unknown, context: functions.https.CallableContext) => {
    assertOrg(await deps.requireAdmin(context));
    const parsed = z.object(selection).strict().safeParse(data ?? {});
    if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Choose a supported economy period and TEST option.');
    return load(deps, parsed.data, deps.now?.() ?? Date.now());
  };
}

export function createEvidenceReviewHandler(deps: Deps) {
  return async (data: unknown, context: functions.https.CallableContext) => {
    const admin = await deps.requireAdmin(context); assertOrg(admin);
    const parsed = z.object({ ...selection, vehicleId: z.string().min(1).max(150), purpose: z.enum(['ICE_CONSUMPTION', 'EV_CONSUMPTION', 'OPERATING_COST']),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/), methodologyVersion: z.literal(READINESS_VERSION),
      normalDutyConfirmed: z.boolean(), recordingCompletenessConfirmed: z.boolean(), configurationComparableConfirmed: z.boolean(),
      notes: z.string().trim().max(2000).default(''), overrideSoftTriggers: z.boolean().default(false), softOverrideReason: z.string().trim().max(2000).default('') }).strict().safeParse(data);
    if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Provide a valid scoped evidence review.');
    const p = parsed.data;
    if (p.overrideSoftTriggers && !p.softOverrideReason) throw new functions.https.HttpsError('invalid-argument', 'A reason is required to override soft review triggers.');
    if (!p.overrideSoftTriggers && p.softOverrideReason) throw new functions.https.HttpsError('invalid-argument', 'Select the explicit soft-trigger override before entering a reason.');
    return deps.db.runTransaction(async tx => {
      const profile = await tx.get(deps.db.collection('users').doc(admin.uid));
      if (!profile.exists || profile.data()?.role !== 'admin' || profile.data()?.employmentStatus !== 'Active') throw new functions.https.HttpsError('permission-denied', 'Active admin privileges required.');
      assertOrg({ data: profile.data() });
      const now = deps.now?.() ?? Date.now();
      const report = await load(deps, p, now, tx);
      const vehicle = report.vehicles.find(v => v.vehicleId === p.vehicleId);
      if (!vehicle) throw new functions.https.HttpsError('not-found', 'Vehicle is not present in this selection.');
      const diagnostic = p.purpose === 'OPERATING_COST' ? vehicle.readiness.cost : vehicle.readiness.consumption;
      if (diagnostic.purpose !== p.purpose) throw new functions.https.HttpsError('invalid-argument', 'Review purpose does not match vehicle powertrain.');
      if (diagnostic.fingerprint !== p.fingerprint) throw new functions.https.HttpsError('failed-precondition', 'Evidence changed. Reload and review the current selection.');
      const id = digest([REVIEW_ORG, p.vehicleId, p.purpose, p.period, p.includeTest, READINESS_VERSION]);
      const ref = deps.db.collection('vehicleEvidenceReviews').doc(id);
      const revision = ref.collection('history').doc();
      const record = { orgId: REVIEW_ORG, vehicleId: p.vehicleId, purpose: p.purpose, period: p.period, includeTest: p.includeTest,
        methodologyVersion: READINESS_VERSION, fingerprint: diagnostic.fingerprint, scopeDay: diagnostic.scopeDay,
        reviewedBy: admin.uid, reviewedAt: FieldValue.serverTimestamp(), normalDutyConfirmed: p.normalDutyConfirmed,
        recordingCompletenessConfirmed: p.recordingCompletenessConfirmed, configurationComparableConfirmed: p.configurationComparableConfirmed,
        notes: p.notes, softOverrideReason: p.overrideSoftTriggers ? p.softOverrideReason : '', isTestData: vehicle.isTestData,
        diagnosticsAtReview: { hard: diagnostic.hard, soft: diagnostic.soft, D: diagnostic.D, E: diagnostic.E, C: diagnostic.C,
          periodStart: vehicle.periodStart, periodEnd: vehicle.periodEnd }, revisionId: revision.id };
      // Confirmation may be recorded even when data fails, but it never overrides diagnostic hard gates.
      tx.set(ref, record); tx.create(revision, record);
      return { reviewId: id, revisionId: revision.id };
    });
  };
}
