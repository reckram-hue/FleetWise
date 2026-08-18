// functions/src/index.ts — FULL DROP-IN Cloud Functions for FleetWise Shift Management
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// =============================================================================
// RATE LIMITING HELPERS
// =============================================================================

/**
 * Check and update rate limiting for PIN attempts
 * Allows max 6 failed attempts in 10 minutes per driver/device
 */
async function checkRateLimit(driverId: string, deviceId: string = 'unknown'): Promise<void> {
  const rateLimitRef = db.collection('rateLimits').doc(`${driverId}_${deviceId}`);
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
  const rateLimitRef = db.collection('rateLimits').doc(`${driverId}_${deviceId}`);
  await rateLimitRef.delete();
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const StartShiftSchema = z.object({
  driverId: z.string().min(1, 'Driver ID is required'),
  vehicleId: z.string().min(1, 'Vehicle ID is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  deviceId: z.string().optional(),
  startOdometer: z.number().min(0, 'Start odometer must be positive').optional(),
  startChargePercent: z.number().min(0).max(100).optional(),
});

const EndShiftSchema = z.object({
  shiftId: z.string().min(1, 'Shift ID is required'),
  endOdometer: z.number().min(0, 'End odometer must be positive'),
  endChargePercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
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

      // Create shift document (legacy-compatible field names)
      const shiftData = {
        driverId,
        vehicleId,
        startTime: admin.firestore.FieldValue.serverTimestamp(),
        endTime: null,
        startOdometer: startOdometer ?? null,
        endOdometer: null,
        startChargePercent: startChargePercent ?? null,
        endChargePercent: null,
        status: 'Active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
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

      // Update shift document (legacy-compatible field names)
      transaction.update(shiftRef, {
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        status: 'Completed',
        endOdometer: endOdometer,
        endChargePercent: endChargePercent ?? null,
        notes: notes ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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
