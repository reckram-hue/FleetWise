import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { TrendingUp, DollarSign, AlertTriangle, Fuel, Printer, FileText, Download } from 'lucide-react';
import Leaderboard from '../shared/Leaderboard';
import ManageCosts from './ManageCosts';
import ManageIncidents from './ManageIncidents';
import FuelEconomyMonitor from './FuelEconomyMonitor';
import { Vehicle, User, UserRole, EmploymentStatus } from '../../types';
import api from '../../services/firebaseApi';

interface ReportsProps {
    onBack: () => void;
}

const Reports: React.FC<ReportsProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<'leaderboard' | 'costs' | 'incidents' | 'fuel-economy' | 'printable'>('leaderboard');
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<User[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [printView, setPrintView] = useState<'none' | 'vehicles' | 'drivers'>('none');

    const getNextServiceKm = (vehicle: Vehicle): string => {
        if (!vehicle.serviceIntervalKm) return 'Not Set';
        const lastService = vehicle.lastServiceOdometer || 0;
        const nextService = lastService + vehicle.serviceIntervalKm;
        return `${nextService.toLocaleString()} km`;
    };

    const fetchData = async () => {
        try {
            const [vehicleData, userData] = await Promise.all([
                api.getVehicles(),
                api.getUsers()
            ]);
            setVehicles(vehicleData);
            setDrivers(userData.filter(u => u.role === UserRole.Driver));
        } catch (error) {
            console.error('Failed to fetch report data:', error);
            setError('Failed to load report data');
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleTabChange = (tabKey: string) => {
        setActiveTab(tabKey as any);
        if (tabKey === 'printable') {
            setPrintView('none');
        }
    };

    const tabConfig = [
        {
            key: 'leaderboard',
            label: 'Driver Leaderboard',
            icon: TrendingUp,
            color: 'text-green-600 border-green-500'
        },
        {
            key: 'fuel-economy',
            label: 'Fuel Economy',
            icon: Fuel,
            color: 'text-blue-600 border-blue-500'
        },
        {
            key: 'costs',
            label: 'Cost Analysis',
            icon: DollarSign,
            color: 'text-orange-600 border-orange-500'
        },
        {
            key: 'incidents',
            label: 'Incident Reports',
            icon: AlertTriangle,
            color: 'text-red-600 border-red-500'
        },
        {
            key: 'printable',
            label: 'Print Reports',
            icon: Printer,
            color: 'text-purple-600 border-purple-500'
        }
    ];

    if (error) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Reports & Analytics" />
                <main className="max-w-7xl mx-auto p-6">
                    <Card>
                        <div className="text-center py-12">
                            <p className="text-red-600 text-lg">{error}</p>
                            <button onClick={onBack} className="mt-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">
                                Back to Dashboard
                            </button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 print:bg-white">
            <div className="print:hidden">
                <Header title="Reports & Analytics" />
            </div>
            <main className="max-w-7xl mx-auto p-6 print:p-0 print:max-w-none">
                <Card className={printView !== 'none' ? 'print:shadow-none print:border-none' : ''}>
                    <div className="flex justify-between items-center mb-6 print:hidden">
                        <h2 className="text-2xl font-bold text-gray-800">Fleet Analytics & Reports</h2>
                        <button
                            onClick={onBack}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                        >
                            Back to Dashboard
                        </button>
                    </div>

                    {/* Tab Navigation */}
                    <div className="border-b border-gray-200 mb-6 print:hidden">
                        <nav className="flex space-x-8">
                            {tabConfig.map(({ key, label, icon: Icon, color }) => (
                                <button
                                    key={key}
                                    onClick={() => handleTabChange(key)}
                                    className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === key
                                        ? `${color} border-b-2`
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <Icon className="inline h-5 w-5 mr-2" />
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Tab Content */}
                    <div>
                        {activeTab === 'leaderboard' && (
                            <div>
                                <Leaderboard onBack={() => { }} hideBackButton={true} />
                            </div>
                        )}

                        {activeTab === 'fuel-economy' && (
                            <div>
                                <FuelEconomyMonitor vehicles={vehicles} />
                            </div>
                        )}

                        {activeTab === 'costs' && (
                            <div>
                                <ManageCosts onBack={() => { }} hideBackButton={true} />
                            </div>
                        )}

                        {activeTab === 'incidents' && (
                            <div>
                                <ManageIncidents onBack={() => { }} hideBackButton={true} />
                            </div>
                        )}

                        {activeTab === 'printable' && (
                            <div className="space-y-6">
                                {printView === 'none' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div
                                            onClick={() => setPrintView('vehicles')}
                                            className="bg-white border rounded-lg p-6 hover:shadow-md cursor-pointer transition flex items-center space-x-4"
                                        >
                                            <div className="p-4 bg-cyan-100 rounded-full text-cyan-600">
                                                <Printer className="h-8 w-8" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-800">Vehicle Fleet Status</h3>
                                                <p className="text-sm text-gray-600">Printable report of all vehicles, mileage, and status.</p>
                                            </div>
                                        </div>

                                        <div
                                            onClick={() => setPrintView('drivers')}
                                            className="bg-white border rounded-lg p-6 hover:shadow-md cursor-pointer transition flex items-center space-x-4"
                                        >
                                            <div className="p-4 bg-indigo-100 rounded-full text-indigo-600">
                                                <FileText className="h-8 w-8" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-800">Driver Performance</h3>
                                                <p className="text-sm text-gray-600">Printable report of driver statuses and license details.</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white p-8 print:p-0">
                                        <div className="flex justify-between items-center mb-8 print:hidden">
                                            <button
                                                onClick={() => setPrintView('none')}
                                                className="text-gray-600 hover:text-gray-900 font-medium flex items-center"
                                            >
                                                ← Back to Reports
                                            </button>
                                            <button
                                                onClick={() => window.print()}
                                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg shadow flex items-center gap-2"
                                            >
                                                <Printer className="h-5 w-5" />
                                                Print / Save PDF
                                            </button>
                                        </div>

                                        {/* Print Header */}
                                        <div className="mb-8 border-b pb-4">
                                            <h1 className="text-3xl font-bold text-gray-900">FleetWise {printView === 'vehicles' ? 'Vehicle Fleet' : 'Driver Staff'} Report</h1>
                                            <p className="text-gray-500 mt-2">Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
                                        </div>

                                        {/* Report Content */}
                                        {printView === 'vehicles' && (
                                            <table className="min-w-full text-left text-sm">
                                                <thead className="bg-gray-100 border-b-2 border-gray-300 font-bold text-gray-900 uppercase">
                                                    <tr>
                                                        <th className="px-4 py-2">Registration</th>
                                                        <th className="px-4 py-2">Make / Model</th>
                                                        <th className="px-4 py-2">Type</th>
                                                        <th className="px-4 py-2">Status</th>
                                                        <th className="px-4 py-2 text-right">Odometer</th>
                                                        <th className="px-4 py-2">Next Service</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {vehicles.map((v, i) => (
                                                        <tr key={v.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50 print:bg-white'}>
                                                            <td className="px-4 py-3 font-semibold">{v.registration}</td>
                                                            <td className="px-4 py-3">{v.make} {v.model}</td>
                                                            <td className="px-4 py-3">{v.vehicleType}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`px-2 py-1 rounded text-xs font-bold border ${v.status === 'Active' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                                                    {v.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">{(v.currentOdometer || 0).toLocaleString()} km</td>
                                                            <td className="px-4 py-3 text-gray-600">{getNextServiceKm(v)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}

                                        {printView === 'drivers' && (
                                            <table className="min-w-full text-left text-sm">
                                                <thead className="bg-gray-100 border-b-2 border-gray-300 font-bold text-gray-900 uppercase">
                                                    <tr>
                                                        <th className="px-4 py-2">Name</th>
                                                        <th className="px-4 py-2">Email</th>
                                                        <th className="px-4 py-2">Status</th>
                                                        <th className="px-4 py-2">License No.</th>
                                                        <th className="px-4 py-2">License Expiry</th>
                                                        <th className="px-4 py-2">Area / Dept</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {drivers.map((d, i) => (
                                                        <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50 print:bg-white'}>
                                                            <td className="px-4 py-3 font-semibold">{d.firstName} {d.surname}</td>
                                                            <td className="px-4 py-3 text-gray-600">{d.email}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`px-2 py-1 rounded text-xs font-bold border ${d.employmentStatus === EmploymentStatus.Active ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                                                                    {d.employmentStatus}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 font-mono">{d.driversLicenceNumber || '-'}</td>
                                                            <td className="px-4 py-3">{d.driversLicenceExpiry || '-'}</td>
                                                            <td className="px-4 py-3">{d.area || '-'} / {d.department || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}

                                        <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500 hidden print:block">
                                            <p>FleetWise System Report • Confidential • {new Date().getFullYear()}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default Reports;