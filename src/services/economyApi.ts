import { callFunction } from '../lib/firebase';
// Type-only contract from the pure engine; no backend runtime enters the bundle.
import type { calculateEconomy } from '../../functions-prod-jhb/src/economyMetrics';
export type EconomyReport = ReturnType<typeof calculateEconomy>;
export const economyApi = {
    get: (period: '30' | '90' | 'ALL', includeTest: boolean) => callFunction<EconomyReport>('getFleetEconomySummaryAdmin', { period, includeTest }),
};
