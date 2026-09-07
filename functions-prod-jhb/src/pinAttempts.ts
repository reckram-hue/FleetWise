import { createHash, randomUUID } from 'crypto';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export const PIN_ATTEMPT_LIMIT = 6;
export const PIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

export function pinAttemptDocumentId(driverId: string): string {
  return 'pin-account-' + createHash('sha256').update(driverId).digest('hex');
}

// Reservations count failed AND in-flight verifications. A successful verification
// releases only its own reservation; it cannot erase concurrent failures. Failed,
// abandoned or interrupted attempts expire together after this fixed window.
// deviceId deliberately has no role in this account-wide budget.
export async function reservePinAttempt(
  db: Firestore,
  driverId: string,
  now: () => number = Date.now,
): Promise<() => Promise<void>> {
  const ref = db.collection('rateLimits').doc(pinAttemptDocumentId(driverId));
  const attemptId = randomUUID();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    const currentMs = now();
    let attemptIds: string[] = [];
    let firstAttempt = Timestamp.fromMillis(currentMs);
    if (snapshot.exists) {
      if (!data || !Array.isArray(data.attemptIds)
        || data.attemptIds.some((id: unknown) => typeof id !== 'string')
        || !(data.firstAttempt instanceof Timestamp)) {
        throw new HttpsError('resource-exhausted', 'PIN verification is temporarily unavailable. Please contact support.');
      }
      if (currentMs < data.firstAttempt.toMillis() + PIN_ATTEMPT_WINDOW_MS) {
        attemptIds = data.attemptIds;
        firstAttempt = data.firstAttempt;
      }
    }
    if (attemptIds.length >= PIN_ATTEMPT_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Too many failed PIN attempts. Please wait 10 minutes before trying again.');
    }
    const reserved = [...attemptIds, attemptId];
    tx.set(ref, {
      attempts: reserved.length,
      attemptIds: reserved,
      firstAttempt,
      lastAttempt: Timestamp.fromMillis(currentMs),
    });
  });

  return async () => {
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data();
      // A late success cannot refund an attempt from a newer window. Repeating
      // this callback is also a no-op once this unique reservation is removed.
      if (!data || !Array.isArray(data.attemptIds) || !data.attemptIds.includes(attemptId)) return;
      const remaining = data.attemptIds.filter((id: string) => id !== attemptId);
      tx.update(ref, { attempts: remaining.length, attemptIds: remaining });
    });
  };
}

// Keep the login status contract shared with self-service PIN changes.
export function assertActivePinDriver(driverData: Record<string, any>): void {
  if (driverData.employmentStatus !== 'Active') {
    throw new HttpsError('failed-precondition', 'Your account is not active. Please contact your administrator.');
  }
  if (driverData.role && driverData.role !== 'driver') {
    throw new HttpsError('failed-precondition', 'This account is not a driver account.');
  }
}
