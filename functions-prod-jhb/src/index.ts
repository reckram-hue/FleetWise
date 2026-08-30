// functions/src/index.ts — FULL DROP-IN Cloud Functions for FleetWise Shift Management
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import * as crypto from 'crypto';
import { createActiveAdminProfile, requireActiveAdmin } from './adminAuthorization';
import { onCall as onCallV2 } from 'firebase-functions/v2/https';

const PROJECT_ID = 'fleetwise-prod-jhb';
const STORAGE_BUCKET = 'fleetwise-prod-jhb.firebasestorage.app';
const REGION = 'africa-south1';

// This app is pinned to the new production project and its exact bucket. Calling
// firestore(app) without a database ID intentionally selects only (default).
const app = admin.initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
const db = admin.firestore(app);

if (app.options.projectId !== PROJECT_ID || app.options.storageBucket !== STORAGE_BUCKET) {
  throw new Error('Johannesburg production Firebase Admin configuration is invalid.');
}

type ProdCallableHandler = (
  data: any,
  context: functions.https.CallableContext,
) => Promise<any>;

const PROD_CALLABLE_OPTIONS = {
  region: REGION,
  memory: '256MiB' as const,
};

/**
 * v2 callable adapter that preserves the existing (data, context) business handlers.
 * All exported callables pass through this adapter and therefore share one region.
 */
function onProdCall(handler: ProdCallableHandler) {
  return onCallV2(PROD_CALLABLE_OPTIONS, async (request) => (
    handler(request.data, request as unknown as functions.https.CallableContext)
  ));
}

// The marker is process-local, giving an inexpensive cold-start signal without changing
// Function configuration. It is intended only for temporary performance telemetry.
let hasHandledMeasuredInvocation = false;
const PERFORMANCE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;

type PerformanceTrace = {
  phase<T>(name: string, operation: () => Promise<T>): Promise<T>;
  phaseSync<T>(name: string, operation: () => T): T;
};

function monotonicNowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function performanceRequestId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = (data as Record<string, unknown>).performanceRequestId;
  return typeof value === 'string' && PERFORMANCE_REQUEST_ID_PATTERN.test(value) ? value : undefined;
}

function onMeasuredCall(
  functionName: string,
  handler: (data: any, context: functions.https.CallableContext, perf: PerformanceTrace) => Promise<any>,
) {
  const measuredCallable = async (data: any, context: functions.https.CallableContext) => {
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
          phases[name] = (phases[name] || 0) + (monotonicNowMs() - phaseStartedAt);
        }
      },
      phaseSync<T>(name: string, operation: () => T): T {
        const phaseStartedAt = monotonicNowMs();
        try {
          return operation();
        } finally {
          phases[name] = (phases[name] || 0) + (monotonicNowMs() - phaseStartedAt);
        }
      },
    };

    let success = false;
    try {
      const result = await handler(data, context, perf);
      success = true;
      return result;
    } finally {
      // Do not include request data, identity, credentials, or error details in telemetry.
      console.info('[FW-PERF]', {
        functionName,
        correlationId: performanceRequestId(data) || null,
        coldStart,
        totalElapsedMs: Math.round((monotonicNowMs() - startedAt) * 10) / 10,
        phaseElapsedMs: Object.fromEntries(
          Object.entries(phases).map(([name, elapsedMs]) => [name, Math.round(elapsedMs * 10) / 10]),
        ),
        success,
        timestamp: new Date().toISOString(),
      });
    }
  };
  return onProdCall(measuredCallable);
}

// =============================================================================
// RATE LIMITING HELPERS
// =============================================================================

// Derives a safe Firestore document ID for rate-limit records.
// The driverId prefix is kept plain so per-driver range queries remain functional.
// The deviceId is hashed to strip `/` and other path-separator characters.
function getRateLimitKey(driverId: string, deviceId: string): string {
  const deviceHash = crypto.createHash('sha256').update(deviceId || 'unknown').digest('hex');
  return `${driverId}_${deviceHash}`;
}

/**
 * Check and update rate limiting for PIN attempts
 * Allows max 6 failed attempts in 10 minutes per driver/device
 */
async function checkRateLimit(driverId: string, deviceId: string = 'unknown'): Promise<void> {
  const rateLimitRef = db.collection('rateLimits').doc(getRateLimitKey(driverId, deviceId));
  const now = admin.firestore.Timestamp.now();
  const tenMinutesAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 10 * 60 * 1000);

  const doc = await rateLimitRef.get();

  if (!doc.exists) {
    // First attempt, create the document
    await rateLimitRef.set({
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
    });
    return;
  }

  const data = doc.data()!;
  const firstAttempt = data.firstAttempt as admin.firestore.Timestamp;

  // Reset if outside 10-minute window
  if (firstAttempt.toMillis() < tenMinutesAgo.toMillis()) {
    await rateLimitRef.set({
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
    });
    return;
  }

  // Check if exceeded limit
  if (data.attempts >= 6) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Too many failed PIN attempts. Please wait 10 minutes before trying again.'
    );
  }

  // Increment attempt counter
  await rateLimitRef.update({
    attempts: admin.firestore.FieldValue.increment(1),
    lastAttempt: now,
  });
}

/**
 * Clear rate limit after successful authentication
 */
async function clearRateLimit(driverId: string, deviceId: string = 'unknown'): Promise<void> {
  const rateLimitRef = db.collection('rateLimits').doc(getRateLimitKey(driverId, deviceId));
  await rateLimitRef.delete();
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

// Charge percent is EV-only. Normalize null/undefined to undefined so ICE vehicles
// can omit the field; still validate 0-100 when a number is actually supplied.
const optionalChargePercent = z.preprocess(
  (v) => (v === null || v === undefined ? undefined : v),
  z.number().min(0).max(100).optional()
);

// A driver-entered EV range estimate, capped to reject implausible entry mistakes.
const MAX_PREDICTED_RANGE_KM = 2000;
const optionalPredictedRangeKm = z.preprocess(
  (v) => (v === null || v === undefined ? undefined : v),
  z.number().finite().min(0, 'Predicted range must be non-negative')
    .max(MAX_PREDICTED_RANGE_KM, `Predicted range cannot exceed ${MAX_PREDICTED_RANGE_KM} km`)
    .optional()
);

// Optional string helper: normalize null/undefined/blank to undefined so optional
// string fields can be omitted across the callable serialization boundary.
const optionalString = z.preprocess(
  (v) => (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : v),
  z.string().optional()
);

const optionalNotes = z.preprocess(
  (v) => (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : v),
  z.string().max(500, 'Notes must be 500 characters or fewer').optional()
);

const SetPinSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  newPin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

const ChangePinSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  currentPin: z.string().regex(/^\d{4}$/, 'Current PIN must be exactly 4 digits'),
  newPin: z.string().regex(/^\d{4}$/, 'New PIN must be exactly 4 digits'),
});

// =============================================================================
// DRIVER SESSION SCHEMAS AND CONSTANTS (WP6A)
// =============================================================================

/** Maximum driver session duration. Covers a 12-hour shift plus a 4-hour buffer. */
const SESSION_DURATION_MS = 16 * 60 * 60 * 1000;

/**
 * Placeholder orgId for single-tenant operation.
 * Will be resolved per-tenant from the driver's organisation record in a future SaaS work package.
 */
const DEFAULT_ORG_ID = 'default';

const DriverLoginSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  deviceId: optionalString,
});

const DriverLogoutSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
});

const RequireSessionSchema = z.object({
  driverId: z.string().min(1),
  sessionToken: z.string().min(1),
});

// =============================================================================
// DRIVER SESSION CALLABLE SCHEMAS (WP6B)
// =============================================================================

const StartShiftWithSessionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  deviceId: optionalString,
  startOdometer: z.number().min(0, 'Start odometer must be positive').optional(),
  startChargePercent: optionalChargePercent,
});

const EndShiftWithSessionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  shiftId: z.string().min(1, 'Shift ID is required'),
  endOdometer: z.number().min(0, 'End odometer must be positive').optional(),
  endChargePercent: optionalChargePercent,
  notes: optionalNotes,
  deviceId: optionalString,
});

const GetActiveShiftWithSessionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
});

const ReportDefectWithSessionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required'),
  urgency: z.string().min(1, 'Urgency is required'),
  location: optionalString,
  notes: optionalString,
  // Storage object paths returned by uploadDefectPhoto — never raw image data. The length
  // cap rejects any accidental base64 payload (a data: URL is always far longer than a path).
  photos: z.preprocess(
    (value) => value === null ? undefined : value,
    z.array(z.string().max(512, 'Photo must be a Storage path from uploadDefectPhoto, not image data')).optional()
  ),
  deviceId: optionalString,
});

// =============================================================================
// VEHICLE ASSIGNMENT CALLABLE SCHEMAS (WP7B)
// =============================================================================

const StartVehicleAssignmentSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  shiftId: z.string().min(1, 'Shift ID is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  startOdometer: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    z.number().min(0, 'Start odometer must be positive').optional()
  ),
  startChargePercent: optionalChargePercent,
  startPredictedRangeKm: optionalPredictedRangeKm,
  transitionReason: z.enum(['SHIFT_START', 'VEHICLE_SWAP']).optional(),
  deviceId: optionalString,
});

const EndVehicleAssignmentSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  assignmentId: z.string().min(1, 'Assignment ID is required'),
  endOdometer: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    z.number().min(0, 'End odometer must be positive').optional()
  ),
  endChargePercent: optionalChargePercent,
  endPredictedRangeKm: optionalPredictedRangeKm,
  leftForCharging: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    z.boolean().optional()
  ),
  chargingLocationId: optionalString,
  publicChargeReference: optionalString,
  publicChargeCost: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    z.number().finite().min(0, 'Public charge cost must be non-negative').optional()
  ),
  chargingNotes: optionalNotes,
  // CANCELLED is intentionally NOT accepted here: ordinary driver sessions must not be
  // able to bypass RETURN-inspection enforcement via a cancellation reason (WP7D2).
  // Cancellation belongs to a future admin/recovery callable.
  transitionReason: z.enum(['VEHICLE_SWAP', 'SHIFT_END']),
  deviceId: optionalString,
});

const GetActiveVehicleAssignmentSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  shiftId: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    z.string().min(1, 'Shift ID is required').optional()
  ),
});

// =============================================================================
// VEHICLE INSPECTION CALLABLE SCHEMAS (WP7D1)
// =============================================================================

const CreateVehicleInspectionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  assignmentId: z.string().min(1, 'Assignment ID is required'),
  boundaryType: z.enum(['PICKUP', 'RETURN']),
  returnIntent: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    z.enum(['VEHICLE_SWAP', 'SHIFT_END']).optional()
  ),
});

const CompleteVehicleInspectionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  inspectionId: z.string().min(1, 'Inspection ID is required'),
  hasDamage: z.boolean(),
  damageDescription: optionalString,
});

const UploadInspectionPhotoSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  assignmentId: z.string().min(1, 'Assignment ID is required'),
  boundaryType: z.enum(['PICKUP', 'RETURN']),
  photoRole: z.enum(['EXTERIOR', 'INTERIOR']),
  imageDataUrl: z.string().min(1, 'Image data is required'),
});

const UploadDefectPhotoSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  imageDataUrl: z.string().min(1, 'Image data is required'),
});

const GetAssignmentInspectionsSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  assignmentId: z.string().min(1, 'Assignment ID is required'),
});

const UpdateOdometerDiscrepancySchema = z.object({
  discrepancyId: z.string().min(1, 'Discrepancy ID is required'),
  status: z.enum(['OPEN', 'RESOLVED', 'INVESTIGATING']),
  notes: optionalNotes,
});

const GetVehicleForSessionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
});

const GetVehicleDefectsForSessionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
});

const LogRefuelWithSessionSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  assignmentId: z.string().min(1, 'Assignment ID is required'),
  odometer: z.number().min(0, 'Odometer must be positive'),
  litresFilled: z.number().positive('Litres filled must be greater than zero'),
  fuelCost: z.number().min(0, 'Fuel cost must be zero or greater'),
  oilCost: z.preprocess(
    (v) => (v === null || v === undefined ? undefined : v),
    z.number().min(0, 'Oil cost must be zero or greater').optional()
  ),
  notes: optionalNotes,
});

// =============================================================================
// CLOUD FUNCTIONS
// =============================================================================

/**
 * Admin function to set or reset a driver's 4-digit PIN
 * Hashes the PIN with bcrypt before storing
 */
export const adminSetDriverPin = onProdCall(async (data, context) => {
  try {
    const { uid: callerUid } = await requireAdmin(context);

    // Validate input
    const validated = SetPinSchema.parse(data);
    const { driverId, newPin } = validated;

    // Verify driver exists
    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await driverRef.get();

    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    // Hash the PIN with bcrypt (salt rounds = 10)
    const pinHash = await bcrypt.hash(newPin, 10);

    // Update driver document
    await driverRef.update({
      pinHash: pinHash,
      pinLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      pinLastUpdatedBy: callerUid,
    });

    // Clear any existing rate limits for this driver
    const rateLimitDocs = await db.collection('rateLimits')
      .where('__name__', '>=', `${driverId}_`)
      .where('__name__', '<', `${driverId}_\uf8ff`)
      .get();

    const batch = db.batch();
    rateLimitDocs.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Revoke all active sessions for this driver — an admin PIN reset invalidates existing sessions.
    await revokeActiveDriverSessions(driverId, 'pin_reset');

    return {
      success: true,
      message: 'Driver PIN set successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }

    console.error('Error in adminSetDriverPin:', error);
    throw new functions.https.HttpsError('internal', 'Failed to set PIN: ' + error.message);
  }
});

/**
 * Allow drivers to change their own PIN
 * Validates current PIN before allowing change
 */
export const driverChangePin = onProdCall(async (data, context) => {
  try {
    const validated = ChangePinSchema.parse(data);
    const { driverId, currentPin, newPin } = validated;

    // Validate new PIN is not the same as current
    if (currentPin === newPin) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'New PIN must be different from current PIN'
      );
    }

    // Validate new PIN is not default
    if (newPin === '1234') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Please choose a PIN other than the default (1234)'
      );
    }

    // Get driver document
    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await driverRef.get();

    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    const driverData = driverDoc.data()!;
    const storedHash = driverData.pinHash;

    if (!storedHash) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No PIN is currently set. Please contact administrator.'
      );
    }

    // Verify current PIN
    const currentPinValid = await bcrypt.compare(currentPin, storedHash);
    if (!currentPinValid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Current PIN is incorrect'
      );
    }

    // Hash new PIN
    const newPinHash = await bcrypt.hash(newPin, 10);

    // Update driver document
    await driverRef.update({
      pinHash: newPinHash,
      pinLastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      pinLastUpdatedBy: driverId, // Driver changed their own PIN
    });

    // Clear any existing rate limits for this driver
    const rateLimitQuery = await db.collection('rateLimits')
      .where('__name__', '>=', `${driverId}_`)
      .where('__name__', '<', `${driverId}_\uf8ff`)
      .get();

    const batch = db.batch();
    rateLimitQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return {
      success: true,
      message: 'PIN changed successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }

    console.error('Error in driverChangePin:', error);
    throw new functions.https.HttpsError('internal', 'Failed to change PIN: ' + error.message);
  }
});

