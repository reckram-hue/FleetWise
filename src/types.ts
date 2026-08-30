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
    // Test-data isolation marker — inherited from the vehicle at creation time.
    isTestData?: boolean;
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
    // Authoritative pointer to the single OPEN ChargingEvent, if the EV was returned
    // for charging. It is set/cleared only by server-side lifecycle callables.
    openChargingEventId?: string;
    // Authoritative pointer to the single OPEN mid-shift ChargingSession, if the driver is
    // currently charging without ending the shift/assignment. Distinct from
    // openChargingEventId (return-for-charging handover) — the two flows are different
    // business events and must never share a guard field. Set/cleared only by
    // startChargingSession / endChargingSession.
    activeChargingSessionId?: string;
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
    // Test-data isolation marker — inherited from the driver or vehicle at creation time.
    isTestData?: boolean;
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
    startPredictedRangeKm?: number | null;
    endPredictedRangeKm?: number | null;
    transitionReason: VehicleAssignmentTransitionReason;
    createdAt: Date;
    updatedAt: Date;
    // Test-data isolation marker — inherited from the driver or vehicle at creation time.
    isTestData?: boolean;
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
    // Test-data isolation marker — inherited from the parent VehicleAssignment.
    isTestData?: boolean;
}

// Driver-safe summary returned with the consolidated active operational state. It contains
// only the boundary status needed to restore the active driver workflow.
export interface DriverOperationalInspection {
    id: string;
    assignmentId: string;
    boundaryType: VehicleInspectionBoundary;
    status: VehicleInspectionStatus;
    returnIntent?: VehicleReturnIntent | null;
}

export interface DriverOperationalAssignment {
    id: string;
    driverId: string;
    shiftId: string;
    vehicleId: string;
    status: VehicleAssignmentStatus;
    startedAt?: Date | null;
    startOdometer?: number | null;
    startChargePercent?: number | null;
    startPredictedRangeKm?: number | null;
}

export interface DriverOperationalState {
    hasActiveShift: boolean;
    shift: Shift | null;
    hasActiveAssignment: boolean;
    assignment: DriverOperationalAssignment | null;
    vehicle: Vehicle | null;
    inspections: DriverOperationalInspection[];
}

export interface DriverLoginResult {
    sessionToken: string;
    driverId: string;
    expiresAt: string;
    requiresPinChange: boolean;
    driver: User;
    operationalState: DriverOperationalState | null;
    operationalStateNeedsRefresh: boolean;
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
    // Cloud Storage object paths from uploadDefectPhoto (e.g. "vehicle-defects/..."). Legacy
    // records created before the Storage migration may still hold raw base64 data: URLs —
    // any future renderer must branch on that (a data: URL is directly usable as an <img src>;
    // a Storage path is not and must be resolved to a download URL first).
    photos?: string[];
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
    // Test-data isolation marker — inherited from the driver or vehicle at creation time.
    isTestData?: boolean;
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
    // Test-data isolation marker — inherited from the vehicle at creation time.
    isTestData?: boolean;
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
    // Test-data isolation marker — inherited from the assignment or vehicle at creation time.
    isTestData?: boolean;
}

/**
 * @deprecated Legacy single-shot charge record. Never successfully written — the frontend
 * never called addChargeRecord, and Firestore rules deny client `create` on chargeRecords
 * outright. Superseded by ChargingSession (mid-shift, stateful start/end) below. Kept for
 * backwards compatibility per policy; do not build new features against this type.
 */
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

export type ChargingLifecycleStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export type ChargingOutcome = 'CHARGED' | 'NOT_CHARGED' | 'UNKNOWN';

export type ChargingFinancialStatus = 'PENDING' | 'KNOWN' | 'RECONCILED' | 'NOT_APPLICABLE';

export interface ChargingLocationSnapshot {
    name: string;
    type: ChargingLocationType;
    provider: string | null;
    chargerType: string | null;
    costOwner: ChargingLocationCostOwner;
    tariffMethod?: ChargingLocationTariffMethod;
    tariffRate?: number | null;
}

// A handover-to-charging record. WP D creates only OPEN events; close and reconciliation
// fields remain nullable until a later pickup-side work package owns those transitions.
export interface ChargingEvent {
    id: string;
    vehicleId: string;
    returnDriverId: string;
    returnShiftId: string;
    returnAssignmentId: string;
    returnedAt: Date;
    returnOdometer: number;
    returnChargePercent: number;
    returnPredictedRangeKm: number;
    chargingLocationId: string;
    locationSnapshot: ChargingLocationSnapshot;
    lifecycleStatus: ChargingLifecycleStatus;
    chargingOutcome: ChargingOutcome | null;
    financialStatus: ChargingFinancialStatus;
    publicChargeReference?: string | null;
    publicChargeCost?: number | null;
    finalCost?: number | null;
    notes?: string | null;
    pickupDriverId?: string | null;
    pickupShiftId?: string | null;
    pickupAssignmentId?: string | null;
    closedAt?: Date | null;
    reconciledAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// Charging source/type for a mid-shift charging session. Structured as a closed union (not
// arbitrary strings) so backend validation and frontend selects stay in lockstep.
export type ChargingType =
    | 'COMPANY_AC'
    | 'COMPANY_DC'
    | 'PUBLIC_AC'
    | 'PUBLIC_DC';

export const CHARGING_TYPE_LABELS: Record<ChargingType, string> = {
    COMPANY_AC: 'Company AC',
    COMPANY_DC: 'Company DC',
    PUBLIC_AC: 'Public AC',
    PUBLIC_DC: 'Public DC',
};

/**
 * A mid-shift EV charging session: the driver stops to charge without ending the shift or
 * vehicle assignment, then continues on the same assignment afterwards. This is a distinct
 * business event from ChargingEvent (which records a vehicle being RETURNED and left for
 * charging at end-of-assignment) — the two must never share Firestore documents or the
 * vehicle-level guard field (see Vehicle.activeChargingSessionId vs openChargingEventId).
 */
export interface ChargingSession {
    id: string;
    orgId: string;
    vehicleId: string;
    driverId: string;
    shiftId: string;
    assignmentId: string;
    status: ChargingLifecycleStatus;
    startedAt: Date;
    endedAt?: Date | null;
    startOdometer: number;
    startChargePercent: number;
    startPredictedRangeKm: number;
    endChargePercent?: number | null;
    endPredictedRangeKm?: number | null;
    chargingLocationId: string;
    chargingLocationSnapshot: ChargingLocationSnapshot;
    chargingType: ChargingType;
    // Charger-metered/billed energy, when known — reported by the driver or later
    // reconciled by admin from an invoice. Never invented; null when not known.
    chargerEnergyDeliveredKWh?: number | null;
    // Server-derived estimate from usable battery capacity x SOC delta. Left null (never
    // fabricated) when the vehicle's battery capacity isn't known. Deliberately a SEPARATE
    // field from chargerEnergyDeliveredKWh — battery energy gained and charger energy
    // supplied/billed are different concepts (charging losses mean they're rarely equal).
    estimatedBatteryEnergyAddedKWh?: number | null;
    chargeCost?: number | null;
    notes?: string | null;
    isTestData?: boolean;
    createdAt: Date;
    updatedAt: Date;
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
    // Test-data isolation marker — inherited from the driver or vehicle at creation time.
    isTestData?: boolean;
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
    // Test-data isolation marker — inherited from the driver or vehicle at creation time.
    isTestData?: boolean;
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
    // Test-data isolation marker — inherited from the driver or vehicle at creation time.
    isTestData?: boolean;
}
