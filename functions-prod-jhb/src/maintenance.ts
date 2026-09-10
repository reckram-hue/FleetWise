import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import { z } from 'zod';

type Row = Record<string, any>;
type Deps = { db: FirebaseFirestore.Firestore; requireAdmin: (context: functions.https.CallableContext) => Promise<{ uid: string; data: Row }> };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const text = z.string().trim().min(1).max(2000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid calendar date');
const odo = z.number().finite().nonnegative();
const money = z.number().finite().nonnegative();
const ids = z.array(id).max(40).default([]).transform(v => [...new Set(v)].sort());
const stamp = () => FieldValue.serverTimestamp();
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fail(message: string): never { throw new functions.https.HttpsError('failed-precondition', message); }
const unresolved = (d: Row) => !['Resolved', 'Duplicate'].includes(d.status);
const disposed = (v: Row) => ['Sold', 'End of Life'].includes(v.status);
const sent = (s: Row) => s.sentForService === true && s.returnedFromService !== true;
const dto = (doc: FirebaseFirestore.DocumentSnapshot) => ({ ...doc.data(), id: doc.id });

/** Small maintenance-specific commands. No direct client writes can bypass these transitions. */
export function createMaintenanceHandlers({ db, requireAdmin }: Deps) {
  const wrap = <T>(schema: z.ZodType<T, any, any>, handler: (p: T, actor: string) => Promise<any>) =>
    async (data: unknown, context: functions.https.CallableContext) => {
      const actor = await requireAdmin(context);
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new functions.https.HttpsError('invalid-argument', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
      return handler(parsed.data, actor.uid);
    };
  async function authorize(tx: FirebaseFirestore.Transaction, actor: string) {
    const p = (await tx.get(db.collection('users').doc(actor))).data();
    if (p?.role !== 'admin' || p.employmentStatus !== 'Active') throw new functions.https.HttpsError('permission-denied', 'Active admin privileges required.');
  }
  async function vehicle(tx: FirebaseFirestore.Transaction, vehicleId: string) {
    const ref = db.collection('vehicles').doc(vehicleId), doc = await tx.get(ref);
    if (!doc.exists) fail('Vehicle no longer exists.');
    return { ref, data: doc.data()! };
  }
  async function idle(tx: FirebaseFirestore.Transaction, vehicleId: string, v: Row) {
    if (v.activeAssignmentId || v.activeShiftId || v.activeChargingSessionId || v.openChargingEventId) fail('Vehicle has custody or charging activity. Complete or recover that workflow first.');
    const queries = await Promise.all(['vehicleAssignments', 'shifts', 'chargingSessions', 'chargingEvents'].map(c => tx.get(db.collection(c).where('vehicleId', '==', vehicleId))));
    if (queries.some(q => q.docs.some(d => ['ACTIVE', 'Active', 'OPEN'].includes(d.data().status) || d.data().lifecycleStatus === 'OPEN'))) fail('Vehicle has an open custody or charging record.');
  }
  async function related(tx: FirebaseFirestore.Transaction, vehicleId: string) {
    await tx.get(db.collection('vehicleMaintenanceLocks').doc(vehicleId));
    const [s, d] = await Promise.all(['scheduledServices', 'defects'].map(c => tx.get(db.collection(c).where('vehicleId', '==', vehicleId))));
    return { services: s.docs, defects: d.docs };
  }
  function audit(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, action: string, actor: string, details: Row) {
    tx.create(ref.collection('history').doc(), { action, actor, at: stamp(), ...details });
  }
  function advance(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, patch: Row = {}) {
    // Serialize new/changed blockers without putting a busy lock revision into the
    // vehicle document included by the economics evidence fingerprint.
    tx.set(db.collection('vehicleMaintenanceLocks').doc(ref.id), { revision: FieldValue.increment(1) }, { merge: true });
    if (Object.keys(patch).length) tx.update(ref, { ...patch, updatedAt: stamp() });
  }
  function replay(s: Row, field: string, fingerprint: string) {
    if (!s[field]) return false;
    if (s[field] !== fingerprint) throw new functions.https.HttpsError('already-exists', 'This operation was saved with different details. Reload the saved record.');
    return true;
  }
  async function operation(tx: FirebaseFirestore.Transaction, action: string, target: string, requestId: string, payload: unknown, actor: string) {
    const ref = db.collection('maintenanceOperations').doc(hash([action, target, requestId])), fingerprint = hash(payload);
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data()!.fingerprint !== fingerprint || existing.data()!.actor !== actor) throw new functions.https.HttpsError('already-exists', 'Request identity was already used with different details.');
      return { ref, fingerprint, saved: true };
    }
    return { ref, fingerprint, saved: false };
  }
  function saveOperation(tx: FirebaseFirestore.Transaction, op: { ref: FirebaseFirestore.DocumentReference; fingerprint: string }, actor: string) {
    tx.create(op.ref, { fingerprint: op.fingerprint, actor, at: stamp() });
  }
  function validOdometer(v: Row, reading: number) {
    for (const field of ['currentOdometer', 'lastServiceOdometer']) {
      if (v[field] != null && (typeof v[field] !== 'number' || !Number.isFinite(v[field]) || reading < v[field])) fail('Actual odometer must not be lower than authoritative vehicle/service readings.');
    }
  }
  async function historicalOdometer(tx: FirebaseFirestore.Transaction, vehicleId: string, reading: number) {
    // Refuels do not advance currentOdometer. Check immutable historical captures too,
    // including legacy records whose vehicle convenience reading was not maintained.
    const records = await Promise.all(['vehicleAssignments', 'shifts', 'refuelRecords', 'maintenanceRecords', 'chargingSessions', 'chargingEvents']
      .map(c => tx.get(db.collection(c).where('vehicleId', '==', vehicleId))));
    for (const q of records) for (const d of q.docs) for (const field of ['odometer', 'startOdometer', 'endOdometer', 'returnOdometer', 'pickupOdometer']) {
      const n = d.data()[field];
      if (typeof n === 'number' && Number.isFinite(n) && n > reading) fail('Actual odometer is lower than an existing historical reading. Review the evidence before completing work.');
    }
  }
  function releaseBlockers(v: Row, services: FirebaseFirestore.QueryDocumentSnapshot[], defects: FirebaseFirestore.QueryDocumentSnapshot[], clearManualHold: boolean) {
    if (disposed(v)) fail('Sold or End of Life vehicles cannot be released.');
    if (services.some(d => sent(d.data()))) fail('Another dispatched service still requires completion.');
    const linked = new Set(services.filter(d => d.data().sentForService && !d.data().releasedAt).flatMap(d => d.data().linkedDefectIds || []));
    if (defects.some(d => unresolved(d.data()) && (d.data().urgency === 'Critical' || linked.has(d.id)))) fail('An unresolved critical or service-linked defect prevents release.');
    const knownServiceHold = services.some(d => d.data().sentForService && !d.data().releasedAt);
    if ((v.manualMaintenanceHold || (!knownServiceHold && v.status !== 'Active')) && !clearManualHold) fail('Explicitly confirm the separate manual hold has been addressed before release.');
  }
  const booking = z.object({ serviceId: id, vehicleId: id, serviceType: text, dueDate: date, dueOdometer: odo,
    bookedDate: date, bookedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), serviceProviderId: id,
    notes: z.string().trim().max(2000).default(''), linkedDefectIds: ids, expectedRevision: z.number().int().nonnegative().default(0) }).strict();
  const saveScheduledServiceAdmin = wrap(booking, async (p, actor) => {
    const ref = db.collection('scheduledServices').doc(p.serviceId);
    await db.runTransaction(async tx => {
      await authorize(tx, actor);
      const { ref: vr, data: v } = await vehicle(tx, p.vehicleId);
      if (disposed(v)) fail('Cannot schedule a disposed vehicle.');
      const existing = await tx.get(ref), provider = await tx.get(db.collection('serviceProviders').doc(p.serviceProviderId));
      const defects = await Promise.all(p.linkedDefectIds.map(d => tx.get(db.collection('defects').doc(d))));
      if (!provider.exists || provider.data()!.isActive !== true) fail('Choose an active workshop.');
      if (defects.some(d => !d.exists || d.data()!.vehicleId !== p.vehicleId || !unresolved(d.data()!))) fail('Linked defects must be outstanding defects on this vehicle.');
      const old = existing.data(), fingerprint = hash(p);
      if (old?.bookingFingerprint === fingerprint) return;
      if (old && (old.vehicleId !== p.vehicleId || old.sentForService || old.returnedFromService || (old.revision || 0) !== p.expectedRevision)) fail('Service changed or was already dispatched. Reload it.');
      const { expectedRevision, serviceId, ...fields } = p;
      tx.set(ref, { ...fields, isBooked: true, serviceProvider: provider.data()!.name, revision: (old?.revision || 0) + 1,
        bookingFingerprint: fingerprint, isTestData: old?.isTestData === true || v.isTestData === true, updatedBy: actor, updatedAt: stamp(), ...(!old ? { createdBy: actor, createdAt: stamp() } : {}) }, { merge: true });
      advance(tx, vr);
      audit(tx, ref, 'BOOKED', actor, { linkedDefectIds: p.linkedDefectIds });
    });
    return dto(await ref.get());
  });
  const dispatchServiceAdmin = wrap(z.object({ serviceId: id, vehicleId: id, sentDate: date }).strict(), async (p, actor) => {
    const ref = db.collection('scheduledServices').doc(p.serviceId), fingerprint = hash(p);
    await db.runTransaction(async tx => {
      await authorize(tx, actor);
      const s = (await tx.get(ref)).data();
      if (!s || s.vehicleId !== p.vehicleId) fail('Service does not belong to this vehicle.');
      if (replay(s, 'dispatchFingerprint', fingerprint)) return;
      const { ref: vr, data: v } = await vehicle(tx, p.vehicleId);
      if (!s.isBooked || !s.serviceProvider || s.sentForService || s.returnedFromService || disposed(v)) fail('Service must be booked and not previously dispatched/completed.');
      if (p.sentDate > new Date().toISOString().slice(0, 10)) fail('Actual dispatch date cannot be in the future.');
      await idle(tx, p.vehicleId, v);
      const r = await related(tx, p.vehicleId);
      const existingServiceHold = r.services.some(d => d.data().sentForService && !d.data().releasedAt);
      tx.update(ref, { sentForService: true, sentDate: p.sentDate, dispatchedAt: stamp(), dispatchedBy: actor,
        dispatchFingerprint: fingerprint, statusBeforeDispatch: v.status, isTestData: s.isTestData === true || v.isTestData === true, updatedAt: stamp() });
      advance(tx, vr, { status: 'In Service', statusDate: p.sentDate, statusNotes: `Sent for ${s.serviceType}`,
        manualMaintenanceHold: v.manualMaintenanceHold === true || (v.status !== 'Active' && !existingServiceHold),
        unavailableSince: v.unavailableSince || stamp() });
      audit(tx, ref, 'DISPATCHED', actor, { vehicleId: p.vehicleId, previousStatus: v.status, sentDate: p.sentDate });
    });
    return dto(await ref.get());
  });
  const completeServiceAdmin = wrap(z.object({ serviceId: id, vehicleId: id, returnDate: date, odometer: odo,
    actualCost: money, serviceNotes: text, resolvedDefectIds: ids }).strict(), async (p, actor) => {
    const ref = db.collection('scheduledServices').doc(p.serviceId), fingerprint = hash(p);
    await db.runTransaction(async tx => {
      await authorize(tx, actor);
      const s = (await tx.get(ref)).data();
      if (!s || s.vehicleId !== p.vehicleId) fail('Service does not belong to this vehicle.');
      if (replay(s, 'completionFingerprint', fingerprint)) return;
      const { ref: vr, data: v } = await vehicle(tx, p.vehicleId);
      if (!s.sentForService || s.returnedFromService || disposed(v) || !['In Service', 'Repairs'].includes(v.status)) fail('Vehicle must be unavailable under a dispatched service.');
      if (p.returnDate < s.sentDate || p.returnDate > new Date().toISOString().slice(0, 10)) fail('Completion date must be between dispatch and today.');
      await idle(tx, p.vehicleId, v); validOdometer(v, p.odometer);
      await historicalOdometer(tx, p.vehicleId, p.odometer);
      const linked = new Set(s.linkedDefectIds || []);
      if (p.resolvedDefectIds.some(d => !linked.has(d))) fail('Only explicitly linked defects may be resolved by this service.');
      const defects = await Promise.all(p.resolvedDefectIds.map(d => tx.get(db.collection('defects').doc(d))));
      if (defects.some(d => !d.exists || d.data()!.vehicleId !== p.vehicleId || !unresolved(d.data()!))) fail('Selected defect changed or belongs to another vehicle. Reload before completion.');
      const mr = db.collection('maintenanceRecords').doc(`service-${p.serviceId}`);
      if ((await tx.get(mr)).exists) fail('Maintenance history already exists without a matching completion. Review this record.');
      const isTestData = s.isTestData === true || v.isTestData === true;
      tx.create(mr, { vehicleId: p.vehicleId, serviceId: p.serviceId, date: p.returnDate, odometer: p.odometer, cost: p.actualCost,
        serviceType: s.serviceType, notes: p.serviceNotes, serviceProvider: s.serviceProvider, serviceProviderId: s.serviceProviderId || null,
        resolvedDefectIds: p.resolvedDefectIds, source: 'SERVICE_COMPLETION', isTestData, createdBy: actor, createdAt: stamp() });
      tx.update(ref, { returnedFromService: true, returnDate: p.returnDate, completedAt: stamp(), completedBy: actor,
        actualCost: p.actualCost, completionOdometer: p.odometer, serviceNotes: p.serviceNotes, resolvedDefectIds: p.resolvedDefectIds,
        maintenanceRecordId: mr.id, completionFingerprint: fingerprint, isTestData, updatedAt: stamp() });
      for (const d of defects) {
        tx.update(d.ref, { status: 'Resolved', resolvedBy: actor, resolvedDateTime: stamp(), resolutionNotes: p.serviceNotes,
          resolvedByServiceId: p.serviceId, maintenanceRecordId: mr.id, updatedAt: stamp() });
        audit(tx, d.ref, 'Resolved', actor, { from: d.data()!.status, serviceId: p.serviceId, maintenanceRecordId: mr.id, notes: p.serviceNotes });
      }
      advance(tx, vr, { currentOdometer: p.odometer, lastServiceOdometer: p.odometer });
      audit(tx, ref, 'WORK_COMPLETED', actor, { maintenanceRecordId: mr.id, resolvedDefectIds: p.resolvedDefectIds });
    });
    return dto(await ref.get());
  });
  const changeVehicleLifecycleAdmin = wrap(z.object({ vehicleId: id, requestId: id,
    status: z.enum(['Active', 'In Service', 'Repairs', 'Sold', 'End of Life']), notes: text,
    clearManualHold: z.boolean().default(false) }).strict(), async (p, actor) => {
    await db.runTransaction(async tx => {
      await authorize(tx, actor);
      const op = await operation(tx, 'LIFECYCLE', p.vehicleId, p.requestId, p, actor); if (op.saved) return;
      const { ref, data: v } = await vehicle(tx, p.vehicleId);
      await idle(tx, p.vehicleId, v);
      if (disposed(v)) fail('Disposed vehicles cannot be reactivated or reinterpreted by this workflow.');
      const r = await related(tx, p.vehicleId);
      if (p.status === 'Active') {
        releaseBlockers(v, r.services, r.defects, p.clearManualHold);
        for (const s of r.services.filter(d => d.data().returnedFromService && !d.data().releasedAt)) {
          tx.update(s.ref, { releasedAt: stamp(), releasedBy: actor, releaseNotes: p.notes, updatedAt: stamp() });
          audit(tx, s.ref, 'RELEASED', actor, { notes: p.notes, requestId: p.requestId });
        }
      } else if (['Sold', 'End of Life'].includes(p.status) && r.services.some(d => sent(d.data()))) fail('Complete outstanding dispatched services before disposal.');
      audit(tx, ref, 'LIFECYCLE', actor, { from: v.status, to: p.status, notes: p.notes,
        unavailableSince: v.unavailableSince || null, clearManualHold: p.clearManualHold });
      advance(tx, ref, { status: p.status, statusDate: new Date().toISOString().slice(0, 10), statusNotes: p.notes,
        manualMaintenanceHold: p.status !== 'Active', unavailableSince: p.status === 'Active' ? null : v.unavailableSince || stamp(),
        ...(p.status === 'Active' ? { lastReleasedAt: stamp(), lastReleasedBy: actor } : {}) });
      saveOperation(tx, op, actor);
    });
    return dto(await db.collection('vehicles').doc(p.vehicleId).get());
  });
  const addMaintenanceRecordAdmin = wrap(z.object({ requestId: id, vehicleId: id, date, odometer: odo,
    serviceType: text, cost: money, notes: text }).strict(), async (p, actor) => {
    const mr = db.collection('maintenanceRecords').doc(`manual-${hash([actor, p.requestId])}`);
    await db.runTransaction(async tx => {
      await authorize(tx, actor);
      const op = await operation(tx, 'MANUAL', actor, p.requestId, p, actor); if (op.saved) return;
      const { ref, data: v } = await vehicle(tx, p.vehicleId); await idle(tx, p.vehicleId, v);
      const r = await related(tx, p.vehicleId);
      if (disposed(v) || r.services.some(d => d.data().sentForService && !d.data().releasedAt)) fail('Use the existing service completion workflow for this vehicle.');
      if (p.date > new Date().toISOString().slice(0, 10)) fail('Maintenance date cannot be in the future.');
      validOdometer(v, p.odometer);
      await historicalOdometer(tx, p.vehicleId, p.odometer);
      const { requestId, ...record } = p;
      tx.create(mr, { ...record, source: 'MANUAL', isTestData: v.isTestData === true, createdBy: actor, createdAt: stamp() });
      advance(tx, ref, { lastServiceOdometer: p.odometer, currentOdometer: p.odometer });
      saveOperation(tx, op, actor);
    });
    return dto(await mr.get());
  });
  const transitionDefectAdmin = wrap(z.object({ defectId: id, requestId: id, expectedStatus: z.enum(['Open', 'Acknowledged', 'In Progress', 'Resolved', 'Duplicate']),
    status: z.enum(['Open', 'Acknowledged', 'In Progress', 'Resolved', 'Duplicate']), notes: text,
    assignedTo: text.optional(), estimatedCost: money.optional(), duplicateOf: id.optional() }).strict(), async (p, actor) => {
    const ref = db.collection('defects').doc(p.defectId);
    await db.runTransaction(async tx => {
      await authorize(tx, actor);
      const op = await operation(tx, 'DEFECT', p.defectId, p.requestId, p, actor); if (op.saved) return;
      const d = (await tx.get(ref)).data(); if (!d || d.status !== p.expectedStatus) fail('Defect changed. Reload before changing its status.');
      const { ref: vr } = await vehicle(tx, d.vehicleId);
      if (p.status === 'Duplicate') {
        if (!p.duplicateOf || p.duplicateOf === p.defectId) fail('Choose the original defect.');
        const original = (await tx.get(db.collection('defects').doc(p.duplicateOf))).data();
        if (!original || original.vehicleId !== d.vehicleId || !unresolved(original)) fail('Original must be an outstanding defect on the same vehicle.');
        // A duplicate cannot remove a service blocker: resolve the repair-linked report explicitly.
        const services = await tx.get(db.collection('scheduledServices').where('vehicleId', '==', d.vehicleId));
        if (services.docs.some(s => !s.data().releasedAt && (s.data().linkedDefectIds || []).includes(p.defectId))) fail('Service-linked defects must be resolved explicitly, not hidden as duplicates.');
      }
      if (p.status === 'In Progress' && !(p.assignedTo || d.assignedTo)) fail('An assignee is required.');
      const reopening = ['Resolved', 'Duplicate'].includes(d.status) && unresolved({ status: p.status });
      const patch: Row = { status: p.status, updatedAt: stamp(), isVisibleToDriver: p.status !== 'Duplicate' };
      if (p.assignedTo) patch.assignedTo = p.assignedTo;
      if (p.estimatedCost !== undefined) patch.estimatedCost = p.estimatedCost;
      if (p.status === 'Acknowledged') Object.assign(patch, { acknowledgedBy: actor, acknowledgedDateTime: stamp() });
      if (p.status === 'Resolved') Object.assign(patch, { resolvedBy: actor, resolvedDateTime: stamp(), resolutionNotes: p.notes });
      if (p.status === 'Duplicate') patch.duplicateOf = p.duplicateOf;
      if (reopening) for (const field of ['resolvedBy', 'resolvedDateTime', 'resolutionNotes', 'resolvedByServiceId', 'maintenanceRecordId', 'duplicateOf']) patch[field] = FieldValue.delete();
      tx.update(ref, patch);
      audit(tx, ref, reopening ? 'REOPENED' : p.status, actor, { from: d.status, to: p.status, notes: p.notes, previousServiceId: d.resolvedByServiceId || null });
      advance(tx, vr); saveOperation(tx, op, actor);
    });
    return dto(await ref.get());
  });
  return { saveScheduledServiceAdmin, dispatchServiceAdmin, completeServiceAdmin, changeVehicleLifecycleAdmin, addMaintenanceRecordAdmin, transitionDefectAdmin };
}
