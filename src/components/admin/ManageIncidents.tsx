import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Edit, AlertTriangle, DollarSign, Calendar, User, Car, X, TrendingUp, Gauge, CheckCircle2 } from 'lucide-react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import api from '../../services/firebaseApi';
import {
    DriverFine,
    VehicleDamage,
    User as UserType,
    Vehicle,
    FineType,
    DamageType,
    IncidentSeverity,
    UserRole,
    DriverIncidentSummary,
    OdometerDiscrepancy
} from '../../types';

interface ManageIncidentsProps {
    onBack: () => void;
    hideBackButton?: boolean;
}

const ManageIncidents: React.FC<ManageIncidentsProps> = ({ onBack, hideBackButton }) => {
    const [activeTab, setActiveTab] = useState<'fines' | 'damages' | 'analytics' | 'odometer'>('fines');
    const [fines, setFines] = useState<DriverFine[]>([]);
    const [damages, setDamages] = useState<VehicleDamage[]>([]);
    const [discrepancies, setDiscrepancies] = useState<OdometerDiscrepancy[]>([]);
    const [users, setUsers] = useState<UserType[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [driverSummaries, setDriverSummaries] = useState<DriverIncidentSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showFineForm, setShowFineForm] = useState(false);
    const [showDamageForm, setShowDamageForm] = useState(false);
    const [selectedFine, setSelectedFine] = useState<DriverFine | null>(null);
    const [selectedDamage, setSelectedDamage] = useState<VehicleDamage | null>(null);
    // Test-data isolation: the Fines/Damages tabs double as both a real-operational
    // report AND the edit surface for those same records, so they can't simply exclude
    // test data unconditionally (that would make a test fine/damage impossible to find
    // and edit during ongoing testing). Default view is the clean, real-only list; this
    // toggle is the explicit, deliberate action needed to reveal test records for editing.
    const [showTestData, setShowTestData] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [finesData, damagesData, usersData, vehiclesData, summariesData, discrepanciesData] = await Promise.all([
                    api.getDriverFines(),
                    api.getVehicleDamages(),
                    api.getUsers(),
                    api.getVehicles(),
                    api.getDriverIncidentSummary(),
                    api.listOdometerDiscrepancies().catch(() => [] as OdometerDiscrepancy[])
                ]);
                setFines(finesData);
                setDamages(damagesData);
                setUsers(usersData);
                setVehicles(vehiclesData);
                setDriverSummaries(summariesData);
                setDiscrepancies(discrepanciesData);
            } catch (error) {
                console.error('Failed to fetch incident data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Test-data isolation (Part C): a record counts as test data if its own isTestData
    // is true, OR its driverId belongs to a test driver, OR its vehicleId belongs to a
    // test vehicle — this covers historical fines/damages that predate the isTestData
    // field entirely, not just newly-created ones.
    const testDriverIds = useMemo(
        () => new Set(users.filter(u => u.isTestData === true).map(u => u.id)),
        [users]
    );
    const testVehicleIds = useMemo(
        () => new Set(vehicles.filter(v => v.isTestData === true).map(v => v.id)),
        [vehicles]
    );
    const isTestRecord = (record: { isTestData?: boolean; driverId: string; vehicleId: string }) =>
        record.isTestData === true || testDriverIds.has(record.driverId) || testVehicleIds.has(record.vehicleId);

    // Category A (real-operational list + implicit totals): excludes test data by
    // default. Category B (management/editing of test records) is reached only via the
    // explicit "Show test data" toggle above — never accidentally hidden functionality,
    // since the driver/vehicle pickers inside the Add/Edit forms remain fully unfiltered.
    const visibleFines = showTestData ? fines : fines.filter(f => !isTestRecord(f));
    const visibleDamages = showTestData ? damages : damages.filter(d => !isTestRecord(d));
    const visibleDiscrepancies = showTestData ? discrepancies : discrepancies.filter(d => !isTestRecord(d));
    // The tab badge is a fleet-health indicator, not tied to the toggle — it always
    // reflects real open discrepancies regardless of whether test data is being viewed.
    const realOpenDiscrepancyCount = discrepancies.filter(d => d.status === 'OPEN' && !isTestRecord(d)).length;

    const handleAddFine = () => {
        setSelectedFine(null);
        setShowFineForm(true);
    };

    const handleEditFine = (fine: DriverFine) => {
        setSelectedFine(fine);
        setShowFineForm(true);
    };

    const handleAddDamage = () => {
        setSelectedDamage(null);
        setShowDamageForm(true);
    };

    const handleEditDamage = (damage: VehicleDamage) => {
        setSelectedDamage(damage);
        setShowDamageForm(true);
    };

    const refreshData = async () => {
        try {
            const [finesData, damagesData, summariesData] = await Promise.all([
                api.getDriverFines(),
                api.getVehicleDamages(),
                api.getDriverIncidentSummary()
            ]);
            setFines(finesData);
            setDamages(damagesData);
            setDriverSummaries(summariesData);
        } catch (error) {
            console.error('Failed to refresh data:', error);
        }
    };

    const getDriverName = (driverId: string) => {
        const driver = users.find(u => u.id === driverId);
        return driver ? `${driver.firstName} ${driver.surname}` : 'Unknown Driver';
    };

    const getVehicleInfo = (vehicleId: string) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        return vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.registration})` : 'Unknown Vehicle';
    };

    const FineCard = ({ fine, isTest }: { fine: DriverFine; isTest?: boolean }) => (
        <Card className={`mb-4 ${isTest ? 'border-2 border-dashed border-amber-300' : ''}`}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                        {fine.fineType}
                        {isTest && (
                            <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">TEST</span>
                        )}
                    </h4>
                    <p className="text-sm text-gray-600">{getDriverName(fine.driverId)}</p>
                    <p className="text-sm text-gray-500">{getVehicleInfo(fine.vehicleId)}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-600">Date: {fine.date}</p>
                    <p className="text-sm text-gray-600">Amount: R{fine.amount.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">Fine #: {fine.fineNumber}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-600">Location: {fine.location}</p>
                    <p className="text-sm text-gray-600">Authority: {fine.issuingAuthority}</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        fine.isPaid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                        {fine.isPaid ? `Paid ${fine.paidDate}` : `Due ${fine.dueDate}`}
                    </span>
                </div>
                <div className="flex justify-end">
                    <button
                        onClick={() => handleEditFine(fine)}
                        className="text-blue-600 hover:text-blue-800 p-2"
                        title="Edit Fine"
                    >
                        <Edit size={16} />
                    </button>
                </div>
            </div>
            {fine.description && (
                <div className="mt-2 pt-2 border-t">
                    <p className="text-sm text-gray-700">{fine.description}</p>
                </div>
            )}
        </Card>
    );

    const DamageCard = ({ damage, isTest }: { damage: VehicleDamage; isTest?: boolean }) => (
        <Card className={`mb-4 ${isTest ? 'border-2 border-dashed border-amber-300' : ''}`}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                        {damage.damageType}
                        {isTest && (
                            <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">TEST</span>
                        )}
                    </h4>
                    <p className="text-sm text-gray-600">{getDriverName(damage.driverId)}</p>
                    <p className="text-sm text-gray-500">{getVehicleInfo(damage.vehicleId)}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-600">Date: {damage.date}</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        damage.severity === IncidentSeverity.Critical ? 'bg-red-100 text-red-800' :
                        damage.severity === IncidentSeverity.Major ? 'bg-orange-100 text-orange-800' :
                        damage.severity === IncidentSeverity.Moderate ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                    }`}>
                        {damage.severity}
                    </span>
                </div>
                <div>
                    <p className="text-sm text-gray-600">
                        Cost: R{(damage.actualCost || damage.estimatedCost).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600">Location: {damage.location}</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        damage.isRepaired ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                        {damage.isRepaired ? `Repaired ${damage.repairedDate}` : 'Needs Repair'}
                    </span>
                </div>
                <div className="flex justify-end">
                    <button
                        onClick={() => handleEditDamage(damage)}
                        className="text-blue-600 hover:text-blue-800 p-2"
                        title="Edit Damage"
                    >
                        <Edit size={16} />
                    </button>
                </div>
            </div>
            {damage.description && (
                <div className="mt-2 pt-2 border-t">
                    <p className="text-sm text-gray-700">{damage.description}</p>
                </div>
            )}
        </Card>
    );

    const DriverSummaryCard = ({ summary }: { summary: DriverIncidentSummary }) => {
        const riskColor = summary.riskScore >= 50 ? 'red' :
                         summary.riskScore >= 25 ? 'orange' :
                         summary.riskScore >= 10 ? 'yellow' : 'green';

        const riskBgClass = riskColor === 'red' ? 'bg-red-100 text-red-800' :
                           riskColor === 'orange' ? 'bg-orange-100 text-orange-800' :
                           riskColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                           'bg-green-100 text-green-800';

        return (
            <Card className="mb-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <h4 className="font-semibold text-gray-800">
                            {summary.driver.firstName} {summary.driver.surname}
                        </h4>
                        <p className="text-sm text-gray-600">{summary.driver.email}</p>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${riskBgClass}`}>
                            Risk Score: {summary.riskScore}
                        </span>
                    </div>
                    <div>
                        <p className="text-sm text-gray-600">Fines: {summary.totalFines}</p>
                        <p className="text-sm text-gray-600">Total: R{summary.totalFineAmount.toLocaleString()}</p>
                        <p className="text-sm text-red-600">Unpaid: R{summary.unpaidAmount.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-600">Damages: {summary.totalDamages}</p>
                        <p className="text-sm text-gray-600">Cost: R{summary.totalDamagesCost.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-600">
                            Last Incident: {summary.lastIncidentDate || 'None'}
                        </p>
                        {summary.needsTraining && (
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 mt-1">
                                Training Recommended
                            </span>
                        )}
                    </div>
                    <div className="flex justify-end">
                        <TrendingUp
                            className={`h-6 w-6 ${
                                riskColor === 'red' ? 'text-red-500' :
                                riskColor === 'orange' ? 'text-orange-500' :
                                riskColor === 'yellow' ? 'text-yellow-500' :
                                'text-green-500'
                            }`}
                        />
                    </div>
                </div>
            </Card>
        );
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Manage Driver Incidents" />
            <main className="max-w-7xl mx-auto p-6">
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Driver Incidents & Penalties</h2>
                        {!hideBackButton && (
                            <button
                                onClick={onBack}
                                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                            >
                                Back to Dashboard
                            </button>
                        )}
                    </div>

                    {/* Tab Navigation */}
                    <div className="border-b border-gray-200 mb-6">
                        <nav className="flex space-x-8">
                            {[
                                { key: 'fines', label: 'Driver Fines', icon: DollarSign },
                                { key: 'damages', label: 'Vehicle Damages', icon: AlertTriangle },
                                { key: 'analytics', label: 'Driver Analytics', icon: User },
                                { key: 'odometer', label: 'Odometer Discrepancies', icon: Gauge, badge: realOpenDiscrepancyCount }
                            ].map(({ key, label, icon: Icon, badge }) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key as any)}
                                    className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center ${
                                        activeTab === key
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <Icon className="inline h-5 w-5 mr-2" />
                                    {label}
                                    {badge != null && badge > 0 && (
                                        <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-full font-bold">
                                            {badge}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {loading ? (
                        <div className="text-center py-8">Loading incidents...</div>
                    ) : (
                        <>
                            {/* Fines Tab */}
                            {activeTab === 'fines' && (
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold">Driver Fines</h3>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center text-sm text-gray-600 gap-1.5">
                                                <input
                                                    type="checkbox"
                                                    checked={showTestData}
                                                    onChange={(e) => setShowTestData(e.target.checked)}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                                />
                                                Show test data
                                            </label>
                                            <button
                                                onClick={handleAddFine}
                                                className="flex items-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg"
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add Fine
                                            </button>
                                        </div>
                                    </div>
                                    {visibleFines.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">
                                            {fines.length === 0 ? 'No fines recorded yet.' : 'No real fines to show. Toggle "Show test data" to view test records.'}
                                        </p>
                                    ) : (
                                        visibleFines.map(fine => <FineCard key={fine.id} fine={fine} isTest={isTestRecord(fine)} />)
                                    )}
                                </div>
                            )}

                            {/* Damages Tab */}
                            {activeTab === 'damages' && (
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-semibold">Vehicle Damages</h3>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center text-sm text-gray-600 gap-1.5">
                                                <input
                                                    type="checkbox"
                                                    checked={showTestData}
                                                    onChange={(e) => setShowTestData(e.target.checked)}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                                />
                                                Show test data
                                            </label>
                                            <button
                                                onClick={handleAddDamage}
                                                className="flex items-center bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg"
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add Damage
                                            </button>
                                        </div>
                                    </div>
                                    {visibleDamages.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">
                                            {damages.length === 0 ? 'No damages recorded yet.' : 'No real damages to show. Toggle "Show test data" to view test records.'}
                                        </p>
                                    ) : (
                                        visibleDamages.map(damage => <DamageCard key={damage.id} damage={damage} isTest={isTestRecord(damage)} />)
                                    )}
                                </div>
                            )}

                            {/* Analytics Tab */}
                            {activeTab === 'analytics' && (
                                <div>
                                    <h3 className="text-lg font-semibold mb-4">Driver Risk Analysis</h3>
                                    {driverSummaries.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">No driver data available yet.</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {driverSummaries
                                                .sort((a, b) => b.riskScore - a.riskScore)
                                                .map(summary => (
                                                <DriverSummaryCard key={summary.driverId} summary={summary} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Odometer Discrepancies Tab */}
                            {activeTab === 'odometer' && (
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <div>
                                            <h3 className="text-lg font-semibold text-gray-900">Unaccounted Mileage & Odometer Discrepancies</h3>
                                            <p className="text-sm text-gray-500">Flags instances where a vehicle's pickup odometer was higher than its last recorded return odometer.</p>
                                        </div>
                                        <label className="flex items-center text-sm text-gray-600 gap-1.5">
                                            <input
                                                type="checkbox"
                                                checked={showTestData}
                                                onChange={(e) => setShowTestData(e.target.checked)}
                                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                            />
                                            Show test data
                                        </label>
                                    </div>

                                    {visibleDiscrepancies.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">
                                            {discrepancies.length === 0
                                                ? 'No odometer discrepancies recorded. All vehicle transitions are consistent.'
                                                : 'No real discrepancies to show. Toggle "Show test data" to view test records.'}
                                        </p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Time</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Pickup</th>
                                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Difference</th>
                                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {visibleDiscrepancies.map(d => {
                                                        const vehicle = vehicles.find(v => v.id === d.vehicleId);
                                                        const driver = users.find(u => u.id === d.driverId);
                                                        const dateStr = d.detectedAt ? (typeof d.detectedAt === 'string' ? new Date(d.detectedAt).toLocaleString() : (d.detectedAt.toDate ? d.detectedAt.toDate().toLocaleString() : new Date(d.detectedAt).toLocaleString())) : '—';
                                                        const isTest = isTestRecord(d);
                                                        return (
                                                            <tr key={d.id} className={`hover:bg-gray-50 ${isTest ? 'bg-amber-50' : ''}`}>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{dateStr}</td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                                                                    {vehicle?.registration || d.vehicleId}
                                                                    {vehicle?.alias && <span className="text-gray-500 font-normal ml-1">({vehicle.alias})</span>}
                                                                    {isTest && (
                                                                        <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">TEST</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800">
                                                                    {driver ? `${driver.firstName} ${driver.surname}` : d.driverId}
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                                                                    {(d.expectedOdometer || 0).toLocaleString()} km
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                                                                    {(d.actualPickupOdometer || 0).toLocaleString()} km
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-amber-600">
                                                                    +{d.unaccountedKm.toLocaleString()} km
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                                        d.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                                                                        d.status === 'INVESTIGATING' ? 'bg-blue-100 text-blue-800' :
                                                                        'bg-amber-100 text-amber-800'
                                                                    }`}>
                                                                        {d.status}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-center space-x-2">
                                                                    {d.status !== 'RESOLVED' && (
                                                                        <button
                                                                            onClick={async () => {
                                                                                await api.updateOdometerDiscrepancyStatus(d.id, 'RESOLVED');
                                                                                setDiscrepancies(prev => prev.map(item => item.id === d.id ? { ...item, status: 'RESOLVED' } : item));
                                                                            }}
                                                                            className="text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-300 font-semibold px-2 py-1 rounded"
                                                                        >
                                                                            Resolve
                                                                        </button>
                                                                    )}
                                                                    {d.status === 'OPEN' && (
                                                                        <button
                                                                            onClick={async () => {
                                                                                await api.updateOdometerDiscrepancyStatus(d.id, 'INVESTIGATING');
                                                                                setDiscrepancies(prev => prev.map(item => item.id === d.id ? { ...item, status: 'INVESTIGATING' } : item));
                                                                            }}
                                                                            className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-300 font-semibold px-2 py-1 rounded"
                                                                        >
                                                                            Investigate
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </Card>

                {/* Fine Form Modal */}
                {showFineForm && (
                    <FineFormModal
                        fine={selectedFine}
                        users={users.filter(u => u.role === UserRole.Driver)}
                        vehicles={vehicles}
                        onClose={() => setShowFineForm(false)}
                        onSave={() => {
                            setShowFineForm(false);
                            refreshData();
                        }}
                    />
                )}

                {/* Damage Form Modal */}
                {showDamageForm && (
                    <DamageFormModal
                        damage={selectedDamage}
                        users={users.filter(u => u.role === UserRole.Driver)}
                        vehicles={vehicles}
                        onClose={() => setShowDamageForm(false)}
                        onSave={() => {
                            setShowDamageForm(false);
                            refreshData();
                        }}
                    />
                )}
            </main>
        </div>
    );
};

// Fine Form Modal Component
const FineFormModal = ({
    fine,
    users,
    vehicles,
    onClose,
    onSave
}: {
    fine: DriverFine | null;
    users: UserType[];
    vehicles: Vehicle[];
    onClose: () => void;
    onSave: () => void;
}) => {
    const [formData, setFormData] = useState<Omit<DriverFine, 'id'>>({
        driverId: fine?.driverId || '',
        vehicleId: fine?.vehicleId || '',
        date: fine?.date || new Date().toISOString().split('T')[0],
        time: fine?.time || '',
        fineType: fine?.fineType || FineType.Speeding,
        amount: fine?.amount || 0,
        description: fine?.description || '',
        fineNumber: fine?.fineNumber || '',
        location: fine?.location || '',
        issuingAuthority: fine?.issuingAuthority || '',
        dueDate: fine?.dueDate || '',
        isPaid: fine?.isPaid || false,
        paidDate: fine?.paidDate || '',
        notes: fine?.notes || '',
        allocatedAutomatically: fine?.allocatedAutomatically || false,
        allocationMethod: fine?.allocationMethod || 'manual'
    });

    const [vehicleRegistration, setVehicleRegistration] = useState(fine ? vehicles.find(v => v.id === fine.vehicleId)?.registration || '' : '');
    const [allocationInfo, setAllocationInfo] = useState<any>(null);
    const [showAutoAllocation, setShowAutoAllocation] = useState(!fine); // Show streamlined flow for new fines
    const [showManualAssignment, setShowManualAssignment] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [autoAssignComplete, setAutoAssignComplete] = useState(false);

    const handleAutoAllocate = async () => {
        if (!vehicleRegistration || !formData.date || !formData.time) {
            alert('Please complete all three steps: Vehicle Registration, Date, and Time');
            return;
        }

        try {
            const result = await api.determineDriverForFine(
                vehicleRegistration,
                formData.date,
                formData.time
            );

            setAllocationInfo(result);

            if (result.driverId && result.vehicleId) {
                setFormData(prev => ({
                    ...prev,
                    driverId: result.driverId || '',
                    vehicleId: result.vehicleId || '',
                    allocatedAutomatically: true,
                    allocationMethod: result.method === 'no_match' ? 'manual' : result.method
                }));
                setAutoAssignComplete(true);
            } else {
                // No match found - show manual assignment and alert admin
                setShowManualAssignment(true);
                alert(`⚠️ ADMIN ALERT: No driver found for vehicle ${vehicleRegistration} on ${formData.date} at ${formData.time}. Please assign manually.`);
            }
        } catch (error) {
            console.error('Auto-allocation failed:', error);
            setShowManualAssignment(true);
            alert('⚠️ ADMIN ALERT: Auto-allocation system failed. Please assign driver manually.');
        }
    };

    // Auto-trigger allocation when all three fields are filled
    useEffect(() => {
        if (showAutoAllocation && !autoAssignComplete && vehicleRegistration && formData.date && formData.time) {
            handleAutoAllocate();
        }
    }, [vehicleRegistration, formData.date, formData.time, showAutoAllocation, autoAssignComplete]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.driverId || !formData.vehicleId || !formData.amount) {
            alert('Please fill in all required fields.');
            return;
        }

        setIsSubmitting(true);
        try {
            if (fine) {
                await api.updateDriverFine({ ...fine, ...formData });
            } else {
                await api.addDriverFine(formData);
            }
            onSave();
        } catch (error) {
            console.error('Failed to save fine:', error);
            alert('Error saving fine.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const parsedValue = type === 'number' ? parseFloat(value) || 0 :
                          type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: parsedValue }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{fine ? 'Edit Fine' : 'Add New Fine'}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Streamlined 3-Step Process for New Fines */}
                    {showAutoAllocation && !showManualAssignment && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <h4 className="text-lg font-semibold text-blue-800 mb-4">Quick Fine Entry - 3 Simple Steps</h4>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Step 1: Vehicle Registration */}
                                <div className="relative">
                                    <div className="absolute -top-3 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full z-10">Step 1</div>
                                    <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">Vehicle Registration *</label>
                                    <select
                                        value={vehicleRegistration}
                                        onChange={(e) => setVehicleRegistration(e.target.value)}
                                        className="block w-full px-3 py-2 border-2 border-blue-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
                                        required
                                    >
                                        <option value="">Select Vehicle Registration</option>
                                        {vehicles.map(vehicle => (
                                            <option key={vehicle.id} value={vehicle.registration}>
                                                {vehicle.registration} - {vehicle.make} {vehicle.model}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Step 2: Date */}
                                <div className="relative">
                                    <div className="absolute -top-3 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full z-10">Step 2</div>
                                    <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">Fine Date *</label>
                                    <input
                                        type="date"
                                        name="date"
                                        value={formData.date}
                                        onChange={handleChange}
                                        className="block w-full px-3 py-2 border-2 border-blue-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
                                        required
                                    />
                                </div>

                                {/* Step 3: Time */}
                                <div className="relative">
                                    <div className="absolute -top-3 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full z-10">Step 3</div>
                                    <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">Fine Time *</label>
                                    <input
                                        type="time"
                                        name="time"
                                        value={formData.time}
                                        onChange={handleChange}
                                        className="block w-full px-3 py-2 border-2 border-blue-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Auto-allocation Status */}
                            {allocationInfo && (
                                <div className={`mt-4 p-3 rounded-lg ${
                                    allocationInfo.driverId ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
                                }`}>
                                    {allocationInfo.driverId ? (
                                        <div className="text-green-800">
                                            <div className="flex items-center">
                                                <span className="text-green-600 mr-2">✓</span>
                                                <strong>Driver Automatically Assigned!</strong>
                                            </div>
                                            <p className="text-sm mt-1">
                                                Driver: {users.find(u => u.id === allocationInfo.driverId)?.firstName} {users.find(u => u.id === allocationInfo.driverId)?.surname}
                                            </p>
                                            <p className="text-sm">
                                                Vehicle: {vehicles.find(v => v.id === allocationInfo.vehicleId)?.make} {vehicles.find(v => v.id === allocationInfo.vehicleId)?.model} ({vehicles.find(v => v.id === allocationInfo.vehicleId)?.registration})
                                            </p>
                                            <p className="text-sm">
                                                Method: {allocationInfo.method} | Confidence: {allocationInfo.confidence}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="text-orange-800">
                                            <div className="flex items-center">
                                                <span className="text-orange-600 mr-2">⚠</span>
                                                <strong>No Matching Driver Found</strong>
                                            </div>
                                            <p className="text-sm mt-1">{allocationInfo.message}</p>
                                            <button
                                                type="button"
                                                onClick={() => setShowManualAssignment(true)}
                                                className="mt-2 text-sm bg-orange-200 hover:bg-orange-300 text-orange-800 px-3 py-1 rounded"
                                            >
                                                Assign Manually
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Manual Assignment Fields - Show when editing or when auto-assignment fails */}
                    {(fine || showManualAssignment) && (
                        <div className="space-y-4">
                            {showManualAssignment && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                                    <h4 className="font-semibold text-orange-800">⚠️ Manual Assignment Required</h4>
                                    <p className="text-sm text-orange-700 mt-1">Please manually select the driver and vehicle below.</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Driver *</label>
                                    <select
                                        name="driverId"
                                        value={formData.driverId}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                        required
                                    >
                                        <option value="">Select Driver</option>
                                        {users.map(user => (
                                            <option key={user.id} value={user.id}>
                                                {user.firstName} {user.surname}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Vehicle *</label>
                                    <select
                                        name="vehicleId"
                                        value={formData.vehicleId}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                        required
                                    >
                                        <option value="">Select Vehicle</option>
                                        {vehicles.map(vehicle => (
                                            <option key={vehicle.id} value={vehicle.id}>
                                                {vehicle.registration} - {vehicle.make} {vehicle.model}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Date *</label>
                                    <input
                                        type="date"
                                        name="date"
                                        value={formData.date}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Time</label>
                                    <input
                                        type="time"
                                        name="time"
                                        value={formData.time}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Fine Details - Always shown after driver assignment */}
                    {(autoAssignComplete || fine || showManualAssignment) && (
                        <div>
                            <h4 className="text-lg font-semibold text-gray-800 mb-3">Fine Details</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Fine Type *</label>
                                    <select
                                        name="fineType"
                                        value={formData.fineType}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                        required
                                    >
                                        {Object.values(FineType).map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Amount (R) *</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        value={formData.amount}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                        required
                                        min="0"
                                        step="0.01"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Fine Number</label>
                                    <input
                                        type="text"
                                        name="fineNumber"
                                        value={formData.fineNumber}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Location</label>
                                    <input
                                        type="text"
                                        name="location"
                                        value={formData.location}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Issuing Authority</label>
                                    <input
                                        type="text"
                                        name="issuingAuthority"
                                        value={formData.issuingAuthority}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Due Date</label>
                                    <input
                                        type="date"
                                        name="dueDate"
                                        value={formData.dueDate}
                                        onChange={handleChange}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                    />
                                </div>

                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        name="isPaid"
                                        checked={formData.isPaid}
                                        onChange={handleChange}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                    />
                                    <label className="ml-2 block text-sm text-gray-700">Fine has been paid</label>
                                </div>

                                {formData.isPaid && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Paid Date</label>
                                        <input
                                            type="date"
                                            name="paidDate"
                                            value={formData.paidDate}
                                            onChange={handleChange}
                                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700">Description</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    rows={3}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>

                            <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700">Notes</label>
                                <textarea
                                    name="notes"
                                    value={formData.notes}
                                    onChange={handleChange}
                                    rows={2}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Saving...' : fine ? 'Update Fine' : 'Add Fine'}
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

// Damage Form Modal Component
const DamageFormModal = ({
    damage,
    users,
    vehicles,
    onClose,
    onSave
}: {
    damage: VehicleDamage | null;
    users: UserType[];
    vehicles: Vehicle[];
    onClose: () => void;
    onSave: () => void;
}) => {
    const [formData, setFormData] = useState<Omit<VehicleDamage, 'id'>>({
        vehicleId: damage?.vehicleId || '',
        driverId: damage?.driverId || '',
        date: damage?.date || new Date().toISOString().split('T')[0],
        damageType: damage?.damageType || DamageType.Scratches,
        severity: damage?.severity || IncidentSeverity.Minor,
        estimatedCost: damage?.estimatedCost || 0,
        actualCost: damage?.actualCost || 0,
        description: damage?.description || '',
        location: damage?.location || '',
        isRepaired: damage?.isRepaired || false,
        repairedDate: damage?.repairedDate || '',
        insuranceClaim: damage?.insuranceClaim || false,
        claimNumber: damage?.claimNumber || '',
        notes: damage?.notes || '',
        photos: damage?.photos || []
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.driverId || !formData.vehicleId || !formData.estimatedCost) {
            alert('Please fill in all required fields.');
            return;
        }

        setIsSubmitting(true);
        try {
            if (damage) {
                await api.updateVehicleDamage({ ...damage, ...formData });
            } else {
                await api.addVehicleDamage(formData);
            }
            onSave();
        } catch (error) {
            console.error('Failed to save damage:', error);
            alert('Error saving damage record.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const parsedValue = type === 'number' ? parseFloat(value) || 0 :
                          type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: parsedValue }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{damage ? 'Edit Damage' : 'Add New Damage'}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Driver *</label>
                            <select
                                name="driverId"
                                value={formData.driverId}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                required
                            >
                                <option value="">Select Driver</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.id}>
                                        {user.firstName} {user.surname}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Vehicle *</label>
                            <select
                                name="vehicleId"
                                value={formData.vehicleId}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                required
                            >
                                <option value="">Select Vehicle</option>
                                {vehicles.map(vehicle => (
                                    <option key={vehicle.id} value={vehicle.id}>
                                        {vehicle.registration} - {vehicle.make} {vehicle.model}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Date *</label>
                            <input
                                type="date"
                                name="date"
                                value={formData.date}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Damage Type *</label>
                            <select
                                name="damageType"
                                value={formData.damageType}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                required
                            >
                                {Object.values(DamageType).map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Severity *</label>
                            <select
                                name="severity"
                                value={formData.severity}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                required
                            >
                                {Object.values(IncidentSeverity).map(severity => (
                                    <option key={severity} value={severity}>{severity}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Estimated Cost (R) *</label>
                            <input
                                type="number"
                                name="estimatedCost"
                                value={formData.estimatedCost}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                required
                                min="0"
                                step="0.01"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Actual Cost (R)</label>
                            <input
                                type="number"
                                name="actualCost"
                                value={formData.actualCost}
                                onChange={handleChange}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                min="0"
                                step="0.01"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Damage Location</label>
                            <input
                                type="text"
                                name="location"
                                value={formData.location}
                                onChange={handleChange}
                                placeholder="e.g., Front bumper, Driver door"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                        </div>

                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                name="isRepaired"
                                checked={formData.isRepaired}
                                onChange={handleChange}
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                            />
                            <label className="ml-2 block text-sm text-gray-700">Damage has been repaired</label>
                        </div>

                        {formData.isRepaired && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Repaired Date</label>
                                <input
                                    type="date"
                                    name="repairedDate"
                                    value={formData.repairedDate}
                                    onChange={handleChange}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        )}

                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                name="insuranceClaim"
                                checked={formData.insuranceClaim}
                                onChange={handleChange}
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                            />
                            <label className="ml-2 block text-sm text-gray-700">Insurance claim filed</label>
                        </div>

                        {formData.insuranceClaim && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Claim Number</label>
                                <input
                                    type="text"
                                    name="claimNumber"
                                    value={formData.claimNumber}
                                    onChange={handleChange}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            rows={2}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-200 text-gray-800 font-bold py-2 px-4 rounded-lg hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Saving...' : damage ? 'Update Damage' : 'Add Damage'}
                        </button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default ManageIncidents;