// Fix: Define all necessary types and enums used throughout the application.
export enum UserRole {
  Admin = 'admin',
  Driver = 'driver',
}

export enum EmploymentStatus {
  Active = 'Active',
  Inactive = 'Inactive',
  Terminated = 'Terminated'
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
  area?: string;
  department?: string;
  employmentStatus?: EmploymentStatus;
  employmentEndDate?: string; // YYYY-MM-DD when employment ended
}

export enum VehicleType {
    ICE = 'ICE', // Internal Combustion Engine
    EV = 'EV',   // Electric Vehicle
}

export enum VehicleStatus {
    Active = 'Active',
    InService = 'In Service', // Scheduled maintenance or repairs
    Repairs = 'Repairs', // Major repairs, accident damage, etc.
    Sold = 'Sold', // Vehicle sold/disposed
    EndOfLife = 'End of Life' // Vehicle retired/disposed
}

export enum BodyStyle {
    Sedan = 'Sedan',
    Hatchback = 'Hatchback',
    SUV = 'SUV',
    PanelVan = 'Panel Van',
    Truck = 'Truck',
    Bakkie = 'Bakkie',
    Coupe = 'Coupe',
    Convertible = 'Convertible',
    Wagon = 'Wagon',
    MiniBus = 'Mini Bus',
    Bus = 'Bus',
    Other = 'Other'
}

export enum FuelType {
    Petrol = 'Petrol',
    Diesel = 'Diesel',
    LPG = 'LPG',
    CNG = 'CNG',
    Hybrid = 'Hybrid'
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

export interface ScheduledService {
  id: string;
  vehicleId: string;
  serviceType: string;
  dueDate: string; // YYYY-MM-DD when service is due
  dueOdometer: number; // Odometer reading when service is due
  isBooked: boolean; // Whether service appointment is booked
  bookedDate?: string; // YYYY-MM-DD when service is scheduled
  bookedTime?: string; // HH:MM appointment time
  serviceProvider?: string; // Workshop/service center name
  reminderSent?: boolean; // Whether day-before reminder has been sent
  notes?: string;
  // Service completion tracking
  sentForService?: boolean; // Vehicle sent to service center
  sentDate?: string; // YYYY-MM-DD when vehicle was sent
  returnedFromService?: boolean; // Vehicle returned from service
  returnDate?: string; // YYYY-MM-DD when vehicle was returned
  actualCost?: number; // Actual cost of service
  serviceNotes?: string; // Notes from service completion
}

export interface Vehicle {
  id: string;
  registration: string;
  alias?: string; // Friendly name/alias for the vehicle
  make: string;
  model: string;
  vin?: string; // Vehicle Identification Number
  engineNumber?: string;
  bodyStyle?: BodyStyle;
  colour?: string;
  fuelType?: FuelType; // Only for ICE vehicles
  vehicleType: VehicleType;
  status: VehicleStatus;
  statusDate?: string; // YYYY-MM-DD when status was last changed
  statusNotes?: string; // Reason for status change, expected return date, etc.
  batteryCapacityKwh?: number; // for EVs
  serviceIntervalKm?: number;
  lastServiceOdometer?: number;
  currentOdometer?: number;
  freeServicesUntilKm?: number;
  maintenanceHistory?: MaintenanceRecord[];

  // Manufacturer Specifications (official claims)
  manufacturerFuelConsumption?: number; // L/100km - manufacturer's claimed consumption
  manufacturerEnergyConsumption?: number; // kWh/100km - for EVs

  // Actual Performance Baselines (real-world established baselines)
  baselineFuelConsumption?: number; // L/100km for ICE vehicles - actual baseline
  baselineEnergyConsumption?: number; // kWh/100km for EVs - actual baseline

  // Economy Monitoring
  currentFuelConsumption?: number; // L/100km - latest calculated consumption
  currentEnergyConsumption?: number; // kWh/100km - latest calculated for EVs
  economyVarianceThreshold?: number; // % variation threshold for alerts (default 15%)
  lastEconomyAlert?: string; // YYYY-MM-DD - last time economy alert was triggered
  economyTrendDirection?: 'improving' | 'stable' | 'degrading' | 'unknown';

