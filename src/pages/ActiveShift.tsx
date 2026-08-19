// src/pages/ActiveShift.tsx — FULL DROP-IN component for managing and ending active shifts

import React, { useState, useEffect, useContext } from 'react';
import { useShiftStore } from '../store/shift';
import { UserContext } from '../contexts/UserContext';
import api from '../services/firebaseApi';
import { getDriverSession } from '../store/session';
import Card from '../components/shared/Card';
import Header from '../components/shared/Header';
import {
  Clock,
  Car,
  User,
  Gauge,
  Battery,
  FileText,
  Loader,
  CheckCircle,
  AlertCircle,
  Bolt,
  Fuel,
  AlertTriangle,
  Flag
} from 'lucide-react';
import ReportDefectForm from '../components/driver/ReportDefectForm';
import LogChargeForm from '../components/driver/LogChargeForm';
import LogRefuelForm from '../components/driver/LogRefuelForm';

interface ActiveShiftProps {
  onShiftEnded: () => void;
  onBack: () => void;
}

const ActiveShift: React.FC<ActiveShiftProps> = ({ onShiftEnded, onBack }) => {
  const { currentUser } = useContext(UserContext);
  const { activeShift, clearActiveShift, setActiveShift } = useShiftStore();

  // Form state
  const [endOdo, setEndOdo] = useState<string>('');
  const [endCharge, setEndCharge] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shiftDuration, setShiftDuration] = useState<string>('');

  // Modal visibility (declared up front to keep React hook order stable)
  const [showEndForm, setShowEndForm] = useState(false);
  const [showLogCharge, setShowLogCharge] = useState(false);
  const [showLogRefuel, setShowLogRefuel] = useState(false);
  const [showReportFault, setShowReportFault] = useState(false);

  // Server reconciliation state
  const [reconciling, setReconciling] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Reconcile local shift state with the authoritative server path (getActiveShift callable)
  useEffect(() => {
    let cancelled = false;
    const reconcile = async () => {
      if (!currentUser) {
        setReconciling(false);
        return;
      }
      setReconciling(true);
      setLookupError(null);
      try {
        const session = getDriverSession();
        if (!session) {
          throw new Error('Your session has expired. Please log in again.');
        }
        const shift = await api.getActiveShiftWithSession(currentUser.id, session.sessionToken);
        if (cancelled) return;
        if (shift) {
          let vehicle = null;
          try {
            vehicle = await api.getVehicle(shift.vehicleId);
          } catch {
            vehicle = null;
          }
          if (cancelled) return;
          const startDate = new Date(shift.startTime as any);
          if (isNaN(startDate.getTime())) {
            throw new Error('Active shift has an unreadable startTime from the server');
          }
          setActiveShift({
            shiftId: shift.id,
            driverId: currentUser.id,
            driverName: `${currentUser.firstName} ${currentUser.surname}`,
            vehicleId: shift.vehicleId,
            vehicle: {
              id: shift.vehicleId,
              registration: vehicle?.registration || 'Unknown',
              alias: vehicle?.alias,
              vehicleType: vehicle?.vehicleType || 'ICE',
            },
            startAt: startDate.toISOString(),
            startOdo: shift.startOdometer,
            startChargePercent: shift.startChargePercent,
          });
        } else {
          clearActiveShift();
        }
      } catch (e: any) {
        if (!cancelled) setLookupError(e?.message || 'Failed to look up active shift');
      } finally {
        if (!cancelled) setReconciling(false);
      }
    };
    reconcile();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Calculate shift duration
  useEffect(() => {
    if (!activeShift) return;

    const updateDuration = () => {
      const startTime = new Date(activeShift.startAt);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      setShiftDuration(`${hours}h ${minutes}m`);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [activeShift]);

  // Handle end shift submission
  const handleEndShift = async () => {
    if (!activeShift) {
      setError('No active shift found');
      return;
    }

    // Validate end odometer
    const endOdometer = parseFloat(endOdo);
    if (!endOdo || isNaN(endOdometer) || endOdometer < 0) {
      setError('Please enter a valid ending odometer reading');
      return;
    }

    // Validate end odometer is greater than start (if start was provided)
    if (activeShift.startOdo && endOdometer < activeShift.startOdo) {
      setError(
        `Ending odometer (${endOdometer} km) must be greater than or equal to starting odometer (${activeShift.startOdo} km)`
      );
      return;
    }

    // Validate end charge for EVs
    const endChargePercent = endCharge.trim() ? parseFloat(endCharge) : undefined;
    if (
      activeShift.vehicle.vehicleType === 'EV' &&
      endChargePercent !== undefined &&
      (isNaN(endChargePercent) || endChargePercent < 0 || endChargePercent > 100)
    ) {
      setError('End charge must be between 0 and 100%');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const session = getDriverSession();
      if (!session) {
        throw new Error('Your session has expired. Please log in again.');
      }
      // Call the session-authenticated Cloud Function to end the shift.
      await api.endShiftWithSession(
        activeShift.shiftId,
        {
          driverId: activeShift.driverId,
          sessionToken: session.sessionToken,
          endOdometer: endOdometer,
          endChargePercent: endChargePercent,
          notes: notes.trim() || undefined,
          deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
        }
      );

      // Clear local shift state
      clearActiveShift();

      // Navigate back
      onShiftEnded();
    } catch (err: any) {
      console.error('Failed to end shift:', err);

      // Display user-friendly error message
      let errorMessage = err.message || 'Failed to end shift';

      // Clean up Firebase error codes
      if (errorMessage.includes('not-found')) {
        errorMessage = 'Shift not found. It may have already been ended.';
      } else if (errorMessage.includes('failed-precondition')) {
        const match = errorMessage.match(/failed-precondition: (.+)/);
        if (match) {
          errorMessage = match[1];
        }
      }

      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Still querying the authoritative server for the active shift
  if (reconciling) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header title="Active Shift" />
        <main className="max-w-4xl mx-auto p-6">
          <Card className="text-center py-12">
            <Loader className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <p className="text-gray-600">Looking up your active shift...</p>
          </Card>
        </main>
      </div>
    );
  }

  // Server lookup failed — surface the error, never present it as "no shift"
  if (lookupError) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header title="Active Shift" />
        <main className="max-w-4xl mx-auto p-6">
          <Card className="text-center py-12">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Could not check your shift</h2>
            <p className="text-red-600 mb-6">{lookupError}</p>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold"
            >
              Go Back
            </button>
          </Card>
        </main>
      </div>
    );
  }

  // If no active shift, show message
  if (!activeShift) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header title="Active Shift" />
        <main className="max-w-4xl mx-auto p-6">
          <Card className="text-center py-12">
            <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Shift</h2>
            <p className="text-gray-600 mb-6">You don't have an active shift at the moment.</p>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold"
            >
              Go Back
            </button>
          </Card>
        </main>
      </div>
    );
  }

  // Calculate distance driven (if both start and current end are available)
  const distanceDriven =
    activeShift.startOdo && endOdo
      ? (parseFloat(endOdo) - activeShift.startOdo).toFixed(1)
      : null;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="Active Shift" />

      <main className="max-w-4xl mx-auto p-6">
        {/* Shift Summary Card */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Current Shift Details</h2>
            <div className="flex items-center text-green-600">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse mr-2"></div>
              <span className="font-semibold">Active</span>
            </div>
          </div>

          {/* Shift info grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Driver */}
            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Driver</p>
                <p className="font-semibold text-gray-900">{activeShift.driverName}</p>
              </div>
            </div>

            {/* Vehicle */}
            <div className="flex items-start space-x-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Car className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Vehicle</p>
                <p className="font-semibold text-gray-900">
                  {activeShift.vehicle.registration}
                  {activeShift.vehicle.alias && (
                    <span className="text-gray-600 ml-1">({activeShift.vehicle.alias})</span>
                  )}
                </p>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${activeShift.vehicle.vehicleType === 'EV'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-blue-100 text-blue-800'
                    }`}
                >
                  {activeShift.vehicle.vehicleType}
                </span>
              </div>
            </div>

            {/* Start Time */}
            <div className="flex items-start space-x-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Started</p>
                <p className="font-semibold text-gray-900">
                  {new Date(activeShift.startAt).toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">Duration: {shiftDuration}</p>
              </div>
            </div>

            {/* Start Odometer */}
            {activeShift.startOdo && (
              <div className="flex items-start space-x-3">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <Gauge className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Start Odometer</p>
                  <p className="font-semibold text-gray-900">
                    {activeShift.startOdo.toLocaleString()} km
                  </p>
                </div>
              </div>
            )}

            {/* Start Charge (EVs only) */}
            {activeShift.vehicle.vehicleType === 'EV' && activeShift.startChargePercent && (
              <div className="flex items-start space-x-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <Battery className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Start Charge</p>
                  <p className="font-semibold text-gray-900">{activeShift.startChargePercent}%</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {!showEndForm && !showLogCharge && !showLogRefuel && !showReportFault ? (
          <div className="grid grid-cols-2 gap-4 mt-6">
            <button
              onClick={() => setShowReportFault(true)}
              className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
            >
              <div className="bg-red-50 p-3 rounded-full mb-2">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <span className="font-medium text-gray-800">Report Fault</span>
            </button>

            {activeShift.vehicle.vehicleType === 'EV' ? (
              <button
                onClick={() => setShowLogCharge(true)}
                className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
              >
                <div className="bg-teal-50 p-3 rounded-full mb-2">
                  <Bolt className="h-6 w-6 text-teal-600" />
                </div>
                <span className="font-medium text-gray-800">Log Charge</span>
              </button>
            ) : (
              <button
                onClick={() => setShowLogRefuel(true)}
                className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
              >
                <div className="bg-orange-50 p-3 rounded-full mb-2">
                  <Fuel className="h-6 w-6 text-orange-600" />
                </div>
                <span className="font-medium text-gray-800">Log Refuel</span>
              </button>
            )}

            <button
              onClick={() => setShowEndForm(true)}
              className="flex flex-col items-center justify-center p-4 bg-white border border-red-200 rounded-xl shadow-sm hover:shadow-md hover:bg-red-50 transition-all active:scale-95 col-span-2"
            >
              <div className="bg-red-100 p-3 rounded-full mb-2">
                <Flag className="h-6 w-6 text-red-600" />
              </div>
              <span className="font-bold text-red-700">End Shift</span>
            </button>
          </div>
        ) : (
          <>
            {/* Forms */}
            {showReportFault && (
              <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
                <ReportDefectForm onBack={() => setShowReportFault(false)} />
              </div>
            )}

            {showLogCharge && activeShift.vehicle && (
              <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
                <LogChargeForm
                  onBack={() => setShowLogCharge(false)}
                  activeVehicle={activeShift.vehicle}
                />
              </div>
            )}

            {showLogRefuel && activeShift.vehicle && (
              <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
                <LogRefuelForm
                  onBack={() => setShowLogRefuel(false)}
                  activeVehicle={activeShift.vehicle}
                />
              </div>
            )}
          </>
        )}

        {showEndForm && (
          /* End Shift Form */
          <Card>
            <h3 className="text-xl font-bold text-gray-800 mb-4">End Shift</h3>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  <p className="text-red-700 font-semibold">Error</p>
                </div>
                <p className="text-red-600 text-sm mt-1">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              {/* End Odometer (Required) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Odometer (km) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={endOdo}
                  onChange={(e) => setEndOdo(e.target.value)}
                  placeholder="Enter ending odometer reading"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                {activeShift.startOdo && (
                  <p className="text-xs text-gray-500 mt-1">
                    Started at {activeShift.startOdo.toLocaleString()} km
                  </p>
                )}
                {distanceDriven && (
                  <p className="text-sm text-green-600 mt-1 font-semibold">
                    Distance: {distanceDriven} km
                  </p>
                )}
              </div>

              {/* End Charge (EVs only) */}
              {activeShift.vehicle.vehicleType === 'EV' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Charge (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={endCharge}
                    onChange={(e) => setEndCharge(e.target.value)}
                    placeholder="Enter ending charge percentage"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {activeShift.startChargePercent && (
                    <p className="text-xs text-gray-500 mt-1">
                      Started at {activeShift.startChargePercent}%
                    </p>
                  )}
                </div>
              )}

              {/* Notes (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes about the shift, vehicle condition, issues, etc."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum 500 characters
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setShowEndForm(false)}
                disabled={submitting}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEndShift}
                disabled={!endOdo || submitting}
                className="flex items-center px-8 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader className="animate-spin mr-2 h-5 w-5" />
                    Ending Shift...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-5 w-5" />
                    End Shift
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Once you end this shift, you won't be able to modify the
                details. Please ensure all information is correct before submitting.
              </p>
            </div>
          </Card>
        )}


      </main>
    </div>
  );
};

export default ActiveShift;
