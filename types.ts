// Fix: Define all necessary types and enums used throughout the application.
export enum UserRole {
  Admin = 'admin',
  Driver = 'driver',
}

export interface User {
  id: string;
  firstName: string;
  surname: string;
  role: UserRole;
  email: string;
  idNumber?: string;
  driversLicenceNumber?: string;
  driversLicenceExpiry?: string; // Storing as string YYYY-MM-DD for simplicity
  contactNumber?: string;
  driversLicenceImageUrl?: string; // base64 or URL
}

export enum VehicleType {
    ICE = 'ICE', // Internal Combustion Engine
    EV = 'EV',   // Electric Vehicle
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  date: string; // YYYY-MM-DD
  odometer: number;
  serviceType: string;
  cost: number;
  notes?: string;
}

export interface Vehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  vehicleType: VehicleType;
  batteryCapacityKwh?: number; // for EVs
  serviceIntervalKm?: number;
  lastServiceOdometer?: number;
  currentOdometer?: number;
  freeServicesUntilKm?: number;
  maintenanceHistory?: MaintenanceRecord[];
  
  // Financial Details
  financeCompany?: string;
  financeAccountNumber?: string;
  financeCost?: number;
  financeEndDate?: string; // YYYY-MM-DD
  balloonPayment?: number;

  insuranceCompany?: string;
  insurancePolicyNumber?: string;
  insuranceFee?: number;

  trackingCompany?: string;
  trackingAccountNumber?: string;
  trackingFee?: number;
}

export enum ShiftStatus {
    Active = 'Active',
    Completed = 'Completed'
}

export interface Shift {
    id: string;
    driverId: string;
    vehicleId: string;
    startTime: Date;
    endTime?: Date;
    startOdometer: number;
    endOdometer?: number;
    startChargePercent?: number; // for EVs
    endChargePercent?: number; // for EVs
    status: ShiftStatus;
}

export enum DefectUrgency {
    Critical = 'Critical',
    High = 'High',
    Medium = 'Medium',
    Low = 'Low',
}

export interface DefectReport {
    id: string;
    vehicleId: string;
    driverId: string;
    dateTime: Date;
    description: string;
    urgency: DefectUrgency;
    isResolved: boolean;
}

export enum CostCategory {
    Fuel = 'Fuel/Charging',
    Maintenance = 'Maintenance',
    Repairs = 'Repairs',
    Insurance = 'Insurance',
    Other = 'Other'
}

export interface Cost {
    id: string;
    vehicleId: string;
    date: Date;
    cost: number;
    category: CostCategory;
    description: string;
}

export interface LeaderboardEntry {
    driver: User;
    totalKmDriven: number;
    averageKmL?: number;
    averageKmPerKwh?: number;
}

export interface VehicleStats {
    avgDailyDistanceKm: number;
    avgEnergyConsumptionKwhPerKm: number;
}