  // Financial Details
  financeCompany?: string;
  financeAccountNumber?: string;
  financeCost?: number;
  financeEndDate?: string; // YYYY-MM-DD
  balloonPayment?: number;
  financeContactName?: string;
  financeContactEmail?: string;
  financeContactPhone?: string;

  insuranceCompany?: string;
  insurancePolicyNumber?: string;
  insuranceFee?: number;
  insuranceContactName?: string;
  insuranceContactEmail?: string;
  insuranceContactPhone?: string;

  trackingCompany?: string;
  trackingAccountNumber?: string;
  trackingFee?: number;
  trackingContactName?: string;
  trackingContactEmail?: string;
  trackingContactPhone?: string;

  // Third Party Warranty Insurance
  warrantyInsurer?: string;
  warrantyPolicyNumber?: string;
  warrantyInceptionDate?: string; // YYYY-MM-DD
  warrantyExpiryDate?: string; // YYYY-MM-DD
  warrantyMileageTo?: number; // Mileage when warranty lapses
  warrantyContactName?: string;
  warrantyContactEmail?: string;
  warrantyContactPhone?: string;

  // Default Service Provider
  defaultServiceProviderId?: string; // ID of preferred service provider
  warrantyServiceProviderId?: string; // Service provider for warranty work

  // License Information
  licenseExpiryDate?: string; // YYYY-MM-DD when vehicle license expires
  licenseRenewalReminderDays?: number; // Number of days before expiry to send reminder (admin configurable)
  lastLicenseRenewalDate?: string; // YYYY-MM-DD when license was last renewed
  licenseNumber?: string; // License/registration number for tracking
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

export interface VehicleUsageStats {
    vehicleId: string;
    avgDailyUsageKm: number; // Average daily kilometers driven
    totalDaysTracked: number; // Number of days with usage data
    lastCalculated: Date; // When stats were last updated
    recentUsageTrend: 'increasing' | 'stable' | 'decreasing'; // Usage pattern trend
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
    time?: string; // HH:MM format for automatic driver allocation
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
    // Auto-allocation tracking
    allocatedAutomatically?: boolean; // True if driver was determined via shift lookup
    allocationMethod?: 'manual' | 'shift_lookup' | 'single_driver'; // How the driver was determined
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

export interface FuelEconomyAlert {
    id: string;
    vehicleId: string;
    date: string; // YYYY-MM-DD
    alertType: 'degradation' | 'improvement' | 'maintenance_required';
    currentConsumption: number;
    baselineConsumption: number;
    manufacturerConsumption?: number;
    variancePercentage: number; // % difference from baseline
    severity: 'low' | 'medium' | 'high' | 'critical';
    isResolved: boolean;
    resolvedDate?: string;
    notes?: string;
}

export interface ServiceProvider {
    id: string;
    name: string;
    contactPerson: string;
    primaryPhone: string;
    secondaryPhone?: string;
    email: string;
    address: string;
    city: string;
    province: string;
    postalCode: string;
    specializations: string[]; // e.g., ['ICE', 'EV', 'Warranty', 'General']
    isActive: boolean;
    notes?: string;
    createdDate: string; // YYYY-MM-DD
    lastModified: Date;
}

export interface LicenseRenewalReminder {
    id: string;
    vehicleId: string;
    scheduledDate: string; // YYYY-MM-DD when reminder should be sent
    reminderDaysBefore: number; // How many days before expiry this reminder is for
    isSent: boolean;
    sentDate?: string; // YYYY-MM-DD when reminder was actually sent
    licenseExpiryDate: string; // YYYY-MM-DD when the license expires
    isActive: boolean; // False if license has been renewed and reminder is no longer needed
}

export interface AppSettings {
    id: string;
    areas: string[];
    departments: string[];
    // Service booking deadline settings
    serviceBookingLeadTimeDays: number; // How many days notice needed to book a service
    enableSmartBookingReminders: boolean; // Enable smart reminders based on usage
    defaultDailyUsageKm: number; // Fallback usage if vehicle has no history
    bookingReminderThresholdKm: number; // Manual override - fixed km threshold for all vehicles
    // License renewal reminder settings
    defaultLicenseReminderDays: number; // Default reminder period for vehicles without custom setting
    enableLicenseReminders: boolean; // Master switch for license reminders
    createdBy: string;
    lastModified: Date;
}