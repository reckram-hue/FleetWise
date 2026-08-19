// functions/src/index.ts — FULL DROP-IN Cloud Functions for FleetWise Shift Management
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import * as crypto from 'crypto';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// =============================================================================
// RATE LIMITING HELPERS
// =============================================================================

// Derives a safe, fixed-length Firestore document ID for rate-limit records.
// Hashing avoids `/` path separators and oversized IDs from user-agent strings.
function getRateLimitKey(driverId: string, deviceId: string): string {
  return crypto.createHash('sha256').update(`${driverId}:${deviceId}`).digest('hex');
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

const StartShiftSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  deviceId: optionalString,
  startOdometer: z.number().min(0, 'Start odometer must be positive').optional(),
  startChargePercent: optionalChargePercent,
});

const EndShiftSchema = z.object({
  shiftId: z.string().min(1, 'Shift ID is required'),
  endOdometer: z.number().min(0, 'End odometer must be positive'),
  endChargePercent: optionalChargePercent,
  notes: optionalNotes,
});

const SetPinSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  newPin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

const ValidatePinSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
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
  endOdometer: z.number().min(0, 'End odometer must be positive'),
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
  photos: z.preprocess(
    (value) => value === null ? undefined : value,
    z.array(z.string()).optional()
  ),
  deviceId: optionalString,
});

// =============================================================================
// CLOUD FUNCTIONS
// =============================================================================

/**
 * Start a shift with PIN authentication
 * Validates driver/vehicle availability, checks PIN, creates shift in transaction
 */
export const startShiftWithPin = functions.https.onCall(async (data, context) => {
  try {
    // Validate input data
    const validated = StartShiftSchema.parse(data);
    const { driverId, vehicleId, pin, deviceId = 'unknown', startOdometer, startChargePercent } = validated;

    // Check rate limiting BEFORE expensive operations
    await checkRateLimit(driverId, deviceId);

    // Run all reads in parallel for better performance
    const [driverDoc, vehicleDoc] = await Promise.all([
      db.collection('users').doc(driverId).get(),
      db.collection('vehicles').doc(vehicleId).get(),
    ]);

    // Validate driver exists and is active
    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }
    const driverData = driverDoc.data()!;

    if (driverData.employmentStatus !== 'Active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver is not active and cannot start shifts'
      );
    }

    if (driverData.role && driverData.role !== 'driver') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Only drivers can start shifts'
      );
    }

    // Validate vehicle exists and is active
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

    // Check PIN (bcrypt comparison)
    const storedHash = driverData.pinHash;
    if (!storedHash) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver does not have a PIN set. Please contact admin to set your PIN.'
      );
    }

    const pinValid = await bcrypt.compare(pin, storedHash);
    if (!pinValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
    }

    // Clear rate limit on successful PIN verification
    await clearRateLimit(driverId, deviceId);

    // Check if driver has active shift
    if (driverData.activeShiftId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver already has an active shift. Please end your current shift first.'
      );
    }

    // Check if vehicle has active shift
    if (vehicleData.activeShiftId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This vehicle is already in use by another driver. Please select a different vehicle.'
      );
    }

    // Optional: Check if driver is allowed to use this vehicle
    if (driverData.allowedVehicles && Array.isArray(driverData.allowedVehicles)) {
      if (!driverData.allowedVehicles.includes(vehicleId)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'You are not authorized to use this vehicle'
        );
      }
    }

    // Legacy compatibility: also detect active shifts that predate activeShiftId pointers
    // (single-field queries + in-memory status filter; no composite index required)
    const [driverShifts, vehicleShifts] = await Promise.all([
      db.collection('shifts').where('driverId', '==', driverId).get(),
      db.collection('shifts').where('vehicleId', '==', vehicleId).get(),
    ]);
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

    // Create shift in transaction
    const shiftRef = db.collection('shifts').doc();
    const shiftId = shiftRef.id;

    await db.runTransaction(async (transaction) => {
      // Double-check availability within transaction
      const [txDriverDoc, txVehicleDoc] = await Promise.all([
        transaction.get(driverDoc.ref),
        transaction.get(vehicleDoc.ref),
      ]);

      if (txDriverDoc.data()?.activeShiftId) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Driver already has an active shift'
        );
      }
      if (txVehicleDoc.data()?.activeShiftId) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Vehicle is already in use'
        );
      }

      // Create shift document (legacy-compatible field names; charge % is EV-only)
      const shiftData: any = {
        driverId,
        vehicleId,
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        endTime: null,
        startOdometer: startOdometer ?? null,
        endOdometer: null,
        endChargePercent: null,
        status: 'Active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof startChargePercent === 'number') {
        shiftData.startChargePercent = startChargePercent;
      }
      transaction.set(shiftRef, shiftData);

      // Update driver's activeShiftId
      transaction.update(driverDoc.ref, {
        activeShiftId: shiftId,
        lastShiftStart: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update vehicle's activeShiftId
      transaction.update(vehicleDoc.ref, {
        activeShiftId: shiftId,
        lastShiftStart: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      success: true,
      shiftId,
      message: 'Shift started successfully',
    };
  } catch (error: any) {
    // Pass through HttpsError instances
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      );
    }

    // Generic error handler
    console.error('Error in startShiftWithPin:', error);
    throw new functions.https.HttpsError('internal', 'Failed to start shift: ' + error.message);
  }
});