// =============================================================================
// DRIVER SESSION CALLABLES (WP6A)
// =============================================================================

/**
 * Authenticate a driver with their PIN and establish a secure session.
 *
 * The driver enters their PIN once here. Subsequent routine actions (startShift,
 * reportDefect, etc.) use the returned sessionToken as a bearer credential instead
 * of repeating the PIN.
 *
 * Security:
 *   - PIN is verified with bcrypt and then discarded. It is NEVER logged or returned.
 *   - sessionToken is a cryptographically random 32-byte opaque bearer credential.
 *     Only its SHA-256 hash is stored in Firestore (driverSessions/{sessionHash}).
 *     The token is returned to the client exactly once and must be stored in
 *     localStorage by the caller — NOT in sessionStorage (cleared on PWA suspend),
 *     NOT in React context or component state, and NOT in any log.
 */
export const driverLogin = onMeasuredCall('driverLogin', async (data, context, perf) => {
  try {
    const validated = DriverLoginSchema.parse(data);
    const { driverId, pin, deviceId = 'unknown' } = validated;

    // Apply rate limiting before touching driver data (same policy as validateDriverPin)
    await perf.phase('rateLimitCheck', () => checkRateLimit(driverId, deviceId));

    const driverDoc = await perf.phase('driverRead', () => db.collection('users').doc(driverId).get());
    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found.');
    }

    const driverData = driverDoc.data()!;

    if (driverData.employmentStatus !== 'Active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Your account is not active. Please contact your administrator.'
      );
    }

    if (driverData.role && driverData.role !== 'driver') {
      throw new functions.https.HttpsError('failed-precondition', 'This account is not a driver account.');
    }

    const storedHash = driverData.pinHash;
    if (!storedHash) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'PIN not set. Please contact your administrator.'
      );
    }

    // PIN verification — the only point in this callable where the PIN value is used
    const pinValid = await perf.phase('pinVerification', () => bcrypt.compare(pin, storedHash));
    if (!pinValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid PIN.');
    }

    // PIN is correct. Clear rate limit; the PIN reference is discarded after this point.
    await perf.phase('rateLimitClear', () => clearRateLimit(driverId, deviceId));

    // Generate session token.
    // SECURITY: The raw token is a bearer credential — it must NOT be logged or stored server-side.
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const sessionHash = hashSessionToken(sessionToken);

    const expiresAtMs = Date.now() + SESSION_DURATION_MS;
    const expiresAtTimestamp = admin.firestore.Timestamp.fromMillis(expiresAtMs);

    await perf.phase('sessionWrite', () => db.collection('driverSessions').doc(sessionHash).set({
      driverId,
      orgId: DEFAULT_ORG_ID,
      deviceId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAtTimestamp,
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      isRevoked: false,
    }));

    const requiresPinChange = pin === '1234';
    let operationalState: Record<string, any> | null = null;
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
      console.warn('driverLogin operational state resolution deferred');
    }

    return {
      sessionToken,
      driverId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      requiresPinChange,
      driver: stripToDriverSafe(driverData, driverId),
      operationalState,
      operationalStateNeedsRefresh,
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in driverLogin:', error);
    throw new functions.https.HttpsError('internal', 'Login failed.');
  }
});

/**
 * Revoke the driver's current session (logout).
 *
 * The sessionToken is a bearer credential — it is validated by hash lookup and then
 * immediately revoked. The client must clear it from localStorage on success.
 * The raw sessionToken must NEVER be logged.
 */
export const driverLogout = onMeasuredCall('driverLogout', async (data, context, perf) => {
  try {
    const validated = DriverLogoutSchema.parse(data);
    const { driverId, sessionToken } = validated;

    // Validate session before revoking (confirms it exists and belongs to this driver)
    const { sessionHash } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId, sessionToken }));

    await perf.phase('sessionRevocationWrite', () => db.collection('driverSessions').doc(sessionHash).update({
      isRevoked: true,
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      revokedReason: 'logout',
    }));

    return { success: true, message: 'Logged out successfully.' };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in driverLogout:', error);
    throw new functions.https.HttpsError('internal', 'Logout failed.');
  }
});

// =============================================================================
// ADMIN AUTHORIZATION HELPER
// =============================================================================

/**
 * Require that the caller is an authenticated, active admin.
 * Reads users/{uid} and confirms role == 'admin' and employmentStatus == 'Active'.
 * Returns the admin user data for audit logging.
 * Throws HttpsError('unauthenticated' | 'permission-denied') otherwise.
 */
async function requireAdmin(context: functions.https.CallableContext): Promise<{ uid: string; data: FirebaseFirestore.DocumentData }> {
  const authorization = await requireActiveAdmin(
    context.auth,
    (uid) => db.collection('users').doc(uid).get(),
  );
  return {
    uid: authorization.uid,
    data: authorization.data as FirebaseFirestore.DocumentData,
  };
}

/**
 * Strip pinHash and other server-only fields from a user document.
 * Returns a safe copy for client transmission.
 */
function stripSensitiveFields(userData: FirebaseFirestore.DocumentData, id: string): Record<string, any> {
  const { pinHash, ...safe } = userData;
  return { id, ...safe };
}

/**
 * Strip to only driver-selection-safe fields.
 * Returns minimal data for the driver selection screen.
 */
function stripToDriverSafe(userData: FirebaseFirestore.DocumentData, id: string): Record<string, any> {
  return {
    id,
    firstName: userData.firstName || '',
    surname: userData.surname || '',
    area: userData.area || '',
    department: userData.department || '',
    employmentStatus: userData.employmentStatus || 'Active',
    role: userData.role || 'driver',
  };
}

/**
 * Strip sensitive financial/internal fields from a vehicle document for driver presentation.
 */
function stripToVehicleSafe(vehicleData: FirebaseFirestore.DocumentData, id: string): Record<string, any> {
  return {
    id,
    registration: vehicleData.registration || '',
    alias: vehicleData.alias || '',
    make: vehicleData.make || '',
    model: vehicleData.model || '',
    year: vehicleData.year || null,
    colour: vehicleData.colour || '',
    vehicleType: vehicleData.vehicleType || 'ICE',
    status: vehicleData.status || 'Active',
    fuelType: vehicleData.fuelType || null,
    batteryCapacityKwh: vehicleData.batteryCapacityKwh || null,
    currentOdometer: typeof vehicleData.currentOdometer === 'number' ? vehicleData.currentOdometer : null,
    activeShiftId: vehicleData.activeShiftId || null,
    activeAssignmentId: vehicleData.activeAssignmentId || null,
    isTestData: vehicleData.isTestData === true,
  };
}

function stripToDriverOperationalShift(shiftData: FirebaseFirestore.DocumentData, id: string): Record<string, any> {
  return {
    id,
    driverId: shiftData.driverId,
    vehicleId: shiftData.vehicleId || null,
    startTime: shiftData.startTime || null,
    endTime: shiftData.endTime || null,
    startOdometer: shiftData.startOdometer ?? null,
    endOdometer: shiftData.endOdometer ?? null,
    startChargePercent: shiftData.startChargePercent ?? null,
    endChargePercent: shiftData.endChargePercent ?? null,
    status: shiftData.status,
    activeAssignmentId: shiftData.activeAssignmentId || null,
  };
}

function stripToDriverOperationalAssignment(assignmentData: FirebaseFirestore.DocumentData, id: string): Record<string, any> {
  return {
    id,
    driverId: assignmentData.driverId,
    shiftId: assignmentData.shiftId,
    vehicleId: assignmentData.vehicleId,
    status: assignmentData.status,
    startedAt: assignmentData.startedAt || null,
    startOdometer: assignmentData.startOdometer ?? null,
    startChargePercent: assignmentData.startChargePercent ?? null,
    startPredictedRangeKm: assignmentData.startPredictedRangeKm ?? null,
  };
}

function stripToDriverOperationalInspection(inspectionData: FirebaseFirestore.DocumentData, id: string): Record<string, any> {
  return {
    id,
    assignmentId: inspectionData.assignmentId,
    boundaryType: inspectionData.boundaryType,
    status: inspectionData.status,
    returnIntent: inspectionData.returnIntent || null,
  };
}

