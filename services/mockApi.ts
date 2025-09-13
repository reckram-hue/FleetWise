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
  MaintenanceRecord
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
    }
};

export default api;