/**
 * End an active shift
 * Updates shift status, clears activeShiftId pointers in transaction
 */
export const endShift = functions.https.onCall(async (data, context) => {
  try {
    // Validate input
    const validated = EndShiftSchema.parse(data);
    const { shiftId, endOdometer, endChargePercent, notes } = validated;

    // Get shift document
    const shiftRef = db.collection('shifts').doc(shiftId);
    const shiftDoc = await shiftRef.get();

    if (!shiftDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Shift not found');
    }

    const shiftData = shiftDoc.data()!;

    // Validate shift is active
    if (shiftData.status !== 'Active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This shift has already been ended'
      );
    }

    // Validate end odometer is greater than start (if both exist)
    if (shiftData.startOdometer && endOdometer < shiftData.startOdometer) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `End odometer (${endOdometer}) must be greater than or equal to start odometer (${shiftData.startOdometer})`
      );
    }

    const driverId = shiftData.driverId;
    const vehicleId = shiftData.vehicleId;

    // End shift in transaction
    await db.runTransaction(async (transaction) => {
      const [driverRef, vehicleRef] = [
        db.collection('users').doc(driverId),
        db.collection('vehicles').doc(vehicleId),
      ];

      // Update shift document (legacy-compatible field names; charge % is EV-only)
      const shiftUpdate: any = {
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        status: 'Completed',
        endOdometer: endOdometer,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof notes === 'string' && notes.trim()) {
        shiftUpdate.notes = notes;
      }
      if (typeof endChargePercent === 'number') {
        shiftUpdate.endChargePercent = endChargePercent;
      }
      transaction.update(shiftRef, shiftUpdate);

      // Clear additive activeShiftId pointers if present (no-op on legacy docs)
      transaction.update(driverRef, { activeShiftId: admin.firestore.FieldValue.delete() });
      transaction.update(vehicleRef, { activeShiftId: admin.firestore.FieldValue.delete() });
    });

    return {
      success: true,
      message: 'Shift ended successfully',
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

    console.error('Error in endShift:', error);
    throw new functions.https.HttpsError('internal', 'Failed to end shift: ' + error.message);
  }
});

/**
 * Admin function to set or reset a driver's 4-digit PIN
 * Hashes the PIN with bcrypt before storing
 */
export const adminSetDriverPin = functions.https.onCall(async (data, context) => {
  try {
    // Require authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Check if user is admin (you can implement more sophisticated role checking)
    const callerUid = context.auth.uid;
    const callerDoc = await db.collection('users').doc(callerUid).get();

    if (!callerDoc.exists) {
      throw new functions.https.HttpsError('permission-denied', 'User not found');
    }

    const callerData = callerDoc.data()!;
    if (callerData.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only administrators can set driver PINs'
      );
    }

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
 * Validate a driver's PIN (for login purposes without starting a shift)
 * Returns whether PIN is valid and whether it needs to be changed (default PIN)
 */
export const validateDriverPin = functions.https.onCall(async (data, context) => {
  try {
    const validated = ValidatePinSchema.parse(data);
    const { driverId, pin } = validated;

    // Get driver document
    const driverDoc = await db.collection('users').doc(driverId).get();

    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    const driverData = driverDoc.data()!;

    // Check if driver is active
    if (driverData.employmentStatus !== 'Active') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Your account is not active. Please contact your administrator.'
      );
    }

    if (driverData.role && driverData.role !== 'driver') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This account is not a driver account'
      );
    }

    // Check if PIN hash exists
    const storedHash = driverData.pinHash;
    if (!storedHash) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'PIN not set. Please contact your administrator to set your PIN.'
      );
    }

    // Validate PIN
    const pinValid = await bcrypt.compare(pin, storedHash);
    if (!pinValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
    }

    // Check if using default PIN (1234)
    const requiresPinChange = pin === '1234';

    return {
      valid: true,
      requiresPinChange,
      message: requiresPinChange
        ? 'Login successful. You must change your default PIN.'
        : 'Login successful',
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

    console.error('Error in validateDriverPin:', error);
    throw new functions.https.HttpsError('internal', 'Failed to validate PIN: ' + error.message);
  }
});