function emptyDriverOperationalState(): Record<string, any> {
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

/**
 * Resolve the complete driver-facing operational state in one session-authenticated read.
 * This replaces the mounted client chain of active-shift, assignment, vehicle, and
 * inspection callables while retaining the individual callables for compatibility.
 */
async function resolveDriverOperationalState(
  driverId: string,
  activeShiftId?: string,
  perf?: PerformanceTrace,
): Promise<Record<string, any>> {
  const phase = <T>(name: string, operation: () => Promise<T>): Promise<T> => (
    perf ? perf.phase(name, operation) : operation()
  );

  let activeShift: { id: string; data: FirebaseFirestore.DocumentData } | null = null;
  if (activeShiftId) {
    const pointedShiftDoc = await phase(
      'shiftLookup',
      () => db.collection('shifts').doc(activeShiftId).get(),
    );
    const pointedShiftData = pointedShiftDoc.data();
    if (
      pointedShiftDoc.exists
      && pointedShiftData?.driverId === driverId
      && pointedShiftData.status === 'Active'
    ) {
      activeShift = { id: pointedShiftDoc.id, data: pointedShiftData };
    }
  }

  // Pointer-less and stale-pointer documents retain the legacy fallback until historical
  // shifts have all been reconciled. The query remains scoped to the authenticated driver.
  if (!activeShift) {
    const snapshot = await phase(
      'legacyShiftLookup',
      () => db.collection('shifts').where('driverId', '==', driverId).get(),
    );
    const legacy = snapshot.docs.find((doc) => doc.data()?.status === 'Active');
    if (legacy) activeShift = { id: legacy.id, data: legacy.data() };
  }

  if (!activeShift) {
    return emptyDriverOperationalState();
  }

  const shiftData = activeShift.data;
  const shift = stripToDriverOperationalShift(shiftData, activeShift.id);
  const activeAssignmentId = shiftData.activeAssignmentId;
  if (activeAssignmentId != null && typeof activeAssignmentId !== 'string') {
    throw new functions.https.HttpsError('failed-precondition', 'Your active assignment pointer is invalid. Please contact support.');
  }

  if (!activeAssignmentId) {
    const legacyVehicleId = typeof shiftData.vehicleId === 'string' ? shiftData.vehicleId : null;
    const legacyVehicleDoc = legacyVehicleId
      ? await phase('vehicleLookup', () => db.collection('vehicles').doc(legacyVehicleId).get())
      : null;
    return {
      success: true,
      hasActiveShift: true,
      shift,
      hasActiveAssignment: false,
      assignment: null,
      vehicle: legacyVehicleDoc?.exists ? stripToVehicleSafe(legacyVehicleDoc.data()!, legacyVehicleDoc.id) : null,
      inspections: [],
    };
  }

  const assignmentDoc = await phase(
    'assignmentLookup',
    () => db.collection('vehicleAssignments').doc(activeAssignmentId).get(),
  );
  if (!assignmentDoc.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Your active assignment record is inconsistent. Please contact support.');
  }
  const assignmentData = assignmentDoc.data()!;
  if (
    assignmentData.driverId !== driverId
    || assignmentData.shiftId !== activeShift.id
    || assignmentData.status !== 'ACTIVE'
  ) {
    throw new functions.https.HttpsError('failed-precondition', 'Your active assignment record is inconsistent. Please contact support.');
  }

  const [vehicleDoc, inspectionDocs] = await Promise.all([
    phase('vehicleLookup', () => db.collection('vehicles').doc(assignmentData.vehicleId).get()),
    phase('inspectionsLookup', () => Promise.all([
      db.collection('vehicleInspections').doc(inspectionDocId(activeAssignmentId, 'PICKUP')).get(),
      db.collection('vehicleInspections').doc(inspectionDocId(activeAssignmentId, 'RETURN')).get(),
    ])),
  ]);

  return {
    success: true,
    hasActiveShift: true,
    shift,
    hasActiveAssignment: true,
    assignment: stripToDriverOperationalAssignment(assignmentData, assignmentDoc.id),
    vehicle: vehicleDoc.exists ? stripToVehicleSafe(vehicleDoc.data()!, vehicleDoc.id) : null,
    inspections: inspectionDocs
      // Deterministic document IDs are not an authorization boundary. Only expose
      // inspection summaries that still match the validated active assignment chain.
      .filter((doc) => {
        if (!doc.exists) return false;
        const inspectionData = doc.data()!;
        return inspectionData.assignmentId === activeAssignmentId
          && inspectionData.driverId === driverId
          && inspectionData.shiftId === activeShift.id
          && inspectionData.vehicleId === assignmentData.vehicleId;
      })
      .map((doc) => stripToDriverOperationalInspection(doc.data()!, doc.id)),
  };
}

function assertPredictedRangeMatchesVehicle(
  vehicleType: unknown,
  predictedRangeKm: number | undefined,
  fieldName: 'startPredictedRangeKm' | 'endPredictedRangeKm'
): void {
  if (vehicleType === 'EV') {
    if (predictedRangeKm === undefined) {
      throw new functions.https.HttpsError('invalid-argument', `${fieldName} is required for EV vehicles.`);
    }
    return;
  }

  if (predictedRangeKm !== undefined) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} is only valid for EV vehicles.`);
  }
}

/**
 * Return only the operational fields a driver needs to choose a charging location.
 * Tariffs and audit metadata remain admin-only.
 */
function stripToChargingLocationForDriver(
  locationData: FirebaseFirestore.DocumentData,
  id: string
): Record<string, any> | null {
  const name = typeof locationData.name === 'string' ? locationData.name.trim() : '';
  const type = locationData.type;
  const costOwner = locationData.costOwner;
  if (!name
    || (type !== 'OFFICE' && type !== 'PUBLIC_THIRD_PARTY')
    || (costOwner !== 'COMPANY' && costOwner !== 'DRIVER')) {
    return null;
  }

  return {
    id,
    name,
    type,
    ...(typeof locationData.description === 'string' && locationData.description.trim()
      ? { description: locationData.description.trim() }
      : {}),
    ...(typeof locationData.provider === 'string' && locationData.provider.trim()
      ? { provider: locationData.provider.trim() }
      : {}),
    ...(typeof locationData.chargerType === 'string' && locationData.chargerType.trim()
      ? { chargerType: locationData.chargerType.trim() }
      : {}),
    costOwner,
  };
}

function assertChargingReturnIntent(
  vehicleType: unknown,
  leftForCharging: boolean | undefined,
  chargingLocationId: string | undefined,
  publicChargeReference: string | undefined,
  publicChargeCost: number | undefined,
  chargingNotes: string | undefined
): void {
  const hasChargingFields = chargingLocationId !== undefined
    || publicChargeReference !== undefined
    || publicChargeCost !== undefined
    || chargingNotes !== undefined;

  if (vehicleType !== 'EV') {
    if (leftForCharging === true || hasChargingFields) {
      throw new functions.https.HttpsError('invalid-argument', 'Charging return fields are only valid for EV vehicles.');
    }
    return;
  }

  if (!leftForCharging && hasChargingFields) {
    throw new functions.https.HttpsError('invalid-argument', 'Charging details are only valid when leftForCharging is true.');
  }
  if (leftForCharging && !chargingLocationId) {
    throw new functions.https.HttpsError('invalid-argument', 'chargingLocationId is required when leaving an EV for charging.');
  }
}

function chargingLocationSnapshot(location: FirebaseFirestore.DocumentData): Record<string, any> {
  const name = typeof location.name === 'string' ? location.name.trim() : '';
  if (!name || (location.type !== 'OFFICE' && location.type !== 'PUBLIC_THIRD_PARTY')
    || (location.costOwner !== 'COMPANY' && location.costOwner !== 'DRIVER')) {
    throw new functions.https.HttpsError('failed-precondition', 'Charging location is not configured correctly.');
  }
  return {
    name,
    type: location.type,
    provider: typeof location.provider === 'string' && location.provider.trim() ? location.provider.trim() : null,
    chargerType: typeof location.chargerType === 'string' && location.chargerType.trim() ? location.chargerType.trim() : null,
    costOwner: location.costOwner,
    ...(location.tariffMethod ? { tariffMethod: location.tariffMethod } : {}),
    ...(typeof location.tariffRate === 'number' ? { tariffRate: location.tariffRate } : {}),
  };
}

async function getActiveAssignmentForDriverAction(driverId: string, assignmentId: string) {
  const assignmentRef = db.collection('vehicleAssignments').doc(assignmentId);
  const assignmentDoc = await assignmentRef.get();
  if (!assignmentDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Vehicle assignment not found');
  }
  const assignmentData = assignmentDoc.data()!;
  if (assignmentData.driverId !== driverId) {
    throw new functions.https.HttpsError('permission-denied', 'Assignment does not belong to this driver.');
  }
  if (assignmentData.status !== 'ACTIVE') {
    throw new functions.https.HttpsError('failed-precondition', 'The assignment is no longer active.');
  }

  const vehicleRef = db.collection('vehicles').doc(assignmentData.vehicleId);
  const vehicleDoc = await vehicleRef.get();
  if (!vehicleDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Vehicle not found');
  }

  return { assignmentRef, assignmentDoc, assignmentData, vehicleRef, vehicleDoc, vehicleData: vehicleDoc.data()! };
}

// =============================================================================
// DRIVER SESSION HELPERS (WP6A)
// =============================================================================

/**
 * Compute the SHA-256 hash of a session token.
 * The hash is used as the Firestore document ID so the raw token — a bearer credential —
 * is never stored server-side.
 */
function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Revoke all non-revoked sessions for a given driver.
 * Called automatically by adminSetDriverPin (PIN reset) and archiveDriver.
 * Idempotent: already-revoked sessions retain their original revocation metadata.
 */
async function revokeActiveDriverSessions(
  driverId: string,
  reason: 'admin_revoked' | 'pin_reset' | 'driver_archived'
): Promise<void> {
  const sessionDocs = await db.collection('driverSessions')
    .where('driverId', '==', driverId)
    .get();

  if (sessionDocs.empty) return;

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();
  let pendingCount = 0;

  sessionDocs.docs.forEach((doc) => {
    if (!doc.data().isRevoked) {
      batch.update(doc.ref, {
        isRevoked: true,
        revokedAt: now,
        revokedReason: reason,
      });
      pendingCount++;
    }
  });

  if (pendingCount > 0) {
    await batch.commit();
  }
}

/**
 * Validate a driver session token and return the verified session context.
 *
 * Security model:
 *   - The session token is an opaque bearer credential issued by driverLogin.
 *   - Only its SHA-256 hash is stored in Firestore (as the document ID).
 *   - O(1) document lookup — no secondary index needed.
 *   - The raw sessionToken must NEVER be logged or stored server-side.
 *
 * @returns Safe session context { driverId, orgId, sessionHash, deviceId }
 * @throws HttpsError('unauthenticated') — session missing, revoked, or expired
 * @throws HttpsError('permission-denied') — driverId mismatch or driver not active
 */
async function requireDriverSession(data: {
  driverId: string;
  sessionToken: string;
}, perf?: PerformanceTrace): Promise<{ driverId: string; orgId: string; sessionHash: string; deviceId: string; activeShiftId?: string; isTestData: boolean }> {
  const phaseSync = <T>(name: string, operation: () => T): T => (
    perf ? perf.phaseSync(name, operation) : operation()
  );
  const phase = <T>(name: string, operation: () => Promise<T>): Promise<T> => (
    perf ? perf.phase(name, operation) : operation()
  );

  const { driverId, sessionHash, sessionRef } = phaseSync('sessionTokenPreparation', () => {
    const validated = RequireSessionSchema.parse(data);
    const hash = hashSessionToken(validated.sessionToken);
    return {
      driverId: validated.driverId,
      sessionHash: hash,
      sessionRef: db.collection('driverSessions').doc(hash),
    };
  });

  const sessionDoc = await phase('sessionDocumentRead', () => sessionRef.get());
  const session = phaseSync('sessionChecks', () => {
    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('unauthenticated', 'Session not found. Please log in again.');
    }

    const sessionData = sessionDoc.data()!;
    if (sessionData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'Session does not belong to this driver.');
    }
    if (sessionData.isRevoked) {
      throw new functions.https.HttpsError('unauthenticated', 'Session has been revoked. Please log in again.');
    }
    if (sessionData.expiresAt.toMillis() < Date.now()) {
      throw new functions.https.HttpsError('unauthenticated', 'Session has expired. Please log in again.');
    }
    return sessionData;
  });

  // Confirm driver still exists and is active (catches archival/inactivation mid-session)
  const driverDoc = await phase('driverDocumentRead', () => db.collection('users').doc(driverId).get());
  const driverData = phaseSync('driverChecks', () => {
    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver account not found.');
    }
    const driverData = driverDoc.data()!;
    if (driverData.employmentStatus !== 'Active') {
      throw new functions.https.HttpsError('permission-denied', 'Driver account is not active.');
    }
    if (driverData.role && driverData.role !== 'driver') {
      throw new functions.https.HttpsError('permission-denied', 'Account is not a driver account.');
    }
    return driverData;
  });

  // Update lastSeenAt — throttled: only if more than 5 minutes since the last update.
  // Fire-and-forget so session activity tracking does not add latency to the caller's response.
  phaseSync('lastSeenScheduling', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (session.lastSeenAt.toMillis() < fiveMinutesAgo) {
      sessionRef
        .update({ lastSeenAt: admin.firestore.FieldValue.serverTimestamp() })
        .catch((err) => console.error('requireDriverSession: lastSeenAt update failed:', err));
    }
  });

  return {
    driverId: session.driverId,
    orgId: session.orgId,
    sessionHash,
    deviceId: session.deviceId,
    activeShiftId: typeof driverData.activeShiftId === 'string' ? driverData.activeShiftId : undefined,
    isTestData: driverData.isTestData === true,
  };
}

// =============================================================================
// NEW VALIDATION SCHEMAS
// =============================================================================

const CreateDriverSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  surname: z.string().min(1, 'Surname is required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  idNumber: z.string().optional().or(z.literal('')),
  driversLicenceNumber: z.string().optional().or(z.literal('')),
  driversLicenceExpiry: z.string().optional().or(z.literal('')),
  contactNumber: z.string().optional().or(z.literal('')),
  driversLicenceImageUrl: z.string().optional().or(z.literal('')),
  area: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  employmentStatus: z.enum(['Active', 'Inactive', 'Terminated']).optional(),
});

const UpdateDriverSchema = z.object({
  id: z.string().min(1, 'Driver ID is required'),
  firstName: z.string().min(1).optional(),
  surname: z.string().min(1).optional(),
  email: z.string().optional(),
  idNumber: z.string().optional(),
  driversLicenceNumber: z.string().optional(),
  driversLicenceExpiry: z.string().optional(),
  contactNumber: z.string().optional(),
  driversLicenceImageUrl: z.string().optional(),
  area: z.string().optional(),
  department: z.string().optional(),
  employmentStatus: z.enum(['Active', 'Inactive', 'Terminated']).optional(),
  employmentEndDate: z.string().optional().nullable(),
}).passthrough(); // Allow additional fields from existing schema

const UpdateEmploymentStatusSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  status: z.enum(['Active', 'Inactive', 'Terminated']),
  endDate: z.string().optional(),
});

const CreateAdminSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  surname: z.string().min(1, 'Surname is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const ArchiveDriverSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  inactiveReason: z.string().min(1, 'Reason for inactivation is required'),
  retentionPeriodMonths: z.number().int().min(1).max(999).optional().default(12),
  retentionReason: z.string().optional(),
  legalHold: z.boolean().optional().default(false),
  legalHoldReason: z.string().optional(),
});

const ChargingLocationTypeSchema = z.enum(['OFFICE', 'PUBLIC_THIRD_PARTY']);
const ChargingLocationTariffMethodSchema = z.enum(['FREE', 'PER_KWH', 'PER_SESSION']);
const ChargingLocationCostOwnerSchema = z.enum(['COMPANY', 'DRIVER']);

const CreateChargingLocationSchema = z.object({
  orgId: optionalString,
  name: z.string().trim().min(1, 'Name is required'),
  type: ChargingLocationTypeSchema,
  description: optionalString,
  active: z.boolean().optional().default(true),
  provider: optionalString,
  chargerType: optionalString,
  tariffMethod: ChargingLocationTariffMethodSchema,
  tariffRate: z.number().finite().min(0, 'Tariff rate must be non-negative').optional(),
  costOwner: ChargingLocationCostOwnerSchema,
});

const UpdateChargingLocationSchema = z.object({
  id: z.string().min(1, 'Charging location ID is required'),
  orgId: optionalString,
  name: z.string().trim().min(1, 'Name is required').optional(),
  type: ChargingLocationTypeSchema.optional(),
  description: optionalString,
  active: z.boolean().optional(),
  provider: optionalString,
  chargerType: optionalString,
  tariffMethod: ChargingLocationTariffMethodSchema.optional(),
  tariffRate: z.number().finite().min(0, 'Tariff rate must be non-negative').optional(),
  costOwner: ChargingLocationCostOwnerSchema.optional(),
});

// =============================================================================
// USER LISTING / PROFILE CALLABLES
// =============================================================================

/**
 * List drivers with only safe fields for the driver-selection screen.
 * No authentication required (drivers are PIN-authenticated, not Firebase Auth).
 * Returns: id, firstName, surname, area, department, employmentStatus, role
 * NEVER returns: pinHash, idNumber, driversLicenceImageUrl, email, contactNumber
 */
export const listDriversSafe = onMeasuredCall('listDriversSafe', async (_data, _context, perf) => {
  try {
    const snapshot = await perf.phase('driverListQuery', () => db.collection('users').get());
    const drivers = snapshot.docs
      .filter(doc => {
        const data = doc.data();
        return data.role === 'driver' && data.employmentStatus === 'Active';
      })
      .map(doc => stripToDriverSafe(doc.data(), doc.id));

    return { success: true, users: drivers };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in listDriversSafe:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list drivers');
  }
});

/**
 * Get the authenticated admin's profile.
 * Requires context.auth. Reads users/{uid}, verifies an active admin profile.
 * Returns all fields except pinHash.
 */
export const getAdminProfile = onProdCall(async (_data, context) => {
  try {
    const { uid, data: userData } = await requireAdmin(context);

    return { success: true, user: stripSensitiveFields(userData, uid) };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in getAdminProfile:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get admin profile');
  }
});

/**
 * List all users for admin screens. Requires admin authentication.
 * Returns all fields EXCEPT pinHash.
 * Used by ManageDrivers, AdminDashboard, Reports, ManageDefects, ManageIncidents, Settings.
 */
export const listUsersAdmin = onProdCall(async (_data, context) => {
  try {
    await requireAdmin(context);

    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => stripSensitiveFields(doc.data(), doc.id));

    return { success: true, users };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in listUsersAdmin:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list users');
  }
});

// =============================================================================
// ADMIN DRIVER CRUD CALLABLES
// =============================================================================

/**
 * Create a new driver. Admin-only.
 * Creates a users document with role: 'driver'.
 * Does NOT set pinHash — admin must use adminSetDriverPin separately.
 */
export const createDriver = onProdCall(async (data, context) => {
  try {
    const { uid: adminUid } = await requireAdmin(context);
    const validated = CreateDriverSchema.parse(data);

    const newDriver: Record<string, any> = {
      ...validated,
      role: 'driver',
      employmentStatus: validated.employmentStatus || 'Active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: adminUid,
    };

    // Never allow pinHash to be set through this callable
    delete newDriver.pinHash;

    const docRef = await db.collection('users').add(newDriver);

    return {
      success: true,
      driverId: docRef.id,
      message: 'Driver created successfully. Set their PIN using the Set PIN function.',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in createDriver:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create driver: ' + error.message);
  }
});

/**
 * Update a driver's profile. Admin-only.
 * Patch update — only modifies fields provided.
 * CANNOT set pinHash — strips it from payload.
 */
export const updateDriver = onProdCall(async (data, context) => {
  try {
    const { uid: adminUid } = await requireAdmin(context);
    const validated = UpdateDriverSchema.parse(data);

    const { id: driverId, ...updateFields } = validated;

    // Verify driver exists
    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await driverRef.get();

    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    // Never allow pinHash to be set through this callable
    delete (updateFields as any).pinHash;
    delete (updateFields as any).pinLastUpdated;
    delete (updateFields as any).pinLastUpdatedBy;

    // Clean undefined values (Firestore does not accept undefined)
    const cleanedUpdate: Record<string, any> = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        cleanedUpdate[key] = value;
      }
    }

    cleanedUpdate.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    cleanedUpdate.updatedBy = adminUid;

    await driverRef.update(cleanedUpdate);

    // Return the updated driver (minus pinHash)
    const updatedDoc = await driverRef.get();
    return {
      success: true,
      user: stripSensitiveFields(updatedDoc.data()!, driverId),
      message: 'Driver updated successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in updateDriver:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update driver: ' + error.message);
  }
});

/**
 * Archive (inactivate) a driver. Admin-only.
 *
 * Business rule: driver records are NEVER physically deleted as a normal admin action.
 * This callable sets employmentStatus = 'Inactive', records the inactivation metadata,
 * and applies the admin-specified retention period and optional legal/disciplinary hold.
 *
 * Permanent purge is a separate future privileged process that may only run after
 * retention eligibility (archiveUntil) is reached AND legalHold is false.
 *
 * Fields written:
 *   employmentStatus    → 'Inactive'
 *   employmentEndDate   → today (YYYY-MM-DD)
 *   inactiveAt          → server timestamp
 *   inactiveBy          → admin UID
 *   inactiveReason      → admin-supplied reason (required)
 *   retentionPeriodMonths → months to retain (default 84 = 7 years)
 *   retentionReason     → why this retention period applies (optional)
 *   archiveUntil        → YYYY-MM-DD (inactiveAt + retentionPeriodMonths)
 *   legalHold           → boolean (default false)
 *   legalHoldReason     → required when legalHold = true
 */
export const archiveDriver = onProdCall(async (data, context) => {
  try {
    const { uid: adminUid } = await requireAdmin(context);
    const validated = ArchiveDriverSchema.parse(data);
    const {
      driverId,
      inactiveReason,
      retentionPeriodMonths,
      retentionReason,
      legalHold,
      legalHoldReason,
    } = validated;

    if (legalHold && !legalHoldReason?.trim()) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Legal hold reason is required when a legal hold is applied.'
      );
    }

    // Verify driver exists
    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await driverRef.get();

    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    const driverData = driverDoc.data()!;

    // Block if driver has an active shift — end the shift first
    if (driverData.activeShiftId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver has an active shift. End the shift before archiving the driver.'
      );
    }

    const activeShifts = await db.collection('shifts')
      .where('driverId', '==', driverId)
      .get();
    const hasActive = activeShifts.docs.some(d => d.data().status === 'Active');
    if (hasActive) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver has an active shift. End the shift before archiving the driver.'
      );
    }

    // Compute archiveUntil date
    const today = new Date();
    const archiveUntilDate = new Date(today);
    archiveUntilDate.setMonth(archiveUntilDate.getMonth() + retentionPeriodMonths);
    const archiveUntil = archiveUntilDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const updatePayload: Record<string, any> = {
      employmentStatus: 'Inactive',
      employmentEndDate: today.toISOString().split('T')[0],
      inactiveAt: admin.firestore.FieldValue.serverTimestamp(),
      inactiveBy: adminUid,
      inactiveReason,
      retentionPeriodMonths,
      archiveUntil,
      legalHold: legalHold ?? false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUid,
    };

    if (retentionReason) updatePayload.retentionReason = retentionReason;
    if (legalHold && legalHoldReason) updatePayload.legalHoldReason = legalHoldReason;

    await driverRef.update(updatePayload);

    // Revoke all active sessions — an archived driver may not continue operating.
    await revokeActiveDriverSessions(driverId, 'driver_archived');

    return {
      success: true,
      archiveUntil,
      message: `Driver archived. Record retained until ${archiveUntil}${legalHold ? ' (legal hold active)' : ''}.`,
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in archiveDriver:', error);
    throw new functions.https.HttpsError('internal', 'Failed to archive driver: ' + error.message);
  }
});

/**
 * Update a driver's employment status. Admin-only.
 */
export const updateEmploymentStatus = onProdCall(async (data, context) => {
  try {
    const { uid: adminUid } = await requireAdmin(context);
    const validated = UpdateEmploymentStatusSchema.parse(data);
    const { driverId, status, endDate } = validated;

    // Verify driver exists
    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await driverRef.get();

    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    const updateData: Record<string, any> = {
      employmentStatus: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUid,
    };

    if (endDate) {
      updateData.employmentEndDate = endDate;
    } else if (status === 'Active') {
      // Clear end date when reactivating
      updateData.employmentEndDate = admin.firestore.FieldValue.delete();
    }

    await driverRef.update(updateData);

    // Return updated user
    const updatedDoc = await driverRef.get();
    return {
      success: true,
      user: stripSensitiveFields(updatedDoc.data()!, driverId),
      message: `Employment status updated to ${status}`,
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in updateEmploymentStatus:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update employment status: ' + error.message);
  }
});

// =============================================================================
// ADMIN USER CREATION
// =============================================================================

/**
 * Create a new admin user. Requires an existing authenticated admin.
 * Creates a Firebase Auth account AND a matching users/{uid} document.
 * Uses Firebase Admin Auth (server-side) — no secondary app hack needed.
 */
export const createAdminUser = onProdCall(async (data, context) => {
  try {
    await requireAdmin(context);
    const validated = CreateAdminSchema.parse(data);
    const { firstName, surname, email, password } = validated;

    // Create Firebase Auth user via Admin SDK
    const authUser = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${surname}`,
    });

    // Create matching Firestore document
    const userData = createActiveAdminProfile(
      firstName,
      surname,
      email,
      admin.firestore.FieldValue.serverTimestamp(),
    );

    await db.collection('users').doc(authUser.uid).set(userData);

    return {
      success: true,
      userId: authUser.uid,
      message: 'Admin user created successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }

    // Handle Firebase Auth specific errors
    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'An account with this email already exists');
    }
    if (error.code === 'auth/invalid-email') {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email address');
    }
    if (error.code === 'auth/weak-password') {
      throw new functions.https.HttpsError('invalid-argument', 'Password is too weak');
    }

    console.error('Error in createAdminUser:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create admin user: ' + error.message);
  }
});

