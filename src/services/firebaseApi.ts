/**
 * Firebase API Service
 * Replaces mockApi with Firestore persistence
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
  orderBy,
  Timestamp,
  writeBatch,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, firebaseConfigured } from '../lib/firebase';
import {
  User,
  UserRole,
  Vehicle,
  Shift,
  ShiftStatus,
  DefectReport,
  DefectStatus,
  DefectCategory,
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
      } else {
        result[key] = convertTimestamps(value);
      }
    }
  });
  return result;
};

const api = {
  // ==================== USERS / DRIVERS ====================
  getUsers: async (): Promise<User[]> => {
    const snapshot = await getDocs(collection(db, COLLECTIONS.users));
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as User);
  },

  getAdminUsers: async (): Promise<User[]> => {
    const q = query(collection(db, COLLECTIONS.users), where('role', '==', UserRole.Admin));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as User);
  },

  createAdminUser: async (userData: { firstName: string; surname: string; email: string; password: string }): Promise<User> => {
    // 1. Get current config to initialize a secondary app
    // This allows creating key without logging out the current user
    const app = getApp();
    const config = app.options;

    // 2. Init secondary app
    const secondaryAppName = `SecondaryApp-${Date.now()}`;
    const secondaryApp = initializeApp(config, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      // 3. Create User in Auth
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, userData.email, userData.password);
      const uid = userCred.user.uid;

      // 4. Create User in Firestore (using main app DB)
      const newUser: User = {
        id: uid,
        firstName: userData.firstName,
        surname: userData.surname,
        email: userData.email,
        role: UserRole.Admin,
        // @ts-ignore - serverTimestamp type mismatch with generic
        createdAt: serverTimestamp()
      };

      // We use setDoc to specify ID matches Auth UID
      await setDoc(doc(db, COLLECTIONS.users, uid), newUser);

      // Sign out from secondary app just in case
      await signOut(secondaryAuth);

      return newUser;
    } catch (error) {
      console.error("Failed to create admin:", error);
      throw error;
    } finally {
      // 5. Cleanup
      await deleteApp(secondaryApp);
    }
  },

  addDriver: async (driverData: Omit<User, 'id' | 'role'>): Promise<User> => {
    // Hash default PIN (1234) client-side using bcryptjs
    let defaultPinHash: string;
    try {
      // Import bcryptjs dynamically to hash the default PIN
      const bcrypt = await import('bcryptjs');
      defaultPinHash = await bcrypt.hash('1234', 10);
    } catch (error) {
      console.error('Failed to hash default PIN:', error);
      throw new Error('Failed to create driver: PIN hashing failed');
    }

    const newDriver = {
      ...driverData,
      role: UserRole.Driver,
      pinHash: defaultPinHash, // Set default PIN hash directly
      pinLastUpdated: serverTimestamp(),
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, COLLECTIONS.users), newDriver);
    const createdDriver = { id: docRef.id, ...driverData, role: UserRole.Driver } as User;

    console.log(`Driver created with default PIN (1234): ${docRef.id}`);

    // NOTE: Telegram sync disabled for Firebase deployment
    // The Express server on localhost:3001 is not available in production
    // Telegram integration should be handled via Cloud Functions if needed
    /*
    try {
      await fetch('http://localhost:3001/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docRef.id,
          firstName: driverData.firstName,
          surname: driverData.surname,
          isActive: true
        })
      });
    } catch (error) {
      console.warn('Failed to sync driver with backend server:', error);
    }
    */

    return createdDriver;
  },

  updateDriver: async (driverData: User): Promise<User> => {
    const { id, ...updateData } = driverData;
    await updateDoc(doc(db, COLLECTIONS.users, id), { ...updateData, updatedAt: serverTimestamp() });
    return driverData;
  },

  deleteDriver: async (driverId: string): Promise<{ success: boolean }> => {
    await deleteDoc(doc(db, COLLECTIONS.users, driverId));
    return { success: true };
  },

  canDeleteDriver: async (driverId: string): Promise<{ canDelete: boolean; reasons: string[] }> => {
    const reasons: string[] = [];

    // Check for active shifts
    const activeShift = await api.getActiveShift(driverId);
    if (activeShift) {
      reasons.push('Driver has an active shift');
    }

    // Check for completed shifts
    const shifts = await api.getDriverShifts(driverId);
    const completedShifts = shifts.filter(s => s.status === ShiftStatus.Completed);
    if (completedShifts.length > 0) {
      reasons.push(`Driver has ${completedShifts.length} completed shift(s) in the system`);
    }

    // Check for fines
    const fines = await api.getDriverFines(driverId);
    if (fines.length > 0) {
      reasons.push(`Driver has ${fines.length} fine(s) recorded`);
    }

    // Check for damages (where driver is responsible)
    const allDamages = await api.getVehicleDamages();
    const driverDamages = allDamages.filter(d => d.driverId === driverId);
    if (driverDamages.length > 0) {
      reasons.push(`Driver has ${driverDamages.length} damage report(s)`);
    }

    return {
      canDelete: reasons.length === 0,
      reasons
    };
  },

  updateEmploymentStatus: async (driverId: string, status: any, endDate?: string): Promise<User> => {
    const driverRef = doc(db, COLLECTIONS.users, driverId);
    const updateData: any = {
      employmentStatus: status,
      updatedAt: serverTimestamp()
    };

    if (endDate) {
      updateData.employmentEndDate = endDate;
    } else {
      // Remove end date if status is Active
      updateData.employmentEndDate = null;
    }

    await updateDoc(driverRef, updateData);
    const updatedDoc = await getDoc(driverRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as User;
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
    const q = query(
      collection(db, COLLECTIONS.shifts),
      where('driverId', '==', driverId),
      where('status', '==', ShiftStatus.Active)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return convertTimestamps({ id: doc.id, ...doc.data() }) as Shift;
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

  startShift: async (shiftData: { driverId: string; vehicleId: string; startOdometer?: number; startChargePercent?: number; }): Promise<Shift> => {
    // Check for existing active shift
    const existingActive = await api.getActiveShift(shiftData.driverId);
    if (existingActive) {
      throw new Error("Driver already has an active shift.");
    }

    const newShift = {
      ...shiftData,
      startTime: serverTimestamp(),
      startOdometer: shiftData.startOdometer || 0,
      status: ShiftStatus.Active,
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, COLLECTIONS.shifts), newShift);
    return { id: docRef.id, ...shiftData, startTime: new Date(), status: ShiftStatus.Active, startOdometer: shiftData.startOdometer || 0 } as Shift;
  },

  endShift: async (shiftId: string, endData: { endOdometer: number; endChargePercent?: number; notes?: string; }): Promise<Shift> => {
    const shiftRef = doc(db, COLLECTIONS.shifts, shiftId);
    const updateData: any = {
      endOdometer: endData.endOdometer,
      endTime: serverTimestamp(),
      status: ShiftStatus.Completed,
      updatedAt: serverTimestamp()
    };

    if (endData.endChargePercent !== undefined) {
      updateData.endChargePercent = endData.endChargePercent;
    }
    if (endData.notes !== undefined) {
      updateData.notes = endData.notes;
    }

    await updateDoc(shiftRef, updateData);
    const updatedDoc = await getDoc(shiftRef);
    return convertTimestamps({ id: updatedDoc.id, ...updatedDoc.data() }) as Shift;
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

  addDefectReport: async (defectData: Omit<DefectReport, 'id' | 'reportedDateTime' | 'status' | 'isVisibleToDriver'>): Promise<DefectReport> => {
    const newDefect = {
      ...defectData,
      reportedDateTime: serverTimestamp(),
      status: DefectStatus.Open,
      isVisibleToDriver: true,
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, COLLECTIONS.defects), newDefect);
    return {
      id: docRef.id,
      ...defectData,
      reportedDateTime: new Date(),
      status: DefectStatus.Open,
      isVisibleToDriver: true
    } as DefectReport;
  },

  updateDefectReport: async (defectId: string, updateData: Partial<DefectReport>): Promise<DefectReport> => {
    const defectRef = doc(db, COLLECTIONS.defects, defectId);
    await updateDoc(defectRef, { ...updateData, updatedAt: serverTimestamp() });
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

  getVehicleCosts: async (vehicleId: string): Promise<Cost[]> => {
    // Fetch and filter in memory to avoid index requirement
    const snapshot = await getDocs(collection(db, COLLECTIONS.costs));
    const allCosts = snapshot.docs.map(doc => convertTimestamps({ id: doc.id, ...doc.data() }) as Cost);
    return allCosts
      .filter(c => c.vehicleId === vehicleId)
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

  // ==================== STATISTICS & REPORTS ====================
  getLeaderboard: async (): Promise<LeaderboardEntry[]> => {
    // Calculate from shifts and other data
    const shifts = await getDocs(collection(db, COLLECTIONS.shifts));
    const users = await api.getUsers();

    const driverStats = new Map<string, { trips: number; totalKm: number }>();

    shifts.forEach(shiftDoc => {
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

    const leaderboard: LeaderboardEntry[] = [];
    users.forEach(user => {
      if (user.role === UserRole.Driver) {
        const stats = driverStats.get(user.id) || { trips: 0, totalKm: 0 };
        leaderboard.push({
          driver: user,
          totalKmDriven: stats.totalKm
        });
      }
    });

    return leaderboard.sort((a, b) => b.totalKmDriven - a.totalKmDriven);
  },

  getVehicleStats: async (vehicleId: string, startDate: Date, endDate: Date): Promise<VehicleStats> => {
    // Aggregate stats from various collections
    const vehicle = await api.getVehicle(vehicleId);
    if (!vehicle) throw new Error('Vehicle not found');

    // This is a simplified version - you'd calculate real stats from shifts, costs, etc.
    return {
      avgDailyDistanceKm: 0, // Placeholder
      avgEnergyConsumptionKwhPerKm: 0 // Placeholder
    };
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

  getDriverIncidentSummary: async (driverId?: string): Promise<DriverIncidentSummary[] | DriverIncidentSummary> => {
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

    // 4. Return array or single object based on input
    // NOTE: Always return array for now as ManageIncidents expects it.
    // If specific driver requested, filter result (already done by drivers filter)

    // However, if we change return type signature, we might break types.
    // The current signature says `Promise<DriverIncidentSummary>`.
    // I need to change the interface usage or the function signature.
    // ManageIncidents calls it without args and expects Array.

    if (driverId) {
      return summaries.length > 0 ? summaries[0] : {
        driverId,
        totalFines: 0,
        totalFineAmount: 0,
        totalDamages: 0,
        totalDamageAmount: 0,
        unpaidFines: 0,
        unpaidAmount: 0,
        totalDamagesCost: 0,
        riskScore: 0,
        needsTraining: false,
        driver: drivers[0] || { id: driverId } as any // Fallback
      } as DriverIncidentSummary;
    }

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

  // ==================== SHIFT MANAGEMENT WITH PIN ====================
  // Client-side implementation replacing Cloud Functions

  /**
   * Validate a driver's PIN
   */
  validateDriverPin: async (driverId: string, pin: string): Promise<{ valid: boolean; requiresPinChange: boolean; message?: string }> => {
    const driverRef = doc(db, COLLECTIONS.users, driverId);
    const driverSnap = await getDoc(driverRef);

    if (!driverSnap.exists()) {
      return { valid: false, requiresPinChange: false, message: 'Driver not found' };
    }

    const driverData = driverSnap.data() as User;

    // If no PIN set, allow default 1234 but force change
    if (!driverData.pinHash) {
      // Check if pin is 1234
      if (pin === '1234') {
        return { valid: true, requiresPinChange: true };
      }
      return { valid: false, requiresPinChange: false, message: 'Invalid PIN' };
    }

    try {
      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(pin, driverData.pinHash);

      if (isValid) {
        // Check if it is the default hash for 1234
        const isDefault = await bcrypt.compare('1234', driverData.pinHash);
        return { valid: true, requiresPinChange: isDefault };
      } else {
        return { valid: false, requiresPinChange: false, message: 'Invalid PIN' };
      }
    } catch (e) {
      console.error("PIN validation error", e);
      return { valid: false, requiresPinChange: false, message: 'Validation error' };
    }
  },

  /**
   * Start a shift with PIN authentication
   * @param driverId - The driver's ID
   * @param vehicleId - The vehicle's ID
   * @param pin - 4-digit PIN for authentication
   * @param deviceId - Optional device identifier for rate limiting
   * @param startOdo - Optional starting odometer reading
   * @param startChargePercent - Optional starting charge percentage (for EVs)
   * @returns Promise with shift details
   */
  startShiftWithPin: async (
    driverId: string,
    vehicleId: string,
    pin: string,
    deviceId?: string,
    startOdo?: number,
    startChargePercent?: number
  ): Promise<{ success: boolean; shiftId: string; message: string }> => {

    // Validate PIN first
    const validation = await api.validateDriverPin(driverId, pin);
    if (!validation.valid) {
      throw new Error(validation.message || 'Invalid PIN');
    }

    try {
      const shift = await api.startShift({
        driverId,
        vehicleId,
        startOdometer: startOdo,
        startChargePercent
      });
      return { success: true, shiftId: shift.id, message: 'Shift started successfully' };
    } catch (e: any) {
      throw new Error(e.message || 'Failed to start shift');
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
    // Validate current PIN
    const validation = await api.validateDriverPin(driverId, currentPin);
    if (!validation.valid) {
      throw new Error('Current PIN is incorrect');
    }

    return await api.adminSetDriverPin(driverId, newPin);
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
    try {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash(newPin, 10);

      await updateDoc(doc(db, COLLECTIONS.users, driverId), {
        pinHash: hash,
        pinLastUpdated: serverTimestamp()
      });

      return { success: true, message: 'PIN updated successfully' };
    } catch (e: any) {
      throw new Error(e.message || 'Failed to update PIN');
    }
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
