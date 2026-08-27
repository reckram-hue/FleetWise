import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { initializeApp } from 'firebase-admin/app';
import {
  DocumentData,
  DocumentSnapshot,
  FieldValue,
  Firestore,
  Timestamp,
  Transaction,
  getFirestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { ZodError, z } from 'zod';

const PROJECT_ID = 'fleetwise-9ab3a';
const DATABASE_ID = 'fleetwise-jhb-test';
const STORAGE_BUCKET = 'fleetwise-9ab3a-jhb-test';
const REGION = 'africa-south1';
const DEFAULT_ORG_ID = 'default';
const SESSION_DURATION_MS = 16 * 60 * 60 * 1000;
const SESSION_LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PREDICTED_RANGE_KM = 2000;
const ROUTINE_INSPECTION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PERFORMANCE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;

const app = initializeApp(
  { projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET },
  'fleetwise-jhb-test-functions',
);
const db = getFirestore(app, DATABASE_ID);
const bucket = getStorage(app).bucket(STORAGE_BUCKET);

// These assertions make a resource-ID edit fail at module load rather than silently
// connecting the benchmark codebase to the production default database or bucket.
assertJhbResources(db, bucket);

function assertJhbResources(firestore: Firestore, storageBucket: { name: string }): void {
  if (firestore.databaseId !== DATABASE_ID || DATABASE_ID !== 'fleetwise-jhb-test') {
    throw new Error('JHB Firestore database configuration is invalid.');
  }
  if (storageBucket.name !== STORAGE_BUCKET || STORAGE_BUCKET !== 'fleetwise-9ab3a-jhb-test') {
    throw new Error('JHB Storage bucket configuration is invalid.');
  }
  if (app.options.projectId !== PROJECT_ID || app.options.storageBucket !== STORAGE_BUCKET) {
    throw new Error('JHB Firebase Admin app configuration is invalid.');
  }
}

type PerformanceTrace = {
  phase<T>(name: string, operation: () => Promise<T>): Promise<T>;
  phaseSync<T>(name: string, operation: () => T): T;
};

type JhbCallableHandler = (
  data: unknown,
  request: CallableRequest<unknown>,
  perf: PerformanceTrace,
) => Promise<unknown>;

let hasHandledMeasuredInvocation = false;

function monotonicNowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function performanceRequestId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>).performanceRequestId;
  return typeof value === 'string' && PERFORMANCE_REQUEST_ID_PATTERN.test(value) ? value : undefined;
}

function normalizeCallableError(functionName: string, error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof ZodError) {
    throw new HttpsError(
      'invalid-argument',
      error.errors.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', '),
    );
  }
  console.error('JHB callable failed', {
    functionName,
    errorType: error instanceof Error ? error.name : 'UnknownError',
  });
  throw new HttpsError('internal', 'The request could not be completed.');
}

function onMeasuredCall(functionName: string, handler: JhbCallableHandler) {
  return onCall(
    { region: REGION, minInstances: 0 },
    async (request) => {
      const startedAt = monotonicNowMs();
      const coldStart = !hasHandledMeasuredInvocation;
      hasHandledMeasuredInvocation = true;
      const phases: Record<string, number> = {};
      const perf: PerformanceTrace = {
        async phase<T>(name: string, operation: () => Promise<T>): Promise<T> {
          const phaseStartedAt = monotonicNowMs();
          try {
            return await operation();
          } finally {
            phases[name] = (phases[name] || 0) + monotonicNowMs() - phaseStartedAt;
          }
        },
        phaseSync<T>(name: string, operation: () => T): T {
          const phaseStartedAt = monotonicNowMs();
          try {
            return operation();
          } finally {
            phases[name] = (phases[name] || 0) + monotonicNowMs() - phaseStartedAt;
          }
        },
      };

      let success = false;
      try {
        const result = await handler(request.data, request, perf);
        success = true;
        return result;
      } catch (error) {
        return normalizeCallableError(functionName, error);
      } finally {
        console.info('[FW-PERF]', {
          functionName,
          correlationId: performanceRequestId(request.data) || null,
          coldStart,
          totalElapsedMs: Math.round((monotonicNowMs() - startedAt) * 10) / 10,
          phaseElapsedMs: Object.fromEntries(
            Object.entries(phases).map(([name, elapsedMs]) => [name, Math.round(elapsedMs * 10) / 10]),
          ),
          success,
          timestamp: new Date().toISOString(),
        });
      }
    },
  );
}

const optionalString = z.preprocess(
  (value) => (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
      ? undefined
      : value
  ),
  z.string().optional(),
);

const optionalChargePercent = z.preprocess(
  (value) => (value === null || value === undefined ? undefined : value),
  z.number().finite().min(0).max(100).optional(),
);

const optionalPredictedRangeKm = z.preprocess(
  (value) => (value === null || value === undefined ? undefined : value),
  z.number().finite().min(0).max(MAX_PREDICTED_RANGE_KM).optional(),
);

const DriverLoginSchema = z.object({
  driverId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
  deviceId: optionalString,
});

const RequireSessionSchema = z.object({
  driverId: z.string().min(1),
  sessionToken: z.string().min(1),
});

const StartShiftSchema = RequireSessionSchema.extend({
  vehicleId: z.string().min(1),
  deviceId: optionalString,
  startOdometer: z.number().finite().min(0).optional(),
  startChargePercent: optionalChargePercent,
});