// =============================================================================
// CHARGING LOCATION ADMIN CRUD
// =============================================================================

export const createChargingLocation = onProdCall(async (data, context) => {
  try {
    const { uid: adminUid, data: adminData } = await requireAdmin(context);
    const validated = CreateChargingLocationSchema.parse(data);

    const chargingLocation: Record<string, any> = {
      ...validated,
      name: validated.name.trim(),
      active: validated.active ?? true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: adminUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminUid,
    };

    if (!chargingLocation.orgId && typeof adminData.orgId === 'string' && adminData.orgId.trim()) {
      chargingLocation.orgId = adminData.orgId.trim();
    }

    const docRef = await db.collection('chargingLocations').add(chargingLocation);
    const createdDoc = await docRef.get();

    return {
      success: true,
      chargingLocation: { id: createdDoc.id, ...createdDoc.data() },
      message: 'Charging location created successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in createChargingLocation:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create charging location: ' + error.message);
  }
});

export const updateChargingLocation = onProdCall(async (data, context) => {
  try {
    const { uid: adminUid } = await requireAdmin(context);
    const validated = UpdateChargingLocationSchema.parse(data);
    const { id, ...updateFields } = validated;

    const locationRef = db.collection('chargingLocations').doc(id);
    const locationDoc = await locationRef.get();
    if (!locationDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Charging location not found');
    }

    const cleanedUpdate: Record<string, any> = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (value !== undefined) {
        cleanedUpdate[key] = key === 'name' && typeof value === 'string' ? value.trim() : value;
      }
    }

    delete cleanedUpdate.createdAt;
    delete cleanedUpdate.createdBy;
    delete cleanedUpdate.updatedAt;
    delete cleanedUpdate.updatedBy;

    cleanedUpdate.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    cleanedUpdate.updatedBy = adminUid;

    await locationRef.update(cleanedUpdate);

    const updatedDoc = await locationRef.get();
    return {
      success: true,
      chargingLocation: { id: updatedDoc.id, ...updatedDoc.data() },
      message: 'Charging location updated successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in updateChargingLocation:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update charging location: ' + error.message);
  }
});

export const listChargingLocationsAdmin = onProdCall(async (_data, context) => {
  try {
    await requireAdmin(context);

    const snapshot = await db.collection('chargingLocations').orderBy('name', 'asc').get();
    const chargingLocations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return { success: true, chargingLocations };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in listChargingLocationsAdmin:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list charging locations');
  }
});

// =============================================================================
// SESSION-AUTHENTICATED DRIVER CALLABLES (WP6B)
// These callables replace PIN-per-action with a session bearer token.
// Each one calls requireDriverSession() as the SOLE authentication mechanism.
// The raw sessionToken is NEVER logged or written to Firestore.
// Legacy PIN-based callables (startShiftWithPin, reportDefect, endShift,
// getActiveShift) remain live for rollback until WP6C frontend migration is
// complete and runtime-tested.
// =============================================================================

/**
 * Start a shift using a driver session token instead of a PIN.
 *
 * The driver logs in once via driverLogin (PIN → sessionToken). This callable
 * accepts that sessionToken as the credential — no PIN re-entry required.
 * All shift collision and vehicle-availability logic is identical to
 * startShiftWithPin; the only difference is the authentication path.
 */
export const startShift = onMeasuredCall('startShift', async (data, context, perf) => {
  try {
    const validated = StartShiftWithSessionSchema.parse(data);
    const {
      driverId: reqDriverId,
      sessionToken,
      vehicleId,
      startOdometer,
      startChargePercent,
    } = validated;

    // Session validation is the sole authentication step — no PIN, no rate limit.
    // requireDriverSession cross-validates driverId against the stored session,
    // checks revocation/expiry, and confirms the driver is still Active.
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    // Parallel reads — driverDoc needed for allowedVehicles and activeShiftId checks.
    const [driverDoc, vehicleDoc] = await perf.phase('initialRecordReads', () => Promise.all([
      db.collection('users').doc(driverId).get(),
      db.collection('vehicles').doc(vehicleId).get(),
    ]));

    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }
    const driverData = driverDoc.data()!;

    // requireDriverSession already checked these, but we re-check for defence-in-depth
    // and to guard against any race between session validation and this read.
    if (driverData.employmentStatus !== 'Active') {
      throw new functions.https.HttpsError('failed-precondition', 'Driver is not active and cannot start shifts');
    }
    if (driverData.role && driverData.role !== 'driver') {
      throw new functions.https.HttpsError('failed-precondition', 'Only drivers can start shifts');
    }

    if (!vehicleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    }
    const vehicleData = vehicleDoc.data()!;

    if (vehicleData.status !== 'Active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Vehicle is ${vehicleData.status} and cannot be used for shifts`
      );
    }

    // Active-shift collision prevention via pointer field
    if (driverData.activeShiftId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver already has an active shift. Please end your current shift first.'
      );
    }
    if (vehicleData.activeShiftId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This vehicle is already in use by another driver. Please select a different vehicle.'
      );
    }

    // Allowed-vehicles check (optional per-driver restriction)
    if (driverData.allowedVehicles && Array.isArray(driverData.allowedVehicles)) {
      if (!driverData.allowedVehicles.includes(vehicleId)) {
        throw new functions.https.HttpsError('permission-denied', 'You are not authorized to use this vehicle');
      }
    }

    // Legacy shift-collision detection: scans by driverId/vehicleId for docs
    // that predate the activeShiftId pointer field. Single-field queries — no
    // composite index required.
    const [driverShifts, vehicleShifts] = await perf.phase('legacyShiftQueries', () => Promise.all([
      db.collection('shifts').where('driverId', '==', driverId).get(),
      db.collection('shifts').where('vehicleId', '==', vehicleId).get(),
    ]));
    if (driverShifts.docs.some(d => d.data().status === 'Active')) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver already has an active shift. Please end your current shift first.'
      );
    }
    if (vehicleShifts.docs.some(d => d.data().status === 'Active')) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This vehicle is already in use by another driver. Please select a different vehicle.'
      );
    }

    // Create shift document in a transaction so pointer updates are atomic.
    const shiftRef = db.collection('shifts').doc();
    const shiftId = shiftRef.id;

    await perf.phase('transaction', () => db.runTransaction(async (transaction) => {
      // Re-check pointer fields inside the transaction to prevent TOCTOU races.
      const [txDriverDoc, txVehicleDoc] = await Promise.all([
        transaction.get(driverDoc.ref),
        transaction.get(vehicleDoc.ref),
      ]);

      if (txDriverDoc.data()?.activeShiftId) {
        throw new functions.https.HttpsError('failed-precondition', 'Driver already has an active shift');
      }
      if (txVehicleDoc.data()?.activeShiftId) {
        throw new functions.https.HttpsError('failed-precondition', 'Vehicle is already in use');
      }

      // Odometer continuity & discrepancy check
      const latestStoredOdometer = txVehicleDoc.data()?.currentOdometer;
      if (typeof startOdometer === 'number' && typeof latestStoredOdometer === 'number') {
        if (startOdometer < latestStoredOdometer) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Start odometer (${startOdometer} km) cannot be lower than the vehicle's last recorded odometer (${latestStoredOdometer} km)`
          );
        }
        if (startOdometer > latestStoredOdometer) {
          const unaccountedKm = startOdometer - latestStoredOdometer;
          const discrepancyRef = db.collection('odometerDiscrepancies').doc();
          transaction.set(discrepancyRef, {
            orgId: DEFAULT_ORG_ID,
            vehicleId,
            driverId,
            shiftId,
            expectedOdometer: latestStoredOdometer,
            actualPickupOdometer: startOdometer,
            unaccountedKm,
            detectedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'OPEN',
            type: 'UNACCOUNTED_MILEAGE',
            // Test-data isolation: inherited from either party (see startShift's shiftData).
            isTestData: driverData.isTestData === true || vehicleData.isTestData === true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // Legacy-compatible shift document schema; startChargePercent is EV-only.
      const shiftData: any = {
        driverId,
        vehicleId,
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        endTime: null,
        startOdometer: startOdometer ?? null,
        endOdometer: null,
        endChargePercent: null,
        status: 'Active',
        // Test-data isolation: inherited from either party so downstream stats/leaderboard
        // aggregation can exclude this record without joining back to users/vehicles.
        isTestData: driverData.isTestData === true || vehicleData.isTestData === true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof startChargePercent === 'number') {
        shiftData.startChargePercent = startChargePercent;
      }
      transaction.set(shiftRef, shiftData);

      transaction.update(driverDoc.ref, {
        activeShiftId: shiftId,
        lastShiftStart: admin.firestore.FieldValue.serverTimestamp(),
      });

      const vehicleUpdate: any = {
        activeShiftId: shiftId,
        lastShiftStart: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof startOdometer === 'number') {
        vehicleUpdate.currentOdometer = startOdometer;
      }
      transaction.update(vehicleDoc.ref, vehicleUpdate);
    }));

    return { success: true, shiftId, message: 'Shift started successfully' };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in startShift:', error);
    throw new functions.https.HttpsError('internal', 'Failed to start shift: ' + error.message);
  }
});

