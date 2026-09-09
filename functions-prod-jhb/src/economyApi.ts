import * as functions from 'firebase-functions';
import { z } from 'zod';
import { calculateEconomy } from './economyMetrics';

/** Bounded on-demand projection. No writes, scheduled jobs, or materialized baselines. */
export function createEconomyHandler(deps: { db: FirebaseFirestore.Firestore; requireAdmin: (context: functions.https.CallableContext) => Promise<any>; now?: () => number }) {
  return async (data: unknown, context: functions.https.CallableContext) => {
    await deps.requireAdmin(context);
    const parsed = z.object({ period: z.enum(['30', '90', 'ALL']).default('30'), includeTest: z.boolean().default(false) }).strict().safeParse(data ?? {});
    if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Choose a supported economy period and TEST option.');
    const collections = ['vehicles', 'users', 'vehicleAssignments', 'refuelRecords', 'chargingSessions', 'chargingEvents'];
    const pages = await Promise.all(collections.map(name => {
      const query = deps.db.collection(name).limit(5001);
      return (name === 'users' ? query.select('isTestData') : query).get();
    }));
    if (pages.some(p => p.size > 5000)) throw new functions.https.HttpsError('resource-exhausted', 'Economy history exceeds the on-demand read limit. No partial totals were calculated.');
    const [vehicles, drivers, assignments, refuels, sessions, chargingEvents] = pages.map(p => p.docs.map(d => ({ ...d.data(), id: d.id })));
    return calculateEconomy({ vehicles, drivers, assignments, refuels, sessions, chargingEvents }, { ...parsed.data, now: deps.now?.() ?? Date.now() });
  };
}
