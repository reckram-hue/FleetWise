import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';
import { imageResponse, readPrivateEvidence } from './privateEvidence';

export function createDefectEvidenceHandler(deps: {
  db: FirebaseFirestore.Firestore;
  requireAdmin: (context: functions.https.CallableContext) => Promise<any>;
  bucket: () => ReturnType<ReturnType<typeof admin.storage>['bucket']>;
}) {
  return async (data: unknown, context: functions.https.CallableContext) => {
    await deps.requireAdmin(context);
    const parsed = z.object({ defectId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), photoIndex: z.number().int().min(0).max(19) }).strict().safeParse(data);
    if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', 'Choose an attached defect photo.');
    const doc = await deps.db.collection('defects').doc(parsed.data.defectId).get();
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Defect not found.');
    const r = doc.data()!, path = r.photos?.[parsed.data.photoIndex];
    if (typeof path !== 'string') throw new functions.https.HttpsError('not-found', 'No attached photo at this position.');
    // Historical embedded images remain private and pass the same size/type validation.
    if (path.startsWith('data:')) {
      const match = path.length <= 7100000 && path.match(/^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new functions.https.HttpsError('failed-precondition', 'Legacy evidence format is unsupported.');
      return imageResponse(Buffer.from(match[2], 'base64'), match[1]);
    }
    const parts = path.split('/');
    if (parts.length !== 4 || parts[0] !== 'vehicle-defects' || !/^[A-Za-z0-9_-]+$/.test(parts[1])
      || parts[2] !== r.vehicleId || !parts[3].startsWith(`${r.driverId}-`)
      || !/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(parts[3]) || path.includes('..')) {
      throw new functions.https.HttpsError('permission-denied', 'Photo is not valid evidence for this defect.');
    }
    return readPrivateEvidence(deps.bucket(), path);
  };
}
