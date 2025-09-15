// Fix: Implement mock API with sample data to resolve module errors and provide data to components.
import {
  User,
  UserRole,
  Vehicle,
  VehicleType,
  Shift,
  ShiftStatus,
  DefectReport,
  DefectUrgency,
  Cost,
  CostCategory,
  LeaderboardEntry,
  VehicleStats,
  MaintenanceRecord,
  DriverFine,
  VehicleDamage,
  FineType,
  DamageType,
  IncidentSeverity,
  DriverIncidentSummary
} from '../types';

// FIX: Export mockUsers to be used in the login screen.
export let mockUsers: User[] = [
  { id: 'admin1', firstName: 'Admin', surname: 'User', role: UserRole.Admin, email: 'admin@fleetwise.com' },
  { id: 'driver1', firstName: 'John', surname: 'Doe', role: UserRole.Driver, email: 'john.d@fleetwise.com', idNumber: '8501015000080', driversLicenceNumber: 'JDOE12345', driversLicenceExpiry: '2025-12-31', contactNumber: '0821234567', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver1' },
  { id: 'driver2', firstName: 'Jane', surname: 'Smith', role: UserRole.Driver, email: 'jane.s@fleetwise.com', idNumber: '9203054001081', driversLicenceNumber: 'JSMITH6789', driversLicenceExpiry: '2024-08-15', contactNumber: '0837654321', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver2' },
  { id: 'driver3', firstName: 'Peter', surname: 'Jones', role: UserRole.Driver, email: 'peter.j@fleetwise.com', idNumber: '8811205002085', driversLicenceNumber: 'PJONES1122', driversLicenceExpiry: '2026-02-28', contactNumber: '0848889999', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver3' },
  { id: 'driver4', firstName: 'Mary', surname: 'Williams', role: UserRole.Driver, email: 'mary.w@fleetwise.com', idNumber: '9507154003083', driversLicenceNumber: 'MWILLS3344', driversLicenceExpiry: '2023-05-20', contactNumber: '0825556666', driversLicenceImageUrl: 'https://i.pravatar.cc/150?u=driver4' },
];

let mockMaintenanceRecords: MaintenanceRecord[] = [
  { id: 'm1', vehicleId: 'v1', date: '2023-10-15', odometer: 45100, serviceType: '10,000 km Service', cost: 1800, notes: 'Oil change, filter replacement, tire rotation.' },
  { id: 'm2', vehicleId: 'v1', date: '2023-06-01', odometer: 35050, serviceType: 'Minor Service', cost: 950, notes: 'Oil and filter change.' },
  { id: 'm3', vehicleId: 'v2', date: '2023-11-20', odometer: 72300, serviceType: '15,000 km Service', cost: 2500, notes: 'Full service with brake fluid change.' },
  { id: 'm4', vehicleId: 'v2', date: '2023-08-10', odometer: 65000, serviceType: 'Tire Replacement', cost: 4800, notes: 'Replaced two rear tires.' },
  { id: 'm5', vehicleId: 'v4', date: '2023-09-05', odometer: 95000, serviceType: 'Major Service', cost: 3200, notes: 'Timing belt checked, all fluids replaced.' },
];

export let mockVehicles: Vehicle[] = [
    { 
        id: 'v1', 
        registration: 'CA 123-456', 
        make: 'Toyota', 
        model: 'Hilux', 
        vehicleType: VehicleType.ICE, 
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
        currentOdometer: 14500, 
        serviceIntervalKm: 15000, 
        lastServiceOdometer: 0,
        freeServicesUntilKm: 45000,
        maintenanceHistory: [] 
    },
    { id: 'v3', registration: 'EC 456-789', make: 'Hyundai', model: 'Kona EV', vehicleType: VehicleType.EV, batteryCapacityKwh: 64, currentOdometer: 32000, maintenanceHistory: [] },
    { id: 'v4', registration: 'KZN 987-654', make: 'Isuzu', model: 'D-Max', vehicleType: VehicleType.ICE, currentOdometer: 98000, serviceIntervalKm: 10000, lastServiceOdometer: 95000, maintenanceHistory: mockMaintenanceRecords.filter(r => r.vehicleId === 'v4') },
    { id: 'v5', registration: 'WP 111-222', make: 'VW', model: 'ID.4', vehicleType: VehicleType.EV, batteryCapacityKwh: 77, currentOdometer: 15000, maintenanceHistory: [] },
];

const mockShifts: Shift[] = [
    { id: 's1', driverId: 'driver1', vehicleId: 'v1', startTime: new Date(new Date().setHours(new Date().getHours() - 4)), startOdometer: 45450, status: ShiftStatus.Active },
    { id: 's2', driverId: 'driver2', vehicleId: 'v3', startTime: new Date(new Date().setDate(new Date().getDate() - 1)), endTime: new Date(new Date().setDate(new Date().getDate() - 1)), startOdometer: 31800, endOdometer: 32000, startChargePercent: 95, endChargePercent: 40, status: ShiftStatus.Completed },
    { id: 's3', driverId: 'driver3', vehicleId: 'v2', startTime: new Date(new Date().setDate(new Date().getDate() - 2)), endTime: new Date(new Date().setDate(new Date().getDate() - 2)), startOdometer: 73000, endOdometer: 73250, status: ShiftStatus.Completed },
];

const mockDefects: DefectReport[] = [
    { id: 'd1', vehicleId: 'v2', driverId: 'driver3', dateTime: new Date(new Date().setDate(new Date().getDate() - 1)), description: 'Brakes feel spongy', urgency: DefectUrgency.High, isResolved: false },
    { id: 'd2', vehicleId: 'v1', driverId: 'driver1', dateTime: new Date(new Date().setDate(new Date().getDate() - 5)), description: 'Engine warning light on', urgency: DefectUrgency.Critical, isResolved: false },
    { id: 'd3', vehicleId: 'v3', driverId: 'driver2', dateTime: new Date(new Date().setDate(new Date().getDate() - 10)), description: 'Cracked windscreen', urgency: DefectUrgency.Medium, isResolved: false },
    { id: 'd4', vehicleId: 'v4', driverId: 'driver4', dateTime: new Date(new Date().setDate(new Date().getDate() - 3)), description: 'Left headlight bulb out', urgency: DefectUrgency.Low, isResolved: true },
    { id: 'd5', vehicleId: 'v1', driverId: 'driver1', dateTime: new Date(new Date().setDate(new Date().getDate() - 2)), description: 'Check engine light flashing intermittently', urgency: DefectUrgency.High, isResolved: false },
    { id: 'd6', vehicleId: 'v2', driverId: 'driver3', dateTime: new Date(new Date().setDate(new Date().getDate() - 4)), description: 'Tire pressure sensor fault', urgency: DefectUrgency.Medium, isResolved: false },
    { id: 'd7', vehicleId: 'v3', driverId: 'driver2', dateTime: new Date(new Date().setDate(new Date().getDate() - 1)), description: 'Charging port cover loose', urgency: DefectUrgency.Low, isResolved: false },
];

let mockCosts: Cost[] = [
    { id: 'c1', vehicleId: 'v1', date: new Date(new Date().setDate(new Date().getDate() - 2)), cost: 1200, category: CostCategory.Fuel, description: 'Diesel fill-up' },
    { id: 'c2', vehicleId: 'v3', date: new Date(new Date().setDate(new Date().getDate() - 1)), cost: 250, category: CostCategory.Fuel, description: 'DC Fast Charge' },
    { id: 'c3', vehicleId: 'v2', date: new Date(new Date().setDate(new Date().getDate() - 5)), cost: 4500, category: CostCategory.Repairs, description: 'Brake pad replacement' },
    { id: 'c4', vehicleId: 'v4', date: new Date(new Date().setDate(new Date().getDate() - 10)), cost: 800, category: CostCategory.Maintenance, description: 'Oil change and filter' },
    { id: 'c5', vehicleId: 'v1', date: new Date(new Date().setDate(new Date().getDate() - 12)), cost: 15000, category: CostCategory.Insurance, description: 'Monthly premium' },
    { id: 'c6', vehicleId: 'v3', date: new Date(new Date().setDate(new Date().getDate() - 15)), cost: 200, category: CostCategory.Fuel, description: 'Overnight charge' },
];

const mockLeaderboard: LeaderboardEntry[] = [
    { driver: mockUsers[2], totalKmDriven: 12540, averageKmPerKwh: 5.8 },
    { driver: mockUsers[1], totalKmDriven: 11230, averageKmL: 9.2 },
    { driver: mockUsers[3], totalKmDriven: 9870, averageKmL: 8.5 },
    { driver: mockUsers[4], totalKmDriven: 8500, averageKmL: 10.1 },
];

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
        return mockDefects.filter(d => !d.isResolved);
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
        return mockLeaderboard.sort((a,b) => b.totalKmDriven - a.totalKmDriven);
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

    addDriverFine: async (fineData: Omit<DriverFine, 'id'>): Promise<DriverFine> => {
        await new Promise(res => setTimeout(res, 300));
        const newFine: DriverFine = {
            ...fineData,
            id: `f${mockDriverFines.length + 1}`,
        };
        mockDriverFines.push(newFine);
        return newFine;
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
    }
};

export default api;