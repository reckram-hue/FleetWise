// Fix: Implement mock API with sample data to resolve module errors and provide data to components.
import {
  User,
  UserRole,
  Vehicle,
  VehicleType,
  VehicleStatus,
  Shift,
  ShiftStatus,
  DefectReport,
  DefectUrgency,
  DefectCategory,
  DefectStatus,
  Cost,
  CostCategory,
  LeaderboardEntry,
  VehicleStats,
  VehicleUsageStats,
  MaintenanceRecord,
  ScheduledService,
  DriverFine,
  VehicleDamage,
  FineType,
  DamageType,
  IncidentSeverity,
  DriverIncidentSummary,
  RefuelRecord,
  ChargeRecord,
  AppSettings,
  EmploymentStatus,
  FuelEconomyAlert
} from '../types';

// FIX: Export mockUsers to be used in the login screen.
export let mockUsers: User[] = [
  { id: 'admin1', firstName: 'Admin', surname: 'User', role: UserRole.Admin, email: 'admin@fleetwise.com' },
  { id: 'driver1', firstName: 'John', surname: 'Doe', role: UserRole.Driver, email: 'john.d@fleetwise.com', idNumber: '8501015000080', driversLicenceNumber: 'JDOE12345', driversLicenceExpiry: '2025-12-31', contactNumber: '0821234567', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver1', employmentStatus: EmploymentStatus.Active, area: 'Cape Town', department: 'Operations' },
  { id: 'driver2', firstName: 'Jane', surname: 'Smith', role: UserRole.Driver, email: 'jane.s@fleetwise.com', idNumber: '9203054001081', driversLicenceNumber: 'JSMITH6789', driversLicenceExpiry: '2024-08-15', contactNumber: '0837654321', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver2', employmentStatus: EmploymentStatus.Active, area: 'Johannesburg', department: 'Logistics' },
  { id: 'driver3', firstName: 'Peter', surname: 'Jones', role: UserRole.Driver, email: 'peter.j@fleetwise.com', idNumber: '8811205002085', driversLicenceNumber: 'PJONES1122', driversLicenceExpiry: '2026-02-28', contactNumber: '0848889999', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver3', employmentStatus: EmploymentStatus.Inactive, area: 'Durban', department: 'Sales', employmentEndDate: '2024-06-30' },
  { id: 'driver4', firstName: 'Mary', surname: 'Williams', role: UserRole.Driver, email: 'mary.w@fleetwise.com', idNumber: '9507154003083', driversLicenceNumber: 'MWILLS3344', driversLicenceExpiry: '2023-05-20', contactNumber: '0825556666', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver4', employmentStatus: EmploymentStatus.Active, area: 'Pretoria', department: 'Finance' },
];

let mockMaintenanceRecords: MaintenanceRecord[] = [
  { id: 'm1', vehicleId: 'v1', date: '2023-10-15', odometer: 45100, serviceType: '10,000 km Service', cost: 1800, notes: 'Oil change, filter replacement, tire rotation.' },
  { id: 'm2', vehicleId: 'v1', date: '2023-06-01', odometer: 35050, serviceType: 'Minor Service', cost: 950, notes: 'Oil and filter change.' },
  { id: 'm3', vehicleId: 'v2', date: '2023-11-20', odometer: 72300, serviceType: '15,000 km Service', cost: 2500, notes: 'Full service with brake fluid change.' },
  { id: 'm4', vehicleId: 'v2', date: '2023-08-10', odometer: 65000, serviceType: 'Tire Replacement', cost: 4800, notes: 'Replaced two rear tires.' },
  { id: 'm5', vehicleId: 'v4', date: '2023-09-05', odometer: 95000, serviceType: 'Major Service', cost: 3200, notes: 'Timing belt checked, all fluids replaced.' },
];

let mockScheduledServices: ScheduledService[] = [
  {
    id: 'ss1',
    vehicleId: 'v1',
    serviceType: '10,000 km Service',
    dueDate: '2024-01-20',
    dueOdometer: 46000,
    isBooked: false,
    notes: 'Due soon - 400km remaining'
  },
  {
    id: 'ss2',
    vehicleId: 'v2',
    serviceType: '15,000 km Service',
    dueDate: '2024-01-25',
    dueOdometer: 74500,
    isBooked: true,
    bookedDate: '2024-01-25',
    bookedTime: '09:00',
    serviceProvider: 'City Motors Workshop',
    reminderSent: false,
    notes: 'Booked with preferred service center'
  },
  {
    id: 'ss3',
    vehicleId: 'v6',
    serviceType: 'First Service',
    dueDate: '2024-01-18',
    dueOdometer: 15000,
    isBooked: true,
    bookedDate: '2024-01-18',
    bookedTime: '14:30',
    serviceProvider: 'Kia Service Center',
    reminderSent: true,
    notes: 'Free service - reminder already sent'
  },
];

let mockVehicleUsageStats: VehicleUsageStats[] = [
  {
    vehicleId: 'v1',
    avgDailyUsageKm: 120, // CA 123-456 Toyota Hilux - moderate usage
    totalDaysTracked: 45,
    lastCalculated: new Date(),
    recentUsageTrend: 'stable'
  },
  {
    vehicleId: 'v2',
    avgDailyUsageKm: 200, // GP 789-XYZ Ford Ranger - high usage
    totalDaysTracked: 38,
    lastCalculated: new Date(),
    recentUsageTrend: 'increasing'
  },
  {
    vehicleId: 'v6',
    avgDailyUsageKm: 85, // NC 321-654 Kia Sonet - low usage
    totalDaysTracked: 20,
    lastCalculated: new Date(),
    recentUsageTrend: 'stable'
  },
  {
    vehicleId: 'v3',
    avgDailyUsageKm: 95, // EC 456-789 Hyundai Kona EV - currently out of service
    totalDaysTracked: 30,
    lastCalculated: new Date(),
    recentUsageTrend: 'decreasing'
  },
  {
    vehicleId: 'v5',
    avgDailyUsageKm: 160, // WP 111-222 VW ID.4 - higher usage EV
    totalDaysTracked: 25,
    lastCalculated: new Date(),
    recentUsageTrend: 'stable'
  }
];

export let mockVehicles: Vehicle[] = [
    {
        id: 'v1',
        registration: 'CA 123-456',
        make: 'Toyota',
        model: 'Hilux',
        vehicleType: VehicleType.ICE,
        status: VehicleStatus.Active,
        statusDate: '2024-01-01',
        statusNotes: '',
        manufacturerFuelConsumption: 9.8, // L/100km - Toyota's claimed consumption
        baselineFuelConsumption: 11.5, // L/100km - actual established baseline
        currentFuelConsumption: 12.8, // L/100km - recent performance (degrading)
        economyVarianceThreshold: 15, // Alert if 15% above baseline
        economyTrendDirection: 'degrading',
        currentOdometer: 45600,
        serviceIntervalKm: 10000,
        lastServiceOdometer: 45100,
        maintenanceHistory: mockMaintenanceRecords.filter(r => r.vehicleId === 'v1'),
        financeCompany: 'WesBank',
        financeAccountNumber: 'WB1234567',
        financeCost: 7500.00,
        financeEndDate: '2026-08-31',
        balloonPayment: 80000.00,
        insuranceCompany: 'Santam',
        insurancePolicyNumber: 'POL9876543',
        insuranceFee: 1500.00,
        trackingCompany: 'Tracker',
        trackingAccountNumber: 'TRK555123',
        trackingFee: 250.00,
    },
    {
        id: 'v2',
        registration: 'GP 789-XYZ',
        make: 'Ford',
        model: 'Ranger',
        vehicleType: VehicleType.ICE,
        status: VehicleStatus.InService,
        statusDate: '2024-01-15',
        statusNotes: 'Scheduled maintenance - expected return Jan 17',
        manufacturerFuelConsumption: 10.2, // L/100km - Ford's claimed consumption
        baselineFuelConsumption: 12.8, // L/100km - actual baseline (higher consumption)
        currentFuelConsumption: 12.6, // L/100km - recent performance (improving)
        economyVarianceThreshold: 15,
        economyTrendDirection: 'improving',
        currentOdometer: 73500,
        serviceIntervalKm: 15000,
        lastServiceOdometer: 72300,
        maintenanceHistory: mockMaintenanceRecords.filter(r => r.vehicleId === 'v2'),
        financeCompany: 'MFC',
        financeAccountNumber: 'MFC-987654',
        financeCost: 8200.00,
        financeEndDate: '2025-11-30',
        balloonPayment: 95000.00,
        insuranceCompany: 'OUTsurance',
        insurancePolicyNumber: 'OUT-112233',
        insuranceFee: 1800.00,
        trackingCompany: 'Netstar',
        trackingAccountNumber: 'NET-445566',
        trackingFee: 300.00,
    },
    {
        id: 'v6',
        registration: 'NC 321-654',
        make: 'Kia',
        model: 'Sonet',
        vehicleType: VehicleType.ICE,
        status: VehicleStatus.Active,
        statusDate: '2024-01-01',
        statusNotes: '',
        manufacturerFuelConsumption: 5.8, // L/100km - Kia's claimed consumption
        baselineFuelConsumption: 7.2, // L/100km - actual baseline (more economical)
        currentFuelConsumption: 7.1, // L/100km - recent performance (stable)
        economyVarianceThreshold: 15,
        economyTrendDirection: 'stable',
        currentOdometer: 14500,
        serviceIntervalKm: 15000,
        lastServiceOdometer: 0,
        freeServicesUntilKm: 45000,
        maintenanceHistory: []
    },
    {
        id: 'v3',
        registration: 'EC 456-789',
        make: 'Hyundai',
        model: 'Kona EV',
        vehicleType: VehicleType.EV,
        status: VehicleStatus.Repairs,
        statusDate: '2024-01-10',
        statusNotes: 'Accident damage repair - awaiting parts',
        batteryCapacityKwh: 64,
        baselineEnergyConsumption: 16.8, // kWh/100km - Hyundai Kona EV baseline
        currentOdometer: 32000,
        maintenanceHistory: []
    },
    {
        id: 'v4',
        registration: 'KZN 987-654',
        make: 'Isuzu',
        model: 'D-Max',
        vehicleType: VehicleType.ICE,
        status: VehicleStatus.Sold,
        statusDate: '2023-12-15',
        statusNotes: 'Vehicle sold - high mileage, no longer cost effective',
        baselineFuelConsumption: 13.5, // L/100km - Isuzu D-Max baseline (highest consumption)
        currentOdometer: 98000,
        serviceIntervalKm: 10000,
        lastServiceOdometer: 95000,
        maintenanceHistory: mockMaintenanceRecords.filter(r => r.vehicleId === 'v4')
    },
    {
        id: 'v5',
        registration: 'WP 111-222',
        make: 'VW',
        model: 'ID.4',
        vehicleType: VehicleType.EV,
        status: VehicleStatus.Active,
        statusDate: '2024-01-01',
        statusNotes: '',
        batteryCapacityKwh: 77,
        baselineEnergyConsumption: 19.2, // kWh/100km - VW ID.4 baseline (larger EV, higher consumption)
        currentOdometer: 15000,
        maintenanceHistory: []
    },
];

const mockShifts: Shift[] = [
    { id: 's1', driverId: 'driver1', vehicleId: 'v1', startTime: new Date(new Date().setHours(new Date().getHours() - 4)), startOdometer: 45450, status: ShiftStatus.Active },
    { id: 's2', driverId: 'driver2', vehicleId: 'v3', startTime: new Date(new Date().setDate(new Date().getDate() - 1)), endTime: new Date(new Date().setDate(new Date().getDate() - 1)), startOdometer: 31800, endOdometer: 32000, startChargePercent: 95, endChargePercent: 40, status: ShiftStatus.Completed },
    { id: 's3', driverId: 'driver3', vehicleId: 'v2', startTime: new Date(new Date().setDate(new Date().getDate() - 2)), endTime: new Date(new Date().setDate(new Date().getDate() - 2)), startOdometer: 73000, endOdometer: 73250, status: ShiftStatus.Completed },
    { id: 's4', driverId: 'driver1', vehicleId: 'v1', startTime: new Date(new Date().setDate(new Date().getDate() - 3)), endTime: new Date(new Date().setDate(new Date().getDate() - 3)), startOdometer: 45200, endOdometer: 45400, status: ShiftStatus.Completed },
    { id: 's5', driverId: 'driver2', vehicleId: 'v5', startTime: new Date(new Date().setDate(new Date().getDate() - 4)), endTime: new Date(new Date().setDate(new Date().getDate() - 4)), startOdometer: 14800, endOdometer: 15000, startChargePercent: 80, endChargePercent: 45, status: ShiftStatus.Completed },
    { id: 's6', driverId: 'driver3', vehicleId: 'v4', startTime: new Date(new Date().setDate(new Date().getDate() - 5)), endTime: new Date(new Date().setDate(new Date().getDate() - 5)), startOdometer: 97800, endOdometer: 98000, status: ShiftStatus.Completed },
    { id: 's7', driverId: 'driver4', vehicleId: 'v2', startTime: new Date(new Date().setDate(new Date().getDate() - 6)), endTime: new Date(new Date().setDate(new Date().getDate() - 6)), startOdometer: 72800, endOdometer: 73000, status: ShiftStatus.Completed },
    // Additional shifts for John Doe (driver1) in EV vehicles
    { id: 's8', driverId: 'driver1', vehicleId: 'v3', startTime: new Date(new Date().setDate(new Date().getDate() - 7)), endTime: new Date(new Date().setDate(new Date().getDate() - 7)), startOdometer: 31500, endOdometer: 31700, startChargePercent: 90, endChargePercent: 65, status: ShiftStatus.Completed },
    { id: 's9', driverId: 'driver1', vehicleId: 'v5', startTime: new Date(new Date().setDate(new Date().getDate() - 8)), endTime: new Date(new Date().setDate(new Date().getDate() - 8)), startOdometer: 14400, endOdometer: 14650, startChargePercent: 85, endChargePercent: 50, status: ShiftStatus.Completed },
    { id: 's10', driverId: 'driver1', vehicleId: 'v3', startTime: new Date(new Date().setDate(new Date().getDate() - 10)), endTime: new Date(new Date().setDate(new Date().getDate() - 10)), startOdometer: 31200, endOdometer: 31450, startChargePercent: 80, endChargePercent: 40, status: ShiftStatus.Completed },
    { id: 's11', driverId: 'driver1', vehicleId: 'v1', startTime: new Date(new Date().setDate(new Date().getDate() - 12)), endTime: new Date(new Date().setDate(new Date().getDate() - 12)), startOdometer: 44950, endOdometer: 45150, status: ShiftStatus.Completed },
];

let mockRefuelRecords: RefuelRecord[] = [
    { id: 'r1', vehicleId: 'v1', driverId: 'driver1', shiftId: 's4', date: new Date(new Date().setDate(new Date().getDate() - 3)), odometer: 45300, litresFilled: 45, fuelCost: 850, notes: 'Mid-shift refuel' },
    { id: 'r2', vehicleId: 'v2', driverId: 'driver3', shiftId: 's3', date: new Date(new Date().setDate(new Date().getDate() - 2)), odometer: 73150, litresFilled: 40, fuelCost: 760, notes: 'Mid-shift refuel' },
    { id: 'r3', vehicleId: 'v4', driverId: 'driver3', shiftId: 's6', date: new Date(new Date().setDate(new Date().getDate() - 5)), odometer: 97900, litresFilled: 50, fuelCost: 950, oilCost: 120, notes: 'Full tank + oil change' },
    { id: 'r4', vehicleId: 'v1', driverId: 'driver4', date: new Date(new Date().setDate(new Date().getDate() - 7)), odometer: 45100, litresFilled: 48, fuelCost: 912, notes: 'End of shift refuel' },
    { id: 'r5', vehicleId: 'v2', driverId: 'driver4', shiftId: 's7', date: new Date(new Date().setDate(new Date().getDate() - 6)), odometer: 72950, litresFilled: 35, fuelCost: 665, notes: 'Mid-shift refuel' },
    // Additional refuel records for John Doe (driver1)
    { id: 'r6', vehicleId: 'v1', driverId: 'driver1', shiftId: 's11', date: new Date(new Date().setDate(new Date().getDate() - 12)), odometer: 45050, litresFilled: 42, fuelCost: 798, notes: 'Pre-shift refuel' },
    { id: 'r7', vehicleId: 'v1', driverId: 'driver1', date: new Date(new Date().setDate(new Date().getDate() - 14)), odometer: 44800, litresFilled: 40, fuelCost: 760, notes: 'End of shift refuel' },
];

let mockChargeRecords: ChargeRecord[] = [
    { id: 'c1', vehicleId: 'v3', driverId: 'driver2', shiftId: 's2', date: new Date(new Date().setDate(new Date().getDate() - 1)), odometer: 31900, kwhAdded: 35, chargeCost: 150, startChargePercent: 60, endChargePercent: 95, notes: 'Mid-shift fast charge' },
    { id: 'c2', vehicleId: 'v5', driverId: 'driver2', shiftId: 's5', date: new Date(new Date().setDate(new Date().getDate() - 4)), odometer: 14900, kwhAdded: 25, chargeCost: 120, startChargePercent: 50, endChargePercent: 80, notes: 'Mid-shift charge' },
    { id: 'c3', vehicleId: 'v3', driverId: 'driver1', date: new Date(new Date().setDate(new Date().getDate() - 8)), odometer: 31600, kwhAdded: 40, chargeCost: 180, startChargePercent: 25, endChargePercent: 90, notes: 'Overnight charge' },
    { id: 'c4', vehicleId: 'v5', driverId: 'driver3', date: new Date(new Date().setDate(new Date().getDate() - 9)), odometer: 14600, kwhAdded: 45, chargeCost: 200, startChargePercent: 20, endChargePercent: 85, notes: 'Full charge session' },
    // Additional charge records for John Doe (driver1) EV shifts
    { id: 'c5', vehicleId: 'v3', driverId: 'driver1', shiftId: 's8', date: new Date(new Date().setDate(new Date().getDate() - 7)), odometer: 31600, kwhAdded: 20, chargeCost: 95, startChargePercent: 70, endChargePercent: 90, notes: 'Pre-shift top-up charge' },
    { id: 'c6', vehicleId: 'v5', driverId: 'driver1', shiftId: 's9', date: new Date(new Date().setDate(new Date().getDate() - 8)), odometer: 14500, kwhAdded: 28, chargeCost: 130, startChargePercent: 55, endChargePercent: 85, notes: 'Mid-shift charge' },
    { id: 'c7', vehicleId: 'v3', driverId: 'driver1', shiftId: 's10', date: new Date(new Date().setDate(new Date().getDate() - 10)), odometer: 31300, kwhAdded: 30, chargeCost: 140, startChargePercent: 50, endChargePercent: 80, notes: 'Mid-shift DC fast charge' },
    { id: 'c8', vehicleId: 'v3', driverId: 'driver1', date: new Date(new Date().setDate(new Date().getDate() - 11)), odometer: 31100, kwhAdded: 35, chargeCost: 160, startChargePercent: 30, endChargePercent: 85, notes: 'End of shift charge' },
];

let mockDefects: DefectReport[] = [
    {
        id: 'd1',
        vehicleId: 'v2',
        driverId: 'driver3',
        reportedDateTime: new Date(new Date().setDate(new Date().getDate() - 5)),
        category: DefectCategory.Brakes,
        description: 'Brakes feel spongy when pressed, requires more pressure than usual',
        urgency: DefectUrgency.High,
        status: DefectStatus.Acknowledged,
        location: 'Brake pedal/system',
        acknowledgedBy: 'admin1',
        acknowledgedDateTime: new Date(new Date().setDate(new Date().getDate() - 4)),
        estimatedCost: 2500,
        isVisibleToDriver: true
    },
    {
        id: 'd2',
        vehicleId: 'v1',
        driverId: 'driver1',
        reportedDateTime: new Date(new Date().setDate(new Date().getDate() - 8)),
        category: DefectCategory.Engine,
        description: 'Engine warning light constantly on, engine runs rough on startup',
        urgency: DefectUrgency.Critical,
        status: DefectStatus.InProgress,
        location: 'Dashboard warning light',
        acknowledgedBy: 'admin1',
        acknowledgedDateTime: new Date(new Date().setDate(new Date().getDate() - 7)),
        assignedTo: 'Main Street Motors',
        estimatedCost: 3500,
        actualCost: 3200,
        isVisibleToDriver: true
    },
    {
        id: 'd3',
        vehicleId: 'v3',
        driverId: 'driver2',
        reportedDateTime: new Date(new Date().setDate(new Date().getDate() - 15)),
        category: DefectCategory.Exterior,
        description: 'Small chip in windscreen on passenger side, approximately 2cm',
        urgency: DefectUrgency.Medium,
        status: DefectStatus.Open,
        location: 'Front windscreen - passenger side',
        notes: 'Chip present when vehicle was collected',
        isVisibleToDriver: true
    },
    {
        id: 'd4',
        vehicleId: 'v4',
        driverId: 'driver4',
        reportedDateTime: new Date(new Date().setDate(new Date().getDate() - 10)),
        category: DefectCategory.Electrical,
        description: 'Left headlight bulb completely out',
        urgency: DefectUrgency.Low,
        status: DefectStatus.Resolved,
        location: 'Front left headlight',
        acknowledgedBy: 'admin1',
        acknowledgedDateTime: new Date(new Date().setDate(new Date().getDate() - 9)),
        resolvedBy: 'admin1',
        resolvedDateTime: new Date(new Date().setDate(new Date().getDate() - 3)),
        actualCost: 45,
        isVisibleToDriver: false
    },
    {
        id: 'd5',
        vehicleId: 'v1',
        driverId: 'driver1',
        reportedDateTime: new Date(new Date().setDate(new Date().getDate() - 2)),
        category: DefectCategory.Engine,
        description: 'Check engine light flashing intermittently during acceleration',
        urgency: DefectUrgency.High,
        status: DefectStatus.Duplicate,
        location: 'Dashboard warning light',
        duplicateOf: 'd2',
        notes: 'Duplicate of existing engine issue - same vehicle, same problem',
        isVisibleToDriver: false
    },
    {
        id: 'd6',
        vehicleId: 'v2',
        driverId: 'driver3',
        reportedDateTime: new Date(new Date().setDate(new Date().getDate() - 6)),
        category: DefectCategory.Tires,
        description: 'Tire pressure sensor warning showing constantly',
        urgency: DefectUrgency.Medium,
        status: DefectStatus.Open,
        location: 'Front right tire sensor',
        isVisibleToDriver: true
    },
    {
        id: 'd7',
        vehicleId: 'v3',
        driverId: 'driver2',
        reportedDateTime: new Date(new Date().setDate(new Date().getDate() - 3)),
        category: DefectCategory.Electrical,
        description: 'Charging port cover is loose and wobbly',
        urgency: DefectUrgency.Low,
        status: DefectStatus.Acknowledged,
        location: 'Rear charging port',
        acknowledgedBy: 'admin1',
        acknowledgedDateTime: new Date(new Date().setDate(new Date().getDate() - 2)),
        estimatedCost: 150,
        isVisibleToDriver: true
    }
];

let mockCosts: Cost[] = [
    { id: 'c1', vehicleId: 'v1', date: new Date(new Date().setDate(new Date().getDate() - 2)), cost: 1200, category: CostCategory.Fuel, description: 'Diesel fill-up' },
    { id: 'c2', vehicleId: 'v3', date: new Date(new Date().setDate(new Date().getDate() - 1)), cost: 250, category: CostCategory.Fuel, description: 'DC Fast Charge' },
    { id: 'c3', vehicleId: 'v2', date: new Date(new Date().setDate(new Date().getDate() - 5)), cost: 4500, category: CostCategory.Repairs, description: 'Brake pad replacement' },
    { id: 'c4', vehicleId: 'v4', date: new Date(new Date().setDate(new Date().getDate() - 10)), cost: 800, category: CostCategory.Maintenance, description: 'Oil change and filter' },
    { id: 'c5', vehicleId: 'v1', date: new Date(new Date().setDate(new Date().getDate() - 12)), cost: 15000, category: CostCategory.Insurance, description: 'Monthly premium' },
    { id: 'c6', vehicleId: 'v3', date: new Date(new Date().setDate(new Date().getDate() - 15)), cost: 200, category: CostCategory.Fuel, description: 'Overnight charge' },
];

// Remove the static mockLeaderboard - we'll calculate it dynamically

let mockDriverFines: DriverFine[] = [
    {
        id: 'f1',
        driverId: 'driver1',
        vehicleId: 'v1',
        date: '2024-11-15',
        fineType: FineType.Speeding,
        amount: 1500,
        description: 'Exceeding speed limit by 15km/h in 60km/h zone',
        fineNumber: 'SP123456789',
        location: 'N1 Highway, Cape Town',
        issuingAuthority: 'City of Cape Town',
        dueDate: '2024-12-15',
        isPaid: false,
        notes: 'Driver claims speedometer was faulty'
    },
    {
        id: 'f5',
        driverId: 'driver1',
        vehicleId: 'v3',
        date: '2024-10-20',
        fineType: FineType.IllegalParking,
        amount: 500,
        description: 'Parking in loading zone',
        fineNumber: 'PK888999000',
        location: 'Cape Town CBD',
        issuingAuthority: 'City of Cape Town',
        dueDate: '2024-11-20',
        isPaid: true,
        paidDate: '2024-11-10',
        notes: 'Paid promptly'
    },
    {
        id: 'f2',
        driverId: 'driver2',
        vehicleId: 'v3',
        date: '2024-11-20',
        fineType: FineType.IllegalParking,
        amount: 500,
        description: 'Parking in disabled bay without permit',
        fineNumber: 'PK987654321',
        location: 'Sandton City Shopping Centre',
        issuingAuthority: 'City of Johannesburg',
        dueDate: '2024-12-20',
        isPaid: true,
        paidDate: '2024-11-25'
    },
    {
        id: 'f3',
        driverId: 'driver1',
        vehicleId: 'v2',
        date: '2024-10-30',
        fineType: FineType.NoSeatBelt,
        amount: 1000,
        description: 'Driver not wearing seatbelt',
        fineNumber: 'SB555666777',
        location: 'M1 Highway, Johannesburg',
        issuingAuthority: 'JMPD',
        dueDate: '2024-11-30',
        isPaid: true,
        paidDate: '2024-11-05'
    },
    {
        id: 'f4',
        driverId: 'driver3',
        vehicleId: 'v4',
        date: '2024-11-10',
        fineType: FineType.MobilePhone,
        amount: 2000,
        description: 'Using mobile phone while driving',
        fineNumber: 'MP111222333',
        location: 'William Nicol Drive, Sandton',
        issuingAuthority: 'JMPD',
        dueDate: '2024-12-10',
        isPaid: false
    }
];

let mockVehicleDamages: VehicleDamage[] = [
    {
        id: 'd1',
        vehicleId: 'v1',
        driverId: 'driver1',
        date: '2024-11-12',
        damageType: DamageType.Scratches,
        severity: IncidentSeverity.Minor,
        estimatedCost: 3500,
        actualCost: 3200,
        description: 'Scratches on left rear door from parking incident',
        location: 'Left rear door',
        isRepaired: true,
        repairedDate: '2024-11-18',
        insuranceClaim: false,
        notes: 'Driver scraped against concrete pillar in parking garage'
    },
    {
        id: 'd5',
        vehicleId: 'v3',
        driverId: 'driver1',
        date: '2024-09-20',
        damageType: DamageType.Scratches,
        severity: IncidentSeverity.Minor,
        estimatedCost: 1800,
        actualCost: 1650,
        description: 'Minor scratches on front bumper',
        location: 'Front bumper',
        isRepaired: true,
        repairedDate: '2024-09-25',
        insuranceClaim: false,
        notes: 'Minor parking incident, driver took responsibility'
    },
    {
        id: 'd2',
        vehicleId: 'v2',
        driverId: 'driver3',
        date: '2024-10-25',
        damageType: DamageType.Windscreen,
        severity: IncidentSeverity.Moderate,
        estimatedCost: 2500,
        actualCost: 2800,
        description: 'Windscreen cracked by stone from truck',
        location: 'Front windscreen - passenger side',
        isRepaired: true,
        repairedDate: '2024-10-28',
        insuranceClaim: true,
        claimNumber: 'WS2024-789456'
    },
    {
        id: 'd3',
        vehicleId: 'v4',
        driverId: 'driver4',
        date: '2024-09-15',
        damageType: DamageType.Accident,
        severity: IncidentSeverity.Major,
        estimatedCost: 25000,
        actualCost: 28500,
        description: 'Rear-end collision at traffic light',
        location: 'Rear bumper, boot, rear lights',
        isRepaired: true,
        repairedDate: '2024-10-05',
        insuranceClaim: true,
        claimNumber: 'ACC2024-123789',
        notes: 'Third-party admitted fault. Driver followed all protocols correctly.'
    },
    {
        id: 'd4',
        vehicleId: 'v3',
        driverId: 'driver2',
        date: '2024-11-28',
        damageType: DamageType.Interior,
        severity: IncidentSeverity.Minor,
        estimatedCost: 1500,
        description: 'Cigarette burn on driver seat',
        location: 'Driver seat cushion',
        isRepaired: false,
        insuranceClaim: false,
        notes: 'Driver was smoking in vehicle against company policy'
    }
];

let mockSettings: AppSettings = {
    id: 'settings1',
    areas: [
        'Cape Town',
        'Johannesburg',
        'Durban',
        'Pretoria',
        'Port Elizabeth',
        'Bloemfontein',
        'East London',
        'Pietermaritzburg'
    ],
    departments: [
        'Operations',
        'Logistics',
        'Sales',
        'Marketing',
        'Finance',
        'Human Resources',
        'IT',
        'Maintenance',
        'Customer Service',
        'Administration'
    ],
    // Service booking deadline settings
    serviceBookingLeadTimeDays: 10, // Default: 10 days notice needed
    enableSmartBookingReminders: true, // Enable usage-based reminders
    defaultDailyUsageKm: 150, // Default daily usage if no history
    bookingReminderThresholdKm: 1500, // Manual override threshold
    createdBy: 'admin1',
    lastModified: new Date()
};

let mockFuelEconomyAlerts: FuelEconomyAlert[] = [
    {
        id: 'ea1',
        vehicleId: 'v1',
        date: new Date().toISOString().split('T')[0],
        alertType: 'degradation',
        currentConsumption: 12.8,
        baselineConsumption: 11.5,
        manufacturerConsumption: 9.8,
        variancePercentage: 11.3, // 11.3% above baseline
        severity: 'medium',
        isResolved: false,
        notes: 'Fuel consumption has increased significantly. Possible maintenance required.'
    },
    {
        id: 'ea2',
        vehicleId: 'v1',
        date: '2024-08-15',
        alertType: 'maintenance_required',
        currentConsumption: 13.2,
        baselineConsumption: 11.5,
        manufacturerConsumption: 9.8,
        variancePercentage: 14.8, // 14.8% above baseline
        severity: 'high',
        isResolved: true,
        resolvedDate: '2024-08-20',
        notes: 'Air filter replacement resolved the issue'
    }
];

const api = {
    getUsers: async (): Promise<User[]> => {
        await new Promise(res => setTimeout(res, 200));
        return mockUsers;
    },
    addDriver: async (driverData: Omit<User, 'id' | 'role'>): Promise<User> => {
        await new Promise(res => setTimeout(res, 300));
        const newDriver: User = {
            ...driverData,
            id: `driver${mockUsers.length + 1}`,
            role: UserRole.Driver,
        };
        mockUsers.push(newDriver);
        return newDriver;
    },
    updateDriver: async (driverData: User): Promise<User> => {
        await new Promise(res => setTimeout(res, 300));
        const driverIndex = mockUsers.findIndex(u => u.id === driverData.id);
        if (driverIndex === -1) throw new Error("Driver not found");
        mockUsers[driverIndex] = { ...mockUsers[driverIndex], ...driverData };
        return mockUsers[driverIndex];
    },
    getVehicles: async (): Promise<Vehicle[]> => {
        await new Promise(res => setTimeout(res, 200));
        return mockVehicles;
    },
    addVehicle: async (vehicleData: Omit<Vehicle, 'id'>): Promise<Vehicle> => {
        await new Promise(res => setTimeout(res, 300));
        const newVehicle: Vehicle = {
            ...vehicleData,
            id: `v${mockVehicles.length + 1}`,
        };
        mockVehicles.push(newVehicle);
        return newVehicle;
    },
    updateVehicle: async (vehicleData: Vehicle): Promise<Vehicle> => {
        await new Promise(res => setTimeout(res, 300));
        const vehicleIndex = mockVehicles.findIndex(v => v.id === vehicleData.id);
        if (vehicleIndex === -1) throw new Error("Vehicle not found");
        mockVehicles[vehicleIndex] = { ...mockVehicles[vehicleIndex], ...vehicleData };
        return mockVehicles[vehicleIndex];
    },
    deleteVehicle: async (vehicleId: string): Promise<{ success: boolean }> => {
        await new Promise(res => setTimeout(res, 300));
        const initialLength = mockVehicles.length;
        mockVehicles = mockVehicles.filter(v => v.id !== vehicleId);
        if (mockVehicles.length === initialLength) throw new Error("Vehicle not found");
        return { success: true };
    },
    addMaintenanceRecord: async (recordData: Omit<MaintenanceRecord, 'id'>): Promise<MaintenanceRecord> => {
        await new Promise(res => setTimeout(res, 300));
        const vehicleIndex = mockVehicles.findIndex(v => v.id === recordData.vehicleId);
        if (vehicleIndex === -1) throw new Error("Vehicle not found");

        const newRecord: MaintenanceRecord = {
            ...recordData,
            id: `m${mockMaintenanceRecords.length + 1}`,
        };
        
        mockMaintenanceRecords.push(newRecord);
        if (!mockVehicles[vehicleIndex].maintenanceHistory) {
            mockVehicles[vehicleIndex].maintenanceHistory = [];
        }
        mockVehicles[vehicleIndex].maintenanceHistory!.push(newRecord);
        mockVehicles[vehicleIndex].maintenanceHistory!.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Also update last service odometer if it's higher
        if(recordData.odometer > (mockVehicles[vehicleIndex].lastServiceOdometer || 0)) {
            mockVehicles[vehicleIndex].lastServiceOdometer = recordData.odometer;
        }

        return newRecord;
    },
    getDriverShifts: async (driverId: string): Promise<Shift[]> => {
        await new Promise(res => setTimeout(res, 200));
        return mockShifts.filter(s => s.driverId === driverId);
    },
    startShift: async (shiftData: { driverId: string; vehicleId: string; startOdometer?: number; startChargePercent?: number; }): Promise<Shift> => {
        await new Promise(res => setTimeout(res, 500));
        const newShift: Shift = {
            id: `s${mockShifts.length + 1}`,
            driverId: shiftData.driverId,
            vehicleId: shiftData.vehicleId,
            startTime: new Date(),
            startOdometer: shiftData.startOdometer || 0,
            startChargePercent: shiftData.startChargePercent,
            status: ShiftStatus.Active,
        };
        const existingActive = mockShifts.find(s => s.driverId === shiftData.driverId && s.status === ShiftStatus.Active);
        if (existingActive) {
            throw new Error("Driver already has an active shift.");
        }
        mockShifts.unshift(newShift); // Add to the beginning
        return newShift;
    },
    getActiveDefects: async (): Promise<DefectReport[]> => {
        await new Promise(res => setTimeout(res, 500));
        return mockDefects.filter(d => d.status !== DefectStatus.Resolved && d.isVisibleToDriver);
    },

    // Get defects for a specific vehicle (visible to drivers)
    getVehicleDefects: async (vehicleId: string): Promise<DefectReport[]> => {
        await new Promise(res => setTimeout(res, 300));
        return mockDefects
            .filter(d => d.vehicleId === vehicleId && d.isVisibleToDriver)
            .sort((a, b) => b.reportedDateTime.getTime() - a.reportedDateTime.getTime());
    },

    // Add new defect with duplicate checking
    addDefectReport: async (defectData: Omit<DefectReport, 'id' | 'reportedDateTime' | 'status' | 'isVisibleToDriver'>): Promise<DefectReport> => {
        await new Promise(res => setTimeout(res, 400));

        // Check for potential duplicates
        const existingDefects = mockDefects.filter(d =>
            d.vehicleId === defectData.vehicleId &&
            d.isVisibleToDriver &&
            d.status !== DefectStatus.Resolved &&
            d.category === defectData.category
        );

        // Simple similarity check based on keywords
        const keywords = defectData.description.toLowerCase().split(' ').filter(word => word.length > 3);
        const potentialDuplicate = existingDefects.find(existing => {
            const existingWords = existing.description.toLowerCase().split(' ').filter(word => word.length > 3);
            const commonWords = keywords.filter(word => existingWords.includes(word));
            return commonWords.length >= 2; // If 2+ significant words match, might be duplicate
        });

        const newDefect: DefectReport = {
            id: `def${mockDefects.length + 1}`,
            reportedDateTime: new Date(),
            status: DefectStatus.Open,
            isVisibleToDriver: true,
            ...defectData
        };

        // If potential duplicate found, still add but flag for admin review
        if (potentialDuplicate) {
            newDefect.notes = (newDefect.notes || '') +
                ` [System Note: Potential duplicate of defect ${potentialDuplicate.id}]`;
        }

        mockDefects.unshift(newDefect);
        return newDefect;
    },

    // Check for existing defects when reporting (to warn driver)
    checkSimilarDefects: async (vehicleId: string, category: DefectCategory, description: string): Promise<DefectReport[]> => {
        await new Promise(res => setTimeout(res, 200));

        const keywords = description.toLowerCase().split(' ').filter(word => word.length > 3);
        const existingDefects = mockDefects.filter(d =>
            d.vehicleId === vehicleId &&
            d.isVisibleToDriver &&
            d.status !== DefectStatus.Resolved &&
            (d.category === category || keywords.some(word => d.description.toLowerCase().includes(word)))
        );

        return existingDefects
            .sort((a, b) => b.reportedDateTime.getTime() - a.reportedDateTime.getTime())
            .slice(0, 3); // Return top 3 most recent similar defects
    },

    // Get driver's current active vehicle
    getDriverActiveVehicle: async (driverId: string): Promise<Vehicle | null> => {
        await new Promise(res => setTimeout(res, 200));

        const activeShift = mockShifts.find(shift =>
            shift.driverId === driverId &&
            shift.status === ShiftStatus.Active
        );

        if (activeShift) {
            return mockVehicles.find(vehicle => vehicle.id === activeShift.vehicleId) || null;
        }

        return null;
    },
    getVehicleCosts: async (): Promise<Cost[]> => {
        await new Promise(res => setTimeout(res, 500));
        return mockCosts;
    },
    addCost: async (costData: Omit<Cost, 'id'>): Promise<Cost> => {
        await new Promise(res => setTimeout(res, 300));
        const newCost: Cost = {
            ...costData,
            id: `c${mockCosts.length + 1}`,
        };
        mockCosts.push(newCost);
        mockCosts.sort((a,b) => b.date.getTime() - a.date.getTime());
        return newCost;
    },
    getLeaderboard: async (): Promise<LeaderboardEntry[]> => {
        await new Promise(res => setTimeout(res, 800));

        // Calculate leaderboard dynamically based on actual shift and fuel/charge data
        const drivers = mockUsers.filter(user => user.role === UserRole.Driver);

        const leaderboardEntries: LeaderboardEntry[] = drivers.map(driver => {
            // Get all completed shifts for this driver
            const driverShifts = mockShifts.filter(shift =>
                shift.driverId === driver.id &&
                shift.status === ShiftStatus.Completed &&
                shift.endOdometer !== undefined
            );

            // Separate ICE and EV shifts
            const iceShifts = driverShifts.filter(shift => {
                const vehicle = mockVehicles.find(v => v.id === shift.vehicleId);
                return vehicle?.vehicleType === VehicleType.ICE;
            });

            const evShifts = driverShifts.filter(shift => {
                const vehicle = mockVehicles.find(v => v.id === shift.vehicleId);
                return vehicle?.vehicleType === VehicleType.EV;
            });

            // Calculate ICE consumption with mid-shift refueling logic
            let totalICEKmDriven = 0;
            let totalFuelConsumed = 0;

            for (const shift of iceShifts) {
                const kmDriven = (shift.endOdometer || 0) - shift.startOdometer;
                totalICEKmDriven += kmDriven;

                // Find refuel records for this shift and driver
                const shiftRefuels = mockRefuelRecords.filter(refuel =>
                    refuel.driverId === driver.id &&
                    (refuel.shiftId === shift.id ||
                     (refuel.date >= shift.startTime &&
                      refuel.date <= (shift.endTime || new Date()) &&
                      refuel.vehicleId === shift.vehicleId))
                );

                if (shiftRefuels.length > 0) {
                    // Sum up fuel from all refuels during this shift
                    const fuelForThisShift = shiftRefuels.reduce((sum, refuel) => sum + refuel.litresFilled, 0);

                    // Calculate the proportion of fuel used by this driver
                    // If there were mid-shift refuels, allocate fuel consumption proportionally
                    if (shiftRefuels.length === 1 && shiftRefuels[0].shiftId === shift.id) {
                        // Single refuel for this shift - driver used all of it
                        totalFuelConsumed += fuelForThisShift;
                    } else {
                        // Multiple refuels or refuels shared between shifts - estimate based on km driven
                        // Use a baseline consumption rate of 12L/100km for estimation
                        const estimatedConsumption = (kmDriven / 100) * 12;
                        totalFuelConsumed += Math.min(estimatedConsumption, fuelForThisShift);
                    }
                } else {
                    // No refuel data for this shift - estimate consumption
                    const estimatedConsumption = (kmDriven / 100) * 12; // 12L/100km baseline
                    totalFuelConsumed += estimatedConsumption;
                }
            }

            // Calculate EV consumption with mid-shift charging logic
            let totalEVKmDriven = 0;
            let totalEnergyConsumed = 0;

            for (const shift of evShifts) {
                const kmDriven = (shift.endOdometer || 0) - shift.startOdometer;
                totalEVKmDriven += kmDriven;

                const vehicle = mockVehicles.find(v => v.id === shift.vehicleId);
                if (!vehicle?.batteryCapacityKwh) continue;

                // Find charge records for this shift and driver
                const shiftCharges = mockChargeRecords.filter(charge =>
                    charge.driverId === driver.id &&
                    (charge.shiftId === shift.id ||
                     (charge.date >= shift.startTime &&
                      charge.date <= (shift.endTime || new Date()) &&
                      charge.vehicleId === shift.vehicleId))
                );

                if (shiftCharges.length > 0) {
                    // Use actual charge data
                    const energyAdded = shiftCharges.reduce((sum, charge) => sum + charge.kwhAdded, 0);

                    // Calculate energy consumed during shift (not just energy added)
                    if (shift.startChargePercent !== undefined && shift.endChargePercent !== undefined) {
                        const chargeUsed = shift.startChargePercent - shift.endChargePercent;
                        const energyUsed = (chargeUsed / 100) * vehicle.batteryCapacityKwh;
                        totalEnergyConsumed += energyUsed;
                    } else {
                        // Fallback to estimation
                        const estimatedConsumption = (kmDriven / 100) * 18; // 18kWh/100km baseline
                        totalEnergyConsumed += estimatedConsumption;
                    }
                } else {
                    // No charge data - calculate from battery percentage if available
                    if (shift.startChargePercent !== undefined && shift.endChargePercent !== undefined) {
                        const chargeUsed = shift.startChargePercent - shift.endChargePercent;
                        const energyUsed = (chargeUsed / 100) * vehicle.batteryCapacityKwh;
                        totalEnergyConsumed += energyUsed;
                    } else {
                        // Estimate consumption
                        const estimatedConsumption = (kmDriven / 100) * 18; // 18kWh/100km baseline
                        totalEnergyConsumed += estimatedConsumption;
                    }
                }
            }

            // Calculate efficiency metrics
            const averageKmL = totalFuelConsumed > 0 ? totalICEKmDriven / totalFuelConsumed : undefined;
            const averageKmPerKwh = totalEnergyConsumed > 0 ? totalEVKmDriven / totalEnergyConsumed : undefined;
            const totalKmDriven = totalICEKmDriven + totalEVKmDriven;

            // Calculate performance scores against vehicle baselines
            let iceEfficiencyScore: number | undefined;
            let evEfficiencyScore: number | undefined;

            // ICE Performance Scoring
            if (totalICEKmDriven > 0 && totalFuelConsumed > 0) {
                // Calculate weighted baseline consumption for ICE vehicles driven
                let totalWeightedBaseline = 0;
                let totalWeightedActual = 0;

                for (const shift of iceShifts) {
                    const vehicle = mockVehicles.find(v => v.id === shift.vehicleId);
                    if (!vehicle?.baselineFuelConsumption) continue;

                    const kmDriven = (shift.endOdometer || 0) - shift.startOdometer;
                    const vehicleBaseline = vehicle.baselineFuelConsumption; // L/100km

                    // Find fuel consumption for this specific shift/vehicle
                    const shiftRefuels = mockRefuelRecords.filter(refuel =>
                        refuel.driverId === driver.id &&
                        (refuel.shiftId === shift.id ||
                         (refuel.date >= shift.startTime &&
                          refuel.date <= (shift.endTime || new Date()) &&
                          refuel.vehicleId === shift.vehicleId))
                    );

                    let actualConsumptionL100km: number;
                    if (shiftRefuels.length > 0) {
                        const fuelUsed = shiftRefuels.reduce((sum, refuel) => sum + refuel.litresFilled, 0);
                        actualConsumptionL100km = (fuelUsed / kmDriven) * 100;
                    } else {
                        // Use overall average for this driver
                        actualConsumptionL100km = (totalFuelConsumed / totalICEKmDriven) * 100;
                    }

                    totalWeightedBaseline += vehicleBaseline * kmDriven;
                    totalWeightedActual += actualConsumptionL100km * kmDriven;
                }

                if (totalWeightedBaseline > 0) {
                    const avgBaseline = totalWeightedBaseline / totalICEKmDriven;
                    const avgActual = totalWeightedActual / totalICEKmDriven;

                    // Score: 100 = perfect baseline, >100 = better than baseline, <100 = worse
                    // Formula: (baseline / actual) * 100
                    iceEfficiencyScore = Math.round((avgBaseline / avgActual) * 100);
                    iceEfficiencyScore = Math.min(150, Math.max(25, iceEfficiencyScore)); // Cap between 25-150
                }
            }

            // EV Performance Scoring
            if (totalEVKmDriven > 0 && totalEnergyConsumed > 0) {
                let totalWeightedBaseline = 0;
                let totalWeightedActual = 0;

                for (const shift of evShifts) {
                    const vehicle = mockVehicles.find(v => v.id === shift.vehicleId);
                    if (!vehicle?.baselineEnergyConsumption || !vehicle.batteryCapacityKwh) continue;

                    const kmDriven = (shift.endOdometer || 0) - shift.startOdometer;
                    const vehicleBaseline = vehicle.baselineEnergyConsumption; // kWh/100km

                    let actualConsumptionKwh100km: number;
                    if (shift.startChargePercent !== undefined && shift.endChargePercent !== undefined) {
                        const chargeUsed = shift.startChargePercent - shift.endChargePercent;
                        const energyUsed = (chargeUsed / 100) * vehicle.batteryCapacityKwh;
                        actualConsumptionKwh100km = (energyUsed / kmDriven) * 100;
                    } else {
                        // Use overall average for this driver
                        actualConsumptionKwh100km = (totalEnergyConsumed / totalEVKmDriven) * 100;
                    }

                    totalWeightedBaseline += vehicleBaseline * kmDriven;
                    totalWeightedActual += actualConsumptionKwh100km * kmDriven;
                }

                if (totalWeightedBaseline > 0) {
                    const avgBaseline = totalWeightedBaseline / totalEVKmDriven;
                    const avgActual = totalWeightedActual / totalEVKmDriven;

                    // Score: 100 = perfect baseline, >100 = better than baseline, <100 = worse
                    evEfficiencyScore = Math.round((avgBaseline / avgActual) * 100);
                    evEfficiencyScore = Math.min(150, Math.max(25, evEfficiencyScore)); // Cap between 25-150
                }
            }

            // Calculate overall efficiency score (weighted by distance driven)
            let overallEfficiencyScore: number | undefined;
            if (iceEfficiencyScore !== undefined && evEfficiencyScore !== undefined) {
                const iceWeight = totalICEKmDriven / totalKmDriven;
                const evWeight = totalEVKmDriven / totalKmDriven;
                overallEfficiencyScore = Math.round((iceEfficiencyScore * iceWeight) + (evEfficiencyScore * evWeight));
            } else if (iceEfficiencyScore !== undefined) {
                overallEfficiencyScore = iceEfficiencyScore;
            } else if (evEfficiencyScore !== undefined) {
                overallEfficiencyScore = evEfficiencyScore;
            }

            return {
                driver,
                totalKmDriven,
                totalICEKmDriven,
                totalEVKmDriven,
                totalFuelConsumed,
                totalEnergyConsumed,
                averageKmL,
                averageKmPerKwh,
                iceEfficiencyScore,
                evEfficiencyScore,
                overallEfficiencyScore
            };
        });

        return leaderboardEntries
            .filter(entry => entry.totalKmDriven > 0) // Only include drivers with actual driving data
            .sort((a, b) => b.totalKmDriven - a.totalKmDriven);
    },
    getVehicleStats: async (vehicleId: string): Promise<VehicleStats> => {
        await new Promise(res => setTimeout(res, 600));
        // Fake some stats
        if(vehicleId === 'v3' || vehicleId === 'v5') {
            return { avgDailyDistanceKm: 150, avgEnergyConsumptionKwhPerKm: 0.18 };
        }
        return { avgDailyDistanceKm: 0, avgEnergyConsumptionKwhPerKm: 0 };
    },
    endShift: async (shiftData: { driverId: string; endOdometer?: number; endChargePercent?: number; }): Promise<Shift> => {
        await new Promise(res => setTimeout(res, 500));
        const activeShiftIndex = mockShifts.findIndex(s => s.driverId === shiftData.driverId && s.status === ShiftStatus.Active);
        if (activeShiftIndex === -1) {
            throw new Error("No active shift found for this driver.");
        }

        const updatedShift: Shift = {
            ...mockShifts[activeShiftIndex],
            endTime: new Date(),
            endOdometer: shiftData.endOdometer,
            endChargePercent: shiftData.endChargePercent,
            status: ShiftStatus.Completed,
        };

        mockShifts[activeShiftIndex] = updatedShift;
        return updatedShift;
    },
    getLastCompletedShift: async (vehicleId: string): Promise<Shift | null> => {
        await new Promise(res => setTimeout(res, 200));
        const vehicleShifts = mockShifts
            .filter(s => s.vehicleId === vehicleId && s.status === ShiftStatus.Completed)
            .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0));

        return vehicleShifts.length > 0 ? vehicleShifts[0] : null;
    },

    // Driver Fines Management
    getDriverFines: async (): Promise<DriverFine[]> => {
        await new Promise(res => setTimeout(res, 200));
        return [...mockDriverFines].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    // Automatically determine driver for a fine based on shift records
    determineDriverForFine: async (vehicleRegistration: string, fineDate: string, fineTime?: string): Promise<{
        driverId: string | null;
        vehicleId: string | null;
        method: 'shift_lookup' | 'single_driver' | 'no_match';
        confidence: 'high' | 'medium' | 'low';
        details: string;
    }> => {
        await new Promise(res => setTimeout(res, 100));

        // Find vehicle by registration
        const vehicle = mockVehicles.find(v => v.registration.toLowerCase() === vehicleRegistration.toLowerCase());
        if (!vehicle) {
            return {
                driverId: null,
                vehicleId: null,
                method: 'no_match',
                confidence: 'low',
                details: `Vehicle with registration ${vehicleRegistration} not found`
            };
        }

        // Parse fine date and time
        const fineDateTime = new Date(`${fineDate}T${fineTime || '12:00'}:00`);
        const fineDateStart = new Date(`${fineDate}T00:00:00`);
        const fineDateEnd = new Date(`${fineDate}T23:59:59`);

        // Find shifts for this vehicle on the fine date
        const vehicleShifts = mockShifts.filter(shift =>
            shift.vehicleId === vehicle.id &&
            shift.startTime >= fineDateStart &&
            shift.startTime <= fineDateEnd
        );

        if (vehicleShifts.length === 0) {
            // No shifts found for that date - check if there's only one active driver for this vehicle
            const vehicleHistory = mockShifts.filter(shift => shift.vehicleId === vehicle.id);
            const uniqueDrivers = [...new Set(vehicleHistory.map(s => s.driverId))];

            if (uniqueDrivers.length === 1) {
                return {
                    driverId: uniqueDrivers[0],
                    vehicleId: vehicle.id,
                    method: 'single_driver',
                    confidence: 'medium',
                    details: `Only one driver (${uniqueDrivers[0]}) has driven this vehicle`
                };
            }

            return {
                driverId: null,
                vehicleId: vehicle.id,
                method: 'no_match',
                confidence: 'low',
                details: `No shifts found for ${vehicleRegistration} on ${fineDate}`
            };
        }

        if (vehicleShifts.length === 1) {
            // Only one shift that day - assign to that driver
            return {
                driverId: vehicleShifts[0].driverId,
                vehicleId: vehicle.id,
                method: 'shift_lookup',
                confidence: 'high',
                details: `Single shift on ${fineDate} by driver ${vehicleShifts[0].driverId}`
            };
        }

        // Multiple shifts - try to match by time if provided
        if (fineTime) {
            for (const shift of vehicleShifts) {
                const shiftStart = shift.startTime;
                const shiftEnd = shift.endTime || new Date(); // Use current time if shift not ended

                if (fineDateTime >= shiftStart && fineDateTime <= shiftEnd) {
                    return {
                        driverId: shift.driverId,
                        vehicleId: vehicle.id,
                        method: 'shift_lookup',
                        confidence: 'high',
                        details: `Fine time ${fineTime} matches shift ${shift.id} (${shift.startTime.toLocaleTimeString()} - ${shiftEnd.toLocaleTimeString()})`
                    };
                }
            }
        }

        // Multiple shifts but no time match - return the first shift as a guess
        return {
            driverId: vehicleShifts[0].driverId,
            vehicleId: vehicle.id,
            method: 'shift_lookup',
            confidence: 'medium',
            details: `Multiple shifts on ${fineDate}, assigned to first shift driver ${vehicleShifts[0].driverId}`
        };
    },

    addDriverFine: async (fineData: Omit<DriverFine, 'id'>): Promise<DriverFine> => {
        await new Promise(res => setTimeout(res, 300));
        const newFine: DriverFine = {
            ...fineData,
            id: `f${mockDriverFines.length + 1}`,
        };
        mockDriverFines.push(newFine);
        return newFine;
    },

    // Enhanced method to add fine with automatic driver allocation
    addDriverFineWithAutoAllocation: async (fineData: {
        vehicleRegistration: string;
        date: string;
        time?: string;
        fineType: FineType;
        amount: number;
        description: string;
        fineNumber?: string;
        location?: string;
        issuingAuthority?: string;
        dueDate?: string;
        notes?: string;
    }): Promise<DriverFine & { allocationInfo: any }> => {
        await new Promise(res => setTimeout(res, 300));

        // Try to automatically determine the driver
        const allocationResult = await api.determineDriverForFine(
            fineData.vehicleRegistration,
            fineData.date,
            fineData.time
        );

        let driverId = allocationResult.driverId;
        let vehicleId = allocationResult.vehicleId;

        // If no driver found automatically, leave empty for manual assignment
        if (!driverId) {
            driverId = '';
            vehicleId = vehicleId || '';
        }

        const newFine: DriverFine = {
            id: `f${mockDriverFines.length + 1}`,
            driverId,
            vehicleId: vehicleId || '',
            date: fineData.date,
            time: fineData.time,
            fineType: fineData.fineType,
            amount: fineData.amount,
            description: fineData.description,
            fineNumber: fineData.fineNumber,
            location: fineData.location,
            issuingAuthority: fineData.issuingAuthority,
            dueDate: fineData.dueDate,
            isPaid: false,
            notes: fineData.notes,
            allocatedAutomatically: !!allocationResult.driverId,
            allocationMethod: allocationResult.method
        };

        mockDriverFines.push(newFine);

        return {
            ...newFine,
            allocationInfo: allocationResult
        };
    },

    updateDriverFine: async (fine: DriverFine): Promise<DriverFine> => {
        await new Promise(res => setTimeout(res, 300));
        const fineIndex = mockDriverFines.findIndex(f => f.id === fine.id);
        if (fineIndex === -1) throw new Error("Fine not found");
        mockDriverFines[fineIndex] = { ...mockDriverFines[fineIndex], ...fine };
        return mockDriverFines[fineIndex];
    },

    // Vehicle Damages Management
    getVehicleDamages: async (): Promise<VehicleDamage[]> => {
        await new Promise(res => setTimeout(res, 200));
        return [...mockVehicleDamages].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    addVehicleDamage: async (damageData: Omit<VehicleDamage, 'id'>): Promise<VehicleDamage> => {
        await new Promise(res => setTimeout(res, 300));
        const newDamage: VehicleDamage = {
            ...damageData,
            id: `d${mockVehicleDamages.length + 1}`,
        };
        mockVehicleDamages.push(newDamage);
        return newDamage;
    },

    updateVehicleDamage: async (damage: VehicleDamage): Promise<VehicleDamage> => {
        await new Promise(res => setTimeout(res, 300));
        const damageIndex = mockVehicleDamages.findIndex(d => d.id === damage.id);
        if (damageIndex === -1) throw new Error("Damage record not found");
        mockVehicleDamages[damageIndex] = { ...mockVehicleDamages[damageIndex], ...damage };
        return mockVehicleDamages[damageIndex];
    },

    // Driver Incident Analytics
    getDriverIncidentSummary: async (driverId?: string): Promise<DriverIncidentSummary[]> => {
        await new Promise(res => setTimeout(res, 500));

        const drivers = driverId ? mockUsers.filter(u => u.id === driverId && u.role === UserRole.Driver)
                                 : mockUsers.filter(u => u.role === UserRole.Driver);

        return drivers.map(driver => {
            const fines = mockDriverFines.filter(f => f.driverId === driver.id);
            const damages = mockVehicleDamages.filter(d => d.driverId === driver.id);

            const totalFineAmount = fines.reduce((sum, f) => sum + f.amount, 0);
            const unpaidFines = fines.filter(f => !f.isPaid);
            const unpaidAmount = unpaidFines.reduce((sum, f) => sum + f.amount, 0);
            const totalDamagesCost = damages.reduce((sum, d) => sum + (d.actualCost || d.estimatedCost), 0);

            // Calculate risk score (0-100)
            let riskScore = 0;
            riskScore += fines.length * 10; // 10 points per fine
            riskScore += unpaidFines.length * 5; // Extra 5 points for unpaid fines
            riskScore += damages.filter(d => d.severity === IncidentSeverity.Critical).length * 25;
            riskScore += damages.filter(d => d.severity === IncidentSeverity.Major).length * 15;
            riskScore += damages.filter(d => d.severity === IncidentSeverity.Moderate).length * 8;
            riskScore += damages.filter(d => d.severity === IncidentSeverity.Minor).length * 3;

            riskScore = Math.min(100, riskScore); // Cap at 100

            const allIncidentDates = [
                ...fines.map(f => f.date),
                ...damages.map(d => d.date)
            ].sort().reverse();

            return {
                driverId: driver.id,
                driver,
                totalFines: fines.length,
                totalFineAmount,
                unpaidFines: unpaidFines.length,
                unpaidAmount,
                totalDamages: damages.length,
                totalDamagesCost,
                lastIncidentDate: allIncidentDates[0],
                riskScore,
                needsTraining: riskScore >= 30 || unpaidFines.length >= 2 || damages.filter(d => d.severity === IncidentSeverity.Major || d.severity === IncidentSeverity.Critical).length > 0
            };
        }).sort((a, b) => b.riskScore - a.riskScore);
    },

    // Refuel Records Management
    getRefuelRecords: async (driverId?: string): Promise<RefuelRecord[]> => {
        await new Promise(res => setTimeout(res, 200));
        const records = driverId
            ? mockRefuelRecords.filter(r => r.driverId === driverId)
            : mockRefuelRecords;
        return [...records].sort((a, b) => b.date.getTime() - a.date.getTime());
    },

    addRefuelRecord: async (refuelData: Omit<RefuelRecord, 'id'>): Promise<RefuelRecord> => {
        await new Promise(res => setTimeout(res, 300));
        const newRefuel: RefuelRecord = {
            ...refuelData,
            id: `r${mockRefuelRecords.length + 1}`,
        };
        mockRefuelRecords.push(newRefuel);
        return newRefuel;
    },

    // Charge Records Management
    getChargeRecords: async (driverId?: string): Promise<ChargeRecord[]> => {
        await new Promise(res => setTimeout(res, 200));
        const records = driverId
            ? mockChargeRecords.filter(r => r.driverId === driverId)
            : mockChargeRecords;
        return [...records].sort((a, b) => b.date.getTime() - a.date.getTime());
    },

    addChargeRecord: async (chargeData: Omit<ChargeRecord, 'id'>): Promise<ChargeRecord> => {
        await new Promise(res => setTimeout(res, 300));
        const newCharge: ChargeRecord = {
            ...chargeData,
            id: `c${mockChargeRecords.length + 1}`,
        };
        mockChargeRecords.push(newCharge);
        return newCharge;
    },

    // Settings Management
    getSettings: async (): Promise<AppSettings> => {
        await new Promise(res => setTimeout(res, 200));
        return { ...mockSettings };
    },

    updateSettings: async (settings: Partial<AppSettings>): Promise<AppSettings> => {
        await new Promise(res => setTimeout(res, 300));
        Object.assign(mockSettings, {
            ...settings,
            lastModified: new Date()
        });
        return { ...mockSettings };
    },

    // Employment Status Management
    updateEmploymentStatus: async (driverId: string, status: EmploymentStatus, endDate?: string): Promise<User> => {
        await new Promise(res => setTimeout(res, 300));
        const driverIndex = mockUsers.findIndex(u => u.id === driverId);
        if (driverIndex === -1) {
            throw new Error('Driver not found');
        }

        mockUsers[driverIndex] = {
            ...mockUsers[driverIndex],
            employmentStatus: status,
            employmentEndDate: status !== EmploymentStatus.Active ? endDate : undefined
        };

        return mockUsers[driverIndex];
    },

    // Driver Deletion with Validation
    canDeleteDriver: async (driverId: string): Promise<{ canDelete: boolean; reasons: string[] }> => {
        await new Promise(res => setTimeout(res, 200));
        const reasons: string[] = [];

        // Check for outstanding fines
        const unpaidFines = mockDriverFines.filter(f => f.driverId === driverId && !f.isPaid);
        if (unpaidFines.length > 0) {
            reasons.push(`${unpaidFines.length} unpaid fine(s)`);
        }

        // Check for unrepaired damages
        const unrepairedDamages = mockVehicleDamages.filter(d => d.driverId === driverId && !d.isRepaired);
        if (unrepairedDamages.length > 0) {
            reasons.push(`${unrepairedDamages.length} unrepaired damage(s)`);
        }

        // Check for active shifts
        const activeShifts = mockShifts.filter(s => s.driverId === driverId && s.status === ShiftStatus.Active);
        if (activeShifts.length > 0) {
            reasons.push(`${activeShifts.length} active shift(s)`);
        }

        // Check for recent activity (shifts in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentShifts = mockShifts.filter(s =>
            s.driverId === driverId &&
            s.startTime > thirtyDaysAgo
        );
        if (recentShifts.length > 0) {
            reasons.push(`${recentShifts.length} shift(s) in the last 30 days`);
        }

        return {
            canDelete: reasons.length === 0,
            reasons
        };
    },

    deleteDriver: async (driverId: string): Promise<void> => {
        await new Promise(res => setTimeout(res, 300));
        const validation = await api.canDeleteDriver(driverId);

        if (!validation.canDelete) {
            throw new Error(`Cannot delete driver: ${validation.reasons.join(', ')}`);
        }

        const driverIndex = mockUsers.findIndex(u => u.id === driverId);
        if (driverIndex === -1) {
            throw new Error('Driver not found');
        }

        // Remove driver from all related data
        mockUsers.splice(driverIndex, 1);

        // Clean up related data (only if no historical importance)
        // Note: We should NOT delete fines, damages, or shifts for audit purposes
        // This would only be done if the driver has no relevant data
    },

    // Fuel Economy Management
    getFuelEconomyAlerts: async (vehicleId?: string): Promise<FuelEconomyAlert[]> => {
        await new Promise(res => setTimeout(res, 200));
        const alerts = vehicleId
            ? mockFuelEconomyAlerts.filter(a => a.vehicleId === vehicleId)
            : mockFuelEconomyAlerts;
        return [...alerts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },

    updateFuelEconomyAlert: async (alertId: string, updates: Partial<FuelEconomyAlert>): Promise<FuelEconomyAlert> => {
        await new Promise(res => setTimeout(res, 300));
        const alertIndex = mockFuelEconomyAlerts.findIndex(a => a.id === alertId);
        if (alertIndex === -1) {
            throw new Error('Alert not found');
        }

        mockFuelEconomyAlerts[alertIndex] = {
            ...mockFuelEconomyAlerts[alertIndex],
            ...updates
        };

        return mockFuelEconomyAlerts[alertIndex];
    },

    calculateFuelEconomyStatus: async (vehicleId: string): Promise<{
        vehicle: Vehicle;
        manufacturerVsBaseline: number; // % difference
        currentVsBaseline: number; // % difference
        currentVsManufacturer: number; // % difference
        needsAttention: boolean;
        trend: 'improving' | 'stable' | 'degrading' | 'unknown';
        recommendations: string[];
    }> => {
        await new Promise(res => setTimeout(res, 200));
        const vehicle = mockVehicles.find(v => v.id === vehicleId);
        if (!vehicle) {
            throw new Error('Vehicle not found');
        }

        const manufacturerConsumption = vehicle.vehicleType === VehicleType.ICE
            ? (vehicle.manufacturerFuelConsumption || 0)
            : (vehicle.manufacturerEnergyConsumption || 0);
        const baselineConsumption = vehicle.vehicleType === VehicleType.ICE
            ? (vehicle.baselineFuelConsumption || 0)
            : (vehicle.baselineEnergyConsumption || 0);
        const currentConsumption = vehicle.vehicleType === VehicleType.ICE
            ? (vehicle.currentFuelConsumption || 0)
            : (vehicle.currentEnergyConsumption || 0);

        const manufacturerVsBaseline = (baselineConsumption > 0 && manufacturerConsumption > 0)
            ? ((baselineConsumption - manufacturerConsumption) / manufacturerConsumption) * 100
            : 0;

        const currentVsBaseline = (baselineConsumption > 0 && currentConsumption > 0)
            ? ((currentConsumption - baselineConsumption) / baselineConsumption) * 100
            : 0;

        const currentVsManufacturer = (manufacturerConsumption > 0 && currentConsumption > 0)
            ? ((currentConsumption - manufacturerConsumption) / manufacturerConsumption) * 100
            : 0;

        const threshold = vehicle.economyVarianceThreshold || 15;
        const needsAttention = !isNaN(currentVsBaseline) && isFinite(currentVsBaseline) && Math.abs(currentVsBaseline) > threshold;

        const recommendations: string[] = [];
        if (!isNaN(currentVsBaseline) && isFinite(currentVsBaseline)) {
            if (currentVsBaseline > 15) {
                recommendations.push('Consider engine service - consumption significantly above baseline');
            }
            if (currentVsBaseline > 20) {
                recommendations.push('Check air filter, fuel injectors, and tire pressure');
            }
            if (currentVsBaseline > 25) {
                recommendations.push('URGENT: Major maintenance required - investigate engine performance');
            }
        }
        if (!isNaN(currentVsManufacturer) && isFinite(currentVsManufacturer) && currentVsManufacturer > 30) {
            recommendations.push('Performance significantly below manufacturer specifications');
        }

        return {
            vehicle,
            manufacturerVsBaseline: isNaN(manufacturerVsBaseline) || !isFinite(manufacturerVsBaseline) ? 0 : manufacturerVsBaseline,
            currentVsBaseline: isNaN(currentVsBaseline) || !isFinite(currentVsBaseline) ? 0 : currentVsBaseline,
            currentVsManufacturer: isNaN(currentVsManufacturer) || !isFinite(currentVsManufacturer) ? 0 : currentVsManufacturer,
            needsAttention,
            trend: vehicle.economyTrendDirection || 'unknown',
            recommendations
        };
    },

    // Scheduled Services Management
    getScheduledServices: async (): Promise<ScheduledService[]> => {
        await new Promise(res => setTimeout(res, 200));
        return [...mockScheduledServices].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    },

    updateScheduledService: async (serviceId: string, updates: Partial<ScheduledService>): Promise<ScheduledService> => {
        await new Promise(res => setTimeout(res, 300));
        const serviceIndex = mockScheduledServices.findIndex(s => s.id === serviceId);
        if (serviceIndex === -1) {
            throw new Error('Scheduled service not found');
        }

        mockScheduledServices[serviceIndex] = {
            ...mockScheduledServices[serviceIndex],
            ...updates
        };

        return mockScheduledServices[serviceIndex];
    },

    getServicesNeedingReminders: async (): Promise<ScheduledService[]> => {
        await new Promise(res => setTimeout(res, 200));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        return mockScheduledServices.filter(service =>
            service.isBooked &&
            !service.reminderSent &&
            service.bookedDate === tomorrowStr
        );
    },

    markReminderSent: async (serviceId: string): Promise<void> => {
        await new Promise(res => setTimeout(res, 200));
        const serviceIndex = mockScheduledServices.findIndex(s => s.id === serviceId);
        if (serviceIndex !== -1) {
            mockScheduledServices[serviceIndex].reminderSent = true;
        }
    },

    // Vehicle Usage Statistics
    getVehicleUsageStats: async (vehicleId?: string): Promise<VehicleUsageStats[]> => {
        await new Promise(res => setTimeout(res, 200));
        if (vehicleId) {
            const stats = mockVehicleUsageStats.filter(s => s.vehicleId === vehicleId);
            return stats;
        }
        return [...mockVehicleUsageStats];
    },

    calculateVehicleUsageStats: async (vehicleId: string): Promise<VehicleUsageStats> => {
        await new Promise(res => setTimeout(res, 300));

        // In a real system, this would calculate from shift data
        // For demo, we'll return existing or create new stats
        let existingStats = mockVehicleUsageStats.find(s => s.vehicleId === vehicleId);

        if (!existingStats) {
            // Calculate from shift data (simplified for demo)
            const vehicleShifts = mockShifts.filter(s => s.vehicleId === vehicleId && s.status === ShiftStatus.Completed);

            if (vehicleShifts.length === 0) {
                // No shift data, use default
                const settings = await api.getSettings();
                existingStats = {
                    vehicleId,
                    avgDailyUsageKm: settings.defaultDailyUsageKm,
                    totalDaysTracked: 0,
                    lastCalculated: new Date(),
                    recentUsageTrend: 'stable'
                };
            } else {
                // Calculate from available shifts
                const totalKm = vehicleShifts.reduce((sum, shift) =>
                    sum + ((shift.endOdometer || 0) - shift.startOdometer), 0);
                const avgKm = totalKm / vehicleShifts.length;

                existingStats = {
                    vehicleId,
                    avgDailyUsageKm: Math.round(avgKm),
                    totalDaysTracked: vehicleShifts.length,
                    lastCalculated: new Date(),
                    recentUsageTrend: 'stable'
                };
            }

            mockVehicleUsageStats.push(existingStats);
        }

        return existingStats;
    },

    getServicesNeedingBooking: async (): Promise<{
        service: ScheduledService;
        vehicle: Vehicle;
        usageStats: VehicleUsageStats;
        kmUntilBookingDeadline: number;
        daysUntilBookingDeadline: number;
        bookingDeadlineKm: number;
        priority: 'urgent' | 'due-soon' | 'upcoming';
    }[]> => {
        await new Promise(res => setTimeout(res, 300));
        const settings = await api.getSettings();
        const vehicles = mockVehicles;
        const result = [];

        for (const service of mockScheduledServices) {
            if (service.isBooked) continue; // Skip already booked services

            const vehicle = vehicles.find(v => v.id === service.vehicleId);
            if (!vehicle || vehicle.status !== VehicleStatus.Active) continue;

            const usageStats = await api.calculateVehicleUsageStats(service.vehicleId);

            let bookingDeadlineKm: number;

            if (settings.enableSmartBookingReminders) {
                // Smart calculation: lead time days × daily usage
                bookingDeadlineKm = settings.serviceBookingLeadTimeDays * usageStats.avgDailyUsageKm;
            } else {
                // Manual override threshold
                bookingDeadlineKm = settings.bookingReminderThresholdKm;
            }

            // Calculate how many km until we reach the booking deadline
            const kmUntilService = service.dueOdometer - (vehicle.currentOdometer || 0);
            const kmUntilBookingDeadline = kmUntilService - bookingDeadlineKm;

            // Only include if we're at or past the booking deadline
            if (kmUntilBookingDeadline <= 0) {
                const daysUntilBookingDeadline = Math.ceil(Math.abs(kmUntilBookingDeadline) / usageStats.avgDailyUsageKm);

                let priority: 'urgent' | 'due-soon' | 'upcoming';
                if (kmUntilBookingDeadline <= -200) priority = 'urgent'; // 200km past deadline
                else if (kmUntilBookingDeadline <= 0) priority = 'due-soon'; // At or just past deadline
                else priority = 'upcoming';

                result.push({
                    service,
                    vehicle,
                    usageStats,
                    kmUntilBookingDeadline,
                    daysUntilBookingDeadline,
                    bookingDeadlineKm,
                    priority
                });
            }
        }

        return result.sort((a, b) => a.kmUntilBookingDeadline - b.kmUntilBookingDeadline);
    }
};

export default api;