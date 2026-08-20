import React, { useState, useEffect } from 'react';
import Card from '../shared/Card';
import Header from '../shared/Header';
import api from '../../services/firebaseApi';
import { Fuel, AlertTriangle, Car, Check } from 'lucide-react';
import { Vehicle, VehicleType } from '../../types';
import { getDriverSession } from '../../store/session';

interface LogRefuelFormProps {
    onBack: () => void;
    activeVehicle?: { id: string; registration: string; alias?: string; vehicleType: any };
}

const LogRefuelForm: React.FC<LogRefuelFormProps> = ({ onBack, activeVehicle }) => {
    const [fullVehicle, setFullVehicle] = useState<Vehicle | null>(null);
    const [showChecklist, setShowChecklist] = useState(false);
    const [checklistItems, setChecklistItems] = useState<{ [key: string]: boolean }>({
        'oil_level': false,
        'washer_fluid': false,
        'tyre_pressure': false,
        'fuel_level': false
    });
    const [refuelData, setRefuelData] = useState({
        odometer: '',
        litres: '',
        fuelCost: '',
        oilRequired: false,
        oilCost: '',
        notes: ''
    });

    useEffect(() => {
        const fetchVehicle = async () => {
            if (activeVehicle?.id) {
                try {
                    const session = getDriverSession();
                    if (!session) return;
                    const v = await api.getVehicleForSession(session.driverId, session.sessionToken, activeVehicle.id);
                    setFullVehicle(v);
                } catch (error) {
                    console.error("Failed to fetch vehicle", error);
                }
            }
        };
        fetchVehicle();
    }, [activeVehicle]);

    // Ensure we have an active ICE vehicle
    if (!activeVehicle || activeVehicle.vehicleType !== VehicleType.ICE) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Log Refueling Session" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <div className="text-center">
                            <AlertTriangle className="mx-auto h-16 w-16 text-red-500 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-800">No Active ICE Vehicle</h3>
                            <p className="text-red-600 mt-2">You must have an active ICE vehicle shift to log refueling.</p>
                            <button onClick={onBack} className="mt-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    const handleStartRefueling = () => {
        // Since button is disabled when validation fails, we can proceed directly to checklist
        setShowChecklist(true);
    };

    const handleCompleteChecklist = () => {
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        if (allItemsChecked) {
            const totalCost = parseFloat(refuelData.fuelCost) + (refuelData.oilRequired ? parseFloat(refuelData.oilCost || '0') : 0);
            alert(`Refueling completed successfully!\n\nSummary:\n- Vehicle: ${fullVehicle?.registration}\n- Odometer: ${parseInt(refuelData.odometer).toLocaleString()} km\n- Fuel: ${refuelData.litres}L @ R${parseFloat(refuelData.fuelCost).toFixed(2)}\n- Oil: ${refuelData.oilRequired ? `Yes - R${parseFloat(refuelData.oilCost || '0').toFixed(2)}` : 'No'}\n- Total Cost: R${totalCost.toFixed(2)}`);
            onBack();
        }
    };

    const calculateTotalCost = () => {
        const fuelCost = parseFloat(refuelData.fuelCost || '0');
        const oilCost = refuelData.oilRequired ? parseFloat(refuelData.oilCost || '0') : 0;
        return fuelCost + oilCost;
    };

    const handleInputChange = (field: string, value: string | boolean) => {
        setRefuelData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    if (!fullVehicle && activeVehicle) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Log Refueling Session" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <div className="text-center">
                            <AlertTriangle className="mx-auto h-16 w-16 text-gray-400 mb-4 animate-pulse" />
                            <h3 className="text-xl font-semibold text-gray-800">Loading Vehicle Data...</h3>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    if (showChecklist) {
        const allItemsChecked = Object.values(checklistItems).every(item => item);
        const checklistLabels = {
            'oil_level': 'Checked engine oil level',
            'washer_fluid': 'Checked washer fluid level',
            'tyre_pressure': 'Checked tyre pressure and condition',
            'fuel_level': 'Confirmed fuel tank is properly filled'
        };

        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Refueling Checklist" />
                <main className="max-w-md mx-auto p-6">
                    <Card>
                        <div className="text-center mb-6">
                            <Fuel className="mx-auto h-12 w-12 text-orange-500" />
                            <h3 className="text-2xl font-bold mt-2">Refueling Safety Check</h3>
                            <p className="text-gray-600">
                                {fullVehicle ? `${fullVehicle.registration} - ${fullVehicle.make} ${fullVehicle.model}` : 'ICE Vehicle'}
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
                                        className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded"
                                    />
                                    <span className="text-sm text-gray-700 leading-5">{label}</span>
                                </label>
                            ))}
                        </div>

                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                            <div className="flex">
                                <Fuel className="h-5 w-5 text-orange-400 mr-2 mt-0.5" />
                                <div>
                                    <h4 className="text-sm font-medium text-orange-800">Refueling Safety</h4>
                                    <p className="text-sm text-orange-700 mt-1">
                                        Complete all safety checks during refueling. Check fluid levels and report any issues immediately.
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
                                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                                    }`}
                            >
                                <Check className="inline h-5 w-5 mr-2" />
                                Complete Refueling
                            </button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Log Refueling Session" />
            <main className="max-w-4xl mx-auto p-6">
                <Card>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Log Vehicle Refuel</h2>

                    <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
                        <p className="font-bold">Refueling Reminder</p>
                        <p>Remember to turn off engine, check fluid levels, and ensure proper fuel cap closure.</p>
                    </div>

                    <div className="space-y-6">
                        {/* Vehicle Info - Read Only */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h3 className="font-semibold text-gray-800 mb-2">Vehicle</h3>
                            <div className="flex items-center">
                                <Car className="h-5 w-5 text-gray-500 mr-2" />
                                <span className="text-lg font-medium">{fullVehicle?.registration} - {fullVehicle?.make} {fullVehicle?.model}</span>
                            </div>
                        </div>

                        {/* Refuel Data Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Current Odometer Reading (km) *</label>
                                <input
                                    type="number"
                                    value={refuelData.odometer}
                                    onChange={(e) => handleInputChange('odometer', e.target.value)}
                                    placeholder={`e.g., ${(fullVehicle?.currentOdometer || 50000) + 100}`}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Litres Filled *</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={refuelData.litres}
                                    onChange={(e) => handleInputChange('litres', e.target.value)}
                                    placeholder="e.g., 45.5"
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Fuel Cost (R) *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={refuelData.fuelCost}
                                    onChange={(e) => handleInputChange('fuelCost', e.target.value)}
                                    placeholder="e.g., 850.00"
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={refuelData.oilRequired}
                                        onChange={(e) => handleInputChange('oilRequired', e.target.checked)}
                                        className="h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Oil purchased</span>
                                </label>

                                {refuelData.oilRequired && (
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={refuelData.oilCost}
                                        onChange={(e) => handleInputChange('oilCost', e.target.value)}
                                        placeholder="Oil cost (R)"
                                        className="mt-2 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                        required={refuelData.oilRequired}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                            <textarea
                                value={refuelData.notes}
                                onChange={(e) => handleInputChange('notes', e.target.value)}
                                rows={2}
                                placeholder="Any additional notes about refueling..."
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                            />
                        </div>

                        {/* Cost Summary */}
                        {(refuelData.fuelCost || refuelData.oilCost) && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                <h4 className="font-medium text-orange-800 mb-2">Cost Summary</h4>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span>Fuel:</span>
                                        <span>R{parseFloat(refuelData.fuelCost || '0').toFixed(2)}</span>
                                    </div>
                                    {refuelData.oilRequired && (
                                        <div className="flex justify-between">
                                            <span>Oil:</span>
                                            <span>R{parseFloat(refuelData.oilCost || '0').toFixed(2)}</span>
                                        </div>
                                    )}
                                    <hr className="border-orange-200" />
                                    <div className="flex justify-between font-medium text-orange-800">
                                        <span>Total:</span>
                                        <span>R{calculateTotalCost().toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center gap-4">
                            <button onClick={onBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                                Back to Dashboard
                            </button>
                            <button
                                onClick={handleStartRefueling}
                                disabled={!refuelData.odometer || !refuelData.litres || !refuelData.fuelCost || (refuelData.oilRequired && !refuelData.oilCost)}
                                className={`font-bold py-2 px-6 rounded-lg transition ${(!refuelData.odometer || !refuelData.litres || !refuelData.fuelCost || (refuelData.oilRequired && !refuelData.oilCost))
                                    ? 'bg-gray-400 cursor-not-allowed text-white'
                                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                                    }`}
                            >
                                <Fuel className="inline h-5 w-5 mr-2" />
                                Proceed to Safety Check
                            </button>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default LogRefuelForm;