const StartVehicleAssignmentSchema = RequireSessionSchema.extend({
  shiftId: z.string().min(1),
  vehicleId: z.string().min(1),
  startOdometer: z.preprocess(
    (value) => (value === null || value === undefined ? undefined : value),
    z.number().finite().min(0).optional(),
  ),
  startChargePercent: optionalChargePercent,
  startPredictedRangeKm: optionalPredictedRangeKm,
  transitionReason: z.enum(['SHIFT_START', 'VEHICLE_SWAP']).optional(),
  deviceId: optionalString,
});

const CreateVehicleInspectionSchema = RequireSessionSchema.extend({
  assignmentId: z.string().min(1),
  boundaryType: z.enum(['PICKUP', 'RETURN']),
  returnIntent: z.preprocess(
    (value) => (value === null || value === undefined ? undefined : value),
    z.enum(['VEHICLE_SWAP', 'SHIFT_END']).optional(),
  ),
});

const UploadInspectionPhotoSchema = RequireSessionSchema.extend({
  assignmentId: z.string().min(1),
  boundaryType: z.enum(['PICKUP', 'RETURN']),
  photoRole: z.enum(['EXTERIOR', 'INTERIOR']),
  imageDataUrl: z.string().min(1),
});

const CompleteVehicleInspectionSchema = RequireSessionSchema.extend({
  inspectionId: z.string().min(1),
  hasDamage: z.boolean(),
  damageDescription: optionalString,
});

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function getRateLimitKey(driverId: string, deviceId: string): string {
  const deviceHash = createHash('sha256').update(deviceId || 'unknown').digest('hex');
  return `${driverId}_${deviceHash}`;
}

async function checkRateLimit(driverId: string, deviceId: string): Promise<void> {
  const rateLimitRef = db.collection('rateLimits').doc(getRateLimitKey(driverId, deviceId));
  const now = Timestamp.now();
  const windowStart = now.toMillis() - 10 * 60 * 1000;
  const rateLimitDoc = await rateLimitRef.get();

  if (!rateLimitDoc.exists) {
    await rateLimitRef.set({ attempts: 1, firstAttempt: now, lastAttempt: now });
    return;
  }

  const value = rateLimitDoc.data()!;
  const firstAttemptMs = value.firstAttempt instanceof Timestamp
    ? value.firstAttempt.toMillis()
    : Number.NaN;
  if (!Number.isFinite(firstAttemptMs) || firstAttemptMs < windowStart) {
    await rateLimitRef.set({ attempts: 1, firstAttempt: now, lastAttempt: now });
    return;
  }
  if (value.attempts >= 6) {
    throw new HttpsError('resource-exhausted', 'Too many failed PIN attempts. Please wait 10 minutes.');
  }
  await rateLimitRef.update({ attempts: FieldValue.increment(1), lastAttempt: now });
}

async function clearRateLimit(driverId: string, deviceId: string): Promise<void> {
  await db.collection('rateLimits').doc(getRateLimitKey(driverId, deviceId)).delete();
}

type DriverSessionContext = {
  driverId: string;
  orgId: string;
  sessionHash: string;
  deviceId: string;
  activeShiftId?: string;
};

async function requireDriverSession(
  input: z.infer<typeof RequireSessionSchema>,
  perf?: PerformanceTrace,
): Promise<DriverSessionContext> {
  const phase = <T>(name: string, operation: () => Promise<T>) => (
    perf ? perf.phase(name, operation) : operation()
  );
  const phaseSync = <T>(name: string, operation: () => T) => (
    perf ? perf.phaseSync(name, operation) : operation()
  );

  const prepared = phaseSync('sessionTokenPreparation', () => {
    const validated = RequireSessionSchema.parse(input);
    const sessionHash = hashSessionToken(validated.sessionToken);
    return {
      requestedDriverId: validated.driverId,
      sessionHash,
      sessionRef: db.collection('driverSessions').doc(sessionHash),
    };
  });

  const sessionDoc = await phase('sessionDocumentRead', () => prepared.sessionRef.get());
  const session = phaseSync('sessionChecks', () => {
    if (!sessionDoc.exists) {
      throw new HttpsError('unauthenticated', 'Session not found. Please log in again.');
    }
    const sessionData = sessionDoc.data()!;
    if (sessionData.driverId !== prepared.requestedDriverId) {
      throw new HttpsError('permission-denied', 'Session does not belong to this driver.');
    }
    if (sessionData.isRevoked === true) {
      throw new HttpsError('unauthenticated', 'Session has been revoked. Please log in again.');
    }
    if (!(sessionData.expiresAt instanceof Timestamp) || sessionData.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('unauthenticated', 'Session has expired. Please log in again.');
    }
    return sessionData;
  });

  const driverDoc = await phase(
    'driverDocumentRead',
    () => db.collection('users').doc(prepared.requestedDriverId).get(),
  );
  const driverData = phaseSync('driverChecks', () => {
    if (!driverDoc.exists) throw new HttpsError('not-found', 'Driver account not found.');
    const value = driverDoc.data()!;
    if (value.employmentStatus !== 'Active') {
      throw new HttpsError('permission-denied', 'Driver account is not active.');
    }
    if (value.role && value.role !== 'driver') {
      throw new HttpsError('permission-denied', 'Account is not a driver account.');
    }
    return value;
  });

  phaseSync('lastSeenScheduling', () => {
    const lastSeenAt = session.lastSeenAt;
    const lastSeenMs = lastSeenAt instanceof Timestamp ? lastSeenAt.toMillis() : 0;
    if (lastSeenMs < Date.now() - SESSION_LAST_SEEN_INTERVAL_MS) {
      prepared.sessionRef
        .update({ lastSeenAt: FieldValue.serverTimestamp() })
        .catch(() => console.error('JHB session activity update failed'));
    }
  });

  return {
    driverId: session.driverId,
    orgId: typeof session.orgId === 'string' ? session.orgId : DEFAULT_ORG_ID,
    sessionHash: prepared.sessionHash,
    deviceId: typeof session.deviceId === 'string' ? session.deviceId : 'unknown',
    activeShiftId: typeof driverData.activeShiftId === 'string' ? driverData.activeShiftId : undefined,
  };
}

