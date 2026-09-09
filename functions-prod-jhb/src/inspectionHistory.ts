import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';
import { readPrivateEvidence } from './privateEvidence';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const cursor = z.object({ id, seconds: z.number().int(), nanoseconds: z.number().int().min(0).max(999999999) }).strict();
const listSchema = z.object({
  vehicleId: id.optional(), driverId: id.optional(), assignmentId: id.optional(), shiftId: id.optional(),
  boundaryType: z.enum(['PICKUP', 'RETURN']).optional(),
  from: z.string().datetime().optional(), until: z.string().datetime().optional(),
  includeTest: z.boolean().default(false), cursor: cursor.optional(), limit: z.number().int().min(1).max(100).default(50),
}).strict();
const iso = (value: any): string | null => value?.toDate instanceof Function ? value.toDate().toISOString() : null;
const text = (value: unknown): string | null => typeof value === 'string' && value ? value : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Read-only, bounded history. Filters run on each scanned page so no new composite
 * indexes are required. An empty filtered page can still have a continuation cursor.
 * Only explicit display fields leave the server: never raw documents or object paths.
 */
export function createInspectionHistoryHandlers(deps: {
  db: FirebaseFirestore.Firestore;
  requireAdmin: (context: functions.https.CallableContext) => Promise<any>;
  bucket: () => ReturnType<ReturnType<typeof admin.storage>['bucket']>;
}) {
  const inspections = deps.db.collection('vehicleInspections');
  const wrap = (handler: (data: any) => Promise<any>) => async (data: unknown, context: functions.https.CallableContext) => {
    await deps.requireAdmin(context);
    try { return await handler(data); }
    catch (error) {
      if (error instanceof z.ZodError) throw new functions.https.HttpsError('invalid-argument', 'Choose valid inspection filters or attached evidence.');
      throw error;
    }
  };
  async function parents(docs: FirebaseFirestore.QueryDocumentSnapshot[] | FirebaseFirestore.DocumentSnapshot[]) {
    const refs = new Map<string, FirebaseFirestore.DocumentReference>();
    for (const doc of docs) {
      const r = doc.data()!;
      for (const [collection, key] of [['users', 'driverId'], ['vehicles', 'vehicleId'], ['vehicleAssignments', 'assignmentId']]) {
        if (id.safeParse(r[key]).success) {
          const ref = deps.db.collection(collection).doc(r[key]); refs.set(ref.path, ref);
        }
      }
    }
    const loaded = refs.size ? await deps.db.getAll(...refs.values()) : [];
    return new Map(loaded.map(doc => [doc.ref.path, doc.data() || {}]));
  }
  function display(doc: FirebaseFirestore.DocumentSnapshot, related: Map<string, FirebaseFirestore.DocumentData>) {
    const r = doc.data()!, driver = related.get(`users/${r.driverId}`) || {}, vehicle = related.get(`vehicles/${r.vehicleId}`) || {};
    const candidate = related.get(`vehicleAssignments/${r.assignmentId}`) || {};
    const assignment = candidate.vehicleId === r.vehicleId && candidate.driverId === r.driverId && candidate.shiftId === r.shiftId ? candidate : {};
    const pickup = r.boundaryType === 'PICKUP', draft = r.returnFinalization || {};
    return {
      id: doc.id, vehicleId: text(r.vehicleId), driverId: text(r.driverId), assignmentId: text(r.assignmentId), shiftId: text(r.shiftId),
      vehicleRegistration: text(r.vehicleRegistrationSnapshot) || text(assignment.vehicleRegistrationSnapshot) || text(vehicle.registration),
      vehicleDisplayName: text(r.vehicleDisplayNameSnapshot) || text(assignment.vehicleDisplayNameSnapshot)
        || [vehicle.make, vehicle.model, vehicle.alias].filter(v => typeof v === 'string' && v).join(' · ') || null,
      identitySource: r.vehicleRegistrationSnapshot || assignment.vehicleRegistrationSnapshot ? 'snapshot' : 'current vehicle record',
      driverName: text(r.driverNameSnapshot) || [driver.firstName, driver.surname].filter(v => typeof v === 'string' && v).join(' ') || null,
      boundaryType: text(r.boundaryType), status: text(r.status), createdAt: iso(r.createdAt), capturedAt: iso(r.capturedAt), completedAt: iso(r.completedAt),
      isTestData: r.isTestData === true || assignment.isTestData === true || driver.isTestData === true || vehicle.isTestData === true,
      odometer: number(pickup ? assignment.startOdometer : draft.endOdometer ?? assignment.endOdometer),
      chargePercent: number(pickup ? assignment.startChargePercent : draft.endChargePercent ?? assignment.endChargePercent),
      predictedRangeKm: number(pickup ? assignment.startPredictedRangeKm : draft.endPredictedRangeKm ?? assignment.endPredictedRangeKm),
      hasDamage: typeof r.hasDamage === 'boolean' ? r.hasDamage : null, damageDescription: text(r.damageDescription),
      linkedDefectId: text(r.linkedDefectId), returnIntent: text(r.returnIntent), returnFinalizationStatus: text(r.returnFinalizationStatus),
      retentionClass: text(r.retentionClass), expiresAt: iso(r.expiresAt),
      photos: { exterior: !!text(r.exteriorPhotoPath), interior: !!text(r.interiorPhotoPath) },
    };
  }
  const listVehicleInspectionsAdmin = wrap(async data => {
    const v = listSchema.parse(data || {});
    if (v.from && v.until && v.from >= v.until) throw new functions.https.HttpsError('invalid-argument', 'The end date must follow the start date.');
    let query: FirebaseFirestore.Query = inspections.orderBy('createdAt', 'desc').orderBy(admin.firestore.FieldPath.documentId(), 'desc');
    if (v.from) query = query.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date(v.from)));
    if (v.until) query = query.where('createdAt', '<', admin.firestore.Timestamp.fromDate(new Date(v.until)));
    if (v.cursor) query = query.startAfter(new admin.firestore.Timestamp(v.cursor.seconds, v.cursor.nanoseconds), v.cursor.id);
    const page = await query.limit(v.limit).get(), related = await parents(page.docs);
    const rows = page.docs.map(doc => display(doc, related)).filter(r =>
      (v.includeTest || !r.isTestData) && (!v.vehicleId || r.vehicleId === v.vehicleId) && (!v.driverId || r.driverId === v.driverId)
      && (!v.assignmentId || r.assignmentId === v.assignmentId) && (!v.shiftId || r.shiftId === v.shiftId)
      && (!v.boundaryType || r.boundaryType === v.boundaryType));
    const last = page.docs[page.size - 1], time = last?.data().createdAt;
    return { inspections: rows, nextCursor: page.size === v.limit ? { id: last.id, seconds: time.seconds, nanoseconds: time.nanoseconds } : null };
  });
  const getVehicleInspectionAdmin = wrap(async data => {
    const v = z.object({ inspectionId: id }).strict().parse(data);
    const doc = await inspections.doc(v.inspectionId).get();
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Inspection not found.');
    return display(doc, await parents([doc]));
  });
  const getInspectionPhotoAdmin = wrap(async data => {
    const v = z.object({ inspectionId: id, photoRole: z.enum(['EXTERIOR', 'INTERIOR']) }).strict().parse(data);
    const doc = await inspections.doc(v.inspectionId).get();
    if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Inspection not found.');
    const r = doc.data()!, path = r[v.photoRole === 'EXTERIOR' ? 'exteriorPhotoPath' : 'interiorPhotoPath'];
    if (!path) throw new functions.https.HttpsError('not-found', 'No attached photo for this inspection.');
    const parts = typeof path === 'string' ? path.split('/') : [];
    // Support both historical canonical filenames and current unique role filenames.
    const filename = new RegExp(`^${v.photoRole.toLowerCase()}(?:-[A-Za-z0-9_-]+)?\\.(jpg|png|webp)$`);
    if (!id.safeParse(r.orgId).success || !id.safeParse(r.assignmentId).success || !['PICKUP', 'RETURN'].includes(r.boundaryType)
      || parts.length !== 5 || parts[0] !== 'vehicle-inspections' || parts[1] !== r.orgId || parts[2] !== r.assignmentId
      || parts[3] !== r.boundaryType || !filename.test(parts[4])) {
      throw new functions.https.HttpsError('permission-denied', 'Photo is not attached evidence owned by this inspection.');
    }
    return readPrivateEvidence(deps.bucket(), path);
  });
  return { listVehicleInspectionsAdmin, getVehicleInspectionAdmin, getInspectionPhotoAdmin };
}
