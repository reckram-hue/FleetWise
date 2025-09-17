import React, { useState, useEffect } from 'react';
import { Vehicle, FuelEconomyAlert } from '../../types';
import api from '../../services/mockApi';
import Card from '../shared/Card';
import {
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Minus,
    CheckCircle,
    XCircle,
    Fuel,
    Zap
} from 'lucide-react';

interface FuelEconomyMonitorProps {
    vehicles: Vehicle[];
}

const FuelEconomyMonitor: React.FC<FuelEconomyMonitorProps> = ({ vehicles }) => {
    const [economyStatuses, setEconomyStatuses] = useState<{ [vehicleId: string]: any }>({});
    const [alerts, setAlerts] = useState<FuelEconomyAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);

    useEffect(() => {
        if (vehicles && vehicles.length > 0) {
            fetchEconomyData();
        }
    }, [vehicles]);

    const fetchEconomyData = async () => {
        setLoading(true);
        try {
            if (!vehicles || vehicles.length === 0) {
                setAlerts([]);
                setEconomyStatuses({});
                return;
            }

            const [alertsData, ...statusPromises] = await Promise.all([
                api.getFuelEconomyAlerts(),
                ...vehicles.map(v => api.calculateFuelEconomyStatus(v.id))
            ]);

            setAlerts(alertsData || []);

            const statusMap: { [vehicleId: string]: any } = {};
            statusPromises.forEach((status, index) => {
                if (status && vehicles[index]) {
                    statusMap[vehicles[index].id] = status;
                }
            });
            setEconomyStatuses(statusMap);
        } catch (error) {
            console.error('Failed to fetch economy data:', error);
            setAlerts([]);
            setEconomyStatuses({});
        } finally {
            setLoading(false);
        }
    };

    const getTrendIcon = (trend: string) => {
        switch (trend) {
            case 'improving':
                return <TrendingDown className="h-4 w-4 text-green-500" title="Improving efficiency" />;
            case 'degrading':
                return <TrendingUp className="h-4 w-4 text-red-500" title="Degrading efficiency" />;
            case 'stable':
                return <Minus className="h-4 w-4 text-blue-500" title="Stable efficiency" />;
            default:
                return <Minus className="h-4 w-4 text-gray-500" title="Unknown trend" />;
        }
    };

    const getStatusColor = (percentage: number) => {
        if (percentage > 20) return 'text-red-600 bg-red-50 border-red-200';
        if (percentage > 15) return 'text-orange-600 bg-orange-50 border-orange-200';
        if (percentage > 10) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        if (percentage > -10) return 'text-green-600 bg-green-50 border-green-200';
        return 'text-blue-600 bg-blue-50 border-blue-200';
    };

    const formatConsumption = (consumption: number, vehicleType: string) => {
        const safeConsumption = (typeof consumption === 'number' && !isNaN(consumption) && isFinite(consumption))
            ? consumption
            : 0;
        return vehicleType === 'ICE'
            ? `${safeConsumption.toFixed(1)} L/100km`
            : `${safeConsumption.toFixed(1)} kWh/100km`;
    };

    const activeAlerts = (alerts || []).filter(a => !a.isResolved);
    const criticalVehicles = Object.values(economyStatuses || {}).filter(s => s && s.needsAttention);

    if (loading) {
        return (
            <Card>
                <div className="text-center py-8">Loading fuel economy data...</div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                    <div className="flex items-center">
                        <AlertTriangle className="h-8 w-8 text-red-500 mr-3" />
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{activeAlerts.length}</p>
                            <p className="text-sm text-gray-500">Active Alerts</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4">
                    <div className="flex items-center">
                        <XCircle className="h-8 w-8 text-orange-500 mr-3" />
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{criticalVehicles.length}</p>
                            <p className="text-sm text-gray-500">Need Attention</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-4">
                    <div className="flex items-center">
                        <CheckCircle className="h-8 w-8 text-green-500 mr-3" />
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{(vehicles || []).length - criticalVehicles.length}</p>
                            <p className="text-sm text-gray-500">Performing Well</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Active Alerts */}
            {activeAlerts.length > 0 && (
                <Card>
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                        Active Fuel Economy Alerts
                    </h3>
                    <div className="space-y-3">
                        {activeAlerts.map(alert => {
                            const vehicle = vehicles.find(v => v.id === alert.vehicleId);
                            const severityColor = {
                                low: 'border-yellow-200 bg-yellow-50',
                                medium: 'border-orange-200 bg-orange-50',
                                high: 'border-red-200 bg-red-50',
                                critical: 'border-red-300 bg-red-100'
                            }[alert.severity];

                            return (
                                <div key={alert.id} className={`p-3 border rounded-lg ${severityColor}`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-medium">
                                                {vehicle?.registration} - {vehicle?.make} {vehicle?.model}
                                            </h4>
                                            <p className="text-sm text-gray-600 mt-1">{alert.notes}</p>
                                            <div className="text-sm text-gray-500 mt-2">
                                                Current: {formatConsumption(alert.currentConsumption, vehicle?.vehicleType || 'ICE')}
                                                | Baseline: {formatConsumption(alert.baselineConsumption, vehicle?.vehicleType || 'ICE')}
                                                | Variance: <span className="font-medium">{alert.variancePercentage.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                            alert.severity === 'critical' ? 'bg-red-200 text-red-800' :
                                            alert.severity === 'high' ? 'bg-red-100 text-red-700' :
                                            alert.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                                            'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {alert.severity.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Vehicle Economy Overview */}
            <Card>
                <h3 className="text-lg font-semibold mb-4">Vehicle Fuel Economy Overview</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manufacturer Spec</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Baseline</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {(vehicles || []).map(vehicle => {
                                const status = economyStatuses[vehicle.id];
                                if (!status) return null;

                                const manufacturerConsumption = vehicle.vehicleType === 'ICE'
                                    ? (vehicle.manufacturerFuelConsumption || 0)
                                    : (vehicle.manufacturerEnergyConsumption || 0);
                                const baselineConsumption = vehicle.vehicleType === 'ICE'
                                    ? (vehicle.baselineFuelConsumption || 0)
                                    : (vehicle.baselineEnergyConsumption || 0);
                                const currentConsumption = vehicle.vehicleType === 'ICE'
                                    ? (vehicle.currentFuelConsumption || 0)
                                    : (vehicle.currentEnergyConsumption || 0);

                                return (
                                    <tr key={vehicle.id} className={status.needsAttention ? 'bg-red-50' : ''}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                {vehicle.vehicleType === 'ICE' ?
                                                    <Fuel className="h-4 w-4 text-gray-400 mr-2" /> :
                                                    <Zap className="h-4 w-4 text-blue-400 mr-2" />
                                                }
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{vehicle.registration}</div>
                                                    <div className="text-sm text-gray-500">{vehicle.make} {vehicle.model}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {formatConsumption(manufacturerConsumption, vehicle.vehicleType)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {formatConsumption(baselineConsumption, vehicle.vehicleType)}
                                            <div className="text-xs text-gray-500">
                                                {status.manufacturerVsBaseline > 0 ? '+' : ''}{status.manufacturerVsBaseline.toFixed(1)}% vs manufacturer
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {formatConsumption(currentConsumption, vehicle.vehicleType)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="flex items-center">
                                                {getTrendIcon(status.trend)}
                                                <span className="ml-1 capitalize">{status.trend}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(status.currentVsBaseline)}`}>
                                                {status.currentVsBaseline > 0 ? '+' : ''}{status.currentVsBaseline.toFixed(1)}%
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {status.needsAttention ? (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                                    Attention Required
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                    Normal
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Recommendations */}
            {Object.values(economyStatuses || {}).some(s => s && s.recommendations && s.recommendations.length > 0) && (
                <Card>
                    <h3 className="text-lg font-semibold mb-4">Maintenance Recommendations</h3>
                    <div className="space-y-4">
                        {(vehicles || []).map(vehicle => {
                            const status = economyStatuses[vehicle.id];
                            if (!status || !status.recommendations || status.recommendations.length === 0) return null;

                            return (
                                <div key={vehicle.id} className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                                    <h4 className="font-medium text-gray-900 mb-2">
                                        {vehicle.registration} - {vehicle.make} {vehicle.model}
                                    </h4>
                                    <ul className="space-y-1">
                                        {status.recommendations.map((rec: string, index: number) => (
                                            <li key={index} className="text-sm text-gray-700 flex items-start">
                                                <span className="text-yellow-500 mr-2">•</span>
                                                {rec}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default FuelEconomyMonitor;