function stripToDriverSafe(data: DocumentData, id: string): Record<string, unknown> {
  return {
    id,
    firstName: data.firstName || '',
    surname: data.surname || '',
    area: data.area || '',
    department: data.department || '',
    employmentStatus: data.employmentStatus || 'Active',
    role: data.role || 'driver',
  };
}

function stripToVehicleSafe(data: DocumentData, id: string): Record<string, unknown> {
  return {
    id,
    registration: data.registration || '',
    alias: data.alias || '',
    make: data.make || '',
    model: data.model || '',
    year: data.year || null,
    colour: data.colour || '',
    vehicleType: data.vehicleType || 'ICE',
    status: data.status || 'Active',
    fuelType: data.fuelType || null,
    batteryCapacityKwh: data.batteryCapacityKwh || null,
    currentOdometer: typeof data.currentOdometer === 'number' ? data.currentOdometer : null,
    activeShiftId: data.activeShiftId || null,
    activeAssignmentId: data.activeAssignmentId || null,
    isTestData: data.isTestData === true,
  };
}

function stripToOperationalShift(data: DocumentData, id: string): Record<string, unknown> {
  return {
    id,
    driverId: data.driverId,
    vehicleId: data.vehicleId || null,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    startOdometer: data.startOdometer ?? null,
    endOdometer: data.endOdometer ?? null,
    startChargePercent: data.startChargePercent ?? null,
    endChargePercent: data.endChargePercent ?? null,
    status: data.status,
    activeAssignmentId: data.activeAssignmentId || null,
  };
}

function stripToOperationalAssignment(data: DocumentData, id: string): Record<string, unknown> {
  return {
    id,
    driverId: data.driverId,
    shiftId: data.shiftId,
    vehicleId: data.vehicleId,
    status: data.status,
    startedAt: data.startedAt || null,
    startOdometer: data.startOdometer ?? null,
    startChargePercent: data.startChargePercent ?? null,
    startPredictedRangeKm: data.startPredictedRangeKm ?? null,
  };
}

function stripToOperationalInspection(data: DocumentData, id: string): Record<string, unknown> {
  return {
    id,
    assignmentId: data.assignmentId,
    boundaryType: data.boundaryType,
    status: data.status,
    returnIntent: data.returnIntent || null,
  };
}

function emptyOperationalState(): Record<string, unknown> {
  return {
    success: true,
    hasActiveShift: false,
    shift: null,
    hasActiveAssignment: false,
    assignment: null,
    vehicle: null,
    inspections: [],
  };
}

