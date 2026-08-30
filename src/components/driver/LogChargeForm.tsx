import React, { useState, useEffect } from 'react';
import api from '../../services/firebaseApi';
import Card from '../shared/Card';
import Header from '../shared/Header';
import { Bolt, Check, Car, AlertTriangle } from 'lucide-react';
import { Vehicle, VehicleType, ChargingType, CHARGING_TYPE_LABELS, ChargingLocationForDriver } from '../../types';
import { getDriverSession } from '../../store/session';
import shiftStore from '../../store/shift';
import ChargingLocationPicker from './ChargingLocationPicker';

interface LogChargeFormProps {
    onBack: () => void;
    assignmentId: string;
    activeVehicle?: { id: string; registration: string; alias?: string; vehicleType: any; activeChargingSessionId?: string };
}

// Deliberately neutral — no hard-coded target percentage. Edit this single string to change
// the fleet-wide guidance shown to drivers; it is not computed from usage data or weather.
const NEUTRAL_CHARGING_GUIDANCE = "Charge according to your fleet's charging guidance and how much of your shift remains. There's no fixed target — charge only as much as you need.";

const CHECKLIST_LABELS: Record<string, string> = {
    charge_level: 'Verified charge level and connected charging cable properly',
    tyre_pressure: 'Checked tyre pressure and condition',
    washer_fluid: 'Checked washer fluid level',
};

type Step = 'checklist' | 'start-details' | 'in-progress' | 'end-details' | 'end-summary';

