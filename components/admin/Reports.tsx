import React, { useState, useEffect } from 'react';
import Header from '../shared/Header';
import Card from '../shared/Card';
import { TrendingUp, DollarSign, AlertTriangle, Fuel } from 'lucide-react';
import Leaderboard from '../shared/Leaderboard';
import ManageCosts from './ManageCosts';
import ManageIncidents from './ManageIncidents';
import FuelEconomyMonitor from './FuelEconomyMonitor';
import { Vehicle } from '../../types';
import api from '../../services/mockApi';

interface ReportsProps {
    onBack: () => void;
}

const Reports: React.FC<ReportsProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<'leaderboard' | 'costs' | 'incidents' | 'fuel-economy'>('leaderboard');
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);

    const fetchVehicles = async () => {
        try {
            const vehicleData = await api.getVehicles();
            setVehicles(vehicleData);
        } catch (error) {
            console.error('Failed to fetch vehicles:', error);
        }
    };

    useEffect(() => {
        fetchVehicles();
    }, []);

    const handleTabChange = (tabKey: string) => {
        setActiveTab(tabKey as any);
        // Refresh vehicle data when switching to fuel-economy tab
        if (tabKey === 'fuel-economy') {
            fetchVehicles();
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
        }
    ];

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Reports & Analytics" />
            <main className="max-w-7xl mx-auto p-6">
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Fleet Analytics & Reports</h2>
                        <button
                            onClick={onBack}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                        >
                            Back to Dashboard
                        </button>
                    </div>

                    {/* Tab Navigation */}
                    <div className="border-b border-gray-200 mb-6">
                        <nav className="flex space-x-8">
                            {tabConfig.map(({ key, label, icon: Icon, color }) => (
                                <button
                                    key={key}
                                    onClick={() => handleTabChange(key)}
                                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                        activeTab === key
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
                                <Leaderboard onBack={() => {}} hideBackButton={true} />
                            </div>
                        )}

                        {activeTab === 'fuel-economy' && (
                            <div>
                                <FuelEconomyMonitor vehicles={vehicles} />
                            </div>
                        )}

                        {activeTab === 'costs' && (
                            <div>
                                <ManageCosts onBack={() => {}} hideBackButton={true} />
                            </div>
                        )}

                        {activeTab === 'incidents' && (
                            <div>
                                <ManageIncidents onBack={() => {}} hideBackButton={true} />
                            </div>
                        )}
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default Reports;