async function resolveDriverOperationalState(
  driverId: string,
  activeShiftId: string | undefined,
  perf: PerformanceTrace,
): Promise<Record<string, unknown>> {
  let activeShift: { id: string; data: DocumentData } | null = null;
  if (activeShiftId) {
    const pointedShift = await perf.phase(
      'shiftLookup',
      () => db.collection('shifts').doc(activeShiftId).get(),
    );
    const pointedData = pointedShift.data();
    if (
      pointedShift.exists
      && pointedData?.driverId === driverId
      && pointedData.status === 'Active'
    ) {
      activeShift = { id: pointedShift.id, data: pointedData };
    }
  }

  if (!activeShift) {
    const shifts = await perf.phase(
      'legacyShiftLookup',
      () => db.collection('shifts').where('driverId', '==', driverId).get(),
    );
    const legacyActive = shifts.docs.find((document) => document.data().status === 'Active');
    if (legacyActive) activeShift = { id: legacyActive.id, data: legacyActive.data() };
  }

  if (!activeShift) return emptyOperationalState();

  const shiftData = activeShift.data;
  const shift = stripToOperationalShift(shiftData, activeShift.id);
  const activeAssignmentId = shiftData.activeAssignmentId;
  if (activeAssignmentId != null && typeof activeAssignmentId !== 'string') {
    throw new HttpsError('failed-precondition', 'Your active assignment pointer is invalid.');
  }

  if (!activeAssignmentId) {
    const legacyVehicleId = typeof shiftData.vehicleId === 'string' ? shiftData.vehicleId : null;
    const legacyVehicle = legacyVehicleId
      ? await perf.phase('vehicleLookup', () => db.collection('vehicles').doc(legacyVehicleId).get())
      : null;
    return {
      success: true,
      hasActiveShift: true,
      shift,
      hasActiveAssignment: false,
      assignment: null,
      vehicle: legacyVehicle?.exists ? stripToVehicleSafe(legacyVehicle.data()!, legacyVehicle.id) : null,
      inspections: [],
    };
  }

  const assignment = await perf.phase(
    'assignmentLookup',
    () => db.collection('vehicleAssignments').doc(activeAssignmentId).get(),
  );
  if (!assignment.exists) {
    throw new HttpsError('failed-precondition', 'Your active assignment record is inconsistent.');
  }
  const assignmentData = assignment.data()!;
  if (
    assignmentData.driverId !== driverId
    || assignmentData.shiftId !== activeShift.id
    || assignmentData.status !== 'ACTIVE'
  ) {
    throw new HttpsError('failed-precondition', 'Your active assignment record is inconsistent.');
  }

  const [vehicle, inspections] = await Promise.all([
    perf.phase('vehicleLookup', () => db.collection('vehicles').doc(assignmentData.vehicleId).get()),
    perf.phase('inspectionsLookup', () => Promise.all([
      db.collection('vehicleInspections').doc(inspectionDocId(activeAssignmentId, 'PICKUP')).get(),
      db.collection('vehicleInspections').doc(inspectionDocId(activeAssignmentId, 'RETURN')).get(),
    ])),
  ]);

  return {
    success: true,
    hasActiveShift: true,
    shift,
    hasActiveAssignment: true,
    assignment: stripToOperationalAssignment(assignmentData, assignment.id),
    vehicle: vehicle.exists ? stripToVehicleSafe(vehicle.data()!, vehicle.id) : null,
    inspections: inspections
      .filter((inspection) => {
        if (!inspection.exists) return false;
        const value = inspection.data()!;
        return value.assignmentId === activeAssignmentId
          && value.driverId === driverId
          && value.shiftId === activeShift.id
          && value.vehicleId === assignmentData.vehicleId;
      })
      .map((inspection) => stripToOperationalInspection(inspection.data()!, inspection.id)),
  };
}

function assertPredictedRangeMatchesVehicle(
  vehicleType: unknown,
  predictedRangeKm: number | undefined,
): void {
  if (vehicleType === 'EV') {
    if (predictedRangeKm === undefined) {
      throw new HttpsError('invalid-argument', 'startPredictedRangeKm is required for EV vehicles.');
    }
    return;
  }
  if (predictedRangeKm !== undefined) {
    throw new HttpsError('invalid-argument', 'startPredictedRangeKm is only valid for EV vehicles.');
  }
}

function inspectionDocId(assignmentId: string, boundaryType: 'PICKUP' | 'RETURN'): string {
  return `${assignmentId}_${boundaryType}`;
}

const INSPECTION_PHOTO_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const INSPECTION_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const listDriversSafeJhb = onMeasuredCall(
  'listDriversSafeJhb',
  async (_data, _request, perf) => {
    const snapshot = await perf.phase('driverListQuery', () => db.collection('users').get());
    const users = snapshot.docs
      .filter((document) => {
        const value = document.data();
        return value.role === 'driver' && value.employmentStatus === 'Active';
      })
      .map((document) => stripToDriverSafe(document.data(), document.id));
    return { success: true, users };
  },
);

export const driverLoginJhb = onMeasuredCall(
  'driverLoginJhb',
  async (data, _request, perf) => {
    const validated = DriverLoginSchema.parse(data);
    const { driverId, pin, deviceId = 'unknown' } = validated;

    await perf.phase('rateLimitCheck', () => checkRateLimit(driverId, deviceId));
    const driverDoc = await perf.phase('driverRead', () => db.collection('users').doc(driverId).get());
    if (!driverDoc.exists) throw new HttpsError('not-found', 'Driver not found.');
    const driverData = driverDoc.data()!;
    if (driverData.employmentStatus !== 'Active') {
      throw new HttpsError('failed-precondition', 'Your account is not active.');
    }
    if (driverData.role && driverData.role !== 'driver') {
      throw new HttpsError('failed-precondition', 'This account is not a driver account.');
    }
    if (typeof driverData.pinHash !== 'string' || driverData.pinHash.length === 0) {
      throw new HttpsError('failed-precondition', 'PIN not set.');
    }

    const pinValid = await perf.phase('pinVerification', () => bcrypt.compare(pin, driverData.pinHash));
    if (!pinValid) throw new HttpsError('permission-denied', 'Invalid PIN.');
    await perf.phase('rateLimitClear', () => clearRateLimit(driverId, deviceId));

    const sessionToken = randomBytes(32).toString('base64url');
    const sessionHash = hashSessionToken(sessionToken);
    const expiresAtMs = Date.now() + SESSION_DURATION_MS;
    await perf.phase('sessionWrite', () => db.collection('driverSessions').doc(sessionHash).set({
      driverId,
      orgId: typeof driverData.orgId === 'string' ? driverData.orgId : DEFAULT_ORG_ID,
      deviceId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMs),
      lastSeenAt: FieldValue.serverTimestamp(),
      isRevoked: false,
    }));

    let operationalState: Record<string, unknown> | null = null;
    let operationalStateNeedsRefresh = false;
    try {
      operationalState = await perf.phase(
        'operationalStateResolution',
        () => resolveDriverOperationalState(
          driverId,
          typeof driverData.activeShiftId === 'string' ? driverData.activeShiftId : undefined,
          perf,
        ),
      );
    } catch {
      operationalStateNeedsRefresh = true;
      console.warn('JHB login operational state resolution deferred');
    }

    return {
      sessionToken,
      driverId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      requiresPinChange: pin === '1234',
      driver: stripToDriverSafe(driverData, driverId),
      operationalState,
      operationalStateNeedsRefresh,
    };
  },
);