const LogChargeForm: React.FC<LogChargeFormProps> = ({ onBack, assignmentId, activeVehicle }) => {
    const [fullVehicle, setFullVehicle] = useState<Vehicle | null>(null);
    const [step, setStep] = useState<Step>(activeVehicle?.activeChargingSessionId ? 'in-progress' : 'checklist');
    const [chargingSessionId, setChargingSessionId] = useState<string | null>(activeVehicle?.activeChargingSessionId || null);

    const [checklistItems, setChecklistItems] = useState<{ [key: string]: boolean }>({
        charge_level: false,
        tyre_pressure: false,
        washer_fluid: false,
    });

    const [startOdometer, setStartOdometer] = useState('');
    const [startChargePercent, setStartChargePercent] = useState('');
    const [startPredictedRangeKm, setStartPredictedRangeKm] = useState('');
    const [chargingLocation, setChargingLocation] = useState<ChargingLocationForDriver | null>(null);
    const [chargingType, setChargingType] = useState<ChargingType | ''>('');

    const [endChargePercent, setEndChargePercent] = useState('');
    const [endPredictedRangeKm, setEndPredictedRangeKm] = useState('');
    const [chargerEnergyDeliveredKWh, setChargerEnergyDeliveredKWh] = useState('');
    const [chargeCost, setChargeCost] = useState('');
    const [endNotes, setEndNotes] = useState('');
    const [endSummary, setEndSummary] = useState<{ estimatedBatteryEnergyAddedKWh: number | null } | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const session = getDriverSession();

    useEffect(() => {
        const fetchVehicle = async () => {
            if (!activeVehicle?.id || !session) return;
            try {
                const v = await api.getVehicleForSession(session.driverId, session.sessionToken, activeVehicle.id);
                if (!v) return;
                setFullVehicle(v);
                setStartOdometer((prev) => (prev || (typeof v.currentOdometer === 'number' ? String(v.currentOdometer) : prev)));
            } catch (error) {
                console.error('Failed to fetch vehicle', error);
            }
        };
        fetchVehicle();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeVehicle?.id]);

    if (!activeVehicle || activeVehicle.vehicleType !== VehicleType.EV) {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Log EV Charge" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <div className="text-center">
                            <AlertTriangle className="mx-auto h-16 w-16 text-red-500 mb-4" />
                            <h3 className="text-xl font-semibold text-gray-800">No Active EV Assignment</h3>
                            <p className="text-red-600 mt-2">You must have an active EV vehicle assignment to log charging.</p>
                            <button onClick={onBack} className="mt-6 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Back to Dashboard</button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    const vehicleLabel = fullVehicle
        ? `${fullVehicle.registration} - ${fullVehicle.make} ${fullVehicle.model}`
        : `${activeVehicle.registration}${activeVehicle.alias ? ` (${activeVehicle.alias})` : ''}`;

    const handleContinueToStartCharge = () => {
        const allItemsChecked = Object.values(checklistItems).every((item) => item);
        if (!allItemsChecked) return;
        setSubmitError(null);
        setStep('start-details');
    };

    const handleStartCharging = async () => {
        if (!session) {
            setSubmitError('Your session has expired. Please log in again.');
            return;
        }
        if (!chargingLocation) {
            setSubmitError('Select a charging location before starting.');
            return;
        }
        if (!chargingType) {
            setSubmitError('Select a charging type before starting.');
            return;
        }
        const odometer = parseFloat(startOdometer);
        const percent = parseFloat(startChargePercent);
        const predictedRange = parseFloat(startPredictedRangeKm);
        if (!Number.isFinite(odometer) || !Number.isFinite(percent) || !Number.isFinite(predictedRange)) {
            setSubmitError('Enter valid odometer, charge percent, and predicted range values.');
            return;
        }

        setSubmitting(true);
        setSubmitError(null);
        try {
            const { chargingSessionId: newSessionId } = await api.startChargingSession({
                driverId: session.driverId,
                sessionToken: session.sessionToken,
                assignmentId,
                startOdometer: odometer,
                startChargePercent: percent,
                startPredictedRangeKm: predictedRange,
                chargingLocationId: chargingLocation.id,
                chargingType,
                deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
            });

            setChargingSessionId(newSessionId);
            const active = shiftStore.getActiveShift();
            if (active?.vehicle) {
                shiftStore.updateShift({ vehicle: { ...active.vehicle, activeChargingSessionId: newSessionId } });
            }
            setStep('in-progress');
        } catch (err) {
            console.error('Failed to start charging session:', err);
            setSubmitError(err instanceof Error && err.message ? err.message : 'Failed to start charging session. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEndCharging = async () => {
        if (!session) {
            setSubmitError('Your session has expired. Please log in again.');
            return;
        }
        if (!chargingSessionId) {
            setSubmitError('No active charging session was found for this vehicle.');
            return;
        }
        const percent = parseFloat(endChargePercent);
        const predictedRange = parseFloat(endPredictedRangeKm);
        if (!Number.isFinite(percent) || !Number.isFinite(predictedRange)) {
            setSubmitError('Enter valid end charge percent and predicted range values.');
            return;
        }

        setSubmitting(true);
        setSubmitError(null);
        try {
            const { estimatedBatteryEnergyAddedKWh } = await api.endChargingSession({
                driverId: session.driverId,
                sessionToken: session.sessionToken,
                chargingSessionId,
                endChargePercent: percent,
                endPredictedRangeKm: predictedRange,
                chargerEnergyDeliveredKWh: chargerEnergyDeliveredKWh.trim() ? parseFloat(chargerEnergyDeliveredKWh) : undefined,
                chargeCost: chargeCost.trim() ? parseFloat(chargeCost) : undefined,
                notes: endNotes.trim() || undefined,
                deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
            });

            const active = shiftStore.getActiveShift();
            if (active?.vehicle) {
                shiftStore.updateShift({ vehicle: { ...active.vehicle, activeChargingSessionId: undefined } });
            }
            setEndSummary({ estimatedBatteryEnergyAddedKWh });
            setStep('end-summary');
        } catch (err) {
            console.error('Failed to end charging session:', err);
            setSubmitError(err instanceof Error && err.message ? err.message : 'Failed to end charging session. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const ErrorBanner = () => submitError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
            <AlertTriangle className="h-4 w-4 mr-1.5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{submitError}</p>
        </div>
    ) : null;

    const VehicleReadOnly = () => (
        <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-2">Vehicle</h3>
            <div className="flex items-center">
                <Car className="h-5 w-5 text-gray-500 mr-2" />
                <span className="text-lg font-medium">{vehicleLabel}</span>
            </div>
        </div>
    );

    // ---- Safety checklist ----
    if (step === 'checklist') {
        const allItemsChecked = Object.values(checklistItems).every((item) => item);
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="EV Charging Checklist" />
                <main className="max-w-md mx-auto p-6">
                    <Card>
                        <div className="text-center mb-6">
                            <Bolt className="mx-auto h-12 w-12 text-teal-500" />
                            <h3 className="text-2xl font-bold mt-2">Charging Safety Check</h3>
                            <p className="text-gray-600">{vehicleLabel}</p>
                        </div>

                        <div className="space-y-4 mb-6">
                            {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
                                <label key={key} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={checklistItems[key] || false}
                                        onChange={(e) => setChecklistItems((prev) => ({ ...prev, [key]: e.target.checked }))}
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
                                onClick={onBack}
                                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleContinueToStartCharge}
                                disabled={!allItemsChecked}
                                className={`w-full font-bold py-3 px-4 rounded-lg transition ${!allItemsChecked
                                    ? 'bg-gray-400 cursor-not-allowed text-white'
                                    : 'bg-teal-500 hover:bg-teal-600 text-white'
                                    }`}
                            >
                                <Check className="inline h-5 w-5 mr-2" />
                                Continue to Start Charge
                            </button>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    // ---- Start Charge Details ----
    if (step === 'start-details') {
        const canStart = !submitting && !!chargingLocation && !!chargingType
            && startOdometer.trim() !== '' && startChargePercent.trim() !== '' && startPredictedRangeKm.trim() !== '';

        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Start Charge Details" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">Start Charge Details</h2>

                        <div className="bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-4 mb-6" role="alert">
                            <p className="font-bold">Charging Guidance</p>
                            <p>{NEUTRAL_CHARGING_GUIDANCE}</p>
                        </div>

                        <div className="space-y-6">
                            <VehicleReadOnly />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Start Odometer (km) *</label>
                                    <input
                                        type="number"
                                        value={startOdometer}
                                        onChange={(e) => setStartOdometer(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Prefilled from the vehicle's last known odometer — verify and correct if needed.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Start State of Charge (%) *</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={startChargePercent}
                                        onChange={(e) => setStartChargePercent(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Start Predicted Range (km) *</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={startPredictedRangeKm}
                                        onChange={(e) => setStartPredictedRangeKm(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Charging Type *</label>
                                    <select
                                        value={chargingType}
                                        onChange={(e) => setChargingType(e.target.value as ChargingType)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    >
                                        <option value="">Select charging type</option>
                                        {(Object.keys(CHARGING_TYPE_LABELS) as ChargingType[]).map((type) => (
                                            <option key={type} value={type}>{CHARGING_TYPE_LABELS[type]}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <ChargingLocationPicker
                                driverId={session?.driverId || ''}
                                sessionToken={session?.sessionToken || ''}
                                value={chargingLocation?.id ?? ''}
                                onChange={setChargingLocation}
                                disabled={submitting}
                            />

                            <p className="text-xs text-gray-500">Start time is recorded automatically when you press Start Charging.</p>

                            <ErrorBanner />

                            <div className="flex justify-between items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setStep('checklist')}
                                    className="bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={handleStartCharging}
                                    disabled={!canStart}
                                    className={`font-bold py-3 px-6 rounded-lg transition ${!canStart
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-teal-500 hover:bg-teal-600 text-white'
                                        }`}
                                >
                                    <Bolt className="inline h-5 w-5 mr-2" />
                                    {submitting ? 'Starting...' : 'Start Charging'}
                                </button>
                            </div>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    // ---- Charging In Progress ----
    if (step === 'in-progress') {
        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="Charging In Progress" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <div className="text-center py-8">
                            <Bolt className="mx-auto h-16 w-16 text-teal-500 mb-4 animate-pulse" />
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">Charging In Progress</h3>
                            <p className="text-gray-600 mb-6">{vehicleLabel} is currently charging. Your shift and vehicle assignment remain active.</p>

                            <ErrorBanner />

                            <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-6">
                                <button onClick={onBack} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
                                    Back to Dashboard
                                </button>
                                <button
                                    onClick={() => { setSubmitError(null); setStep('end-details'); }}
                                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-lg transition"
                                >
                                    <Bolt className="inline h-5 w-5 mr-2" />
                                    End Charge
                                </button>
                            </div>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    // ---- End Charge Details ----
    if (step === 'end-details') {
        const canEnd = !submitting && endChargePercent.trim() !== '' && endPredictedRangeKm.trim() !== '';

        return (
            <div className="min-h-screen bg-gray-100">
                <Header title="End Charge Details" />
                <main className="max-w-4xl mx-auto p-6">
                    <Card>
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">End Charge Details</h2>

                        <div className="space-y-6">
                            <VehicleReadOnly />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">End State of Charge (%) *</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={endChargePercent}
                                        onChange={(e) => setEndChargePercent(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">End Predicted Range (km) *</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={endPredictedRangeKm}
                                        onChange={(e) => setEndPredictedRangeKm(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Charger Energy Delivered (kWh)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.1"
                                        value={chargerEnergyDeliveredKWh}
                                        onChange={(e) => setChargerEnergyDeliveredKWh(e.target.value)}
                                        placeholder="Optional — only if metered/billed"
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Charge Cost (R)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={chargeCost}
                                        onChange={(e) => setChargeCost(e.target.value)}
                                        placeholder="Optional"
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                                <textarea
                                    value={endNotes}
                                    onChange={(e) => setEndNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Any additional context about this charging session..."
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                                />
                            </div>

                            <p className="text-xs text-gray-500">
                                Battery energy added will be estimated automatically from this vehicle's battery capacity and your reported charge levels — you don't need to calculate it yourself.
                            </p>

                            <ErrorBanner />

                            <div className="flex justify-between items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setStep('in-progress')}
                                    className="bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 transition"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={handleEndCharging}
                                    disabled={!canEnd}
                                    className={`font-bold py-3 px-6 rounded-lg transition ${!canEnd
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                                        }`}
                                >
                                    <Check className="inline h-5 w-5 mr-2" />
                                    {submitting ? 'Ending Charge...' : 'End Charging'}
                                </button>
                            </div>
                        </div>
                    </Card>
                </main>
            </div>
        );
    }

    // ---- Charge Complete summary ----
    return (
        <div className="min-h-screen bg-gray-100">
            <Header title="Charge Complete" />
            <main className="max-w-4xl mx-auto p-6">
                <Card>
                    <div className="text-center py-6">
                        <Check className="mx-auto h-16 w-16 text-green-500 mb-4" />
                        <h3 className="text-2xl font-bold text-gray-800 mb-2">Charging Session Ended</h3>
                        <p className="text-gray-600 mb-6">{vehicleLabel} has finished charging. Your shift and vehicle assignment continue as before.</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm text-gray-700">
                        <div className="flex justify-between"><span>End State of Charge:</span><span className="font-medium">{endChargePercent}%</span></div>
                        <div className="flex justify-between"><span>End Predicted Range:</span><span className="font-medium">{endPredictedRangeKm} km</span></div>
                        <div className="flex justify-between">
                            <span>Estimated Battery Energy Added:</span>
                            <span className="font-medium">
                                {endSummary?.estimatedBatteryEnergyAddedKWh != null ? `${endSummary.estimatedBatteryEnergyAddedKWh} kWh` : 'Not available'}
                            </span>
                        </div>
                        {chargerEnergyDeliveredKWh.trim() && (
                            <div className="flex justify-between"><span>Charger Energy Delivered:</span><span className="font-medium">{chargerEnergyDeliveredKWh} kWh</span></div>
                        )}
                        {chargeCost.trim() && (
                            <div className="flex justify-between"><span>Charge Cost:</span><span className="font-medium">R{parseFloat(chargeCost).toFixed(2)}</span></div>
                        )}
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={onBack}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition duration-300"
                        >
                            Continue Shift
                        </button>
                    </div>
                </Card>
            </main>
        </div>
    );
};

export default LogChargeForm;
