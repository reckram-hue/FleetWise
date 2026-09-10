import { callFunction } from '../lib/firebase';
// Type-only contract from the pure engine; no backend runtime enters the bundle.
import type { attachReadiness, Purpose } from '../../functions-prod-jhb/src/evidenceReadiness';
export type EconomyReport = ReturnType<typeof attachReadiness>;
export type EvidenceReviewInput = {
    vehicleId: string; purpose: Purpose; period: '30' | '90' | 'ALL'; includeTest: boolean;
    fingerprint: string; methodologyVersion: 'v1'; normalDutyConfirmed: boolean;
    recordingCompletenessConfirmed: boolean; configurationComparableConfirmed: boolean;
    notes: string; overrideSoftTriggers: boolean; softOverrideReason: string;
};
export const economyApi = {
    get: (period: '30' | '90' | 'ALL', includeTest: boolean) => callFunction<EconomyReport>('getFleetEconomySummaryAdmin', { period, includeTest }),
    saveReview: (input: EvidenceReviewInput) => callFunction<{ reviewId: string; revisionId: string }>('saveVehicleEvidenceReviewAdmin', input),
};
