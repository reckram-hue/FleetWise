// src/pages/ShiftStart.tsx — Simplified Shift Start (QR Code + No PIN for logged-in drivers)

import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Vehicle, VehicleType } from '../types';
import api from '../services/firebaseApi';
import { shiftStore } from '../store/shift';
import { getDriverSession } from '../store/session';
import Card from '../components/shared/Card';
import Header from '../components/shared/Header';
import { UserContext } from '../contexts/UserContext';
import { Search, Car, Loader, UserIcon, AlertCircle } from 'lucide-react';
import VehicleQrScanner from '../components/driver/VehicleQrScanner';
import OutstandingVehicleDefects from '../components/driver/OutstandingVehicleDefects';
import ReportDefectForm from '../components/driver/ReportDefectForm';

interface ShiftStartProps {
  onShiftStarted: () => void;
  onBack: () => void;
}

const ShiftStart: React.FC<ShiftStartProps> = ({ onShiftStarted, onBack }) => {
  const { currentUser } = useContext(UserContext);

  const [showDefectForm, setShowDefectForm] = useState(false);
  const [defectsReady, setDefectsReady] = useState(false);

  // State for wizard steps (1 = Vehicle, 2 = Confirm & Start)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // State for selections
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Optional fields
  const [startOdo, setStartOdo] = useState<string>('');
  const [startCharge, setStartCharge] = useState<string>('');
  const [startPredictedRange, setStartPredictedRange] = useState<string>('');

  // Data loading
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  // Search filters
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Load vehicles
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const session = getDriverSession();
        if (!currentUser || !session) {
          setError('Your session has expired. Please log in again.');
          setLoading(false);
          return;
        }

        const vehiclesData = await api.listVehiclesForSession(currentUser.id, session.sessionToken);

        // Filter only active vehicles not currently in use
        const availableVehicles = vehiclesData.filter(
          (v) => v.status === 'Active' && !v.activeAssignmentId && !v.activeShiftId && !v.activeChargingSessionId
        );
        setVehicles(availableVehicles);
      } catch (err: any) {
        console.error('Failed to load data:', err);
        setError(err.message || 'Failed to load vehicles. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentUser]);

  // Filtered vehicles based on search
  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles;

    const search = vehicleSearch.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.registration.toLowerCase().includes(search) ||
        v.alias?.toLowerCase().includes(search) ||
        v.make.toLowerCase().includes(search) ||
        v.model.toLowerCase().includes(search)
    );
  }, [vehicles, vehicleSearch]);

  const handleVehicleSelect = async (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setStartOdo(vehicle.currentOdometer != null ? String(vehicle.currentOdometer) : '');
    setCurrentStep(2);
    setError(null);
    setValidationMsg(null);

    setDefectsReady(false);
  };

  const handleStartShift = async () => {
    if (!selectedVehicle || !currentUser || submitting || !defectsReady) return;

    // Validation
    if (selectedVehicle.vehicleType === VehicleType.EV && (!startOdo || !startCharge || !startPredictedRange)) {
      setError("Please enter the odometer, State of Charge, and predicted range");
      return;
    }
    if (!startOdo) {
      setError("Please enter starting odometer");
      return;
    }

    const startOdometer = parseFloat(startOdo);
    if (isNaN(startOdometer) || startOdometer < 0) {
      setError("Please enter a valid starting odometer");
      return;
    }
    if (selectedVehicle.currentOdometer != null && startOdometer < selectedVehicle.currentOdometer) {
      setError(`Reading cannot be lower than the last recorded odometer (${selectedVehicle.currentOdometer.toLocaleString()} km).`);
      return;
    }

    let startPredictedRangeKm: number | undefined;
    if (selectedVehicle.vehicleType === VehicleType.EV) {
      const range = Number(startPredictedRange);
      if (!Number.isFinite(range) || range < 0 || range > 2000) {
        setError('Please enter a valid predicted range between 0 and 2000 km.');
        return;
      }
      startPredictedRangeKm = range;
    }

    setSubmitting(true);
    setError(null);

    try {
      const session = getDriverSession();
      if (!session) {
        setError("Your session has expired. Please log in again.");
        setSubmitting(false);
        return;
      }
      const startOdometer = parseFloat(startOdo);
      const startChargePercent = startCharge ? parseFloat(startCharge) : undefined;

      // Start shift via the session-authenticated Cloud Function (no PIN re-entry).
      const result = await api.startShiftWithSession({
        driverId: currentUser.id,
        sessionToken: session.sessionToken,
        vehicleId: selectedVehicle.id,
        startOdometer,
        startChargePercent,
        deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
      });

      const shiftId = result.id;
      const startAtIso = result.startTime ? new Date(result.startTime).toISOString() : new Date().toISOString();
      const vehicle = {
        id: selectedVehicle.id,
        registration: selectedVehicle.registration,
        alias: selectedVehicle.alias,
        vehicleType: selectedVehicle.vehicleType,
      };

      try {
        // Create the first VehicleAssignment bridge on the SAME shift + vehicle (WP7C).
        const { assignmentId } = await api.startVehicleAssignment({
          driverId: currentUser.id,
          sessionToken: session.sessionToken,
          shiftId,
          vehicleId: selectedVehicle.id,
          startOdometer,
          startChargePercent,
          startPredictedRangeKm,
          transitionReason: 'SHIFT_START',
          deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
        });

        shiftStore.setActiveShift({
          shiftId,
          driverId: currentUser.id,
          driverName: `${currentUser.firstName} ${currentUser.surname}`,
          startAt: startAtIso,
          startOdo: startOdometer,
          startChargePercent: startChargePercent,
          assignmentId,
          assignmentStartOdo: startOdometer,
          assignmentStartChargePercent: startChargePercent,
          assignmentStartPredictedRangeKm: startPredictedRangeKm,
          vehicleId: selectedVehicle.id,
          vehicle,
        });
      } catch (assignmentErr: any) {
        // Shift created but the first assignment failed — DO NOT create another shift.
        // Keep the shift active with the chosen vehicle as a "continue with" suggestion and
        // route to Active Shift, which surfaces an explicit retry (recovery state).
        console.error('First vehicle assignment failed after shift start:', assignmentErr);
        shiftStore.setActiveShift({
          shiftId,
          driverId: currentUser.id,
          driverName: `${currentUser.firstName} ${currentUser.surname}`,
          startAt: startAtIso,
          startOdo: startOdometer,
          startChargePercent: startChargePercent,
          vehicleId: selectedVehicle.id,
          vehicle,
        });
      }

      onShiftStarted();
    } catch (err: any) {
      console.error('Failed to start shift:', err);
      setError(err.message || "Failed to start shift");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentStep === 2) {
      setCurrentStep(1);
      setStartOdo('');
      setStartCharge('');
      setStartPredictedRange('');
    } else {
      onBack();
    }
  };

  if (!currentUser) return <div className="p-6 text-center">Please log in first.</div>;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader className="animate-spin h-12 w-12 text-blue-500" />
      </div>
    );
  }

  if (showDefectForm && selectedVehicle) return (
    <ReportDefectForm currentVehicle={selectedVehicle} pickup
      onBack={() => { setShowDefectForm(false); setDefectsReady(false); }} />
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Start Shift" />
      <main className="max-w-xl mx-auto p-4 sm:p-6">

        {/* Step 1: Select Vehicle */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <VehicleQrScanner vehicles={vehicles} onSelected={handleVehicleSelect} disabled={submitting} />

            {/* Manual Selection */}
            {(
              <Card>
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <Car className="mr-2" /> Manual Selection
                </h3>

                {/* Search */}
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    aria-label="Search available vehicles" placeholder="Search vehicle..."
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {filteredVehicles.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">No vehicles found.</p>
                  ) : (
                    filteredVehicles.map(v => (
                      <button
                        key={v.id}
                        onClick={() => handleVehicleSelect(v)}
                        className="w-full text-left p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 transition flex justify-between items-center"
                      >
                        <div>
                          <p className="font-bold text-gray-900">{v.registration}</p>
                          <p className="text-xs text-gray-500">{v.make} {v.model}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${v.vehicleType === 'EV' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {v.vehicleType}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            )}

            <button onClick={onBack} className="w-full py-3 text-gray-600 font-semibold">
              Back to Dashboard
            </button>
          </div>
        )}

        {/* Step 2: Confirm & Start */}
        {currentStep === 2 && selectedVehicle && (
          <Card>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Start Shift</h2>

            <div className="bg-blue-50 p-4 rounded-lg mb-6 space-y-2">
              <div className="flex items-center">
                <UserIcon className="w-5 h-5 text-blue-600 mr-2" />
                <span className="font-semibold text-gray-700">Driver:</span>
                <span className="ml-2 text-gray-900">{currentUser.firstName} {currentUser.surname}</span>
              </div>
              <div className="flex items-center">
                <Car className="w-5 h-5 text-blue-600 mr-2" />
                <span className="font-semibold text-gray-700">Vehicle:</span>
                <span className="ml-2 text-gray-900">{selectedVehicle.registration}</span>
                <span className="ml-2 text-xs text-gray-500">({selectedVehicle.make} {selectedVehicle.model})</span>
              </div>
            </div>

            <OutstandingVehicleDefects key={selectedVehicle.id} driverId={currentUser.id} vehicleId={selectedVehicle.id}
              onReadyChange={setDefectsReady} disabled={submitting} onReport={() => setShowDefectForm(true)} />

            <div className="space-y-4 mb-6">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="pickup-odometer" className="block text-sm font-semibold text-gray-700">
                    Actual Odometer (km) *
                  </label>
                  {selectedVehicle.currentOdometer != null && (
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      Last recorded: {selectedVehicle.currentOdometer.toLocaleString()} km
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  id="pickup-odometer" value={startOdo}
                  onChange={(e) => setStartOdo(e.target.value)}
                  placeholder="e.g. 10500"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                />
                {selectedVehicle.currentOdometer != null && startOdo && !isNaN(parseFloat(startOdo)) && (
                  <>
                    {parseFloat(startOdo) < selectedVehicle.currentOdometer && (
                      <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center">
                        <AlertCircle className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                        Reading cannot be lower than the last recorded odometer ({selectedVehicle.currentOdometer.toLocaleString()} km).
                      </p>
                    )}
                    {parseFloat(startOdo) > selectedVehicle.currentOdometer && (
                      <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 flex items-start">
                        <AlertCircle className="h-4 w-4 mr-1.5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <span>Vehicle is {(parseFloat(startOdo) - selectedVehicle.currentOdometer).toLocaleString()} km above the last recorded odometer. This will be flagged for admin review.</span>
                      </p>
                    )}
                  </>
                )}
              </div>

              {selectedVehicle.vehicleType === 'EV' && (
                <div>
                  <label htmlFor="driver-startCharge" className="block text-sm font-semibold text-gray-700 mb-1">
                    Start State of Charge (%) *
                  </label>
                  <input id="driver-startCharge"
                    type="number"
                    min="0" max="100"
                    value={startCharge}
                    onChange={(e) => setStartCharge(e.target.value)}
                    placeholder="e.g. 85"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                  />
                </div>
              )}
              {selectedVehicle.vehicleType === 'EV' && (
                <div>
                  <label htmlFor="driver-startPredictedRange" className="block text-sm font-semibold text-gray-700 mb-1">
                    Start Predicted Range (km) *
                  </label>
                  <input id="driver-startPredictedRange"
                    type="number"
                    min="0"
                    max="2000"
                    step="1"
                    value={startPredictedRange}
                    onChange={(e) => setStartPredictedRange(e.target.value)}
                    placeholder="e.g. 320"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-lg"
                  />
                </div>
              )}

            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}

            {!defectsReady && <p role="status" className="mb-3 text-sm text-gray-600">Check the outstanding defects before starting.</p>}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleBack}
                disabled={submitting}
                className="py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition"
              >
                Back
              </button>
              <button
                onClick={handleStartShift}
                disabled={submitting || !defectsReady}
                className="py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition flex justify-center items-center disabled:opacity-50"
              >
                {submitting ? <Loader className="animate-spin" /> : "Start Shift"}
              </button>
            </div>
          </Card>
        )}


      </main>
    </div>
  );
};

export default ShiftStart;
