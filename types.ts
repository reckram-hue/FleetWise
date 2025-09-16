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

  // Performance Baselines
  baselineFuelConsumption?: number; // L/100km for ICE vehicles
  baselineEnergyConsumption?: number; // kWh/100km for EVs

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

export enum DefectCategory {
    Engine = 'Engine',
    Transmission = 'Transmission',
    Brakes = 'Brakes',
    Electrical = 'Electrical',
    HVAC = 'HVAC/Climate',
    Exterior = 'Exterior',
    Interior = 'Interior',
    Tires = 'Tires',
    Safety = 'Safety Systems',
    Audio = 'Audio/Entertainment',
    Other = 'Other'
}

export enum DefectStatus {
    Open = 'Open',
    Acknowledged = 'Acknowledged', // Admin has seen it
    InProgress = 'In Progress', // Being repaired
    Resolved = 'Resolved', // Fixed and closed
    Duplicate = 'Duplicate' // Marked as duplicate of another defect
}

export interface DefectReport {
    id: string;
    vehicleId: string;
    driverId: string;
    reportedDateTime: Date;
    category: DefectCategory;
    description: string;
    urgency: DefectUrgency;
    status: DefectStatus;
    location?: string; // Where on the vehicle
    photos?: string[]; // URLs or base64
    notes?: string;

    // Admin fields
    acknowledgedBy?: string; // Admin user ID
    acknowledgedDateTime?: Date;
    assignedTo?: string; // Technician/repair shop
    estimatedCost?: number;
    actualCost?: number;
    resolvedBy?: string; // Admin user ID
    resolvedDateTime?: Date;
    duplicateOf?: string; // ID of original defect if this is a duplicate

    // Tracking
    isVisibleToDriver: boolean; // False if marked as duplicate
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
    totalICEKmDriven?: number;
    totalEVKmDriven?: number;
    totalFuelConsumed?: number;
    totalEnergyConsumed?: number;
    // Performance scoring
    iceEfficiencyScore?: number; // 0-100, compared to vehicle baselines
    evEfficiencyScore?: number; // 0-100, compared to vehicle baselines
    overallEfficiencyScore?: number; // Weighted average of ICE and EV scores
}

export interface VehicleStats {
    avgDailyDistanceKm: number;
    avgEnergyConsumptionKwhPerKm: number;
}

export interface RefuelRecord {
    id: string;
    vehicleId: string;
    driverId: string;
    shiftId?: string;
    date: Date;
    odometer: number;
    litresFilled: number;
    fuelCost: number;
    oilCost?: number;
    notes?: string;
}

export interface ChargeRecord {
    id: string;
    vehicleId: string;
    driverId: string;
    shiftId?: string;
    date: Date;
    odometer: number;
    kwhAdded: number;
    chargeCost: number;
    startChargePercent: number;
    endChargePercent: number;
    notes?: string;
}

export enum FineType {
    Speeding = 'Speeding',
    IllegalParking = 'Illegal Parking',
    NoSeatBelt = 'No Seat Belt',
    MobilePhone = 'Mobile Phone Use',
    RedLight = 'Red Light Violation',
    StopSign = 'Stop Sign Violation',
    Overloading = 'Vehicle Overloading',
    UnlicensedDriving = 'Unlicensed Driving',
    Other = 'Other'
}

export enum DamageType {
    Accident = 'Traffic Accident',
    Scratches = 'Scratches/Dents',
    Windscreen = 'Windscreen Damage',
    Tyres = 'Tyre Damage',
    Interior = 'Interior Damage',
    Mechanical = 'Mechanical Damage',
    Vandalism = 'Vandalism',
    Theft = 'Theft/Break-in',
    Other = 'Other'
}

export enum IncidentSeverity {
    Minor = 'Minor',
    Moderate = 'Moderate',
    Major = 'Major',
    Critical = 'Critical'
}

export interface DriverFine {
    id: string;
    driverId: string;
    vehicleId: string;
    date: string; // YYYY-MM-DD
    fineType: FineType;
    amount: number;
    description: string;
    fineNumber?: string;
    location?: string;
    issuingAuthority?: string;
    dueDate?: string; // YYYY-MM-DD
    isPaid: boolean;
    paidDate?: string; // YYYY-MM-DD
    notes?: string;
}

export interface VehicleDamage {
    id: string;
    vehicleId: string;
    driverId: string;
    date: string; // YYYY-MM-DD
    damageType: DamageType;
    severity: IncidentSeverity;
    estimatedCost: number;
    actualCost?: number;
    description: string;
    location?: string; // Where on vehicle
    isRepaired: boolean;
    repairedDate?: string; // YYYY-MM-DD
    insuranceClaim: boolean;
    claimNumber?: string;
    notes?: string;
    photos?: string[]; // URLs or base64
}

export interface DriverIncidentSummary {
    driverId: string;
    driver: User;
    totalFines: number;
    totalFineAmount: number;
    unpaidFines: number;
    unpaidAmount: number;
    totalDamages: number;
    totalDamagesCost: number;
    lastIncidentDate?: string;
    riskScore: number; // 0-100, higher = more risky
    needsTraining: boolean;
}