/**
 * Report a vehicle defect using a session token instead of a PIN.
 * The driverId used in the defect document is always the one returned by
 * requireDriverSession — the client-supplied value is cross-validated against
 * the stored session to prevent impersonation.
 *
 * `photos` must be Storage object paths returned by uploadDefectPhoto (see below), uploaded
 * BEFORE this callable is invoked — never raw base64 image data. Residual risk: if the photo
 * uploads succeed but this call then fails (network blip, validation error, etc.), those
 * already-uploaded objects are orphaned in Storage under vehicle-defects/. This is accepted
 * as a low-severity storage-cost tradeoff rather than adding a cross-request cleanup/rollback
 * mechanism; orphaned objects carry no PII beyond the photo itself and are not linked from
 * any Firestore document.
 */
export const reportDefectWithSession = onProdCall(async (data, context) => {
  try {
    const validated = ReportDefectWithSessionSchema.parse(data);
    const {
      driverId: reqDriverId,
      sessionToken,
      vehicleId,
      category,
      description,
      urgency,
      location,
      notes,
      photos,
    } = validated;

    // Session validation — no rate limiting for routine actions post-login.
    const { driverId, isTestData: driverIsTestData } = await requireDriverSession({ driverId: reqDriverId, sessionToken });

    // Vehicle must exist (no status restriction — defects can be reported on any vehicle)
    const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    }
    const vehicleData = vehicleDoc.data()!;

    // Build defect document using the same schema as reportDefect.
    const defectData: Record<string, any> = {
      vehicleId,
      driverId,   // authoritative: from session, not raw client input
      category,
      description,
      urgency,
      status: 'Open',
      isVisibleToDriver: true,
      // Test-data isolation: inherited from either party (see startShift).
      isTestData: driverIsTestData || vehicleData.isTestData === true,
      reportedDateTime: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (location) defectData.location = location;
    if (notes) defectData.notes = notes;
    if (photos && photos.length > 0) defectData.photos = photos;

    const defectRef = await db.collection('defects').add(defectData);

    return {
      success: true,
      defectId: defectRef.id,
      message: 'Defect report submitted successfully',
    };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in reportDefectWithSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to report defect: ' + error.message);
  }
});

/**
 * End a shift using a session token.
 *
 * Unlike the legacy endShift (which accepts any shiftId without a driver
 * credential), this callable enforces that the authenticated driver can only
 * end their OWN shift — preventing cross-driver shift termination.
 */
export const endShiftWithSession = onMeasuredCall('endShiftWithSession', async (data, context, perf) => {
  try {
    const validated = EndShiftWithSessionSchema.parse(data);
    const { driverId: reqDriverId, sessionToken, shiftId, endOdometer, endChargePercent, notes } = validated;

    // Session validation — returns the authoritative driverId.
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    const shiftRef = db.collection('shifts').doc(shiftId);
    const shiftDoc = await perf.phase('shiftRead', () => shiftRef.get());

    if (!shiftDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Shift not found');
    }

    const shiftData = shiftDoc.data()!;

    // Enforce shift ownership — a driver may only end their own shift.
    if (shiftData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only end your own shift.');
    }

    if (shiftData.status !== 'Active') {
      throw new functions.https.HttpsError('failed-precondition', 'This shift has already been ended');
    }

    // WP7B: prevent ending the shift while a vehicle assignment is still active.
    if (shiftData.activeAssignmentId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'You still have a vehicle assigned. Please return the vehicle before ending your shift.'
      );
    }

    if (endOdometer !== undefined && shiftData.startOdometer && endOdometer < shiftData.startOdometer) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `End odometer (${endOdometer}) must be greater than or equal to start odometer (${shiftData.startOdometer})`
      );
    }

    const vehicleId = shiftData.vehicleId;

    await perf.phase('transaction', () => db.runTransaction(async (transaction) => {
      const driverRef = db.collection('users').doc(driverId);

      // Re-check the active-assignment pointer inside the transaction (race protection).
      const txShift = await transaction.get(shiftRef);
      if (txShift.data()?.activeAssignmentId) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'You still have a vehicle assigned. Please return the vehicle before ending your shift.'
        );
      }

      // Legacy-compatible shift update; endChargePercent is EV-only.
      const shiftUpdate: any = {
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        status: 'Completed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof endOdometer === 'number') {
        shiftUpdate.endOdometer = endOdometer;
      }
      if (typeof notes === 'string' && notes.trim()) {
        shiftUpdate.notes = notes.trim();
      }
      if (typeof endChargePercent === 'number') {
        shiftUpdate.endChargePercent = endChargePercent;
      }
      transaction.update(shiftRef, shiftUpdate);

      // Clear additive pointer fields (no-op on legacy docs that never had them).
      transaction.update(driverRef, { activeShiftId: admin.firestore.FieldValue.delete() });
      if (vehicleId) {
        const vehicleRef = db.collection('vehicles').doc(vehicleId);
        transaction.update(vehicleRef, { activeShiftId: admin.firestore.FieldValue.delete() });
      }
    }));

    return { success: true, message: 'Shift ended successfully' };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }
    console.error('Error in endShiftWithSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to end shift: ' + error.message);
  }
});

/**
 * Get the active shift for the authenticated driver.
 *
 * Unlike the legacy getActiveShift (which accepts any driverId without a
 * credential), this callable enforces that the query is restricted to the
 * authenticated driver — preventing cross-driver shift data leakage.
 */
export const getActiveShiftWithSession = onMeasuredCall('getActiveShiftWithSession', async (data, context, perf) => {
  try {
    const validated = GetActiveShiftWithSessionSchema.parse(data);
    const { driverId: reqDriverId, sessionToken } = validated;

    // Session validation — the query is scoped to this authoritative driverId only.
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await perf.phase('driverPointerRead', () => driverRef.get());
    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    // A. Fast path: additive activeShiftId pointer on new-style driver documents.
    const activeShiftId = driverDoc.data()?.activeShiftId;
    if (activeShiftId) {
      const shiftDoc = await perf.phase('activeShiftRead', () => db.collection('shifts').doc(activeShiftId).get());
      if (shiftDoc.exists && shiftDoc.data()?.status === 'Active') {
        return { success: true, hasActiveShift: true, shift: { id: shiftDoc.id, ...shiftDoc.data() } };
      }
      // Stale pointer — fall through to legacy scan.
    }

    // B. Legacy scan: query by driverId, filter Active in-memory. Single-field
    // query avoids the need for a composite index. Scoped to this driver only.
    const snapshot = await perf.phase('legacyShiftQuery', () => db.collection('shifts').where('driverId', '==', driverId).get());
    let active: any = null;
    snapshot.docs.forEach(d => {
      const sd = d.data();
      if (!active && sd && sd.status === 'Active') {
        active = { id: d.id, ...sd };
      }
    });

    if (active) {
      return { success: true, hasActiveShift: true, shift: active };
    }

    return { success: true, hasActiveShift: false, shift: null };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in getActiveShiftWithSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get active shift: ' + error.message);
  }
});

/**
 * Resolve the complete driver-facing operational state in one session-authenticated read.
 * This replaces the mounted client chain of active-shift, assignment, vehicle, and
 * inspection callables while retaining the individual callables for compatibility.
 */
export const getDriverOperationalState = onMeasuredCall('getDriverOperationalState', async (data, context, perf) => {
  try {
    const validated = RequireSessionSchema.parse(data);
    const { driverId, activeShiftId } = await perf.phase(
      'sessionValidation',
      () => requireDriverSession(validated, perf),
    );
    return await resolveDriverOperationalState(driverId, activeShiftId, perf);
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in getDriverOperationalState:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get driver operational state.');
  }
});

/**
 * Compute the authenticated driver's own incident/risk stats summary (WP8H).
 * Driver-scoped reads only: driverFines, vehicleDamages, and shifts filtered by driverId —
 * never a full-collection scan of other drivers' records.
 *
 * The risk-scoring formula is not invented here: it matches the pre-migration
 * getDriverIncidentSummary logic in legacy/services/mockApi.ts (fines +10 each, unpaid
 * fines +5 each, damage severity weighted Critical/Major/Moderate/Minor = 25/15/8/3,
 * capped at 100; needsTraining when riskScore >= 30, or 2+ unpaid fines, or any
 * Major/Critical damage).
 */
export const getDriverStatsWithSession = onMeasuredCall('getDriverStatsWithSession', async (data, context, perf) => {
  try {
    const validated = RequireSessionSchema.parse(data);
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession(validated, perf));

    const [finesSnapshot, damagesSnapshot, shiftsSnapshot] = await perf.phase('driverStatsReads', () => Promise.all([
      db.collection('driverFines').where('driverId', '==', driverId).get(),
      db.collection('vehicleDamages').where('driverId', '==', driverId).get(),
      db.collection('shifts').where('driverId', '==', driverId).get(),
    ]));

    const stats = perf.phaseSync('driverStatsAggregation', () => {
      const fines = finesSnapshot.docs.map(d => d.data());
      const damages = damagesSnapshot.docs.map(d => d.data());

      let totalKmDriven = 0;
      shiftsSnapshot.docs.forEach(doc => {
        const shift = doc.data();
        if (shift.status !== 'Completed') return;
        const start = shift.startOdometer;
        const end = shift.endOdometer;
        if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) return;
        const distance = end - start;
        if (distance > 0) totalKmDriven += distance;
      });

      const totalFines = fines.length;
      const totalFineAmount = fines.reduce((sum, f) => sum + (Number.isFinite(f.amount) ? f.amount : 0), 0);
      const unpaidFinesList = fines.filter(f => !f.isPaid);
      const unpaidFines = unpaidFinesList.length;
      const unpaidAmount = unpaidFinesList.reduce((sum, f) => sum + (Number.isFinite(f.amount) ? f.amount : 0), 0);

      const totalDamages = damages.length;
      const totalDamagesCost = damages.reduce((sum, d) => {
        const cost = Number.isFinite(d.actualCost) ? d.actualCost : (Number.isFinite(d.estimatedCost) ? d.estimatedCost : 0);
        return sum + cost;
      }, 0);

      const allIncidentDates = [
        ...fines.map(f => f.date),
        ...damages.map(d => d.date),
      ].filter((d): d is string => typeof d === 'string').sort();
      const lastIncidentDate = allIncidentDates.length > 0 ? allIncidentDates[allIncidentDates.length - 1] : null;

      let riskScore = 0;
      riskScore += totalFines * 10;
      riskScore += unpaidFines * 5;
      riskScore += damages.filter(d => d.severity === 'Critical').length * 25;
      riskScore += damages.filter(d => d.severity === 'Major').length * 15;
      riskScore += damages.filter(d => d.severity === 'Moderate').length * 8;
      riskScore += damages.filter(d => d.severity === 'Minor').length * 3;
      riskScore = Math.min(100, riskScore);

      const needsTraining = riskScore >= 30
        || unpaidFines >= 2
        || damages.filter(d => d.severity === 'Major' || d.severity === 'Critical').length > 0;

      return {
        totalKmDriven,
        totalFines,
        totalFineAmount,
        unpaidFines,
        unpaidAmount,
        totalDamages,
        totalDamagesCost,
        lastIncidentDate,
        riskScore,
        needsTraining,
      };
    });

    return { success: true, stats };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in getDriverStatsWithSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get driver stats.');
  }
});

const GetLeaderboardSchema = z.object({
  driverId: z.string().min(1).optional(),
  sessionToken: z.string().min(1).optional(),
});

/**
 * Fleet-wide driver leaderboard ranked by total distance driven. Accepts EITHER an
 * authenticated driver session ({driverId, sessionToken}) OR an authenticated Firebase
 * Auth admin (no params) — matching the two current frontend call shapes in
 * firebaseApi.getLeaderboard(). Never reachable by an unauthenticated caller.
 *
 * Scope note: only totalKmDriven is computed, matching the actual production behavior of
 * the pre-migration client-side getLeaderboard() (see git history of firebaseApi.ts prior
 * to the secure-callable migration). averageKmL/averageKmPerKwh and the ICE/EV/efficiency
 * breakdown fields on LeaderboardEntry are intentionally left unset — the elaborate scoring
 * formula in legacy/services/mockApi.ts was mock-only scaffolding that never shipped, and
 * the current Leaderboard.tsx UI does not render the ICE/EV/efficiency fields at all.
 */
export const getLeaderboard = onMeasuredCall('getLeaderboard', async (data, context, perf) => {
  try {
    const validated = GetLeaderboardSchema.parse(data);

    if (validated.driverId || validated.sessionToken) {
      if (!validated.driverId || !validated.sessionToken) {
        throw new functions.https.HttpsError('invalid-argument', 'driverId and sessionToken must be provided together');
      }
      await perf.phase(
        'sessionValidation',
        () => requireDriverSession({ driverId: validated.driverId!, sessionToken: validated.sessionToken! }, perf),
      );
    } else {
      await perf.phase('adminValidation', () => requireAdmin(context));
    }

    const [usersSnapshot, shiftsSnapshot] = await perf.phase('leaderboardReads', () => Promise.all([
      db.collection('users').where('role', '==', 'driver').get(),
      db.collection('shifts').where('status', '==', 'Completed').get(),
    ]));

    const leaderboard = perf.phaseSync('leaderboardAggregation', () => {
      // Test-data isolation: build the set of test driverIds first (covers both drivers
      // explicitly marked isTestData and, via the shift-level check below, any historical
      // shift that predates isTestData stamping but still references a test driver).
      const testDriverIds = new Set(
        usersSnapshot.docs.filter((doc) => doc.data().isTestData === true).map((doc) => doc.id),
      );

      const totalKmByDriver = new Map<string, number>();
      shiftsSnapshot.docs.forEach((doc) => {
        const shift = doc.data();
        if (shift.isTestData === true || testDriverIds.has(shift.driverId)) return;
        const start = shift.startOdometer;
        const end = shift.endOdometer;
        if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) return;
        const km = end - start;
        if (km <= 0) return;
        totalKmByDriver.set(shift.driverId, (totalKmByDriver.get(shift.driverId) || 0) + km);
      });

      return usersSnapshot.docs
        .filter((doc) => doc.data().isTestData !== true)
        .map((doc) => ({
          driver: stripToDriverSafe(doc.data(), doc.id),
          totalKmDriven: totalKmByDriver.get(doc.id) || 0,
        }))
        .sort((a, b) => b.totalKmDriven - a.totalKmDriven);
    });

    return { success: true, leaderboard };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in getLeaderboard:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get leaderboard.');
  }
});

// =============================================================================
// VEHICLE ASSIGNMENT CALLABLES (WP7B)
// =============================================================================

/**
 * Start a VehicleAssignment under an existing Active shift. Session-authenticated;
 * no PIN re-entry. Enforces one ACTIVE assignment per shift and per vehicle.
 */
