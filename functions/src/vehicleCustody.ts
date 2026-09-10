import * as functions from 'firebase-functions';

/** Current custody, including conservative legacy anchors. All reads precede caller writes. */
export async function assertVehicleIdle(tx: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore,
  vehicleId: string, v: Record<string, any>, allowReturnCharging = false) {
  const fail = (message: string): never => { throw new functions.https.HttpsError('failed-precondition', message); };
  if (v.activeAssignmentId || v.activeShiftId || v.activeChargingSessionId || (v.openChargingEventId && !allowReturnCharging)) fail('Vehicle has custody or charging activity. Complete or recover that workflow first.');
  const [assignments, shifts, sessions, events] = await Promise.all(['vehicleAssignments', 'shifts', 'chargingSessions', 'chargingEvents']
    .map(c => tx.get(db.collection(c).where('vehicleId', '==', vehicleId))));
  const isOpen = (d: FirebaseFirestore.QueryDocumentSnapshot) => ['ACTIVE', 'Active', 'OPEN'].includes(d.data().status) || d.data().lifecycleStatus === 'OPEN';
  if ([assignments, sessions].some(q => q.docs.some(isOpen))) fail('Vehicle has an open custody or charging record.');
  const openEvents = events.docs.filter(isOpen);
  if (allowReturnCharging && v.openChargingEventId) {
    // Starting a shift may reserve a returned vehicle; the subsequent assignment
    // performs normal event closure. Never clear or silently ignore an orphan.
    const event = openEvents.find(d => d.id === v.openChargingEventId);
    if (!event || event.data().lifecycleStatus !== 'OPEN' || openEvents.length !== 1 || (event.data().orgId && event.data().orgId !== 'default')) fail('Return-charging pointer needs administrator recovery.');
  } else if (openEvents.length) fail('Vehicle has an open return-charging record.');
  for (const shift of shifts.docs.filter(d => d.data().status === 'Active')) {
    const returned = assignments.docs.some(a => a.data().shiftId === shift.id && a.data().driverId === shift.data().driverId && a.data().status === 'COMPLETED' && a.data().endedAt);
    if (!returned) fail('Active legacy shift has no verified return for this vehicle.');
    if (shift.data().activeAssignmentId) {
      const a = (await tx.get(db.collection('vehicleAssignments').doc(shift.data().activeAssignmentId))).data()
        ?? fail('Current shift assignment is missing.');
      if (a.status !== 'ACTIVE' || a.shiftId !== shift.id || a.driverId !== shift.data().driverId || a.vehicleId === vehicleId) fail('Shift custody pointers are inconsistent.');
      const other = (await tx.get(db.collection('vehicles').doc(a.vehicleId))).data();
      if (!other || other.activeAssignmentId !== shift.data().activeAssignmentId || other.activeShiftId !== shift.id) fail('Current assignment vehicle pointers are inconsistent.');
    }
  }
}
