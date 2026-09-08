import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';
import { randomUUID, createHash } from 'crypto';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().trim().max(300).nullable().optional();
const long = z.string().trim().max(6000).nullable().optional();
const tri = z.enum(['YES', 'NO', 'UNKNOWN']).nullable().optional();
const Fields = z.object({
  accidentAt: z.string().datetime().nullable().optional(),
  locationDescription: long,
  narrative: long,
  injuries: tri,
  emergencyAttended: tri,
  policeAttended: tri,
  policeAgency: text,
  policeReference: text,
  vehicleMotion: z.enum(['MOVING', 'PARKED', 'UNKNOWN']).nullable().optional(),
  otherDriverName: text,
  otherDriverSurname: text,
  otherDriverPhone: text,
  otherDriverEmail: text,
  otherDriverLicence: text,
  otherDriverLicenceExpiry: text,
  otherDriverJurisdiction: text,
  otherVehicleRegistration: text,
  otherVehicleMake: text,
  otherVehicleModel: text,
  otherVehicleColour: text,
  otherVehicleType: text,
  ownerName: text,
  ownerContact: text,
  ownerRelationship: text,
  insurer: text,
  policyNumber: text,
  claimReference: text,
  insuredParty: text,
  fleetDamage: long,
  otherVehicleDamage: long,
  propertyDamage: long,
  vehicleDriveable: tri,
  towingRequired: tri,
  gps: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict().nullable().optional(),
  witnesses: z.array(z.object({ name: text, phone: text, email: text, notes: long }).strict()).max(20).optional(),
  incompleteDetailsAcknowledged: z.boolean().optional(),
}).strict();
const Credentials = z.object({ driverId: id, sessionToken: z.string().min(1) });
const ReportRequest = Credentials.extend({ reportId: id });
const error = (code: functions.https.FunctionsErrorCode, message: string): never => { throw new functions.https.HttpsError(code, message); };
const wrap = (fn: (data: any, context: functions.https.CallableContext) => Promise<any>) => async (data: any, context: functions.https.CallableContext) => {
  try { return await fn(data, context); }
  catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    if (e instanceof z.ZodError) error('invalid-argument', e.errors.map(v => `${v.path.join('.')}: ${v.message}`).join('; '));
    // Do not log roadside personal details, credentials or image bytes.
    error('internal', 'Accident report operation failed. Please retry.');
  }
};