export const startVehicleAssignment = onMeasuredCall('startVehicleAssignment', async (data, context, perf) => {
  try {
    const validated = StartVehicleAssignmentSchema.parse(data);
    const {
      driverId: reqDriverId,
      sessionToken,
      shiftId,
      vehicleId,
      startOdometer,
      startChargePercent,
      startPredictedRangeKm,
      transitionReason = 'SHIFT_START',
    } = validated;

    const { driverId, isTestData: driverIsTestData } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    const [shiftDoc, vehicleDoc, driverDoc] = await perf.phase('initialRecordReads', () => Promise.all([
      db.collection('shifts').doc(shiftId).get(),
      db.collection('vehicles').doc(vehicleId).get(),
      db.collection('users').doc(driverId).get(),
    ]));

    if (!shiftDoc.exists) throw new functions.https.HttpsError('not-found', 'Shift not found');
    const shiftData = shiftDoc.data()!;

    if (shiftData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only use your own shift.');
    }
    if (shiftData.status !== 'Active') {
      throw new functions.https.HttpsError('failed-precondition', 'The shift is not active.');
    }

    if (!vehicleDoc.exists) throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    const vehicleData = vehicleDoc.data()!;
    if (vehicleData.status !== 'Active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Vehicle is ' + vehicleData.status + ' and cannot be used.'
      );
    }
    assertPredictedRangeMatchesVehicle(vehicleData.vehicleType, startPredictedRangeKm, 'startPredictedRangeKm');

    // Allowed-vehicles check — same restriction as startShift/startShiftWithPin.
    // allowedVehicles absent → no restriction. Present → driver may only use listed vehicles.
    if (driverDoc.exists) {
      const driverData = driverDoc.data()!;
      if (driverData.allowedVehicles && Array.isArray(driverData.allowedVehicles)) {
        if (!driverData.allowedVehicles.includes(vehicleId)) {
          throw new functions.https.HttpsError('permission-denied', 'You are not authorized to use this vehicle.');
        }
      }
    }

    const assignmentRef = db.collection('vehicleAssignments').doc();
    const assignmentId = assignmentRef.id;

    await perf.phase('transaction', () => db.runTransaction(async (transaction) => {
      const [txShiftDoc, txVehicleDoc, txDriverDoc] = await Promise.all([
        transaction.get(shiftDoc.ref),
        transaction.get(vehicleDoc.ref),
        transaction.get(driverDoc.ref),
      ]);

      // A. Shift remains Active.
      if (txShiftDoc.data()?.status !== 'Active') {
        throw new functions.https.HttpsError('failed-precondition', 'The shift is no longer active.');
      }
      // B. Shift still belongs to this driver.
      if (txShiftDoc.data()?.driverId !== driverId) {
        throw new functions.https.HttpsError('permission-denied', 'Shift ownership changed.');
      }
      // C. Shift has no other ACTIVE assignment.
      if (txShiftDoc.data()?.activeAssignmentId) {
        throw new functions.https.HttpsError('failed-precondition', 'The shift already has an active vehicle assignment.');
      }
      // D. Vehicle has no other ACTIVE assignment.
      if (txVehicleDoc.data()?.activeAssignmentId) {
        throw new functions.https.HttpsError('failed-precondition', 'This vehicle already has an active assignment.');
      }
      assertPredictedRangeMatchesVehicle(
        txVehicleDoc.data()?.vehicleType,
        startPredictedRangeKm,
        'startPredictedRangeKm'
      );
      // E/F. Vehicle activeShiftId must be absent OR equal to this same shift (legacy bridge).
      const vehicleActiveShiftId = txVehicleDoc.data()?.activeShiftId;
      if (vehicleActiveShiftId && vehicleActiveShiftId !== shiftId) {
        throw new functions.https.HttpsError('failed-precondition', 'This vehicle belongs to another active shift.');
      }
      // G. Re-verify allowedVehicles from authoritative driver doc inside the transaction.
      const txDriverData = txDriverDoc.data();
      if (txDriverData?.allowedVehicles && Array.isArray(txDriverData.allowedVehicles)) {
        if (!txDriverData.allowedVehicles.includes(vehicleId)) {
          throw new functions.https.HttpsError('permission-denied', 'You are not authorized to use this vehicle.');
        }
      }

      // Odometer continuity & discrepancy check
      const latestStoredOdometer = txVehicleDoc.data()?.currentOdometer;
      if (typeof startOdometer === 'number' && typeof latestStoredOdometer === 'number') {
        if (startOdometer < latestStoredOdometer) {
          throw new functions.https.HttpsError(
            'invalid-argument',
            `Start odometer (${startOdometer} km) cannot be lower than the vehicle's last recorded odometer (${latestStoredOdometer} km)`
          );
        }
        if (startOdometer > latestStoredOdometer) {
          const unaccountedKm = startOdometer - latestStoredOdometer;
          const discrepancyRef = db.collection('odometerDiscrepancies').doc();
          transaction.set(discrepancyRef, {
            orgId: DEFAULT_ORG_ID,
            vehicleId,
            driverId,
            shiftId,
            assignmentId,
            expectedOdometer: latestStoredOdometer,
            actualPickupOdometer: startOdometer,
            unaccountedKm,
            detectedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'OPEN',
            type: 'UNACCOUNTED_MILEAGE',
            // Test-data isolation: inherited from either party (see startVehicleAssignment's assignmentData).
            isTestData: driverIsTestData || vehicleData.isTestData === true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      const assignmentData: any = {
        orgId: DEFAULT_ORG_ID,
        driverId,
        shiftId,
        vehicleId,
        status: 'ACTIVE',
        // Test-data isolation: inherited from either party (see startShift).
        isTestData: driverIsTestData || vehicleData.isTestData === true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        endedAt: null,
        startOdometer: startOdometer ?? null,
        endOdometer: null,
        startChargePercent: startChargePercent ?? null,
        endChargePercent: null,
        startPredictedRangeKm: startPredictedRangeKm ?? null,
        endPredictedRangeKm: null,
        transitionReason,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      transaction.set(assignmentRef, assignmentData);

      transaction.update(shiftDoc.ref, {
        activeAssignmentId: assignmentId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const vehicleUpdate: any = {
        activeAssignmentId: assignmentId,
        activeShiftId: shiftId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof startOdometer === 'number') {
        vehicleUpdate.currentOdometer = startOdometer;
      }
      transaction.update(vehicleDoc.ref, vehicleUpdate);
    }));

    return { success: true, assignmentId, message: 'Vehicle assignment started' };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', '));
    }
    console.error('Error in startVehicleAssignment:', error);
    throw new functions.https.HttpsError('internal', 'Failed to start vehicle assignment: ' + error.message);
  }
});

/**
 * End a VehicleAssignment. Session-authenticated. Clears the shift/vehicle pointers only
 * when they still point to this assignment/shift. Idempotent on COMPLETED.
 */
export const endVehicleAssignment = onMeasuredCall('endVehicleAssignment', async (data, context, perf) => {
  try {
    const validated = EndVehicleAssignmentSchema.parse(data);
    const {
      driverId: reqDriverId,
      sessionToken,
      assignmentId,
      endOdometer,
      endChargePercent,
      endPredictedRangeKm,
      leftForCharging,
      chargingLocationId,
      publicChargeReference,
      publicChargeCost,
      chargingNotes,
      transitionReason,
    } = validated;

    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    const assignmentRef = db.collection('vehicleAssignments').doc(assignmentId);
    const assignmentDoc = await perf.phase('assignmentRead', () => assignmentRef.get());
    if (!assignmentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle assignment not found');
    }
    const assignmentData = assignmentDoc.data()!;

    if (assignmentData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only end your own vehicle assignment.');
    }

    const shiftId = assignmentData.shiftId;
    const vehicleId = assignmentData.vehicleId;

    const [shiftDoc, vehicleDoc] = await perf.phase('shiftAndVehicleReads', () => Promise.all([
      db.collection('shifts').doc(shiftId).get(),
      db.collection('vehicles').doc(vehicleId).get(),
    ]));

    if (!shiftDoc.exists) throw new functions.https.HttpsError('not-found', 'Shift not found');
    if (shiftDoc.data()!.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'Shift does not belong to this driver.');
    }
    if (!vehicleDoc.exists) throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    assertPredictedRangeMatchesVehicle(
      vehicleDoc.data()!.vehicleType,
      endPredictedRangeKm,
      'endPredictedRangeKm'
    );
    assertChargingReturnIntent(
      vehicleDoc.data()!.vehicleType,
      leftForCharging,
      chargingLocationId,
      publicChargeReference,
      publicChargeCost,
      chargingNotes
    );
    if (leftForCharging && (endOdometer === undefined || endChargePercent === undefined || endPredictedRangeKm === undefined)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'An EV returned for charging requires return odometer, charge percent, and predicted range.'
      );
    }
    const chargingLocationRef = leftForCharging && chargingLocationId
      ? db.collection('chargingLocations').doc(chargingLocationId)
      : null;
    const chargingEventRef = leftForCharging ? db.collection('chargingEvents').doc() : null;

    // WP7D2A: BOTH the PICKUP and RETURN inspections must be COMPLETED before the assignment
    // may be closed. CANCELLED has been removed from the driver-session schema, so ordinary
    // drivers cannot bypass this guard; future admin cancellation is a separate recovery callable.
    // Deterministic IDs (${assignmentId}_PICKUP / _RETURN) guarantee the inspection's
    // assignmentId + boundaryType by construction; we additionally verify the server-written
    // driverId/shiftId/vehicleId match the assignment being closed.
    const pickupInspectionRef = db.collection('vehicleInspections').doc(inspectionDocId(assignmentId, 'PICKUP'));
    const pickupInspectionDoc = await perf.phase('inspectionValidationReads', () => pickupInspectionRef.get());
    if (!pickupInspectionDoc.exists || pickupInspectionDoc.data()!.status !== 'COMPLETED') {
      throw new functions.https.HttpsError('failed-precondition', 'A completed pickup inspection is required before returning the vehicle.');
    }
    const pickupData = pickupInspectionDoc.data()!;
    if (pickupData.driverId !== driverId || pickupData.shiftId !== assignmentData.shiftId || pickupData.vehicleId !== assignmentData.vehicleId) {
      throw new functions.https.HttpsError('failed-precondition', 'The pickup inspection does not match this assignment.');
    }

    const returnInspectionRef = db.collection('vehicleInspections').doc(inspectionDocId(assignmentId, 'RETURN'));
    const returnInspectionDoc = await perf.phase('inspectionValidationReads', () => returnInspectionRef.get());
    if (!returnInspectionDoc.exists || returnInspectionDoc.data()!.status !== 'COMPLETED') {
      throw new functions.https.HttpsError('failed-precondition', 'A completed return inspection is required before returning the vehicle.');
    }
    const returnData = returnInspectionDoc.data()!;
    if (returnData.driverId !== driverId || returnData.shiftId !== assignmentData.shiftId || returnData.vehicleId !== assignmentData.vehicleId) {
      throw new functions.https.HttpsError('failed-precondition', 'The return inspection does not match this assignment.');
    }

    if (assignmentData.startOdometer != null && endOdometer !== undefined && endOdometer < assignmentData.startOdometer) {
      throw new functions.https.HttpsError('invalid-argument', 'End odometer must be greater than or equal to start odometer');
    }

    await perf.phase('transaction', () => db.runTransaction(async (transaction) => {
      // Every conditional read is included before the transaction issues any write.
      const [txAssignmentDoc, txShiftDoc, txVehicleDoc, txChargingLocationDoc] = await Promise.all([
        transaction.get(assignmentRef),
        transaction.get(shiftDoc.ref),
        transaction.get(vehicleDoc.ref),
        chargingLocationRef ? transaction.get(chargingLocationRef) : Promise.resolve(null),
      ]);

      const txAssignment = txAssignmentDoc.data()!;

      // Idempotency: already completed -> no-op (no duplicate pointer mutations).
      if (txAssignment.status === 'COMPLETED') {
        return;
      }
      if (txAssignment.status === 'CANCELLED') {
        throw new functions.https.HttpsError('failed-precondition', 'This assignment was already cancelled.');
      }
      assertPredictedRangeMatchesVehicle(
        txVehicleDoc.data()?.vehicleType,
        endPredictedRangeKm,
        'endPredictedRangeKm'
      );
      assertChargingReturnIntent(
        txVehicleDoc.data()?.vehicleType,
        leftForCharging,
        chargingLocationId,
        publicChargeReference,
        publicChargeCost,
        chargingNotes
      );

      let locationSnapshot: Record<string, any> | null = null;
      if (leftForCharging) {
        if (!txChargingLocationDoc?.exists) {
          throw new functions.https.HttpsError('not-found', 'Charging location not found.');
        }
        const locationData = txChargingLocationDoc.data()!;
        if (locationData.active !== true) {
          throw new functions.https.HttpsError('failed-precondition', 'Charging location is inactive.');
        }
        const assignmentOrgId = txAssignment.orgId || DEFAULT_ORG_ID;
        if (locationData.orgId && locationData.orgId !== assignmentOrgId) {
          throw new functions.https.HttpsError('permission-denied', 'Charging location does not belong to this organisation.');
        }
        locationSnapshot = chargingLocationSnapshot(locationData);
        if (locationSnapshot.type !== 'PUBLIC_THIRD_PARTY'
          && (publicChargeReference !== undefined || publicChargeCost !== undefined)) {
          throw new functions.https.HttpsError('invalid-argument', 'Public charge details require a public charging location.');
        }
        if (txVehicleDoc.data()?.openChargingEventId) {
          throw new functions.https.HttpsError('failed-precondition', 'This vehicle already has an open charging event.');
        }
      }

      // Ensure return odometer does not regress canonical vehicle odometer
      const currentVehicleOdo = txVehicleDoc.data()?.currentOdometer;
      if (typeof endOdometer === 'number' && typeof currentVehicleOdo === 'number' && endOdometer < currentVehicleOdo) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          `End odometer (${endOdometer} km) cannot be lower than the vehicle's current recorded odometer (${currentVehicleOdo} km)`
        );
      }

      const assignmentUpdate: any = {
        status: 'COMPLETED',
        endedAt: admin.firestore.FieldValue.serverTimestamp(),
        transitionReason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (endOdometer !== undefined) assignmentUpdate.endOdometer = endOdometer;
      if (endChargePercent !== undefined) assignmentUpdate.endChargePercent = endChargePercent;
      if (endPredictedRangeKm !== undefined) assignmentUpdate.endPredictedRangeKm = endPredictedRangeKm;
      transaction.update(assignmentRef, assignmentUpdate);

      if (leftForCharging && chargingEventRef && locationSnapshot) {
        // The existing location document may change later; this preserves the handover facts.
        const financialStatus = locationSnapshot.type === 'PUBLIC_THIRD_PARTY' && publicChargeCost !== undefined
          ? 'KNOWN'
          : 'PENDING';
        transaction.set(chargingEventRef, {
          id: chargingEventRef.id,
          orgId: txAssignment.orgId || DEFAULT_ORG_ID,
          vehicleId: txAssignment.vehicleId,
          returnDriverId: txAssignment.driverId,
          returnShiftId: txAssignment.shiftId,
          returnAssignmentId: assignmentId,
          returnedAt: admin.firestore.FieldValue.serverTimestamp(),
          returnOdometer: endOdometer,
          returnChargePercent: endChargePercent,
          returnPredictedRangeKm: endPredictedRangeKm,
          chargingLocationId,
          locationSnapshot,
          lifecycleStatus: 'OPEN',
          chargingOutcome: null,
          financialStatus,
          publicChargeReference: publicChargeReference ?? null,
          publicChargeCost: publicChargeCost ?? null,
          finalCost: publicChargeCost ?? null,
          notes: chargingNotes ?? null,
          pickupDriverId: null,
          pickupShiftId: null,
          pickupAssignmentId: null,
          closedAt: null,
          reconciledAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Clear shift pointer only if it still points to this assignment.
      if (txShiftDoc.data()?.activeAssignmentId === assignmentId) {
        transaction.update(shiftDoc.ref, { activeAssignmentId: admin.firestore.FieldValue.delete() });
      }

      // Update vehicle: update currentOdometer and clear assignment/shift pointers
      const vehicleUpdate: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof endOdometer === 'number') {
        vehicleUpdate.currentOdometer = endOdometer;
      }
      if (txVehicleDoc.data()?.activeAssignmentId === assignmentId) {
        vehicleUpdate.activeAssignmentId = admin.firestore.FieldValue.delete();
      }
      if (txVehicleDoc.data()?.activeShiftId === shiftId) {
        vehicleUpdate.activeShiftId = admin.firestore.FieldValue.delete();
      }
      if (leftForCharging && chargingEventRef) {
        vehicleUpdate.openChargingEventId = chargingEventRef.id;
      }
      transaction.update(vehicleDoc.ref, vehicleUpdate);
    }));

    return { success: true, message: 'Vehicle assignment ended' };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', '));
    }
    console.error('Error in endVehicleAssignment:', error);
    throw new functions.https.HttpsError('internal', 'Failed to end vehicle assignment: ' + error.message);
  }
});

