/**
 * Firebase API Service
 * Replaces mockApi with Firestore persistence
 * WP5C: User/defect operations migrated to secure Cloud Function callables
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db, callFunction } from '../lib/firebase';
import {
  User,
  UserRole,
  Vehicle,
  Shift,
  ShiftStatus,
  VehicleAssignment,
  VehicleAssignmentTransitionReason,
  DefectReport,
  DefectStatus,
  DefectCategory,
  DefectUrgency,
  Cost,
  LeaderboardEntry,
  VehicleStats,
  VehicleUsageStats,
  MaintenanceRecord,
  ScheduledService,
  DriverFine,
  VehicleDamage,
  DriverIncidentSummary,
  RefuelRecord,
  ChargeRecord,
  AppSettings,
  FuelEconomyAlert,
  ServiceProvider,
  LicenseRenewalReminder
} from '../types';

// Collection names
const COLLECTIONS = {
  users: 'users',
  vehicles: 'vehicles',
  shifts: 'shifts',
  defects: 'defects',
  costs: 'costs',
  maintenanceRecords: 'maintenanceRecords',
  scheduledServices: 'scheduledServices',
  driverFines: 'driverFines',
  vehicleDamages: 'vehicleDamages',
  refuelRecords: 'refuelRecords',
  chargeRecords: 'chargeRecords',
  serviceProviders: 'serviceProviders',
  settings: 'settings',
  fuelEconomyAlerts: 'fuelEconomyAlerts'
};

// Helper to convert Firestore timestamps to Date objects
const convertTimestamps = (data: any): any => {
  if (!data) return data;
  const result = { ...data };
  Object.keys(result).forEach(key => {
    const value = result[key];
    if (value && typeof value.toDate === 'function') {
      result[key] = value.toDate();
    } else if (value && typeof value === 'object') {
      if ('seconds' in value && 'nanoseconds' in value) {
        result[key] = new Date(value.seconds * 1000 + value.nanoseconds / 1000000);
      } else if ('_seconds' in value && '_nanoseconds' in value) {
        result[key] = new Date(value._seconds * 1000 + value._nanoseconds / 1000000);
      } else {
        result[key] = convertTimestamps(value);
      }
    }
  });
  return result;
};

const api = {
  // ==================== USERS / DRIVERS (SECURE CALLABLE BRIDGE) ====================

  /**
   * List all users via secure admin callable.
   * pinHash is stripped server-side — never crosses the network.
   * Requires Firebase Auth (admin) — the callable verifies role == 'admin'.
   */
  getUsers: async (): Promise<User[]> => {
    const data = await callFunction<{ success: boolean; users: any[] }>('listUsersAdmin', {});
    return data.users.map(u => convertTimestamps(u) as User);
  },

  /**
   * List admin users via secure callable. Filters result client-side.
   */
  getAdminUsers: async (): Promise<User[]> => {
    const data = await callFunction<{ success: boolean; users: any[] }>('listUsersAdmin', {});
    return data.users
      .filter((u: any) => u.role === UserRole.Admin)
      .map(u => convertTimestamps(u) as User);
  },

  /**
   * List only safe driver fields for the driver-selection screen.
   * No authentication required — callable returns only: id, firstName, surname, area, department, employmentStatus, role.
   * NEVER returns pinHash, idNumber, email, contactNumber, driversLicenceImageUrl.
   */
  listDriversSafe: async (): Promise<User[]> => {
    const data = await callFunction<{ success: boolean; users: any[] }>('listDriversSafe', {});
    return data.users.map(u => convertTimestamps(u) as User);
  },

  /**
   * Get the authenticated admin's profile via secure callable.
   * Uses context.auth.uid — no need to scan all users.
   */
  getAdminProfile: async (): Promise<User> => {
    const data = await callFunction<{ success: boolean; user: any }>('getAdminProfile', {});
    return convertTimestamps(data.user) as User;
  },

  /**
   * Create a new admin user via secure callable.
   * Server-side: creates Firebase Auth account + Firestore profile using Admin SDK.
   * No secondary app hack needed.
   */
  createAdminUser: async (userData: { firstName: string; surname: string; email: string; password: string }): Promise<User> => {
    const data = await callFunction<{ success: boolean; userId: string; message: string }>('createAdminUser', userData);
    return {
      id: data.userId,
      firstName: userData.firstName,
      surname: userData.surname,
      email: userData.email,
      role: UserRole.Admin,
    } as User;
  },

  /**
   * Create a new driver via secure callable. Admin-only.
   * PIN is NOT set here — use adminSetDriverPin separately.
   */
  addDriver: async (driverData: Omit<User, 'id' | 'role'>): Promise<User> => {
    const data = await callFunction<{ success: boolean; driverId: string; message: string }>('createDriver', driverData);
    const createdDriver = { id: data.driverId, ...driverData, role: UserRole.Driver } as User;
    console.log(`Driver created via callable (PIN must be set by an admin): ${data.driverId}`);
    return createdDriver;
  },

  /**
   * Update a driver via secure callable. Admin-only.
   * Cannot set pinHash — server strips it.
   */
  updateDriver: async (driverData: User): Promise<User> => {
    const data = await callFunction<{ success: boolean; user: any; message: string }>('updateDriver', driverData);
    return convertTimestamps(data.user) as User;
  },

  /**
   * Archive (inactivate) a driver via secure callable. Admin-only.
   * Never physically deletes the document — sets employmentStatus to 'Inactive'
   * and records retention period and optional legal/disciplinary hold.
   * The callable blocks if the driver has an active shift.
   */
  archiveDriver: async (payload: {
    driverId: string;
    inactiveReason: string;
    retentionPeriodMonths?: number;
    retentionReason?: string;
    legalHold?: boolean;
    legalHoldReason?: string;
  }): Promise<{ success: boolean; archiveUntil: string; message: string }> => {
    const data = await callFunction<{ success: boolean; archiveUntil: string; message: string }>('archiveDriver', payload);
    return { success: data.success, archiveUntil: data.archiveUntil, message: data.message };
  },

  /**
   * Update employment status via secure callable. Admin-only.
   */
  updateEmploymentStatus: async (driverId: string, status: any, endDate?: string): Promise<User> => {
    const data = await callFunction<{ success: boolean; user: any; message: string }>('updateEmploymentStatus', {
      driverId,
      status,
      endDate,
    });
    return convertTimestamps(data.user) as User;
  },

  // ==================== DRIVER SESSION (WP6A/WP6B) ====================

  /**
   * Establish a driver session. The driver enters their PIN exactly once here; the
   * returned sessionToken is a bearer credential used by all later session-authenticated
   * calls. Returns a SAFE driver profile (no pinHash/email/idNumber/contact).
   */
  driverLogin: async (driverId: string, pin: string, deviceId?: string): Promise<{
    sessionToken: string;
    driverId: string;
    expiresAt: string;
    requiresPinChange: boolean;
    driver: User;
  }> => {
    const data = await callFunction<any>('driverLogin', { driverId, pin, deviceId });
    return {
      sessionToken: data.sessionToken,
      driverId: data.driverId,
      expiresAt: data.expiresAt,
      requiresPinChange: data.requiresPinChange,
      driver: data.driver as User,
    };
  },

  /**
   * Revoke the driver session server-side.
   */
  driverLogout: async (driverId: string, sessionToken: string): Promise<void> => {
    await callFunction('driverLogout', { driverId, sessionToken });
  },

  /**
   * Session-authenticated start shift (WP6B). No PIN re-entry.
   */
  startShiftWithSession: async (shiftData: {
    driverId: string;
    sessionToken: string;
    vehicleId: string;
    startOdometer?: number;
    startChargePercent?: number;
    deviceId?: string;
  }): Promise<Shift> => {
    const payload: any = {
      driverId: shiftData.driverId,
      sessionToken: shiftData.sessionToken,
      vehicleId: shiftData.vehicleId,
      startOdometer: shiftData.startOdometer,
      deviceId: shiftData.deviceId,
    };
    if (typeof shiftData.startChargePercent === 'number') {
      payload.startChargePercent = shiftData.startChargePercent;
    }
    const data = await callFunction<{ success: boolean; shiftId: string; message: string }>('startShift', payload);
    return {
      id: data.shiftId,
      driverId: shiftData.driverId,
      vehicleId: shiftData.vehicleId,
      startTime: new Date(),
      startOdometer: shiftData.startOdometer || 0,
      startChargePercent: shiftData.startChargePercent,
      status: ShiftStatus.Active,
    } as Shift;
  },

  /**
   * Session-authenticated defect reporting (WP6B). No PIN re-entry.
   */
  reportDefectWithSession: async (defectData: {
    driverId: string;
    sessionToken: string;
    vehicleId: string;
    category: DefectCategory;
    description: string;
    urgency: DefectUrgency;
    location?: string;
    notes?: string;
    photos?: string[];
    deviceId?: string;
  }): Promise<DefectReport> => {
    const data = await callFunction<{ success: boolean; defectId: string; message: string }>('reportDefectWithSession', {
      driverId: defectData.driverId,
      sessionToken: defectData.sessionToken,
      vehicleId: defectData.vehicleId,
      category: defectData.category,
      description: defectData.description,
      urgency: defectData.urgency,
      location: defectData.location,
      notes: defectData.notes,
      photos: defectData.photos,
      deviceId: defectData.deviceId,
    });
    return {
      id: data.defectId,
      driverId: defectData.driverId,
      vehicleId: defectData.vehicleId,
      category: defectData.category,
      description: defectData.description,
      urgency: defectData.urgency,
      location: defectData.location,
      notes: defectData.notes,
      photos: defectData.photos,
      reportedDateTime: new Date(),
      status: DefectStatus.Open,
      isVisibleToDriver: true,
    } as DefectReport;
  },

  /**
   * Session-authenticated end shift (WP6B). No PIN re-entry.
   */
  endShiftWithSession: async (shiftId: string, endData: {
    driverId: string;
    sessionToken: string;
    endOdometer: number;
    endChargePercent?: number;
    notes?: string;
    deviceId?: string;
  }): Promise<Shift> => {
    const payload: any = {
      driverId: endData.driverId,
      sessionToken: endData.sessionToken,
      shiftId,
      endOdometer: endData.endOdometer,
      deviceId: endData.deviceId,
    };
    if (typeof endData.notes === 'string' && endData.notes.trim()) {
      payload.notes = endData.notes.trim();
    }
    if (typeof endData.endChargePercent === 'number') {
      payload.endChargePercent = endData.endChargePercent;
    }
    await callFunction<{ success: boolean; message: string }>('endShiftWithSession', payload);
    return { id: shiftId, endOdometer: endData.endOdometer, endChargePercent: endData.endChargePercent, endTime: new Date(), status: ShiftStatus.Completed } as Shift;
  },

  /**
   * Session-authenticated active-shift lookup (WP6B).
   */
  getActiveShiftWithSession: async (driverId: string, sessionToken: string): Promise<Shift | null> => {
    const data = await callFunction<{ success: boolean; hasActiveShift: boolean; shift: any | null }>('getActiveShiftWithSession', { driverId, sessionToken });
    if (data.hasActiveShift && data.shift) {
      return convertTimestamps(data.shift) as Shift;
    }
    return null;
  },

  /**
   * Start a VehicleAssignment under an existing active shift (WP7B). Session-authenticated;
   * no PIN re-entry. Enforces one ACTIVE assignment per shift and per vehicle server-side.
   */
  startVehicleAssignment: async (assignmentData: {
    driverId: string;
    sessionToken: string;
    shiftId: string;
    vehicleId: string;
    startOdometer?: number;
    startChargePercent?: number;
    transitionReason?: VehicleAssignmentTransitionReason;
    deviceId?: string;
  }): Promise<{ assignmentId: string }> => {
    const payload: any = {
      driverId: assignmentData.driverId,
      sessionToken: assignmentData.sessionToken,
      shiftId: assignmentData.shiftId,
      vehicleId: assignmentData.vehicleId,
      deviceId: assignmentData.deviceId,
    };
    if (typeof assignmentData.startOdometer === 'number') payload.startOdometer = assignmentData.startOdometer;
    if (typeof assignmentData.startChargePercent === 'number') payload.startChargePercent = assignmentData.startChargePercent;
    if (assignmentData.transitionReason) payload.transitionReason = assignmentData.transitionReason;
    const data = await callFunction<{ success: boolean; assignmentId: string; message: string }>('startVehicleAssignment', payload);
    return { assignmentId: data.assignmentId };
  },

  /**
   * End a VehicleAssignment (WP7B). Session-authenticated; no PIN re-entry.
   * Clears the shift/vehicle pointers only when they still point to this assignment.
   */
  endVehicleAssignment: async (endData: {
    driverId: string;
    sessionToken: string;
    assignmentId: string;
    endOdometer?: number;
    endChargePercent?: number;
    transitionReason: VehicleAssignmentTransitionReason;
    deviceId?: string;
  }): Promise<void> => {
    const payload: any = {
      driverId: endData.driverId,
      sessionToken: endData.sessionToken,
      assignmentId: endData.assignmentId,
      transitionReason: endData.transitionReason,
      deviceId: endData.deviceId,
    };
    if (typeof endData.endOdometer === 'number') payload.endOdometer = endData.endOdometer;
    if (typeof endData.endChargePercent === 'number') payload.endChargePercent = endData.endChargePercent;
    await callFunction<{ success: boolean; message: string }>('endVehicleAssignment', payload);
  },

  /**
   * Get the driver's current ACTIVE VehicleAssignment (WP7B), or null when the shift has
   * none (e.g. a legacy shift with no assignment, or after a vehicle has been returned).
   */
  getActiveVehicleAssignment: async (driverId: string, sessionToken: string, shiftId?: string): Promise<VehicleAssignment | null> => {
    const payload: any = { driverId, sessionToken };
    if (shiftId) payload.shiftId = shiftId;
    const data = await callFunction<{ success: boolean; hasActiveAssignment: boolean; assignment: any | null }>('getActiveVehicleAssignment', payload);
    if (data.hasActiveAssignment && data.assignment) {
      return convertTimestamps(data.assignment) as VehicleAssignment;
    }
    return null;
  },

  // ==================== VEHICLES ====================
  getVehicles: async (): Promise<Vehicle[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.vehicles));
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as Vehicle);
  },

  getVehicle: async (id: string): Promise<Vehicle | null> => {
    const docSnap = await getDoc(doc(db, COLLECTIONS.vehicles, id));
    if (!docSnap.exists()) return null;
    return convertTimestamps({ id: docSnap.id, ...docSnap.data() }) as Vehicle;
  },

  addVehicle: async (vehicleData: Omit<Vehicle, 'id'>): Promise<Vehicle> => {
    const newVehicle = {
      ...vehicleData,
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, COLLECTIONS.vehicles), newVehicle);
    const createdVehicle = { id: docRef.id, ...vehicleData } as Vehicle;

    // NOTE: Telegram sync disabled for Firebase deployment
    // The Express server on localhost:3001 is not available in production
    // Telegram integration should be handled via Cloud Functions if needed
    /*
    try {
      await fetch('http://localhost:3001/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docRef.id,
          name: vehicleData.alias || vehicleData.registration || docRef.id
        })
      });
    } catch (error) {
      console.warn('Failed to sync vehicle with backend server:', error);
    }
    */

    return createdVehicle;
  },

  updateVehicle: async (vehicleData: Vehicle): Promise<Vehicle> => {
    const { id, ...updateData } = vehicleData;
    await updateDoc(doc(db, COLLECTIONS.vehicles, id), { ...updateData, updatedAt: serverTimestamp() });
    return vehicleData;
  },

  getVehicleStats: async (vehicleId: string): Promise<VehicleStats> => {
    // Basic implementation - in real app, calculate from shifts/refuels
    const vehicle = await api.getVehicle(vehicleId);
    return {
      avgDailyDistanceKm: vehicle?.baselineFuelConsumption ? 150 : 0, // Mock or calculate
      avgEnergyConsumptionKwhPerKm: vehicle?.baselineEnergyConsumption || 0.2
    };
  },

  deleteVehicle: async (vehicleId: string): Promise<{ success: boolean }> => {
    await deleteDoc(doc(db, COLLECTIONS.vehicles, vehicleId));
    return { success: true };
  },

  getVehiclesWithExpiredLicenses: async (daysUntilExpiry: number): Promise<Vehicle[]> => {
    const vehicles = await api.getVehicles();
    const today = new Date();
    const targetDate = new Date(today.getTime() + (daysUntilExpiry * 24 * 60 * 60 * 1000));

    return vehicles.filter(v => {
      if (!v.licenseExpiryDate) return false;
      const expiryDate = new Date(v.licenseExpiryDate);
      return expiryDate <= targetDate;
    });
  },

  // ==================== MAINTENANCE ====================
  addMaintenanceRecord: async (recordData: Omit<MaintenanceRecord, 'id'>): Promise<MaintenanceRecord> => {
    const newRecord = {
      ...recordData,
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, COLLECTIONS.maintenanceRecords), newRecord);

    // Update vehicle's last service odometer
    if (recordData.vehicleId) {
      const vehicle = await api.getVehicle(recordData.vehicleId);
      if (vehicle && recordData.odometer > (vehicle.lastServiceOdometer || 0)) {
        await api.updateVehicle({ ...vehicle, lastServiceOdometer: recordData.odometer });
      }
    }

    return { id: docRef.id, ...recordData } as MaintenanceRecord;
  },

  // ==================== SHIFTS ====================
  getDriverShifts: async (driverId: string): Promise<Shift[]> => {
    // Fetch and filter in memory to avoid index requirement
    const snapshot = await getDocs(collection(db, COLLECTIONS.shifts));
    const allShifts = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as Shift);
    return allShifts
      .filter(s => s.driverId === driverId)
      .sort((a, b) => {
        const aTime = a.startTime instanceof Date ? a.startTime.getTime() : 0;
        const bTime = b.startTime instanceof Date ? b.startTime.getTime() : 0;
        return bTime - aTime;
      });
  },

  getActiveShift: async (driverId: string): Promise<Shift | null> => {
    const data = await callFunction<{ success: boolean; hasActiveShift: boolean; shift: any | null }>('getActiveShift', { driverId });
    if (data.hasActiveShift && data.shift) {
      return convertTimestamps(data.shift) as Shift;
    }
    return null;
  },

  getActiveShifts: async (): Promise<Shift[]> => {
    // In-memory fetch to support logic requiring all active shifts
    const snapshot = await getDocs(collection(db, COLLECTIONS.shifts));
    const allShifts = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as Shift);
    return allShifts.filter(s => s.status === ShiftStatus.Active);
  },

  getLastCompletedShift: async (vehicleId: string): Promise<Shift | null> => {
    // In-memory filter to avoid index requirement
    const snapshot = await getDocs(collection(db, COLLECTIONS.shifts));
    const shifts = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as Shift);

    const completed = shifts.filter(s => s.vehicleId === vehicleId && s.status === ShiftStatus.Completed);
    completed.sort((a, b) => {
      const aTime = a.endTime ? new Date(a.endTime).getTime() : 0;
      const bTime = b.endTime ? new Date(b.endTime).getTime() : 0;
      return bTime - aTime;
    });
    return completed.length > 0 ? completed[0] : null;
  },

  startShift: async (shiftData: { driverId: string; vehicleId: string; pin?: string; startOdometer?: number; startChargePercent?: number; }): Promise<Shift> => {
    if (!shiftData.pin) {
      throw new Error('PIN is required to start a shift.');
    }
    // Build payload omitting charge % for ICE (avoids serializing undefined -> null).
    const payload: any = {
      driverId: shiftData.driverId,
      vehicleId: shiftData.vehicleId,
      pin: shiftData.pin,
      startOdometer: shiftData.startOdometer,
    };
    if (typeof shiftData.startChargePercent === 'number') {
      payload.startChargePercent = shiftData.startChargePercent;
    }
    const data = await callFunction<{ success: boolean; shiftId: string; message: string }>('startShiftWithPin', payload);
    return {
      id: data.shiftId,
      driverId: shiftData.driverId,
      vehicleId: shiftData.vehicleId,
      startTime: new Date(),
      startOdometer: shiftData.startOdometer || 0,
      startChargePercent: shiftData.startChargePercent,
      status: ShiftStatus.Active,
    } as Shift;
  },

  endShift: async (shiftId: string, endData: { endOdometer: number; endChargePercent?: number; notes?: string; }): Promise<Shift> => {
    const payload: any = {
      shiftId,
      endOdometer: endData.endOdometer,
    };
    if (typeof endData.notes === 'string' && endData.notes.trim()) {
      payload.notes = endData.notes.trim();
    }
    if (typeof endData.endChargePercent === 'number') {
      payload.endChargePercent = endData.endChargePercent;
    }
    await callFunction<{ success: boolean; message: string }>('endShift', payload);
    return { id: shiftId, endOdometer: endData.endOdometer, endChargePercent: endData.endChargePercent, endTime: new Date(), status: ShiftStatus.Completed } as Shift;
  },

  // ==================== DEFECTS ====================
  getActiveDefects: async (): Promise<DefectReport[]> => {
    // Fetch all defects and filter in memory to avoid index requirement
    const snapshot = await getDocs(collection(db, COLLECTIONS.defects));
    const allDefects = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as DefectReport);
    return allDefects.filter(d => d.status !== DefectStatus.Resolved && d.isVisibleToDriver);
  },

  getVehicleDefects: async (vehicleId: string): Promise<DefectReport[]> => {
    // Fetch and filter in memory to avoid index requirement
    const snapshot = await getDocs(collection(db, COLLECTIONS.defects));
    const allDefects = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as DefectReport);
    return allDefects
      .filter(d => d.vehicleId === vehicleId && d.isVisibleToDriver)
      .sort((a, b) => {
        const aTime = a.reportedDateTime instanceof Date ? a.reportedDateTime.getTime() : 0;
        const bTime = b.reportedDateTime instanceof Date ? b.reportedDateTime.getTime() : 0;
        return bTime - aTime;
      });
  },

  getAllDefects: async (): Promise<DefectReport[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.defects));
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as DefectReport);
  },

  /**
   * Report a defect via secure callable. Drivers must supply their PIN for server-side
   * verification. The PIN comes from local component state (per-operation, not session).
   *
   * Direct Firestore writes to /defects are blocked by the proposed rules (allow create: if false).
   * All defect creation must go through the reportDefect callable.
   */
  addDefectReport: async (defectData: Omit<DefectReport, 'id' | 'reportedDateTime' | 'status' | 'isVisibleToDriver'> & { pin?: string }): Promise<DefectReport> => {
    if (!defectData.pin) {
      throw new Error('PIN is required to report a defect. The reportDefect callable enforces PIN verification.');
    }

    const { pin, ...rest } = defectData;
    const data = await callFunction<{ success: boolean; defectId: string; message: string }>('reportDefect', {
      driverId: rest.driverId,
      pin,
      vehicleId: rest.vehicleId,
      category: rest.category,
      description: rest.description,
      urgency: rest.urgency,
      location: rest.location,
      notes: rest.notes,
      photos: rest.photos,
    });
    return {
      id: data.defectId,
      ...rest,
      reportedDateTime: new Date(),
      status: DefectStatus.Open,
      isVisibleToDriver: true,
    } as DefectReport;
  },

  updateDefectReport: async (defectId: string, updateData: Partial<DefectReport>): Promise<DefectReport> => {
    const defectRef = doc(db, COLLECTIONS.defects, defectId);
    await updateDoc(defectRef, { ...updateData, updatedAt: serverTimestamp() });
    const updatedDoc = await getDoc(defectRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as DefectReport;
  },

  updateDefectStatus: async (defectId: string, status: DefectStatus, notes?: string): Promise<DefectReport> => {
    const defectRef = doc(db, COLLECTIONS.defects, defectId);
    const updateData: any = { status, updatedAt: serverTimestamp() };
    if (notes !== undefined) updateData.notes = notes;
    if (status === DefectStatus.Resolved) updateData.resolvedDateTime = serverTimestamp();
    if (status === DefectStatus.Acknowledged) updateData.acknowledgedDateTime = serverTimestamp();
    await updateDoc(defectRef, updateData);
    const updatedDoc = await getDoc(defectRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as DefectReport;
  },

  assignDefect: async (defectId: string, assignedTo: string, estimatedCost?: number): Promise<DefectReport> => {
    const defectRef = doc(db, COLLECTIONS.defects, defectId);
    const updateData: any = {
      assignedTo,
      status: DefectStatus.InProgress,
      updatedAt: serverTimestamp(),
    };
    if (estimatedCost !== undefined) updateData.estimatedCost = estimatedCost;
    await updateDoc(defectRef, updateData);
    const updatedDoc = await getDoc(defectRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as DefectReport;
  },

  deleteDefectReport: async (defectId: string): Promise<{ success: boolean }> => {
    await deleteDoc(doc(db, COLLECTIONS.defects, defectId));
    return { success: true };
  },

  // ==================== COSTS ====================
  getCosts: async (): Promise<Cost[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.costs));
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as Cost);
  },

  getVehicleCosts: async (vehicleId?: string): Promise<Cost[]> => {
    // Fetch and filter in memory to avoid index requirement
    const snapshot = await getDocs(collection(db, COLLECTIONS.costs));
    const allCosts = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as Cost);
    const filtered = vehicleId ? allCosts.filter(c => c.vehicleId === vehicleId) : allCosts;
    return filtered
      .sort((a, b) => {
        const aDate = new Date(a.date).getTime();
        const bDate = new Date(b.date).getTime();
        return bDate - aDate;
      });
  },

  addCost: async (costData: Omit<Cost, 'id'>): Promise<Cost> => {
    const newCost = {
      ...costData,
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, COLLECTIONS.costs), newCost);
    return { id: docRef.id, ...costData } as Cost;
  },

  updateCost: async (costId: string, costData: Partial<Cost>): Promise<Cost> => {
    const costRef = doc(db, COLLECTIONS.costs, costId);
    await updateDoc(costRef, { ...costData, updatedAt: serverTimestamp() });
    const updatedDoc = await getDoc(costRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as Cost;
  },

  deleteCost: async (costId: string): Promise<{ success: boolean }> => {
    await deleteDoc(doc(db, COLLECTIONS.costs, costId));
    return { success: true };
  },

  // ==================== SCHEDULED SERVICES ====================
  getScheduledServices: async (): Promise<ScheduledService[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.scheduledServices));
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as ScheduledService);
  },

  addScheduledService: async (serviceData: Omit<ScheduledService, 'id'>): Promise<ScheduledService> => {
    const docRef = await addDoc(collection(db, COLLECTIONS.scheduledServices), serviceData);
    return { id: docRef.id, ...serviceData } as ScheduledService;
  },

  updateScheduledService: async (serviceId: string, updateData: Partial<ScheduledService>): Promise<ScheduledService> => {
    const serviceRef = doc(db, COLLECTIONS.scheduledServices, serviceId);
    await updateDoc(serviceRef, { ...updateData, updatedAt: serverTimestamp() });
    const updatedDoc = await getDoc(serviceRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as ScheduledService;
  },

  sendVehicleForService: async (serviceId: string, sentDate: string): Promise<void> => {
    await api.updateScheduledService(serviceId, {
      sentForService: true,
      sentDate
    });
  },

  returnVehicleFromService: async (serviceId: string, returnData: { returnDate: string; actualCost: number; serviceNotes: string }): Promise<void> => {
    await api.updateScheduledService(serviceId, {
      returnedFromService: true,
      returnDate: returnData.returnDate,
      actualCost: returnData.actualCost,
      serviceNotes: returnData.serviceNotes
    });
  },

  getServicesNeedingReminders: async (): Promise<ScheduledService[]> => {
    const services = await api.getScheduledServices();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    return services.filter(s =>
      s.isBooked &&
      !s.reminderSent &&
      s.bookedDate === tomorrowStr
    );
  },

  // ==================== SERVICE PROVIDERS ====================
  getServiceProviders: async (activeOnly = false): Promise<ServiceProvider[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.serviceProviders));
    let providers = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as ServiceProvider);
    if (activeOnly) {
      providers = providers.filter(p => p.isActive);
    }
    return providers;
  },

  addServiceProvider: async (providerData: Omit<ServiceProvider, 'id'>): Promise<ServiceProvider> => {
    const docRef = await addDoc(collection(db, COLLECTIONS.serviceProviders), providerData);
    return { id: docRef.id, ...providerData } as ServiceProvider;
  },

  updateServiceProvider: async (providerId: string, providerData: Partial<ServiceProvider>): Promise<ServiceProvider> => {
    const providerRef = doc(db, COLLECTIONS.serviceProviders, providerId);
    await updateDoc(providerRef, { ...providerData, updatedAt: serverTimestamp() });
    const updatedDoc = await getDoc(providerRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as ServiceProvider;
  },

  deleteServiceProvider: async (providerId: string): Promise<{ success: boolean }> => {
    await deleteDoc(doc(db, COLLECTIONS.serviceProviders, providerId));
    return { success: true };
  },

  // ==================== REFUEL / CHARGE RECORDS ====================
  getRefuelRecords: async (vehicleId?: string): Promise<RefuelRecord[]> => {
    let q;
    if (vehicleId) {
      q = query(collection(db, COLLECTIONS.refuelRecords), where('vehicleId', '==', vehicleId));
    } else {
      q = collection(db, COLLECTIONS.refuelRecords);
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as RefuelRecord);
  },

  addRefuelRecord: async (recordData: Omit<RefuelRecord, 'id'>): Promise<RefuelRecord> => {
    const docRef = await addDoc(collection(db, COLLECTIONS.refuelRecords), recordData);
    return { id: docRef.id, ...recordData } as RefuelRecord;
  },

  getChargeRecords: async (vehicleId?: string): Promise<ChargeRecord[]> => {
    let q;
    if (vehicleId) {
      q = query(collection(db, COLLECTIONS.chargeRecords), where('vehicleId', '==', vehicleId));
    } else {
      q = collection(db, COLLECTIONS.chargeRecords);
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as ChargeRecord);
  },

  addChargeRecord: async (recordData: Omit<ChargeRecord, 'id'>): Promise<ChargeRecord> => {
    const docRef = await addDoc(collection(db, COLLECTIONS.chargeRecords), recordData);
    return { id: docRef.id, ...recordData } as ChargeRecord;
  },

  // ==================== DRIVER INCIDENTS ====================
  getDriverFines: async (driverId?: string): Promise<DriverFine[]> => {
    let q;
    if (driverId) {
      q = query(collection(db, COLLECTIONS.driverFines), where('driverId', '==', driverId));
    } else {
      q = collection(db, COLLECTIONS.driverFines);
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as DriverFine);
  },

  addDriverFine: async (fineData: Omit<DriverFine, 'id'>): Promise<DriverFine> => {
    const docRef = await addDoc(collection(db, COLLECTIONS.driverFines), fineData);
    return { id: docRef.id, ...fineData } as DriverFine;
  },

  updateDriverFine: async (fine: DriverFine): Promise<DriverFine> => {
    const { id, ...updateData } = fine;
    await updateDoc(doc(db, COLLECTIONS.driverFines, id), { ...updateData, updatedAt: serverTimestamp() });
    const updatedDoc = await getDoc(doc(db, COLLECTIONS.driverFines, id));
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as DriverFine;
  },

  determineDriverForFine: async (vehicleRegistration: string, fineDate: string, fineTime?: string): Promise<{
    driverId: string | null;
    vehicleId: string | null;
    method: 'shift_lookup' | 'single_driver' | 'no_match';
    confidence: 'high' | 'medium' | 'low';
    details: string;
  }> => {
    const vehicles = await api.getVehicles();
    const vehicle = vehicles.find(v => (v.registration || '').toLowerCase() === vehicleRegistration.toLowerCase());
    if (!vehicle) {
      return { driverId: null, vehicleId: null, method: 'no_match', confidence: 'low', details: `Vehicle with registration ${vehicleRegistration} not found` };
    }

    const fineDateTime = new Date(`${fineDate}T${fineTime || '12:00'}:00`);
    const fineDateStart = new Date(`${fineDate}T00:00:00`);
    const fineDateEnd = new Date(`${fineDate}T23:59:59`);

    const snapshot = await getDocs(collection(db, COLLECTIONS.shifts));
    const allShifts = snapshot.docs.map(d => convertTimestamps({ id: d.id, ...d.data() }) as Shift);

    const vehicleShifts = allShifts.filter(shift =>
      shift.vehicleId === vehicle.id &&
      shift.startTime >= fineDateStart &&
      shift.startTime <= fineDateEnd
    );

    if (vehicleShifts.length === 0) {
      const vehicleHistory = allShifts.filter(shift => shift.vehicleId === vehicle.id);
      const uniqueDrivers = [...new Set(vehicleHistory.map(s => s.driverId))];
      if (uniqueDrivers.length === 1) {
        return { driverId: uniqueDrivers[0], vehicleId: vehicle.id, method: 'single_driver', confidence: 'medium', details: 'Only one driver has driven this vehicle' };
      }
      return { driverId: null, vehicleId: vehicle.id, method: 'no_match', confidence: 'low', details: `No shifts found for ${vehicleRegistration} on ${fineDate}` };
    }

    if (vehicleShifts.length === 1) {
      return { driverId: vehicleShifts[0].driverId, vehicleId: vehicle.id, method: 'shift_lookup', confidence: 'high', details: `Single shift on ${fineDate} by driver ${vehicleShifts[0].driverId}` };
    }

    if (fineTime) {
      for (const shift of vehicleShifts) {
        const shiftEnd = shift.endTime || new Date();
        if (fineDateTime >= shift.startTime && fineDateTime <= shiftEnd) {
          return { driverId: shift.driverId, vehicleId: vehicle.id, method: 'shift_lookup', confidence: 'high', details: `Fine time ${fineTime} matches shift ${shift.id}` };
        }
      }
    }

    return { driverId: vehicleShifts[0].driverId, vehicleId: vehicle.id, method: 'shift_lookup', confidence: 'medium', details: `Multiple shifts on ${fineDate}, assigned to first shift driver` };
  },

  getVehicleDamages: async (vehicleId?: string): Promise<VehicleDamage[]> => {
    let q;
    if (vehicleId) {
      q = query(collection(db, COLLECTIONS.vehicleDamages), where('vehicleId', '==', vehicleId));
    } else {
      q = collection(db, COLLECTIONS.vehicleDamages);
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as VehicleDamage);
  },

  addVehicleDamage: async (damageData: Omit<VehicleDamage, 'id'>): Promise<VehicleDamage> => {
    const docRef = await addDoc(collection(db, COLLECTIONS.vehicleDamages), damageData);
    return { id: docRef.id, ...damageData } as VehicleDamage;
  },

  updateVehicleDamage: async (damage: VehicleDamage): Promise<VehicleDamage> => {
    const { id, ...updateData } = damage;
    await updateDoc(doc(db, COLLECTIONS.vehicleDamages, id), { ...updateData, updatedAt: serverTimestamp() });
    const updatedDoc = await getDoc(doc(db, COLLECTIONS.vehicleDamages, id));
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as VehicleDamage;
  },

  // ==================== STATISTICS & REPORTS ====================
  getLeaderboard: async (): Promise<LeaderboardEntry[]> => {
    // listDriversSafe is public (no auth required) and safe to call from driver context.
    // getUsers() would require admin auth and break the driver-facing leaderboard route.
    const [shiftsSnap, drivers] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.shifts)),
      api.listDriversSafe(),
    ]);

    const driverStats = new Map<string, { trips: number; totalKm: number }>();

    shiftsSnap.forEach(shiftDoc => {
      const shift = shiftDoc.data() as Shift;
      if (shift.status === ShiftStatus.Completed && shift.endOdometer && shift.startOdometer) {
        const km = shift.endOdometer - shift.startOdometer;
        const current = driverStats.get(shift.driverId) || { trips: 0, totalKm: 0 };
        driverStats.set(shift.driverId, {
          trips: current.trips + 1,
          totalKm: current.totalKm + km
        });
      }
    });

    const leaderboard: LeaderboardEntry[] = drivers.map(user => {
      const stats = driverStats.get(user.id) || { trips: 0, totalKm: 0 };
      return { driver: user, totalKmDriven: stats.totalKm };
    });

    return leaderboard.sort((a, b) => b.totalKmDriven - a.totalKmDriven);
  },

  getVehicleUsageStats: async (): Promise<VehicleUsageStats[]> => {
    const vehicles = await api.getVehicles();
    return vehicles.map(v => ({
      vehicleId: v.id,
      avgDailyUsageKm: 0, // Placeholder
      totalDaysTracked: 0, // Placeholder
      lastCalculated: new Date(),
      recentUsageTrend: 'stable' as const
    }));
  },

  getDriverIncidentSummary: async (driverId?: string): Promise<DriverIncidentSummary[]> => {
    // 1. Fetch relevant data
    const [allFines, allDamages, allUsers] = await Promise.all([
      api.getDriverFines(driverId),
      api.getVehicleDamages(), // We need to filter these by driver manually if driverId is provided
      api.getUsers()
    ]);

    // 2. Filter drivers
    const drivers = driverId
      ? allUsers.filter(u => u.id === driverId)
      : allUsers.filter(u => u.role === UserRole.Driver);

    // 3. Aggregate stats per driver
    const summaries: DriverIncidentSummary[] = drivers.map(driver => {
      const driverFines = allFines.filter(f => f.driverId === driver.id);
      const driverDamages = allDamages.filter(d => d.driverId === driver.id);

      const totalFines = driverFines.length;
      const totalFineAmount = driverFines.reduce((sum, f) => sum + f.amount, 0);
      const unpaidFines = driverFines.filter(f => !f.isPaid);
      const unpaidAmount = unpaidFines.reduce((sum, f) => sum + f.amount, 0);

      const totalDamages = driverDamages.length;
      const totalDamagesCost = driverDamages.reduce((sum, d) => sum + (d.actualCost || d.estimatedCost || 0), 0);

      // Determine last incident date
      const dates = [
        ...driverFines.map(f => f.date),
        ...driverDamages.map(d => d.date)
      ].sort().reverse(); // Descending

      const lastIncidentDate = dates.length > 0 ? dates[0] : undefined;

      // Calculate simplified risk score (0-100)
      // Base: 0. Add points for incidents.
      let riskScore = 0;
      riskScore += totalFines * 10;
      riskScore += totalDamages * 25;
      riskScore = Math.min(riskScore, 100);

      return {
        driverId: driver.id,
        driver: driver, // Include full driver object for UI
        totalFines,
        totalFineAmount,
        unpaidFines: unpaidFines.length,
        unpaidAmount,
        totalDamages,
        totalDamagesCost,
        riskScore,
        lastIncidentDate,
        needsTraining: riskScore > 50
      };
    });

    return summaries;
  },

  // ==================== SETTINGS ====================
  getSettings: async (): Promise<AppSettings> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.settings));
    if (snapshot.empty) {
      // Create and return default settings
      const defaultSettings = {
        defaultServiceReminderDays: 1,
        defaultLicenseRenewalReminderDays: 30,
        fuelEconomyThreshold: 0.15,
        companyName: 'FleetWise',
        areas: [],
        departments: [],
        serviceBookingLeadTimeDays: 7,
        enableSmartBookingReminders: true,
        defaultDailyUsageKm: 50,
        bookingReminderThresholdKm: 1000,
        defaultLicenseReminderDays: 30,
        enableLicenseReminders: true,
        createdBy: 'System',
        lastModified: new Date()
      };
      const docRef = await addDoc(collection(db, COLLECTIONS.settings), defaultSettings);
      return { id: docRef.id, ...defaultSettings };
    }
    const docSnapshot = snapshot.docs[0];
    return { id: docSnapshot.id, ...docSnapshot.data() } as AppSettings;
  },

  updateSettings: async (settings: Partial<AppSettings>): Promise<AppSettings> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.settings));
    let settingsId: string;

    if (snapshot.empty) {
      // Create new settings document if none exists
      const defaultSettings = {
        defaultServiceReminderDays: 1,
        defaultLicenseRenewalReminderDays: 30,
        fuelEconomyThreshold: 0.15,
        companyName: 'FleetWise',
        areas: [],
        departments: [],
        serviceBookingLeadTimeDays: 7,
        enableSmartBookingReminders: true,
        defaultDailyUsageKm: 50,
        bookingReminderThresholdKm: 1000,
        defaultLicenseReminderDays: 30,
        enableLicenseReminders: true,
        createdBy: 'System',
        lastModified: new Date(),
        ...settings
      };
      const docRef = await addDoc(collection(db, COLLECTIONS.settings), defaultSettings);
      return { id: docRef.id, ...defaultSettings } as AppSettings;
    }

    settingsId = snapshot.docs[0].id;
    const currentData = snapshot.docs[0].data();
    const updatedData = { ...currentData, ...settings };
    const settingsRef = doc(db, COLLECTIONS.settings, settingsId);
    await updateDoc(settingsRef, updatedData);
    return { id: settingsId, ...updatedData } as AppSettings;
  },

  // ==================== FUEL ECONOMY ALERTS ====================
  getFuelEconomyAlerts: async (): Promise<FuelEconomyAlert[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.fuelEconomyAlerts));
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as FuelEconomyAlert);
  },

  calculateFuelEconomyStatus: async (vehicleId: string): Promise<{
    vehicle: Vehicle;
    manufacturerVsBaseline: number;
    currentVsBaseline: number;
    currentVsManufacturer: number;
    needsAttention: boolean;
    trend: 'improving' | 'stable' | 'degrading' | 'unknown';
    recommendations: string[];
  }> => {
    const vehicle = await api.getVehicle(vehicleId);
    if (!vehicle) throw new Error('Vehicle not found');

    const isICE = vehicle.vehicleType === 'ICE';
    const manufacturerConsumption = isICE ? (vehicle.manufacturerFuelConsumption || 0) : (vehicle.manufacturerEnergyConsumption || 0);
    const baselineConsumption = isICE ? (vehicle.baselineFuelConsumption || 0) : (vehicle.baselineEnergyConsumption || 0);
    const currentConsumption = isICE ? (vehicle.currentFuelConsumption || 0) : (vehicle.currentEnergyConsumption || 0);

    const manufacturerVsBaseline = (baselineConsumption > 0 && manufacturerConsumption > 0)
      ? ((baselineConsumption - manufacturerConsumption) / manufacturerConsumption) * 100 : 0;
    const currentVsBaseline = (baselineConsumption > 0 && currentConsumption > 0)
      ? ((currentConsumption - baselineConsumption) / baselineConsumption) * 100 : 0;
    const currentVsManufacturer = (manufacturerConsumption > 0 && currentConsumption > 0)
      ? ((currentConsumption - manufacturerConsumption) / manufacturerConsumption) * 100 : 0;

    const threshold = vehicle.economyVarianceThreshold || 15;
    const needsAttention = Math.abs(currentVsBaseline) > threshold;

    const recommendations: string[] = [];
    if (currentVsBaseline > 15) recommendations.push('Consider engine service - consumption significantly above baseline');
    if (currentVsBaseline > 20) recommendations.push('Check air filter, fuel injectors, and tire pressure');
    if (currentVsBaseline > 25) recommendations.push('URGENT: Major maintenance required - investigate engine performance');
    if (currentVsManufacturer > 30) recommendations.push('Performance significantly below manufacturer specifications');

    return {
      vehicle,
      manufacturerVsBaseline,
      currentVsBaseline,
      currentVsManufacturer,
      needsAttention,
      trend: vehicle.economyTrendDirection || 'unknown',
      recommendations,
    };
  },

  // ==================== SHIFT MANAGEMENT WITH PIN ====================
  // Client-side implementation replacing Cloud Functions

  /**
   * Validate a driver's PIN
   */
  validateDriverPin: async (driverId: string, pin: string): Promise<{ valid: boolean; requiresPinChange: boolean; message?: string }> => {
    try {
      const data = await callFunction<{ valid: boolean; requiresPinChange: boolean; message?: string }>('validateDriverPin', { driverId, pin });
      return { valid: data.valid, requiresPinChange: data.requiresPinChange, message: data.message };
    } catch (e: any) {
      return { valid: false, requiresPinChange: false, message: e?.message || 'PIN validation failed' };
    }
  },

  /**
   * End an active shift
   * @param shiftId - The shift ID to end
   * @param endOdo - Ending odometer reading
   * @param endChargePercent - Optional ending charge percentage (for EVs)
   * @param notes - Optional notes about the shift
   * @returns Promise with success status
   */
  endShiftWithPin: async (
    shiftId: string,
    endOdo: number,
    endChargePercent?: number,
    notes?: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // We accept the function signature but just delegate to endShift
      // The UI seems to call this when ending a shift

      await api.endShift(shiftId, {
        endOdometer: endOdo,
        endChargePercent,
        notes
      });
      return { success: true, message: 'Shift ended successfully' };
    } catch (e: any) {
      throw new Error(e.message || 'Failed to end shift');
    }
  },

  /**
   * Driver function to change pin.
   * Verifies current pin then sets new pin.
   */
  driverChangePin: async (driverId: string, currentPin: string, newPin: string): Promise<{ success: boolean; message: string }> => {
    const data = await callFunction<{ success: boolean; message: string }>('driverChangePin', { driverId, currentPin, newPin });
    return { success: data.success, message: data.message };
  },

  /**
   * Admin function to set or reset a driver's 4-digit PIN
   * @param driverId - The driver's ID
   * @param newPin - New 4-digit PIN
   * @returns Promise with success status
   */
  adminSetDriverPin: async (
    driverId: string,
    newPin: string
  ): Promise<{ success: boolean; message: string }> => {
    const data = await callFunction<{ success: boolean; message: string }>('adminSetDriverPin', { driverId, newPin });
    return { success: data.success, message: data.message };
  },

  /**
   * Get the driver's active shift
   * @param driverId - Optional driver ID (defaults to current user)
   * @returns Promise with active shift details or null
   */
  getActiveShiftWithDetails: async (
    driverId?: string
  ): Promise<{
    success: boolean;
    hasActiveShift: boolean;
    shift: any | null;
  }> => {
    if (!driverId) {
      // Must handle this case if strict, but for now we assume caller provides it or we return fail
      return { success: false, hasActiveShift: false, shift: null };
    }

    try {
      const activeShift = await api.getActiveShift(driverId);

      if (activeShift) {
        // We need to fetch vehicle details too to match the "WithDetails" expectations
        // But the type 'any' allows us to just return the shift object for now.
        // It might expect { ...shift, vehicle: { ... } }

        const vehicle = await api.getVehicle(activeShift.vehicleId);

        return {
          success: true,
          hasActiveShift: true,
          shift: {
            ...activeShift,
            vehicle: vehicle || undefined
          }
        };
      }

      return {
        success: true,
        hasActiveShift: false,
        shift: null
      };
    } catch (error: any) {
      console.error('Failed to get active shift:', error);
      return {
        success: false,
        hasActiveShift: false,
        shift: null,
      };
    }
  },

  /**
   * Get the active vehicle for a driver (via active shift)
   */
  getDriverActiveVehicle: async (driverId: string): Promise<Vehicle | null> => {
    const activeShift = await api.getActiveShift(driverId);
    if (!activeShift) return null;
    return await api.getVehicle(activeShift.vehicleId);
  },

  /**
   * Check for similar defects on a vehicle
   */
  checkSimilarDefects: async (
    vehicleId: string,
    category: DefectCategory,
    description: string
  ): Promise<DefectReport[]> => {
    const allDefects = await api.getVehicleDefects(vehicleId);
    const descLower = description.toLowerCase();

    return allDefects.filter(defect => {
      // Same category and status is not resolved
      if (defect.category !== category || defect.status === DefectStatus.Resolved) {
        return false;
      }

      // Check if descriptions are similar (simple keyword matching)
      const defectDescLower = defect.description.toLowerCase();
      const words = descLower.split(' ').filter(w => w.length > 3);

      return words.some(word => defectDescLower.includes(word));
    });
  },

  // Placeholder methods for compatibility
  getVehicleHealthStatus: async () => ({ overallStatus: 'Good' as const, issues: [] }),
  submitVehicleCheck: async () => ({}),
  updateVehicleOdometer: async () => ({}),
  getLicenseRenewalReminders: async () => [] as LicenseRenewalReminder[]
};

export default api;
