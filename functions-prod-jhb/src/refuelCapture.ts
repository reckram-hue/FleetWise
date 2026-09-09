import * as crypto from 'crypto';
import * as functions from 'firebase-functions';

/** One immutable capture per driver/request ID. Old clients remain explicitly unverified. */
export async function persistRefuel(db: FirebaseFirestore.Firestore, record: Record<string, any>, clientRequestId?: string) {
  const canonical = { driverId: record.driverId, assignmentId: record.assignmentId, vehicleId: record.vehicleId, odometer: record.odometer,
    litresFilled: record.litresFilled, fuelCost: record.fuelCost, oilCost: record.oilCost ?? null, notes: record.notes ?? null, fillLevel: record.fillLevel };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const ref = clientRequestId ? db.collection('refuelRecords').doc('capture-' + crypto.createHash('sha256').update(record.driverId + ':' + clientRequestId).digest('hex'))
    : db.collection('refuelRecords').doc();
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()?.captureFingerprint !== fingerprint) throw new functions.https.HttpsError('already-exists', 'This refuel request was already saved with different details.');
      return;
    }
    tx.create(ref, { ...record, captureVersion: 1, recordStatus: clientRequestId ? 'ACTIVE' : 'UNVERIFIED',
      clientRequestId: clientRequestId ?? null, captureFingerprint: fingerprint, currency: 'ZAR' });
  });
  const saved = await ref.get();
  return { id: saved.id, ...saved.data() };
}