/**
 * Get the driver's current ACTIVE VehicleAssignment (O(1) via shift.activeAssignmentId).
 * Session-authenticated. Returns null for legacy shifts that have no assignment.
 */
export const getActiveVehicleAssignment = onMeasuredCall('getActiveVehicleAssignment', async (data, context, perf) => {
  try {
    const validated = GetActiveVehicleAssignmentSchema.parse(data);
    const { driverId: reqDriverId, sessionToken, shiftId: reqShiftId } = validated;

    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    let shiftId: string | undefined = reqShiftId;
    let shiftData: any = null;

    if (shiftId) {
      const activeShiftIdForRead = shiftId;
      const shiftDoc = await perf.phase('shiftRead', () => db.collection('shifts').doc(activeShiftIdForRead).get());
      if (!shiftDoc.exists) throw new functions.https.HttpsError('not-found', 'Shift not found');
      const sd = shiftDoc.data()!;
      if (sd.driverId !== driverId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only view your own shift.');
      }
      if (sd.status !== 'Active') {
        throw new functions.https.HttpsError('failed-precondition', 'The shift is not active.');
      }
      shiftData = sd;
    } else {
      const driverDoc = await perf.phase('driverPointerRead', () => db.collection('users').doc(driverId).get());
      const activeShiftId = driverDoc.exists ? driverDoc.data()?.activeShiftId : null;
      if (activeShiftId) {
        const shiftDoc = await perf.phase('shiftRead', () => db.collection('shifts').doc(activeShiftId).get());
        if (shiftDoc.exists && shiftDoc.data()?.status === 'Active') {
          shiftId = activeShiftId;
          shiftData = shiftDoc.data()!;
        }
      }
      if (!shiftId) {
        const snapshot = await perf.phase('legacyShiftQuery', () => db.collection('shifts').where('driverId', '==', driverId).get());
        for (const d of snapshot.docs) {
          if (d.data()?.status === 'Active') {
            shiftId = d.id;
            shiftData = d.data()!;
            break;
          }
        }
      }
    }

    if (!shiftId || !shiftData) {
      return { success: true, hasActiveAssignment: false, assignment: null };
    }

    const activeAssignmentId = shiftData.activeAssignmentId;
    if (!activeAssignmentId) {
      return { success: true, hasActiveAssignment: false, assignment: null };
    }

    const assignmentDoc = await perf.phase('assignmentRead', () => db.collection('vehicleAssignments').doc(activeAssignmentId).get());
    // shift.activeAssignmentId is present — the pointed document MUST be valid and consistent.
    // Returning null here could allow a second assignment to start while a stale pointer remains.
    if (!assignmentDoc.exists) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Your assignment record is inconsistent. Please contact support.'
      );
    }
    const assignmentData = assignmentDoc.data()!;
    if (
      assignmentData.status !== 'ACTIVE' ||
      assignmentData.shiftId !== shiftId ||
      assignmentData.driverId !== driverId
    ) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Your assignment record is inconsistent. Please contact support.'
      );
    }

    return { success: true, hasActiveAssignment: true, assignment: { id: assignmentDoc.id, ...assignmentData } };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => e.path.join('.') + ': ' + e.message).join(', '));
    }
    console.error('Error in getActiveVehicleAssignment:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get active vehicle assignment: ' + error.message);
  }
});

// =============================================================================
// VEHICLE INSPECTION CALLABLES (WP7D1)
// =============================================================================

/**
 * Deterministic inspection document ID: one PICKUP and one RETURN per assignment.
 * Idempotent, retry-safe, O(1) reads — no index required.
 */
function inspectionDocId(assignmentId: string, boundaryType: 'PICKUP' | 'RETURN'): string {
  return `${assignmentId}_${boundaryType}`;
}

/** ROUTINE inspection retention: 7 days. EVIDENCE inspections never auto-expire. */
const ROUTINE_INSPECTION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Resolve only the explicitly configured Johannesburg production Storage bucket. */
function inspectionStorageBucket() {
  const bucket = admin.storage(app).bucket(STORAGE_BUCKET);
  if (bucket.name !== STORAGE_BUCKET) {
    throw new functions.https.HttpsError('internal', 'Storage bucket is not configured.');
  }
  return bucket;
}

/** Accepted inspection photo MIME types (rejected content is never stored). */
const INSPECTION_PHOTO_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Maximum decoded inspection photo size (bytes) after client-side compression. */
const INSPECTION_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Create a PENDING inspection for an ACTIVE assignment (idempotent).
 * The deterministic ID guarantees at most one PICKUP and one RETURN inspection per assignment.
 */
export const createVehicleInspection = onMeasuredCall('createVehicleInspection', async (data, context, perf) => {
  try {
    const validated = CreateVehicleInspectionSchema.parse(data);
    const { driverId: reqDriverId, sessionToken, assignmentId, boundaryType, returnIntent } = validated;
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    // RETURN inspections require an explicit, server-validated return intent.
    if (boundaryType === 'RETURN' && !returnIntent) {
      throw new functions.https.HttpsError('invalid-argument', 'A return intent (VEHICLE_SWAP or SHIFT_END) is required for a RETURN inspection.');
    }

    const assignmentRef = db.collection('vehicleAssignments').doc(assignmentId);
    const assignmentDoc = await perf.phase('assignmentRead', () => assignmentRef.get());
    if (!assignmentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle assignment not found');
    }
    const assignmentData = assignmentDoc.data()!;
    if (assignmentData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only inspect your own vehicle assignment.');
    }
    if (assignmentData.status !== 'ACTIVE') {
      throw new functions.https.HttpsError('failed-precondition', 'The assignment is no longer active.');
    }

    const inspectionId = inspectionDocId(assignmentId, boundaryType);
    const inspectionRef = db.collection('vehicleInspections').doc(inspectionId);
    const existing = await perf.phase('inspectionRead', () => inspectionRef.get());
    if (existing.exists) {
      // Idempotent — never create a duplicate boundary inspection.
      return { success: true, inspection: { id: inspectionId, ...existing.data() } };
    }

    const inspectionData = {
      orgId: assignmentData.orgId || DEFAULT_ORG_ID,
      assignmentId,
      shiftId: assignmentData.shiftId,
      driverId,
      vehicleId: assignmentData.vehicleId,
      boundaryType,
      // PICKUP -> null; RETURN -> the validated intent (first write wins; never overwritten).
      returnIntent: boundaryType === 'PICKUP' ? null : returnIntent,
      status: 'PENDING',
      // Test-data isolation: inherited directly from the parent assignment (which already
      // combined driver/vehicle isTestData at startVehicleAssignment time).
      isTestData: assignmentData.isTestData === true,
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await perf.phase('inspectionWrite', () => inspectionRef.set(inspectionData));

    return { success: true, inspection: { id: inspectionId, ...inspectionData } };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in createVehicleInspection:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create vehicle inspection: ' + error.message);
  }
});

/**
 * Upload one inspection photo (EXTERIOR or INTERIOR) to Cloud Storage (WP7D2).
 * Server-mediated: the client sends compressed image data; the server validates the
 * session/assignment/inspection, derives an authoritative path, stores the object, and
 * persists the object path + metadata. The client NEVER chooses a Storage path.
 */
export const uploadInspectionPhoto = onMeasuredCall('uploadInspectionPhoto', async (data, context, perf) => {
  try {
    const validated = UploadInspectionPhotoSchema.parse(data);
    const {
      driverId: reqDriverId,
      sessionToken,
      assignmentId,
      boundaryType,
      photoRole,
      imageDataUrl,
    } = validated;
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    const assignmentRef = db.collection('vehicleAssignments').doc(assignmentId);
    const assignmentDoc = await perf.phase('assignmentRead', () => assignmentRef.get());
    if (!assignmentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle assignment not found');
    }
    const assignmentData = assignmentDoc.data()!;
    if (assignmentData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only upload photos for your own assignment.');
    }
    if (assignmentData.status !== 'ACTIVE') {
      throw new functions.https.HttpsError('failed-precondition', 'The assignment is no longer active.');
    }

    const inspectionId = inspectionDocId(assignmentId, boundaryType);
    const inspectionRef = db.collection('vehicleInspections').doc(inspectionId);
    const inspectionDoc = await perf.phase('inspectionRead', () => inspectionRef.get());
    if (!inspectionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle inspection not found');
    }
    const inspectionData = inspectionDoc.data()!;
    if (inspectionData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only upload photos for your own inspection.');
    }
    if (inspectionData.boundaryType !== boundaryType) {
      throw new functions.https.HttpsError('invalid-argument', 'Photo boundary does not match the inspection.');
    }
    if (inspectionData.status !== 'PENDING') {
      throw new functions.https.HttpsError('failed-precondition', 'The inspection is already completed.');
    }

    // Validate the image content (MIME + size), never the filename.
    const match = imageDataUrl.match(/^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported image format. Use JPEG, PNG, or WebP.');
    }
    const mimeType = match[1];
    const ext = INSPECTION_PHOTO_MIME_TYPES[mimeType];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > INSPECTION_PHOTO_MAX_BYTES) {
      throw new functions.https.HttpsError('invalid-argument', 'Image must be between 1 byte and 5 MB.');
    }

    // Server-derived UNIQUE PERMANENT object path (no shared canonical role path; no
    // temp/promote). Every upload writes a fresh distinct object, so a late/in-flight upload
    // can NEVER overwrite bytes already referenced by a COMPLETED inspection.
    const orgId = assignmentData.orgId || DEFAULT_ORG_ID;
    const roleSegment = photoRole.toLowerCase();
    const objectPath = `vehicle-inspections/${orgId}/${assignmentId}/${boundaryType}/${roleSegment}-${crypto.randomUUID()}.${ext}`;

    const bucket = inspectionStorageBucket();

    // Save bytes directly to the unique permanent path.
    await perf.phase('storageUpload', () => bucket.file(objectPath).save(buffer, { contentType: mimeType, resumable: false }));

    // Re-read the inspection before touching Firestore metadata. The unique path guarantees
    // the object write could not have clobbered completed evidence even if completion raced it.
    const recheckDoc = await perf.phase('inspectionRecheck', () => inspectionRef.get());
    if (!recheckDoc.exists) {
      await bucket.file(objectPath).delete().catch(() => {});
      throw new functions.https.HttpsError('not-found', 'Vehicle inspection not found');
    }
    const recheck = recheckDoc.data()!;
    if (recheck.driverId !== driverId || recheck.boundaryType !== boundaryType) {
      await bucket.file(objectPath).delete().catch(() => {});
      throw new functions.https.HttpsError('failed-precondition', 'The inspection changed while the photo was uploading.');
    }
    if (recheck.status !== 'PENDING') {
      await bucket.file(objectPath).delete().catch(() => {});
      throw new functions.https.HttpsError('failed-precondition', 'This inspection was completed while the photo was uploading.');
    }

    // Persist authoritative metadata (only while still PENDING).
    const update: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (photoRole === 'EXTERIOR') {
      update.exteriorPhotoPath = objectPath;
      update.exteriorPhotoSize = buffer.length;
      update.exteriorPhotoContentType = mimeType;
    } else {
      update.interiorPhotoPath = objectPath;
      update.interiorPhotoSize = buffer.length;
      update.interiorPhotoContentType = mimeType;
    }
    await perf.phase('inspectionMetadataWrite', () => inspectionRef.update(update));

    return { success: true, photoRole, photoPath: objectPath };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in uploadInspectionPhoto:', error);
    throw new functions.https.HttpsError('internal', 'Failed to upload inspection photo: ' + error.message);
  }
});

/**
 * Upload one defect-report photo to Cloud Storage. Server-mediated, mirroring
 * uploadInspectionPhoto: the client sends compressed image data, the server validates the
 * session + target vehicle, derives an authoritative unique path, stores the object, and
 * returns the path. The client never chooses a Storage path and never writes image bytes
 * into Firestore. Call this once per photo BEFORE reportDefectWithSession, then pass the
 * returned paths as reportDefectWithSession's `photos`.
 */