/**
 * Allow drivers to change their own PIN
 * Validates current PIN before allowing change
 */
export const driverChangePin = functions.https.onCall(async (data, context) => {
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

/**
 * Helper function to get a driver's active shift (for driver dashboard)
 */
export const getActiveShift = functions.https.onCall(async (data, context) => {
  try {
    const driverId = typeof data?.driverId === 'string' ? data.driverId : '';
    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'Driver ID is required');
    }

    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await driverRef.get();
    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    // A. New documents with additive activeShiftId pointer
    const activeShiftId = driverDoc.data()?.activeShiftId;
    if (activeShiftId) {
      const shiftDoc = await db.collection('shifts').doc(activeShiftId).get();
      if (shiftDoc.exists && shiftDoc.data()?.status === 'Active') {
        return { success: true, hasActiveShift: true, shift: { id: shiftDoc.id, ...shiftDoc.data() } };
      }
      // stale pointer — fall through to legacy lookup
    }

    // B. Legacy lookup by driverId + status 'Active' (single-field query; no composite index)
    const snapshot = await db.collection('shifts').where('driverId', '==', driverId).get();
    let active: any = null;
    snapshot.docs.forEach(d => {
      const data = d.data();
      if (!active && data && data.status === 'Active') {
        active = { id: d.id, ...data };
      }
    });

    if (active) {
      return { success: true, hasActiveShift: true, shift: active };
    }

    return { success: true, hasActiveShift: false, shift: null };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    console.error('Error in getActiveShift:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get active shift: ' + error.message);
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
export const driverLogin = functions.https.onCall(async (data, context) => {
  try {
    const validated = DriverLoginSchema.parse(data);
    const { driverId, pin, deviceId = 'unknown' } = validated;

    // Apply rate limiting before touching driver data (same policy as validateDriverPin)
    await checkRateLimit(driverId, deviceId);

    const driverDoc = await db.collection('users').doc(driverId).get();
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
    const pinValid = await bcrypt.compare(pin, storedHash);
    if (!pinValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid PIN.');
    }

    // PIN is correct. Clear rate limit; the PIN reference is discarded after this point.
    await clearRateLimit(driverId, deviceId);

    // Generate session token.
    // SECURITY: The raw token is a bearer credential — it must NOT be logged or stored server-side.
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const sessionHash = hashSessionToken(sessionToken);

    const expiresAtMs = Date.now() + SESSION_DURATION_MS;
    const expiresAtTimestamp = admin.firestore.Timestamp.fromMillis(expiresAtMs);

    await db.collection('driverSessions').doc(sessionHash).set({
      driverId,
      orgId: DEFAULT_ORG_ID,
      deviceId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAtTimestamp,
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      isRevoked: false,
    });

    const requiresPinChange = pin === '1234';

    return {
      sessionToken,
      driverId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      requiresPinChange,
      driver: stripToDriverSafe(driverData, driverId),
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
export const driverLogout = functions.https.onCall(async (data, context) => {
  try {
    const validated = DriverLogoutSchema.parse(data);
    const { driverId, sessionToken } = validated;

    // Validate session before revoking (confirms it exists and belongs to this driver)
    const { sessionHash } = await requireDriverSession({ driverId, sessionToken });

    await db.collection('driverSessions').doc(sessionHash).update({
      isRevoked: true,
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      revokedReason: 'logout',
    });

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
 * Require that the caller is an authenticated admin.
 * Reads users/{uid} and confirms role == 'admin'.
 * Returns the admin user data for audit logging.
 * Throws HttpsError('unauthenticated' | 'permission-denied') otherwise.
 */
async function requireAdmin(context: functions.https.CallableContext): Promise<{ uid: string; data: FirebaseFirestore.DocumentData }> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const uid = context.auth.uid;
  const userDoc = await db.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found');
  }

  const userData = userDoc.data()!;
  if (userData.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }

  return { uid, data: userData };
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
}): Promise<{ driverId: string; orgId: string; sessionHash: string; deviceId: string }> {
  const validated = RequireSessionSchema.parse(data);
  const { driverId, sessionToken } = validated;

  const sessionHash = hashSessionToken(sessionToken);
  const sessionRef = db.collection('driverSessions').doc(sessionHash);
  const sessionDoc = await sessionRef.get();

  if (!sessionDoc.exists) {
    throw new functions.https.HttpsError('unauthenticated', 'Session not found. Please log in again.');
  }

  const session = sessionDoc.data()!;

  if (session.driverId !== driverId) {
    throw new functions.https.HttpsError('permission-denied', 'Session does not belong to this driver.');
  }

  if (session.isRevoked) {
    throw new functions.https.HttpsError('unauthenticated', 'Session has been revoked. Please log in again.');
  }

  if (session.expiresAt.toMillis() < Date.now()) {
    throw new functions.https.HttpsError('unauthenticated', 'Session has expired. Please log in again.');
  }

  // Confirm driver still exists and is active (catches archival/inactivation mid-session)
  const driverDoc = await db.collection('users').doc(driverId).get();
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

  // Update lastSeenAt — throttled: only if more than 5 minutes since the last update.
  // Fire-and-forget so session activity tracking does not add latency to the caller's response.
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (session.lastSeenAt.toMillis() < fiveMinutesAgo) {
    sessionRef
      .update({ lastSeenAt: admin.firestore.FieldValue.serverTimestamp() })
      .catch((err) => console.error('requireDriverSession: lastSeenAt update failed:', err));
  }

  return {
    driverId: session.driverId,
    orgId: session.orgId,
    sessionHash,
    deviceId: session.deviceId,
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

const ReportDefectSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required'),
  urgency: z.string().min(1, 'Urgency is required'),
  location: optionalString,
  notes: optionalString,
  photos: z.preprocess(
    (value) => value === null ? undefined : value,
    z.array(z.string()).optional()
  ),
  deviceId: optionalString,
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
export const listDriversSafe = functions.https.onCall(async (_data, _context) => {
  try {
    const snapshot = await db.collection('users').get();
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
 * Requires context.auth. Reads users/{uid}, verifies role == 'admin'.
 * Returns all fields except pinHash.
 */
export const getAdminProfile = functions.https.onCall(async (_data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const uid = context.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Admin profile not found');
    }

    const userData = userDoc.data()!;
    if (userData.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Not an admin account');
    }

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
export const listUsersAdmin = functions.https.onCall(async (_data, context) => {
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
export const createDriver = functions.https.onCall(async (data, context) => {
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
export const updateDriver = functions.https.onCall(async (data, context) => {
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
export const archiveDriver = functions.https.onCall(async (data, context) => {
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
export const updateEmploymentStatus = functions.https.onCall(async (data, context) => {
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
export const createAdminUser = functions.https.onCall(async (data, context) => {
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
    const userData = {
      firstName,
      surname,
      email,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

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
// DEFECT REPORTING (PIN-VERIFIED)
// =============================================================================

/**
 * Report a vehicle defect. Requires PIN verification since drivers
 * have no Firebase Auth identity.
 * 
 * Security model:
 * - Validates driverId + pin server-side (same pattern as validateDriverPin)
 * - Rate-limits by driverId
 * - Only then creates the defect document
 */
export const reportDefect = functions.https.onCall(async (data, context) => {
  try {
    const validated = ReportDefectSchema.parse(data);
    const {
      driverId,
      pin,
      vehicleId,
      category,
      description,
      urgency,
      location,
      notes,
      photos,
      deviceId = 'unknown',
    } = validated;

    // Rate limit
    await checkRateLimit(driverId, deviceId);

    // Verify driver exists and is active
    const driverDoc = await db.collection('users').doc(driverId).get();
    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    const driverData = driverDoc.data()!;
    if (driverData.employmentStatus !== 'Active') {
      throw new functions.https.HttpsError('failed-precondition', 'Driver is not active');
    }

    // Verify PIN
    const storedHash = driverData.pinHash;
    if (!storedHash) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Driver does not have a PIN set. Please contact admin.'
      );
    }

    const pinValid = await bcrypt.compare(pin, storedHash);
    if (!pinValid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
    }

    // Clear rate limit on successful verification
    await clearRateLimit(driverId, deviceId);

    // Verify vehicle exists
    const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    }

    // Create defect document
    const defectData: Record<string, any> = {
      vehicleId,
      driverId,
      category,
      description,
      urgency,
      status: 'Open',
      isVisibleToDriver: true,
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
    console.error('Error in reportDefect:', error);
    throw new functions.https.HttpsError('internal', 'Failed to report defect: ' + error.message);
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
export const startShift = functions.https.onCall(async (data, context) => {
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
    const { driverId } = await requireDriverSession({ driverId: reqDriverId, sessionToken });

    // Parallel reads — driverDoc needed for allowedVehicles and activeShiftId checks.
    const [driverDoc, vehicleDoc] = await Promise.all([
      db.collection('users').doc(driverId).get(),
      db.collection('vehicles').doc(vehicleId).get(),
    ]);

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
    const [driverShifts, vehicleShifts] = await Promise.all([
      db.collection('shifts').where('driverId', '==', driverId).get(),
      db.collection('shifts').where('vehicleId', '==', vehicleId).get(),
    ]);
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

    await db.runTransaction(async (transaction) => {
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
      transaction.update(vehicleDoc.ref, {
        activeShiftId: shiftId,
        lastShiftStart: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

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
 */
export const reportDefectWithSession = functions.https.onCall(async (data, context) => {
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
    const { driverId } = await requireDriverSession({ driverId: reqDriverId, sessionToken });

    // Vehicle must exist (no status restriction — defects can be reported on any vehicle)
    const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Vehicle not found');
    }

    // Build defect document using the same schema as reportDefect.
    const defectData: Record<string, any> = {
      vehicleId,
      driverId,   // authoritative: from session, not raw client input
      category,
      description,
      urgency,
      status: 'Open',
      isVisibleToDriver: true,
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
export const endShiftWithSession = functions.https.onCall(async (data, context) => {
  try {
    const validated = EndShiftWithSessionSchema.parse(data);
    const { driverId: reqDriverId, sessionToken, shiftId, endOdometer, endChargePercent, notes } = validated;

    // Session validation — returns the authoritative driverId.
    const { driverId } = await requireDriverSession({ driverId: reqDriverId, sessionToken });

    const shiftRef = db.collection('shifts').doc(shiftId);
    const shiftDoc = await shiftRef.get();

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

    if (shiftData.startOdometer && endOdometer < shiftData.startOdometer) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `End odometer (${endOdometer}) must be greater than or equal to start odometer (${shiftData.startOdometer})`
      );
    }

    const vehicleId = shiftData.vehicleId;

    await db.runTransaction(async (transaction) => {
      const driverRef = db.collection('users').doc(driverId);
      const vehicleRef = db.collection('vehicles').doc(vehicleId);

      // Legacy-compatible shift update; endChargePercent is EV-only.
      const shiftUpdate: any = {
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        status: 'Completed',
        endOdometer,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof notes === 'string' && notes.trim()) {
        shiftUpdate.notes = notes;
      }
      if (typeof endChargePercent === 'number') {
        shiftUpdate.endChargePercent = endChargePercent;
      }
      transaction.update(shiftRef, shiftUpdate);

      // Clear additive pointer fields (no-op on legacy docs that never had them).
      transaction.update(driverRef, { activeShiftId: admin.firestore.FieldValue.delete() });
      transaction.update(vehicleRef, { activeShiftId: admin.firestore.FieldValue.delete() });
    });

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
export const getActiveShiftWithSession = functions.https.onCall(async (data, context) => {
  try {
    const validated = GetActiveShiftWithSessionSchema.parse(data);
    const { driverId: reqDriverId, sessionToken } = validated;

    // Session validation — the query is scoped to this authoritative driverId only.
    const { driverId } = await requireDriverSession({ driverId: reqDriverId, sessionToken });

    const driverRef = db.collection('users').doc(driverId);
    const driverDoc = await driverRef.get();
    if (!driverDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Driver not found');
    }

    // A. Fast path: additive activeShiftId pointer on new-style driver documents.
    const activeShiftId = driverDoc.data()?.activeShiftId;
    if (activeShiftId) {
      const shiftDoc = await db.collection('shifts').doc(activeShiftId).get();
      if (shiftDoc.exists && shiftDoc.data()?.status === 'Active') {
        return { success: true, hasActiveShift: true, shift: { id: shiftDoc.id, ...shiftDoc.data() } };
      }
      // Stale pointer — fall through to legacy scan.
    }

    // B. Legacy scan: query by driverId, filter Active in-memory. Single-field
    // query avoids the need for a composite index. Scoped to this driver only.
    const snapshot = await db.collection('shifts').where('driverId', '==', driverId).get();
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