export function createAccidentHandlers(deps: {
  db: FirebaseFirestore.Firestore;
  requireDriverSession: (data: { driverId: string; sessionToken: string }) => Promise<{ driverId: string; orgId: string; isTestData: boolean }>;
  requireAdmin: (context: functions.https.CallableContext) => Promise<any>;
  bucket: () => ReturnType<ReturnType<typeof admin.storage>['bucket']>;
}) {
  const { db } = deps;
  const reports = db.collection('accidentReports');
  const stamp = () => admin.firestore.FieldValue.serverTimestamp();
  const record = (doc: FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data() });
  function owned(report: FirebaseFirestore.DocumentData | undefined, driverId: string) {
    if (!report || report.driverId !== driverId) error('permission-denied', 'This accident report is not available to this driver.');
    return report!;
  }
  async function active(tx: FirebaseFirestore.Transaction, assignmentId: string, driverId: string) {
    const assignment = (await tx.get(db.collection('vehicleAssignments').doc(assignmentId))).data();
    if (!assignment || assignment.driverId !== driverId || assignment.status !== 'ACTIVE') error('permission-denied', 'An active assignment owned by you is required.');
    const a = assignment!;
    const [shift, vehicle] = await Promise.all([tx.get(db.collection('shifts').doc(a.shiftId)), tx.get(db.collection('vehicles').doc(a.vehicleId))]);
    if (shift.data()?.status !== 'Active' || shift.data()?.driverId !== driverId || shift.data()?.activeAssignmentId !== assignmentId || vehicle.data()?.activeAssignmentId !== assignmentId) {
      error('failed-precondition', 'The current vehicle assignment changed. Reload before continuing.');
    }
    return { assignment: a, vehicle: vehicle.data()! };
  }
  async function editContext(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, driverId: string) {
    const report = owned((await tx.get(ref)).data(), driverId);
    if (report.status !== 'DRAFT') error('failed-precondition', 'Submitted accident reports are read-only.');
    const { assignment } = await active(tx, report.assignmentId, driverId);
    if (assignment.vehicleId !== report.vehicleId || assignment.shiftId !== report.shiftId) error('failed-precondition', 'Report context changed.');
    return report;
  }
  const createAccidentReportDraft = wrap(async data => {
    const v = Credentials.extend({ assignmentId: id, requestId: id }).parse(data);
    const session = await deps.requireDriverSession(v);
    const ref = reports.doc(v.requestId);
    const pointer = db.collection('accidentDrafts').doc(v.assignmentId);
    const reportId = await db.runTransaction(async tx => {
      const { assignment, vehicle } = await active(tx, v.assignmentId, session.driverId);
      const existing = await tx.get(ref);
      if (existing.exists) {
        const r = owned(existing.data(), session.driverId);
        if (r.assignmentId !== v.assignmentId) error('permission-denied', 'Report belongs to another assignment.');
        return ref.id;
      }
      const draftId = (await tx.get(pointer)).data()?.reportId;
      if (draftId) {
        const draft = owned((await tx.get(reports.doc(draftId))).data(), session.driverId);
        if (draft.status === 'DRAFT') return draftId as string;
      }
      const orgId = assignment.orgId || session.orgId || 'default';
      if (!/^[A-Za-z0-9_-]+$/.test(orgId)) error('failed-precondition', 'Invalid organisation context.');
      tx.create(ref, { orgId, driverId: session.driverId, createdByDriverId: session.driverId,
        assignmentId: v.assignmentId, shiftId: assignment.shiftId, vehicleId: assignment.vehicleId,
        isTestData: session.isTestData || assignment.isTestData === true || vehicle.isTestData === true,
        status: 'DRAFT', createdAt: stamp(), updatedAt: stamp(), submittedAt: null, revision: 0,
        fields: { accidentAt: new Date().toISOString(), witnesses: [] }, photos: [] });
      tx.set(pointer, { reportId: ref.id });
      return ref.id;
    });
    return record(await reports.doc(reportId).get());
  });
  const updateAccidentReportDraft = wrap(async data => {
    const v = ReportRequest.extend({ revision: z.number().int().min(0), mutationId: id, fields: Fields }).parse(data);
    const { driverId } = await deps.requireDriverSession(v);
    const ref = reports.doc(v.reportId);
    await db.runTransaction(async tx => {
      const r = await editContext(tx, ref, driverId);
      if (r.lastMutationId === v.mutationId) return;
      if (r.revision !== v.revision) error('aborted', 'This draft changed in another window. Reload the saved report before editing.');
      tx.update(ref, { fields: { ...r.fields, ...v.fields }, revision: r.revision + 1, lastMutationId: v.mutationId, updatedAt: stamp() });
    });
    return record(await ref.get());
  });
  const getAccidentReportForDriver = wrap(async data => {
    const v = Credentials.extend({ reportId: id.optional(), assignmentId: id.optional() }).parse(data);
    const { driverId } = await deps.requireDriverSession(v);
    if (v.reportId) { const doc = await reports.doc(v.reportId).get(); owned(doc.data(), driverId); return record(doc); }
    if (!v.assignmentId) error('invalid-argument', 'Assignment is required.');
    const a = (await db.collection('vehicleAssignments').doc(v.assignmentId!).get()).data();
    if (a?.driverId !== driverId) error('permission-denied', 'Assignment is not yours.');
    const docs = await reports.where('assignmentId', '==', v.assignmentId).get();
    return docs.docs.filter(d => d.data().driverId === driverId).map(record);
  });
  const uploadAccidentPhoto = wrap(async data => {
    const v = ReportRequest.extend({ uploadId: id, imageDataUrl: z.string().max(7100000), caption: z.string().trim().max(300).optional() }).parse(data);
    const { driverId } = await deps.requireDriverSession(v);
    const ref = reports.doc(v.reportId);
    const match = v.imageDataUrl.match(/^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) error('invalid-argument', 'Use JPEG, PNG or WebP photos.');
    const mime = match![1], bytes = Buffer.from(match![2], 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) error('invalid-argument', 'Photos must be between 1 byte and 5 MB.');
    const signature = mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!signature) error('invalid-argument', 'Image content does not match its format.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const r = await db.runTransaction(tx => editContext(tx, ref, driverId));
    const prior = r.photos.find((p: any) => p.id === v.uploadId);
    if (prior) { if (prior.sha256 !== hash) error('failed-precondition', 'Photo retry has different content.'); return prior; }
    if (r.photos.length >= 20) error('failed-precondition', 'A report can contain up to 20 photos.');
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    const objectPath = `accident-reports/${r.orgId}/${ref.id}/${randomUUID()}.${ext}`;
    const photo = { id: v.uploadId, path: objectPath, caption: v.caption || '', mimeType: mime, size: bytes.length, sha256: hash };
    await deps.bucket().file(objectPath).save(bytes, { resumable: false, contentType: mime,
      preconditionOpts: { ifGenerationMatch: 0 }, metadata: { metadata: { reportId: ref.id, driverId, vehicleId: r.vehicleId, sha256: hash } } });
    // Submission and attachment serialize on the report. A losing upload may leave an
    // unreferenced object; it never rewrites submitted evidence or drops a referenced photo.
    return db.runTransaction(async tx => {
      const current = await editContext(tx, ref, driverId);
      const existing = current.photos.find((p: any) => p.id === v.uploadId);
      if (existing) { if (existing.sha256 !== hash) error('failed-precondition', 'Photo retry has different content.'); return existing; }
      if (current.photos.length >= 20) error('failed-precondition', 'A report can contain up to 20 photos.');
      tx.update(ref, { photos: [...current.photos, photo], updatedAt: stamp() });
      return photo;
    });
  });
  const submitAccidentReport = wrap(async data => {
    const v = ReportRequest.extend({ revision: z.number().int().min(0) }).parse(data);
    const { driverId } = await deps.requireDriverSession(v); const ref = reports.doc(v.reportId);
    await db.runTransaction(async tx => {
      const existing = owned((await tx.get(ref)).data(), driverId);
      if (existing.status === 'SUBMITTED') return;
      const r = await editContext(tx, ref, driverId);
      if (r.revision !== v.revision) error('aborted', 'The draft changed. Reload before submitting.');
      const f = r.fields;
      if (!f.accidentAt || !f.locationDescription?.trim() || !f.narrative?.trim() || !f.injuries || !f.incompleteDetailsAcknowledged) {
        error('invalid-argument', 'Date/time, location, narrative, injury indication and incomplete-details acknowledgement are required.');
      }
      tx.update(ref, { status: 'SUBMITTED', submittedAt: stamp(), updatedAt: stamp() });
    });
    return record(await ref.get());
  });
  const listAccidentReportsAdmin = wrap(async (data, context) => {
    await deps.requireAdmin(context);
    const v = z.object({ includeTest: z.boolean().default(false), status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
      cursor: id.optional(), limit: z.number().int().min(1).max(100).default(50) }).parse(data || {});
    let query: FirebaseFirestore.Query = reports.orderBy(admin.firestore.FieldPath.documentId());
    if (v.cursor) query = query.startAfter(v.cursor);
    // Page all IDs first so filtering never silently prevents access to older reports.
    const page = await query.limit(v.limit).get();
    return { reports: page.docs.filter(d => (v.includeTest || d.data().isTestData !== true) && (!v.status || d.data().status === v.status)).map(record),
      nextCursor: page.size === v.limit ? page.docs[page.docs.length - 1].id : null };
  });
  const getAccidentReportAdmin = wrap(async (data, context) => {
    await deps.requireAdmin(context); const v = z.object({ reportId: id }).parse(data);
    const doc = await reports.doc(v.reportId).get(); if (!doc.exists) error('not-found', 'Accident report not found.');
    const r = doc.data()!;
    const [driver, vehicle] = await Promise.all([db.collection('users').doc(r.driverId).get(), db.collection('vehicles').doc(r.vehicleId).get()]);
    return { ...record(doc), driverName: [driver.data()?.firstName, driver.data()?.surname].filter(Boolean).join(' ') || null,
      vehicleRegistration: vehicle.data()?.registration || null };
  });
  const getAccidentPhoto = wrap(async (data, context) => {
    const v = z.object({ reportId: id, photoId: id, driverId: id.optional(), sessionToken: z.string().optional() }).parse(data);
    const session = v.driverId && v.sessionToken
      ? await deps.requireDriverSession({ driverId: v.driverId, sessionToken: v.sessionToken }) : null;
    if (!session) await deps.requireAdmin(context);
    const doc = await reports.doc(v.reportId).get();
    if (session) owned(doc.data(), session.driverId);
    if (!doc.exists) error('not-found', 'Report not found.');
    const r = doc.data()!, p = r.photos.find((p: any) => p.id === v.photoId);
    if (!p || !p.path.startsWith(`accident-reports/${r.orgId}/${doc.id}/`) || p.path.includes('..')) error('permission-denied', 'Photo is not linked to this report.');
    // Short-lived, authorized view only. No public download token or direct Storage grants.
    const [url] = await deps.bucket().file(p.path).getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 });
    return { url };
  });
  return { createAccidentReportDraft, updateAccidentReportDraft, getAccidentReportForDriver, uploadAccidentPhoto,
    submitAccidentReport, listAccidentReportsAdmin, getAccidentReportAdmin, getAccidentPhoto };
}
