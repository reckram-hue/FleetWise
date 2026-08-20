import React, { useState, useEffect } from 'react';
import api from '../../services/firebaseApi';
import Card from '../shared/Card';
import Header from '../shared/Header';
import { Bolt, Check } from 'lucide-react';
import { Vehicle, VehicleType } from '../../types';
import { getDriverSession } from '../../store/session';

interface LogChargeFormProps {
    onBack: () => void;
    activeVehicle?: { id: string; registration: string; alias?: string; vehicleType: any };
}

const LogChargeForm: React.FC<LogChargeFormProps> = ({ onBack, activeVehicle }) => {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [loading, setLoading] = useState(false);
    const [showChecklist, setShowChecklist] = useState(false);
    const [checklistItems, setChecklistItems] = useState<{ [key: string]: boolean }>({
        'charge_level': false,
        'tyre_pressure': false,
        'washer_fluid': false
    });

    useEffect(() => {
        const session = getDriverSession();
        if (!session) return;
        api.listVehiclesForSession(session.driverId, session.sessionToken).then(allVehicles => {
            const evs = allVehicles.filter(v => v.vehicleType === VehicleType.EV);
            setVehicles(evs);
            if (activeVehicle && activeVehicle.vehicleType === VehicleType.EV) {
                setSelectedVehicleId(activeVehicle.id);
            } else if (evs.length > 0) {
                setSelectedVehicleId(evs[0].id);
            }
        });
    }, [activeVehicle]);

    useEffect(() => {
        if (!selectedVehicleId) return;

        const fetchRecommendation = async () => {
            setLoading(true);
            setRecommendation('');
            const vehicle = vehicles.find(v => v.id === selectedVehicleId);
            const avgDailyDistanceKm = vehicle?.baselineFuelConsumption ? 150 : 0;
            const avgEnergyConsumptionKwhPerKm = vehicle?.baselineEnergyConsumption || 0.2;
            if (avgDailyDistanceKm > 0 && vehicle && vehicle.batteryCapacityKwh) {
                const requiredKwh = avgDailyDistanceKm * avgEnergyConsumptionKwhPerKm;
                // Add a 15% buffer
                const recommendedChargePercent = Math.min(100, Math.ceil(((requiredKwh * 1.15) / vehicle.batteryCapacityKwh) * 100));

                setRecommendation(`Based on this vehicle's typical daily use (~${Math.round(avgDailyDistanceKm)} km), we recommend charging to at least ${recommendedChargePercent}% for a full shift.`);
            } else {
                setRecommendation("No usage data available. Recommend charging to 100%.");
            }
            setLoading(false);
        };

        fetchRecommendation();

    }, [selectedVehicleId, vehicles]);

    const handleStartCharging = () => {
        setShowChecklist(true);
    };

    const handleCompleteChecklist = () => {
        // All checklist items must be checked
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        if (allItemsChecked) {
            alert('Charging session logged successfully! All safety checks completed.');
            onBack();
        }
    };

    if (showChecklist) {
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

        const checklistLabels = {
            'charge_level': 'Verified charge level and connected charging cable properly',
            'tyre_pressure': 'Checked tyre pressure and condition',
            'washer_fluid': 'Checked washer fluid level'
        };

        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="EV Charging Checklist" />
                <main className="max-w-md mx-auto p-6">
                    <Card>
                        <div className="text-center mb-6">
                            <Bolt className="mx-auto h-12 w-12 text-teal-500" />
                            <h3 className="text-2xl font-bold mt-2">Charging Safety Check</h3>
                            <p className="text-gray-600">
                                {selectedVehicle ? `${selectedVehicle.registration} - ${selectedVehicle.make} ${selectedVehicle.model}` : 'Electric Vehicle'}
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            {Object.entries(checklistLabels).map(([key, label]) => (
                                <label key={key} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={checklistItems[key] || false}
                                        onChange={(e) => setChecklistItems(prev => ({
                                            ...prev,
                                            [key]: e.target.checked
                                        }))}
                                        className="mt-1 h-4 w-4 text-teal-600 border-gray-300 rounded"
                                    />
                                    <span className="text-sm text-gray-700 leading-5">{label}</span>
                                </label>
                            ))}
                        </div>

                        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
                            <div className="flex">
                                <Bolt className="h-5 w-5 text-teal-400 mr-2 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-medium text-teal-800">Charging Safety</h4>
                                    <p className="text-sm text-teal-700 mt-1">
                                        Complete all safety checks before and during charging. Report any charging issues immediately.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center gap-4">
                            <button
                                type="button"
                                onClick={() => setShowChecklist(false)}
                                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleCompleteChecklist}
                                disabled={!allItemsChecked}
                                className={`w-full font-bold py-3 px-4 rounded-lg transition ${!allItemsChecked
                                    ? 'bg-gray-400 cursor-not-allowed text-white'
                                    : 'bg-teal-500 hover:bg-teal-600 text-white'
                                    }`}
                            >
                                <Check className="inline h-5 w-5 mr-2" />
                                Complete Charging
                            </button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Log Charging Session" />
            <main className="max-w-4xl mx-auto p-6">
                <Card>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Log EV Charge</h2>
                    {recommendation && (
                        <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6" role="alert">
                            <p className="font-bold">Charging Recommendation</p>
                            <p>{loading ? "Calculating..." : recommendation}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Vehicle</label>
                            <select
                                value={selectedVehicleId}
                                onChange={(e) => setSelectedVehicleId(e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            >
                                {vehicles.map(vehicle => (
                                    <option key={vehicle.id} value={vehicle.id}>
                                        {vehicle.registration} - {vehicle.make} {vehicle.model}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-between items-center gap-4">
                            <button onClick={onBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                                Back to Dashboard
                            </button>
                            <button
                                onClick={handleStartCharging}
                                disabled={!selectedVehicleId}
                                className={`font-bold py-2 px-6 rounded-lg transition ${!selectedVehicleId
                                    ? 'bg-gray-400 cursor-not-allowed text-white'
                                    : 'bg-teal-500 hover:bg-teal-600 text-white'
                                    }`}
                            >
                                <Bolt className="inline h-5 w-5 mr-2" />
                                Start Charging Session
                            </button>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default LogChargeForm;
