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
    pinHash?: string;
    pinLastUpdated?: any; // Timestamp
    // Archive / retention fields (set by archiveDriver callable)
    inactiveAt?: Date;
    inactiveBy?: string;
    inactiveReason?: string;
    retentionPeriodMonths?: number;
    retentionReason?: string;
    archiveUntil?: string; // YYYY-MM-DD — earliest date a permanent purge could be considered
    legalHold?: boolean;
    legalHoldReason?: string;
    // Seed / test data marker — never set on real driver records
    isTestData?: boolean;
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
    year?: number; // Model year
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
    licenseDiscNumber?: string; // Licence disc number (renewal disc)
    // Seed / test data marker — never set on real vehicle records
    isTestData?: boolean;

    // Server-maintained current-vehicle pointers (WP7B). Transactionally kept in sync by
    // startShiftWithSession / startVehicleAssignment / endVehicleAssignment — never written
    // by the client. activeAssignmentId is set only while an ACTIVE VehicleAssignment exists
    // for this vehicle; activeShiftId is the broader "this vehicle currently belongs to a
    // shift" pointer the backend uses to gate NEW shift starts (startShiftWithSession).
    // Absent means available (subject to `status`). Do not derive current-vehicle-in-use
    // from any Shift document's frozen vehicleId field — use these instead.
    activeAssignmentId?: string;
    activeShiftId?: string;
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

// A VehicleAssignment represents "this driver possessed/used this vehicle during this
// portion of the shift." A shift may have many assignments over time (e.g. EV swaps).
export type VehicleAssignmentStatus =
    | 'ACTIVE'
    | 'COMPLETED'
    | 'CANCELLED';

export type VehicleAssignmentTransitionReason =
    | 'SHIFT_START'
    | 'VEHICLE_SWAP'
    | 'SHIFT_END'
    | 'CANCELLED';

export interface VehicleAssignment {
    id: string;
    orgId: string;
    driverId: string;
    shiftId: string;
    vehicleId: string;
    status: VehicleAssignmentStatus;
    startedAt: Date;
    endedAt?: Date | null;
    startOdometer?: number | null;
    endOdometer?: number | null;
    startChargePercent?: number | null;
    endChargePercent?: number | null;
    transitionReason: VehicleAssignmentTransitionReason;
    createdAt: Date;
    updatedAt: Date;
}

// A VehicleInspection captures chain-of-custody / condition evidence at a
// VehicleAssignment boundary (PICKUP or RETURN). Photo paths remain null until
// WP7D2 adds real Cloud Storage; WP7D1 records capture-completion booleans only.
export type VehicleInspectionBoundary = 'PICKUP' | 'RETURN';

export type VehicleInspectionStatus = 'PENDING' | 'COMPLETED';

export type RetentionClass = 'ROUTINE' | 'EVIDENCE';

// What the driver intends to do AFTER a RETURN inspection is completed.
export type VehicleReturnIntent = 'VEHICLE_SWAP' | 'SHIFT_END';

// The two required routine inspection photo roles.
export type VehicleInspectionPhotoRole = 'EXTERIOR' | 'INTERIOR';

export interface VehicleInspection {
    id: string;
    orgId: string;
    assignmentId: string;
    shiftId: string;
    driverId: string;
    vehicleId: string;
    boundaryType: VehicleInspectionBoundary;
    status: VehicleInspectionStatus;
    // PICKUP -> null. RETURN -> 'VEHICLE_SWAP' or 'SHIFT_END' (server-authoritative).
    returnIntent?: VehicleReturnIntent | null;
    capturedAt?: Date | null;
    completedAt?: Date | null;
    // Storage OBJECT PATHS (not public URLs). Written server-side only.
    exteriorPhotoPath?: string | null;
    interiorPhotoPath?: string | null;
    exteriorPhotoSize?: number | null;
    interiorPhotoSize?: number | null;
    exteriorPhotoContentType?: string | null;
    interiorPhotoContentType?: string | null;
    // Derived convenience fields (server-set to true only after real objects are verified).
    exteriorPhotoCaptured: boolean;
    interiorPhotoCaptured: boolean;
    hasDamage: boolean;
    damageDescription?: string | null;
    retentionClass: RetentionClass;
    expiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
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

// Driver-facing "View My Stats" summary (WP8H). Returned by the session-authenticated
// getDriverStatsWithSession callable — server-scoped to the authenticated driver only.
// Deliberately narrower than LeaderboardEntry/DriverIncidentSummary (used by admin
// screens): no nested user object, no ICE/EV/efficiency breakdown fields that the
// live Driver Dashboard never actually populated.
export interface DriverStatsSummary {
    totalKmDriven: number;
    totalFines: number;
    totalFineAmount: number;
    unpaidFines: number;
    unpaidAmount: number;
    totalDamages: number;
    totalDamagesCost: number;
    lastIncidentDate: string | null;
    riskScore: number; // 0-100, higher = more risky
    needsTraining: boolean;
}

export interface RefuelRecord {
    id: string;
    vehicleId: string;
    driverId: string;
    shiftId?: string;
    assignmentId?: string;
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

export type ChargingLocationType =
    | 'OFFICE'
    | 'PUBLIC_THIRD_PARTY';

export type ChargingLocationTariffMethod =
    | 'FREE'
    | 'PER_KWH'
    | 'PER_SESSION';

export type ChargingLocationCostOwner =
    | 'COMPANY'
    | 'DRIVER';

export interface ChargingLocation {
    id: string;
    orgId?: string;
    name: string;
    type: ChargingLocationType;
    description?: string;
    active: boolean;
    provider?: string;
    chargerType?: string;
    tariffMethod: ChargingLocationTariffMethod;
    tariffRate?: number;
    costOwner: ChargingLocationCostOwner;
    createdAt?: Date | string | any;
    createdBy: string;
    updatedAt?: Date | string | any;
    updatedBy: string;
}

/**
 * Driver-safe charging-location projection returned only by the
 * session-authenticated location picker callable.
 */
export interface ChargingLocationForDriver {
    id: string;
    name: string;
    type: ChargingLocationType;
    description?: string;
    provider?: string;
    chargerType?: string;
    costOwner: ChargingLocationCostOwner;
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
    createdDate?: string; // YYYY-MM-DD
    lastModified?: Date;
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

export type DiscrepancyStatus = 'OPEN' | 'RESOLVED' | 'INVESTIGATING';
export type DiscrepancyType = 'UNACCOUNTED_MILEAGE';

export interface OdometerDiscrepancy {
    id: string;
    orgId?: string;
    vehicleId: string;
    vehicleRegistration?: string;
    driverId: string;
    driverName?: string;
    shiftId: string;
    assignmentId?: string;
    expectedOdometer: number;
    actualPickupOdometer: number;
    unaccountedKm: number;
    detectedAt: Date | string | any;
    status: DiscrepancyStatus;
    type: DiscrepancyType;
    createdAt?: Date | string | any;
    updatedAt?: Date | string | any;
    notes?: string;
}