export const getDriverOperationalStateJhb = onMeasuredCall(
  'getDriverOperationalStateJhb',
  async (data, _request, perf) => {
    const validated = RequireSessionSchema.parse(data);
    const session = await perf.phase(
      'sessionValidation',
      () => requireDriverSession(validated, perf),
    );
    return resolveDriverOperationalState(session.driverId, session.activeShiftId, perf);
  },
);

export const startShiftJhb = onMeasuredCall(
  'startShiftJhb',
  async (data, _request, perf) => {
    const validated = StartShiftSchema.parse(data);
    const {
      driverId: requestedDriverId,
      sessionToken,
      vehicleId,
      startOdometer,
      startChargePercent,
    } = validated;
    const session = await perf.phase(
      'sessionValidation',
      () => requireDriverSession({ driverId: requestedDriverId, sessionToken }, perf),
    );
    const driverId = session.driverId;

    const [driverDoc, vehicleDoc] = await perf.phase('initialRecordReads', () => Promise.all([
      db.collection('users').doc(driverId).get(),
      db.collection('vehicles').doc(vehicleId).get(),
    ]));
    if (!driverDoc.exists) throw new HttpsError('not-found', 'Driver not found.');
    if (!vehicleDoc.exists) throw new HttpsError('not-found', 'Vehicle not found.');
    const driverData = driverDoc.data()!;
    const vehicleData = vehicleDoc.data()!;
    if (driverData.employmentStatus !== 'Active' || (driverData.role && driverData.role !== 'driver')) {
      throw new HttpsError('failed-precondition', 'Driver is not active.');
    }
    if (vehicleData.status !== 'Active') {
      throw new HttpsError('failed-precondition', `Vehicle is ${vehicleData.status} and cannot be used.`);
    }
    if (driverData.activeShiftId) {
      throw new HttpsError('failed-precondition', 'Driver already has an active shift.');
    }
    if (vehicleData.activeShiftId) {
      throw new HttpsError('failed-precondition', 'This vehicle is already in use.');
    }
    if (Array.isArray(driverData.allowedVehicles) && !driverData.allowedVehicles.includes(vehicleId)) {
      throw new HttpsError('permission-denied', 'You are not authorized to use this vehicle.');
    }

    const [driverShifts, vehicleShifts] = await perf.phase('legacyShiftQueries', () => Promise.all([
      db.collection('shifts').where('driverId', '==', driverId).get(),
      db.collection('shifts').where('vehicleId', '==', vehicleId).get(),
    ]));
    if (driverShifts.docs.some((document) => document.data().status === 'Active')) {
      throw new HttpsError('failed-precondition', 'Driver already has an active shift.');
    }
    if (vehicleShifts.docs.some((document) => document.data().status === 'Active')) {
      throw new HttpsError('failed-precondition', 'This vehicle is already in use.');
    }

    const shiftRef = db.collection('shifts').doc();
    await perf.phase('transaction', () => db.runTransaction(async (transaction) => {
      const [currentDriver, currentVehicle] = await Promise.all([
        transaction.get(driverDoc.ref),
        transaction.get(vehicleDoc.ref),
      ]);
      if (currentDriver.data()?.activeShiftId) {
        throw new HttpsError('failed-precondition', 'Driver already has an active shift.');
      }
      if (currentVehicle.data()?.activeShiftId) {
        throw new HttpsError('failed-precondition', 'Vehicle is already in use.');
      }
      if (
        Array.isArray(currentDriver.data()?.allowedVehicles)
        && !currentDriver.data()?.allowedVehicles.includes(vehicleId)
      ) {
        throw new HttpsError('permission-denied', 'You are not authorized to use this vehicle.');
      }

      applyStartOdometerContinuity(
        transaction,
        currentVehicle.data(),
        startOdometer,
        { vehicleId, driverId, shiftId: shiftRef.id },
      );

      const shiftData: Record<string, unknown> = {
        driverId,
        vehicleId,
        startTime: FieldValue.serverTimestamp(),
        endTime: null,
        startOdometer: startOdometer ?? null,
        endOdometer: null,
        endChargePercent: null,
        status: 'Active',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (typeof startChargePercent === 'number') shiftData.startChargePercent = startChargePercent;
      transaction.set(shiftRef, shiftData);
      transaction.update(driverDoc.ref, {
        activeShiftId: shiftRef.id,
        lastShiftStart: FieldValue.serverTimestamp(),
      });
      const vehicleUpdate: Record<string, unknown> = {
        activeShiftId: shiftRef.id,
        lastShiftStart: FieldValue.serverTimestamp(),
      };
      if (typeof startOdometer === 'number') vehicleUpdate.currentOdometer = startOdometer;
      transaction.update(vehicleDoc.ref, vehicleUpdate);
    }));

    return { success: true, shiftId: shiftRef.id, message: 'Shift started successfully.' };
  },
);

type OdometerContext = {
  vehicleId: string;
  driverId: string;
  shiftId: string;
  assignmentId?: string;
};

function applyStartOdometerContinuity(
  transaction: Transaction,
  vehicleData: DocumentData | undefined,
  startOdometer: number | undefined,
  context: OdometerContext,
): void {
  const currentOdometer = vehicleData?.currentOdometer;
  if (typeof startOdometer !== 'number' || typeof currentOdometer !== 'number') return;
  if (startOdometer < currentOdometer) {
    throw new HttpsError(
      'invalid-argument',
      `Start odometer (${startOdometer} km) cannot be lower than the vehicle's last recorded odometer (${currentOdometer} km)`,
    );
  }
  if (startOdometer === currentOdometer) return;

  const discrepancyRef = db.collection('odometerDiscrepancies').doc();
  transaction.set(discrepancyRef, {
    orgId: DEFAULT_ORG_ID,
    ...context,
    expectedOdometer: currentOdometer,
    actualPickupOdometer: startOdometer,
    unaccountedKm: startOdometer - currentOdometer,
    detectedAt: FieldValue.serverTimestamp(),
    status: 'OPEN',
    type: 'UNACCOUNTED_MILEAGE',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export const startVehicleAssignmentJhb = onMeasuredCall(
  'startVehicleAssignmentJhb',
  async (data, _request, perf) => {
    const validated = StartVehicleAssignmentSchema.parse(data);
    const {
      driverId: requestedDriverId,
      sessionToken,
      shiftId,
      vehicleId,
      startOdometer,
      startChargePercent,
      startPredictedRangeKm,
      transitionReason = 'SHIFT_START',
    } = validated;
    const session = await perf.phase(
      'sessionValidation',
      () => requireDriverSession({ driverId: requestedDriverId, sessionToken }, perf),
    );
    const driverId = session.driverId;

    const [shiftDoc, vehicleDoc, driverDoc] = await perf.phase('initialRecordReads', () => Promise.all([
      db.collection('shifts').doc(shiftId).get(),
      db.collection('vehicles').doc(vehicleId).get(),
      db.collection('users').doc(driverId).get(),
    ]));
    validateAssignmentStartRecords(driverId, shiftId, vehicleId, shiftDoc, vehicleDoc, driverDoc);
    assertPredictedRangeMatchesVehicle(vehicleDoc.data()!.vehicleType, startPredictedRangeKm);

    const assignmentRef = db.collection('vehicleAssignments').doc();
    await perf.phase('transaction', () => db.runTransaction(async (transaction) => {
      const [currentShift, currentVehicle, currentDriver] = await Promise.all([
        transaction.get(shiftDoc.ref),
        transaction.get(vehicleDoc.ref),
        transaction.get(driverDoc.ref),
      ]);
      if (currentShift.data()?.status !== 'Active' || currentShift.data()?.driverId !== driverId) {
        throw new HttpsError('failed-precondition', 'The shift is no longer available.');
      }
      if (currentShift.data()?.activeAssignmentId) {
        throw new HttpsError('failed-precondition', 'The shift already has an active vehicle assignment.');
      }
      if (currentVehicle.data()?.activeAssignmentId) {
        throw new HttpsError('failed-precondition', 'This vehicle already has an active assignment.');
      }
      const activeShiftId = currentVehicle.data()?.activeShiftId;
      if (activeShiftId && activeShiftId !== shiftId) {
        throw new HttpsError('failed-precondition', 'This vehicle belongs to another active shift.');
      }
      if (
        Array.isArray(currentDriver.data()?.allowedVehicles)
        && !currentDriver.data()?.allowedVehicles.includes(vehicleId)
      ) {
        throw new HttpsError('permission-denied', 'You are not authorized to use this vehicle.');
      }
      assertPredictedRangeMatchesVehicle(currentVehicle.data()?.vehicleType, startPredictedRangeKm);
      applyStartOdometerContinuity(
        transaction,
        currentVehicle.data(),
        startOdometer,
        { vehicleId, driverId, shiftId, assignmentId: assignmentRef.id },
      );

      transaction.set(assignmentRef, {
        orgId: session.orgId,
        driverId,
        shiftId,
        vehicleId,
        status: 'ACTIVE',
        startedAt: FieldValue.serverTimestamp(),
        endedAt: null,
        startOdometer: startOdometer ?? null,
        endOdometer: null,
        startChargePercent: startChargePercent ?? null,
        endChargePercent: null,
        startPredictedRangeKm: startPredictedRangeKm ?? null,
        endPredictedRangeKm: null,
        transitionReason,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(shiftDoc.ref, {
        activeAssignmentId: assignmentRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
      const vehicleUpdate: Record<string, unknown> = {
        activeAssignmentId: assignmentRef.id,
        activeShiftId: shiftId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (typeof startOdometer === 'number') vehicleUpdate.currentOdometer = startOdometer;
      transaction.update(vehicleDoc.ref, vehicleUpdate);
    }));

    return { success: true, assignmentId: assignmentRef.id, message: 'Vehicle assignment started.' };
  },
);

function validateAssignmentStartRecords(
  driverId: string,
  shiftId: string,
  vehicleId: string,
  shiftDoc: DocumentSnapshot,
  vehicleDoc: DocumentSnapshot,
  driverDoc: DocumentSnapshot,
): void {
  if (!shiftDoc.exists) throw new HttpsError('not-found', 'Shift not found.');
  if (shiftDoc.data()?.driverId !== driverId) {
    throw new HttpsError('permission-denied', 'You can only use your own shift.');
  }
  if (shiftDoc.data()?.status !== 'Active') {
    throw new HttpsError('failed-precondition', 'The shift is not active.');
  }
  if (!vehicleDoc.exists) throw new HttpsError('not-found', 'Vehicle not found.');
  if (vehicleDoc.data()?.status !== 'Active') {
    throw new HttpsError('failed-precondition', 'The vehicle is not active.');
  }
  if (
    driverDoc.exists
    && Array.isArray(driverDoc.data()?.allowedVehicles)
    && !driverDoc.data()?.allowedVehicles.includes(vehicleId)
  ) {
    throw new HttpsError('permission-denied', 'You are not authorized to use this vehicle.');
  }
  if (shiftDoc.id !== shiftId) throw new HttpsError('failed-precondition', 'Shift identity mismatch.');
}

export const createVehicleInspectionJhb = onMeasuredCall(
  'createVehicleInspectionJhb',
  async (data, _request, perf) => {
    const validated = CreateVehicleInspectionSchema.parse(data);
    const {
      driverId: requestedDriverId,
      sessionToken,
      assignmentId,
      boundaryType,
      returnIntent,
    } = validated;
    const session = await perf.phase(
      'sessionValidation',
      () => requireDriverSession({ driverId: requestedDriverId, sessionToken }, perf),
    );
    if (boundaryType === 'RETURN' && !returnIntent) {
      throw new HttpsError('invalid-argument', 'A return intent is required for a RETURN inspection.');
    }

    const assignment = await perf.phase(
      'assignmentRead',
      () => db.collection('vehicleAssignments').doc(assignmentId).get(),
    );
    assertActiveOwnedAssignment(assignment, session.driverId);

    const inspectionRef = db.collection('vehicleInspections').doc(inspectionDocId(assignmentId, boundaryType));
    const existing = await perf.phase('inspectionRead', () => inspectionRef.get());
    if (existing.exists) {
      return { success: true, inspection: { id: existing.id, ...existing.data() } };
    }

    const assignmentData = assignment.data()!;
    const inspectionData = {
      orgId: assignmentData.orgId || session.orgId,
      assignmentId,
      shiftId: assignmentData.shiftId,
      driverId: session.driverId,
      vehicleId: assignmentData.vehicleId,
      boundaryType,
      returnIntent: boundaryType === 'PICKUP' ? null : returnIntent,
      status: 'PENDING',
      capturedAt: null,
      completedAt: null,
      exteriorPhotoPath: null,
      interiorPhotoPath: null,
      exteriorPhotoCaptured: false,
      interiorPhotoCaptured: false,
      hasDamage: false,
      damageDescription: null,
      retentionClass: 'ROUTINE',
      expiresAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await perf.phase('inspectionWrite', () => inspectionRef.set(inspectionData));
    return { success: true, inspection: { id: inspectionRef.id, ...inspectionData } };
  },
);

export const uploadInspectionPhotoJhb = onMeasuredCall(
  'uploadInspectionPhotoJhb',
  async (data, _request, perf) => {
    const validated = UploadInspectionPhotoSchema.parse(data);
    const {
      driverId: requestedDriverId,
      sessionToken,
      assignmentId,
      boundaryType,
      photoRole,
      imageDataUrl,
    } = validated;
    const session = await perf.phase(
      'sessionValidation',
      () => requireDriverSession({ driverId: requestedDriverId, sessionToken }, perf),
    );
    const assignment = await perf.phase(
      'assignmentRead',
      () => db.collection('vehicleAssignments').doc(assignmentId).get(),
    );
    assertActiveOwnedAssignment(assignment, session.driverId);

    const inspectionRef = db.collection('vehicleInspections').doc(inspectionDocId(assignmentId, boundaryType));
    const inspection = await perf.phase('inspectionRead', () => inspectionRef.get());
    assertPendingOwnedInspection(inspection, session.driverId, assignmentId, boundaryType);

    const imageMatch = imageDataUrl.match(
      /^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!imageMatch) throw new HttpsError('invalid-argument', 'Unsupported image format.');
    const mimeType = imageMatch[1];
    const extension = INSPECTION_PHOTO_MIME_TYPES[mimeType];
    const imageBytes = Buffer.from(imageMatch[2], 'base64');
    if (imageBytes.length === 0 || imageBytes.length > INSPECTION_PHOTO_MAX_BYTES) {
      throw new HttpsError('invalid-argument', 'Image must be between 1 byte and 5 MB.');
    }

    const assignmentData = assignment.data()!;
    const orgId = assignmentData.orgId || session.orgId;
    const objectPath = [
      'vehicle-inspections',
      orgId,
      assignmentId,
      boundaryType,
      `${photoRole.toLowerCase()}-${randomUUID()}.${extension}`,
    ].join('/');
    await perf.phase(
      'storageUpload',
      () => bucket.file(objectPath).save(imageBytes, { contentType: mimeType, resumable: false }),
    );

    const recheck = await perf.phase('inspectionRecheck', () => inspectionRef.get());
    try {
      assertPendingOwnedInspection(recheck, session.driverId, assignmentId, boundaryType);
    } catch (error) {
      await bucket.file(objectPath).delete().catch(() => undefined);
      throw error;
    }

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (photoRole === 'EXTERIOR') {
      update.exteriorPhotoPath = objectPath;
      update.exteriorPhotoSize = imageBytes.length;
      update.exteriorPhotoContentType = mimeType;
    } else {
      update.interiorPhotoPath = objectPath;
      update.interiorPhotoSize = imageBytes.length;
      update.interiorPhotoContentType = mimeType;
    }
    await perf.phase('inspectionMetadataWrite', () => inspectionRef.update(update));
    return { success: true, photoRole, photoPath: objectPath };
  },
);

export const completeVehicleInspectionJhb = onMeasuredCall(
  'completeVehicleInspectionJhb',
  async (data, _request, perf) => {
    const validated = CompleteVehicleInspectionSchema.parse(data);
    const {
      driverId: requestedDriverId,
      sessionToken,
      inspectionId,
      hasDamage,
      damageDescription,
    } = validated;
    const session = await perf.phase(
      'sessionValidation',
      () => requireDriverSession({ driverId: requestedDriverId, sessionToken }, perf),
    );
    const inspectionRef = db.collection('vehicleInspections').doc(inspectionId);
    const inspection = await perf.phase('inspectionRead', () => inspectionRef.get());
    if (!inspection.exists) throw new HttpsError('not-found', 'Vehicle inspection not found.');
    const inspectionData = inspection.data()!;
    if (inspectionData.driverId !== session.driverId) {
      throw new HttpsError('permission-denied', 'You can only complete your own inspection.');
    }
    if (inspectionData.status === 'COMPLETED') {
      return { success: true, inspection: { id: inspection.id, ...inspectionData } };
    }

    const assignment = await perf.phase(
      'assignmentRead',
      () => db.collection('vehicleAssignments').doc(inspectionData.assignmentId).get(),
    );
    assertActiveOwnedAssignment(assignment, session.driverId);
    const assignmentData = assignment.data()!;
    if (
      inspectionData.shiftId !== assignmentData.shiftId
      || inspectionData.vehicleId !== assignmentData.vehicleId
    ) {
      throw new HttpsError('failed-precondition', 'Inspection does not match the assignment.');
    }
    if (hasDamage && (!damageDescription || damageDescription.trim() === '')) {
      throw new HttpsError('invalid-argument', 'A damage description is required.');
    }

    const exteriorPath = typeof inspectionData.exteriorPhotoPath === 'string'
      ? inspectionData.exteriorPhotoPath
      : undefined;
    const interiorPath = typeof inspectionData.interiorPhotoPath === 'string'
      ? inspectionData.interiorPhotoPath
      : undefined;
    if (!exteriorPath || !interiorPath) {
      throw new HttpsError('failed-precondition', 'Both inspection photos must be uploaded.');
    }
    const [exteriorExists, interiorExists] = await perf.phase('storageVerification', () => Promise.all([
      bucket.file(exteriorPath).exists(),
      bucket.file(interiorPath).exists(),
    ]));
    if (!exteriorExists[0]) throw new HttpsError('failed-precondition', 'Exterior photo is missing.');
    if (!interiorExists[0]) throw new HttpsError('failed-precondition', 'Interior photo is missing.');

    const retentionClass = hasDamage ? 'EVIDENCE' : 'ROUTINE';
    const expiresAt = hasDamage
      ? null
      : Timestamp.fromMillis(Date.now() + ROUTINE_INSPECTION_RETENTION_MS);
    await perf.phase('inspectionCompletionWrite', () => inspectionRef.update({
      status: 'COMPLETED',
      capturedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      hasDamage,
      damageDescription: hasDamage ? damageDescription!.trim() : null,
      exteriorPhotoPath: exteriorPath,
      interiorPhotoPath: interiorPath,
      exteriorPhotoCaptured: true,
      interiorPhotoCaptured: true,
      retentionClass,
      expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    }));
    const updated = await perf.phase('inspectionReadback', () => inspectionRef.get());
    return { success: true, inspection: { id: updated.id, ...updated.data() } };
  },
);

function assertActiveOwnedAssignment(
  assignment: DocumentSnapshot,
  driverId: string,
): void {
  if (!assignment.exists) throw new HttpsError('not-found', 'Vehicle assignment not found.');
  const value = assignment.data()!;
  if (value.driverId !== driverId) {
    throw new HttpsError('permission-denied', 'Assignment does not belong to this driver.');
  }
  if (value.status !== 'ACTIVE') {
    throw new HttpsError('failed-precondition', 'The assignment is no longer active.');
  }
}

function assertPendingOwnedInspection(
  inspection: DocumentSnapshot,
  driverId: string,
  assignmentId: string,
  boundaryType: 'PICKUP' | 'RETURN',
): void {
  if (!inspection.exists) throw new HttpsError('not-found', 'Vehicle inspection not found.');
  const value = inspection.data()!;
  if (value.driverId !== driverId) {
    throw new HttpsError('permission-denied', 'Inspection does not belong to this driver.');
  }
  if (value.assignmentId !== assignmentId || value.boundaryType !== boundaryType) {
    throw new HttpsError('failed-precondition', 'Inspection relationship is invalid.');
  }
  if (value.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', 'The inspection is already completed.');
  }
}