export const uploadDefectPhoto = onMeasuredCall('uploadDefectPhoto', async (data, context, perf) => {
  try {
    const validated = UploadDefectPhotoSchema.parse(data);
    const { driverId: reqDriverId, sessionToken, vehicleId, imageDataUrl } = validated;
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    // Vehicle must exist (matches reportDefectWithSession's own precondition — no status
    // or assignment restriction; defects and their photos can be reported on any vehicle).
    const vehicleDoc = await perf.phase('vehicleRead', () => db.collection('vehicles').doc(vehicleId).get());
    if (!vehicleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    }
    const vehicleData = vehicleDoc.data()!;

    // Validate the image content (MIME + size), never the filename. Same allow-list and
    // size cap as inspection photos.
    const match = imageDataUrl.match(/^data:(image\/jpeg|image\/png|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      throw new functions.https.HttpsError('invalid-argument', 'Unsupported image format. Use JPEG, PNG, or WebP.');
    }
    const mimeType = match[1];
    const ext = INSPECTION_PHOTO_MIME_TYPES[mimeType];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > INSPECTION_PHOTO_MAX_BYTES) {
      throw new functions.https.HttpsError('invalid-argument', 'Image must be between 1 byte and 5 MB.');
    }

    // Server-derived UNIQUE object path, under its own top-level prefix so a defect photo can
    // never collide with (or overwrite) an inspection photo path.
    const orgId = vehicleData.orgId || DEFAULT_ORG_ID;
    const objectPath = `vehicle-defects/${orgId}/${vehicleId}/${driverId}-${crypto.randomUUID()}.${ext}`;

    const bucket = inspectionStorageBucket();
    await perf.phase('storageUpload', () => bucket.file(objectPath).save(buffer, { contentType: mimeType, resumable: false }));

    return { success: true, photoPath: objectPath };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in uploadDefectPhoto:', error);
    throw new functions.https.HttpsError('internal', 'Failed to upload defect photo: ' + error.message);
  }
});

/**
 * Complete a PENDING inspection with damage + photo capture markers.
 * retentionClass is determined SERVER-SIDE from hasDamage (never trusted from the client).
 * A COMPLETED inspection cannot be rewritten.
 */
export const completeVehicleInspection = onMeasuredCall('completeVehicleInspection', async (data, context, perf) => {
  try {
    const validated = CompleteVehicleInspectionSchema.parse(data);
    const {
      driverId: reqDriverId,
      sessionToken,
      inspectionId,
      hasDamage,
      damageDescription,
    } = validated;
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    const inspectionRef = db.collection('vehicleInspections').doc(inspectionId);
    const inspectionDoc = await perf.phase('inspectionRead', () => inspectionRef.get());
    if (!inspectionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle inspection not found');
    }
    const inspectionData = inspectionDoc.data()!;
    if (inspectionData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only complete your own inspection.');
    }
    if (inspectionData.status === 'COMPLETED') {
      // Idempotent + immutable: return the existing record without rewriting it.
      return { success: true, inspection: { id: inspectionId, ...inspectionData } };
    }

    // The inspection must still belong to an ACTIVE assignment owned by this driver.
    const assignmentRef = db.collection('vehicleAssignments').doc(inspectionData.assignmentId);
    const assignmentDoc = await perf.phase('assignmentRead', () => assignmentRef.get());
    if (!assignmentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle assignment not found');
    }
    const assignmentData = assignmentDoc.data()!;
    if (assignmentData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'Assignment does not belong to this driver.');
    }
    if (assignmentData.status !== 'ACTIVE') {
      throw new functions.https.HttpsError('failed-precondition', 'The assignment is no longer active.');
    }
    // Cross-check the inspection links to the assignment's shift/vehicle.
    if (inspectionData.shiftId !== assignmentData.shiftId || inspectionData.vehicleId !== assignmentData.vehicleId) {
      throw new functions.https.HttpsError('failed-precondition', 'Inspection does not match the assignment.');
    }

    // Damage description is required when damage is reported.
    if (hasDamage && (!damageDescription || damageDescription.trim() === '')) {
      throw new functions.https.HttpsError('invalid-argument', 'A damage description is required when damage is reported.');
    }

    // WP7D2: real photo evidence is required. Verify the Storage objects actually exist at
    // the authoritative paths before allowing the inspection to become COMPLETED.
    // The client cannot satisfy this with booleans — only server-verified objects count.
    const bucket = inspectionStorageBucket();
    const extPath: string | undefined = inspectionData.exteriorPhotoPath;
    const intPath: string | undefined = inspectionData.interiorPhotoPath;
    if (!extPath || !intPath) {
      throw new functions.https.HttpsError('failed-precondition', 'Both inspection photos must be uploaded before completing the inspection.');
    }
    const [extExists, intExists] = await perf.phase('storageVerification', () => Promise.all([
      bucket.file(extPath).exists(),
      bucket.file(intPath).exists(),
    ]));
    if (!extExists[0]) {
      throw new functions.https.HttpsError('failed-precondition', 'The exterior inspection photo is missing.');
    }
    if (!intExists[0]) {
      throw new functions.https.HttpsError('failed-precondition', 'The interior inspection photo is missing.');
    }

    const retentionClass = hasDamage ? 'EVIDENCE' : 'ROUTINE';
    const expiresAt = hasDamage
      ? null
      : admin.firestore.Timestamp.fromMillis(Date.now() + ROUTINE_INSPECTION_RETENTION_MS);

    await perf.phase('inspectionCompletionWrite', () => inspectionRef.update({
      status: 'COMPLETED',
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      hasDamage,
      damageDescription: hasDamage ? damageDescription!.trim() : null,
      // Explicitly freeze the EXACT verified object paths (WP7D2B). A concurrent replacement
      // upload writes a distinct unique object, so these frozen bytes can never be overwritten.
      exteriorPhotoPath: extPath,
      interiorPhotoPath: intPath,
      // Derived convenience fields — true only because the objects were verified above.
      exteriorPhotoCaptured: true,
      interiorPhotoCaptured: true,
      retentionClass,
      expiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }));

    const updated = await perf.phase('inspectionReadback', () => inspectionRef.get());
    return { success: true, inspection: { id: inspectionId, ...updated.data() } };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in completeVehicleInspection:', error);
    throw new functions.https.HttpsError('internal', 'Failed to complete vehicle inspection: ' + error.message);
  }
});

/**
 * List both boundary inspections for an assignment (O(1) deterministic reads).
 */
export const getAssignmentInspections = onMeasuredCall('getAssignmentInspections', async (data, context, perf) => {
  try {
    const validated = GetAssignmentInspectionsSchema.parse(data);
    const { driverId: reqDriverId, sessionToken, assignmentId } = validated;
    const { driverId } = await perf.phase('sessionValidation', () => requireDriverSession({ driverId: reqDriverId, sessionToken }));

    const assignmentRef = db.collection('vehicleAssignments').doc(assignmentId);
    const assignmentDoc = await perf.phase('assignmentRead', () => assignmentRef.get());
    if (!assignmentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle assignment not found');
    }
    if (assignmentDoc.data()!.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only view your own inspections.');
    }

    const [pickupDoc, returnDoc] = await perf.phase('inspectionReads', () => Promise.all([
      db.collection('vehicleInspections').doc(inspectionDocId(assignmentId, 'PICKUP')).get(),
      db.collection('vehicleInspections').doc(inspectionDocId(assignmentId, 'RETURN')).get(),
    ]));

    const inspections: any[] = [];
    if (pickupDoc.exists) inspections.push({ id: pickupDoc.id, ...pickupDoc.data() });
    if (returnDoc.exists) inspections.push({ id: returnDoc.id, ...returnDoc.data() });

    return { success: true, inspections };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in getAssignmentInspections:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get assignment inspections: ' + error.message);
  }
});

// =============================================================================
// ODOMETER DISCREPANCIES (WP-ODO)
// =============================================================================

/**
 * Admin-authenticated list of odometer discrepancies.
 */
export const listOdometerDiscrepancies = onProdCall(async (data, context) => {
  try {
    await requireAdmin(context);
    const snap = await db.collection('odometerDiscrepancies').orderBy('detectedAt', 'desc').limit(200).get();
    const discrepancies = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, discrepancies };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in listOdometerDiscrepancies:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list odometer discrepancies: ' + error.message);
  }
});

/**
 * Admin-authenticated update of discrepancy status/notes.
 */
export const updateOdometerDiscrepancyStatus = onProdCall(async (data, context) => {
  try {
    const { uid: adminUid } = await requireAdmin(context);
    const validated = UpdateOdometerDiscrepancySchema.parse(data);
    const { discrepancyId, status, notes } = validated;

    const ref = db.collection('odometerDiscrepancies').doc(discrepancyId);
    const doc = await ref.get();
    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Discrepancy record not found');
    }

    const update: any = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: adminUid,
    };
    if (status === 'RESOLVED') {
      update.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    if (typeof notes === 'string' && notes.trim()) {
      update.notes = notes.trim();
    }

    await ref.update(update);
    return { success: true, message: 'Discrepancy updated successfully' };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in updateOdometerDiscrepancyStatus:', error);
    throw new functions.https.HttpsError('internal', 'Failed to update discrepancy: ' + error.message);
  }
});

// =============================================================================
// DRIVER VEHICLE & DEFECT SESSION CALLABLES
// =============================================================================

/**
 * Session-authenticated safe vehicle listing for drivers.
 */
export const listVehiclesForSession = onMeasuredCall('listVehiclesForSession', async (data, context, perf) => {
  try {
    const validated = RequireSessionSchema.parse(data);
    const session = await perf.phase('sessionValidation', () => requireDriverSession(validated));

    const driverDoc = await perf.phase('driverRead', () => db.collection('users').doc(session.driverId).get());
    const driverData = driverDoc.data();

    const snapshot = await perf.phase('vehicleQuery', () => db.collection('vehicles').get());
    let vehicles = snapshot.docs
      .map(doc => stripToVehicleSafe(doc.data(), doc.id))
      .filter(v => v.status === 'Active');

    if (driverData?.allowedVehicles && Array.isArray(driverData.allowedVehicles) && driverData.allowedVehicles.length > 0) {
      vehicles = vehicles.filter(v => driverData.allowedVehicles.includes(v.id));
    }

    return { success: true, vehicles };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in listVehiclesForSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list vehicles: ' + error.message);
  }
});

/**
 * Session-authenticated safe vehicle read for drivers.
 */
export const getVehicleForSession = onMeasuredCall('getVehicleForSession', async (data, context, perf) => {
  try {
    const validated = GetVehicleForSessionSchema.parse(data);
    const { vehicleId } = validated;

    await perf.phase('sessionValidation', () => requireDriverSession(validated));

    const doc = await perf.phase('vehicleRead', () => db.collection('vehicles').doc(vehicleId).get());
    if (!doc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    }

    return { success: true, vehicle: stripToVehicleSafe(doc.data()!, doc.id) };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in getVehicleForSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get vehicle: ' + error.message);
  }
});

/**
 * Session-authenticated active defects read for a vehicle.
 */
export const getVehicleDefectsForSession = onMeasuredCall('getVehicleDefectsForSession', async (data, context, perf) => {
  try {
    const validated = GetVehicleDefectsForSessionSchema.parse(data);
    const { vehicleId } = validated;

    await perf.phase('sessionValidation', () => requireDriverSession(validated));

    // Return the driver-visible, currently-OUTSTANDING defects for the selected vehicle —
    // this powers driver-facing "does this vehicle have active faults" views, not history.
    // Resolved defects are excluded: a fixed fault is no longer outstanding. Duplicate
    // defects are also excluded: a Duplicate-status record exists only to point at another
    // (still-tracked) defect as the authoritative report via `duplicateOf`, so it never
    // represents an independently-actionable fault of its own. Neither exclusion deletes or
    // hides these records from admin — getAllDefects (admin) reads the full collection
    // directly and is unaffected by this callable's filtering.
    const snap = await perf.phase('defectQuery', () => db.collection('defects')
      .where('vehicleId', '==', vehicleId)
      .get());

    const defects = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((defect: any) => defect.isVisibleToDriver)
      .filter((defect: any) => defect.status !== 'Resolved' && defect.status !== 'Duplicate')
      .sort((a: any, b: any) => {
        const aTime = a?.reportedDateTime?.toDate ? a.reportedDateTime.toDate().getTime() : 0;
        const bTime = b?.reportedDateTime?.toDate ? b.reportedDateTime.toDate().getTime() : 0;
        return bTime - aTime;
      });
    return { success: true, defects };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in getVehicleDefectsForSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get vehicle defects: ' + error.message);
  }
});

/**
 * Session-authenticated active charging-location list for drivers.
 * Direct client access remains denied by Firestore rules.
 */
export const listChargingLocationsForSession = onProdCall(async (data, context) => {
  try {
    const validated = RequireSessionSchema.parse(data);
    const session = await requireDriverSession(validated);

    const snapshot = await db.collection('chargingLocations')
      .where('active', '==', true)
      .get();

    const chargingLocations = snapshot.docs
      // Locations without orgId are legacy/global records for the current single-tenant deployment.
      .filter((doc) => !doc.data().orgId || doc.data().orgId === session.orgId)
      .map((doc) => stripToChargingLocationForDriver(doc.data(), doc.id))
      .filter((location): location is Record<string, any> => location !== null)
      .sort((a, b) => {
        const nameOrder = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
        return nameOrder || a.id.localeCompare(b.id, 'en', { sensitivity: 'base' });
      });

    return { success: true, chargingLocations };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in listChargingLocationsForSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to list charging locations');
  }
});

/**
 * Session-authenticated refuel logging for the driver's ACTIVE ICE assignment.
 */
export const logRefuelWithSession = onProdCall(async (data, context) => {
  try {
    const validated = LogRefuelWithSessionSchema.parse(data);
    const {
      driverId: reqDriverId,
      sessionToken,
      assignmentId,
      odometer,
      litresFilled,
      fuelCost,
      oilCost,
      notes,
    } = validated;
    const { driverId } = await requireDriverSession({ driverId: reqDriverId, sessionToken });
    const { assignmentData, vehicleData } = await getActiveAssignmentForDriverAction(driverId, assignmentId);

    if (vehicleData.vehicleType !== 'ICE') {
      throw new functions.https.HttpsError('failed-precondition', 'Refuel logging is only allowed for ICE vehicles.');
    }
    const currentVehicleOdo = vehicleData.currentOdometer;
    if (typeof currentVehicleOdo === 'number' && odometer < currentVehicleOdo) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Odometer (${odometer}) cannot be lower than the vehicle's last recorded odometer (${currentVehicleOdo}).`
      );
    }

    const recordRef = db.collection('refuelRecords').doc();
    const recordData: Record<string, any> = {
      vehicleId: assignmentData.vehicleId,
      driverId,
      // Test-data isolation: inherited from the parent assignment or the vehicle itself.
      isTestData: assignmentData.isTestData === true || vehicleData.isTestData === true,
      shiftId: assignmentData.shiftId,
      assignmentId,
      date: admin.firestore.FieldValue.serverTimestamp(),
      odometer,
      litresFilled,
      fuelCost,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (typeof oilCost === 'number' && oilCost > 0) recordData.oilCost = oilCost;
    if (typeof notes === 'string' && notes.trim()) recordData.notes = notes.trim();

    await recordRef.set(recordData);
    const saved = await recordRef.get();
    return { success: true, record: { id: saved.id, ...saved.data() } };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
    }
    console.error('Error in logRefuelWithSession:', error);
    throw new functions.https.HttpsError('internal', 'Failed to log refuel record: ' + error.message);
  }
});
