// src/pages/ActiveShift.tsx — Active shift with WP7C vehicle-assignment workflow.
// Distinguishes: active Shift + active VehicleAssignment (assigned vehicle) vs
// active Shift with no assignment (take vehicle / end shift). Server remains authoritative.

import React, { useState, useEffect, useContext } from 'react';
import { useShiftStore } from '../store/shift';
import { UserContext } from '../contexts/UserContext';
import api from '../services/firebaseApi';
import { getDriverSession } from '../store/session';
import { resolveActiveShiftState } from '../lib/resolveActiveShift';
import Card from '../components/shared/Card';
import Header from '../components/shared/Header';
import TakeVehicleForm, { TakeVehicleResult } from '../components/driver/TakeVehicleForm';
import ReportDefectForm from '../components/driver/ReportDefectForm';
import LogChargeForm from '../components/driver/LogChargeForm';
import LogRefuelForm from '../components/driver/LogRefuelForm';
import {
  Clock, Car, User, Gauge, Battery, Loader, CheckCircle, AlertCircle,
  Bolt, Fuel, AlertTriangle, Flag,
} from 'lucide-react';

interface ActiveShiftProps {
  onShiftEnded: () => void;
  onBack: () => void;
}

const ActiveShift: React.FC<ActiveShiftProps> = ({ onShiftEnded, onBack }) => {
  const { currentUser } = useContext(UserContext);
  const { activeShift, clearActiveShift, setActiveShift, setVehicleAssignment, clearVehicleAssignment } = useShiftStore();

  // Form state
  const [endOdo, setEndOdo] = useState<string>('');
  const [endCharge, setEndCharge] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shiftDuration, setShiftDuration] = useState<string>('');
  const [showEndForm, setShowEndForm] = useState(false);
  const [showLogCharge, setShowLogCharge] = useState(false);
  const [showLogRefuel, setShowLogRefuel] = useState(false);
  const [showReportFault, setShowReportFault] = useState(false);
  const [reconciling, setReconciling] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [returning, setReturning] = useState<'VEHICLE_SWAP' | 'SHIFT_END' | null>(null);
  const [takingVehicle, setTakingVehicle] = useState(false);

  // Reconcile local state with the authoritative server path (shift + active assignment).
  useEffect(() => {
    let cancelled = false;
    const reconcile = async () => {
      if (!currentUser) { setReconciling(false); return; }
      setReconciling(true);
      setLookupError(null);
      try {
        const state = await resolveActiveShiftState(currentUser);
        if (cancelled) return;
        if (state) setActiveShift(state);
        else clearActiveShift();
      } catch (e: any) {
        if (!cancelled) setLookupError(e?.message || 'Failed to look up active shift');
      } finally {
        if (!cancelled) setReconciling(false);
      }
    };
    reconcile();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Re-query the authoritative server state after an ambiguous mutation (network errors).
  const refreshFromServer = async () => {
    if (!currentUser) return;
    try {
      const state = await resolveActiveShiftState(currentUser);
      if (state) setActiveShift(state);
      else clearActiveShift();
      setLookupError(null);
    } catch (e: any) {
      setLookupError(e?.message || 'Failed to look up active shift');
    }
  };

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
    const interval = setInterval(updateDuration, 60000);
    return () => clearInterval(interval);
  }, [activeShift]);

  // ---- Return a vehicle (swap) or return-and-end-shift ----
  const handleReturnVehicle = async (transitionReason: 'VEHICLE_SWAP' | 'SHIFT_END') => {
    if (!activeShift || !activeShift.assignmentId) return;

    const endOdometer = parseFloat(endOdo);
    if (!endOdo || isNaN(endOdometer) || endOdometer < 0) {
      setError('Please enter a valid ending odometer reading');
      return;
    }
    const startOdo = activeShift.assignmentStartOdo ?? activeShift.startOdo;
    if (startOdo != null && endOdometer < startOdo) {
      setError(`Ending odometer (${endOdometer} km) must be greater than or equal to starting odometer (${startOdo} km)`);
      return;
    }

    let endChargePercent: number | undefined;
    const isEV = activeShift.vehicle?.vehicleType === 'EV';
    if (isEV) {
      const c = parseFloat(endCharge);
      if (!endCharge || isNaN(c) || c < 0 || c > 100) {
        setError('Please enter a valid end charge % (0-100)');
        return;
      }
      endChargePercent = c;
    }

    setSubmitting(true);
    setError(null);

    const session = getDriverSession();
    if (!session) {
      setError('Your session has expired. Please log in again.');
      setSubmitting(false);
      return;
    }

    // Step 1 — end the vehicle assignment.
    try {
      await api.endVehicleAssignment({
        driverId: activeShift.driverId,
        sessionToken: session.sessionToken,
        assignmentId: activeShift.assignmentId,
        endOdometer,
        endChargePercent,
        transitionReason,
        deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
      });
    } catch (err: any) {
      const code = String(err?.code || '');
      let msg = err?.message || 'Failed to return vehicle';
      if (code.includes('failed-precondition')) { const m = msg.match(/failed-precondition: (.+)/); if (m) msg = m[1]; }
      else if (code.includes('not-found')) msg = 'This vehicle assignment was already ended.';
      setError(msg);
      setSubmitting(false);
      setReturning(null);
      await refreshFromServer(); // decide actual state authoritatively before further action
      return;
    }

    if (transitionReason === 'SHIFT_END') {
      // Step 2 — end the work shift (vehicle already returned).
      try {
        await api.endShiftWithSession(activeShift.shiftId, {
          driverId: activeShift.driverId,
          sessionToken: session.sessionToken,
          endOdometer,
          endChargePercent,
          notes: notes.trim() || undefined,
          deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
        });
        clearActiveShift();
        onShiftEnded();
      } catch (err: any) {
        console.error('End shift after final return failed:', err);
        setError('Vehicle returned, but ending the shift failed. Please retry End Shift.');
        setSubmitting(false);
        setReturning(null);
        await refreshFromServer(); // shift stays active with no assignment -> retry End Shift
      }
      return;
    }

    // SWAP — keep the shift active and route to vehicle selection.
    clearVehicleAssignment();
    setReturning(null);
    setEndOdo('');
    setEndCharge('');
    setSubmitting(false);
    setTakingVehicle(true);
  };

  // ---- Take next vehicle (assignment on the SAME active shift) ----
  const handleAssigned = (result: TakeVehicleResult) => {
    setVehicleAssignment({
      assignmentId: result.assignmentId,
      vehicleId: result.vehicle.id,
      vehicle: result.vehicle,
      startOdo: result.startOdometer,
      startChargePercent: result.startChargePercent,
    });
    setTakingVehicle(false);
    setError(null);
  };

  // ---- End the work shift (only reachable when no assignment is active) ----
  const handleEndShift = async () => {
    if (!activeShift) { setError('No active shift found'); return; }
    const endOdometer = parseFloat(endOdo);
    if (!endOdo || isNaN(endOdometer) || endOdometer < 0) {
      setError('Please enter a valid ending odometer reading');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const session = getDriverSession();
      if (!session) throw new Error('Your session has expired. Please log in again.');
      await api.endShiftWithSession(activeShift.shiftId, {
        driverId: activeShift.driverId,
        sessionToken: session.sessionToken,
        endOdometer,
        notes: notes.trim() || undefined,
        deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
      });
      clearActiveShift();
      onShiftEnded();
    } catch (err: any) {
      console.error('Failed to end shift:', err);
      let msg = err?.message || 'Failed to end shift';
      const code = String(err?.code || '');
      if (code.includes('not-found')) msg = 'Shift not found. It may have already been ended.';
      else if (code.includes('failed-precondition')) { const m = msg.match(/failed-precondition: (.+)/); if (m) msg = m[1]; }
      setError(msg);
      setSubmitting(false);
    }
  };

  // Still querying the authoritative server for the active shift.
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

  // Server lookup failed — surface the error, never present it as "no shift".
  if (lookupError) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header title="Active Shift" />
        <main className="max-w-4xl mx-auto p-6">
          <Card className="text-center py-12">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Could not check your shift</h2>
            <p className="text-red-600 mb-6">{lookupError}</p>
            <button onClick={refreshFromServer} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold">Retry</button>
          </Card>
        </main>
      </div>
    );
  }

  // If no active shift, show message.
  if (!activeShift) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Header title="Active Shift" />
        <main className="max-w-4xl mx-auto p-6">
          <Card className="text-center py-12">
            <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No Active Shift</h2>
            <p className="text-gray-600 mb-6">You don't have an active shift at the moment.</p>
            <button onClick={onBack} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold">Go Back</button>
          </Card>
        </main>
      </div>
    );
  }

  const hasAssignment = !!activeShift.assignmentId;
  const currentVehicle = activeShift.vehicle;
  const displayStartOdo = hasAssignment ? activeShift.assignmentStartOdo : activeShift.startOdo;
  const displayStartCharge = hasAssignment ? activeShift.assignmentStartChargePercent : activeShift.startChargePercent;

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 p-2 rounded-lg"><User className="h-6 w-6 text-blue-600" /></div>
              <div><p className="text-sm text-gray-600">Driver</p><p className="font-semibold text-gray-900">{activeShift.driverName}</p></div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="bg-orange-100 p-2 rounded-lg"><Clock className="h-6 w-6 text-orange-600" /></div>
              <div><p className="text-sm text-gray-600">Started</p><p className="font-semibold text-gray-900">{new Date(activeShift.startAt).toLocaleString()}</p><p className="text-sm text-gray-600">Duration: {shiftDuration}</p></div>
            </div>
          </div>
        </Card>

        {returning ? (
          /* Return Vehicle form */
          <Card>
            <h3 className="text-xl font-bold text-gray-800 mb-4">{returning === 'SHIFT_END' ? 'Return Vehicle & End Shift' : 'Return / Change Vehicle'}</h3>
            {error && <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded"><div className="flex items-center"><AlertCircle className="h-5 w-5 text-red-500 mr-2" /><p className="text-red-700 font-semibold">Error</p></div><p className="text-red-600 text-sm mt-1">{error}</p></div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Odometer (km) <span className="text-red-500">*</span></label>
                <input type="number" value={endOdo} onChange={e => setEndOdo(e.target.value)} placeholder="Enter ending odometer reading" className="w-full px-4 py-2 border border-gray-300 rounded-lg" required />
                {displayStartOdo != null && <p className="text-xs text-gray-500 mt-1">Started at {displayStartOdo.toLocaleString()} km</p>}
              </div>
              {currentVehicle?.vehicleType === 'EV' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Charge (%) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" max="100" value={endCharge} onChange={e => setEndCharge(e.target.value)} placeholder="Enter ending charge percentage" className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
                  {displayStartCharge != null && <p className="text-xs text-gray-500 mt-1">Started at {displayStartCharge}%</p>}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any notes about the vehicle condition, etc." className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none" />
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => { setReturning(null); setError(null); }} disabled={submitting} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold disabled:opacity-50">Cancel</button>
              <button onClick={() => handleReturnVehicle(returning)} disabled={submitting} className="flex items-center px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50">
                {submitting ? (<><Loader className="animate-spin mr-2 h-5 w-5" />Processing...</>) : (returning === 'SHIFT_END' ? 'Return & End Shift' : 'Return Vehicle')}
              </button>
            </div>
          </Card>
        ) : takingVehicle ? (
          <TakeVehicleForm
            shiftId={activeShift.shiftId}
            driverId={activeShift.driverId}
            suggestedVehicle={!hasAssignment ? currentVehicle : null}
            suggestedStartOdo={!hasAssignment ? activeShift.startOdo : undefined}
            suggestedStartChargePercent={!hasAssignment ? activeShift.startChargePercent : undefined}
            onAssigned={handleAssigned}
            onBack={() => setTakingVehicle(false)}
          />
        ) : showEndForm ? (
          /* End Shift form (no assignment active) */
          <Card>
            <h3 className="text-xl font-bold text-gray-800 mb-4">End Shift</h3>
            {error && <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded"><div className="flex items-center"><AlertCircle className="h-5 w-5 text-red-500 mr-2" /><p className="text-red-700 font-semibold">Error</p></div><p className="text-red-600 text-sm mt-1">{error}</p></div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Odometer (km) <span className="text-red-500">*</span></label>
                <input type="number" value={endOdo} onChange={e => setEndOdo(e.target.value)} placeholder="Enter ending odometer reading" className="w-full px-4 py-2 border border-gray-300 rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Any notes about the shift..." className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none" />
              </div>
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => { setShowEndForm(false); setError(null); }} disabled={submitting} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold disabled:opacity-50">Cancel</button>
              <button onClick={handleEndShift} disabled={!endOdo || submitting} className="flex items-center px-8 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? (<><Loader className="animate-spin mr-2 h-5 w-5" />Ending Shift...</>) : (<><CheckCircle className="mr-2 h-5 w-5" />End Shift</>)}
              </button>
            </div>
          </Card>
        ) : (
          <>
            {/* Vehicle status card */}
            <Card className="mb-6">
              {hasAssignment && currentVehicle ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Current Vehicle</h3>
                    <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">Assigned</span>
                  </div>
                  <div className="flex items-start space-x-3 mb-4">
                    <div className="bg-purple-100 p-2 rounded-lg"><Car className="h-6 w-6 text-purple-600" /></div>
                    <div>
                      <p className="font-semibold text-gray-900">{currentVehicle.registration}{currentVehicle.alias && <span className="text-gray-600 ml-1">({currentVehicle.alias})</span>}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${currentVehicle.vehicleType === 'EV' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{currentVehicle.vehicleType}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {displayStartOdo != null && (
                      <div className="flex items-start space-x-2"><Gauge className="h-5 w-5 text-gray-500 mt-0.5" /><div><p className="text-sm text-gray-600">Start Odometer</p><p className="font-semibold text-gray-900">{displayStartOdo.toLocaleString()} km</p></div></div>
                    )}
                    {currentVehicle.vehicleType === 'EV' && displayStartCharge != null && (
                      <div className="flex items-start space-x-2"><Battery className="h-5 w-5 text-green-600 mt-0.5" /><div><p className="text-sm text-gray-600">Start Charge</p><p className="font-semibold text-gray-900">{displayStartCharge}%</p></div></div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Car className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-gray-800 mb-1">No Vehicle Assigned</h3>
                  <p className="text-gray-600">Your shift is still active, but no vehicle is currently assigned.</p>
                  {currentVehicle && (
                    <p className="text-sm text-blue-700 mt-2">Shift started with {currentVehicle.registration}{currentVehicle.alias ? ` (${currentVehicle.alias})` : ''} — you can continue with it or choose another.</p>
                  )}
                </div>
              )}
            </Card>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <button onClick={() => setShowReportFault(true)} className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                <div className="bg-red-50 p-3 rounded-full mb-2"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
                <span className="font-medium text-gray-800">Report Fault</span>
              </button>
              {hasAssignment && currentVehicle && (currentVehicle.vehicleType === 'EV' ? (
                <button onClick={() => setShowLogCharge(true)} className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                  <div className="bg-teal-50 p-3 rounded-full mb-2"><Bolt className="h-6 w-6 text-teal-600" /></div>
                  <span className="font-medium text-gray-800">Log Charge</span>
                </button>
              ) : (
                <button onClick={() => setShowLogRefuel(true)} className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                  <div className="bg-orange-50 p-3 rounded-full mb-2"><Fuel className="h-6 w-6 text-orange-600" /></div>
                  <span className="font-medium text-gray-800">Log Refuel</span>
                </button>
              ))}

              {hasAssignment ? (
                <>
                  <button onClick={() => { setReturning('VEHICLE_SWAP'); setEndOdo(''); setEndCharge(''); setError(null); }} className="flex flex-col items-center justify-center p-4 bg-white border border-blue-200 rounded-xl shadow-sm hover:shadow-md hover:bg-blue-50 transition-all active:scale-95">
                    <div className="bg-blue-50 p-3 rounded-full mb-2"><Car className="h-6 w-6 text-blue-600" /></div>
                    <span className="font-semibold text-blue-700">Return / Change Vehicle</span>
                  </button>
                  <button onClick={() => { setReturning('SHIFT_END'); setEndOdo(''); setEndCharge(''); setError(null); }} className="flex flex-col items-center justify-center p-4 bg-white border border-red-200 rounded-xl shadow-sm hover:shadow-md hover:bg-red-50 transition-all active:scale-95 col-span-2">
                    <div className="bg-red-100 p-3 rounded-full mb-2"><Flag className="h-6 w-6 text-red-600" /></div>
                    <span className="font-bold text-red-700">Return Vehicle & End Shift</span>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setTakingVehicle(true); setError(null); }} className="flex flex-col items-center justify-center p-4 bg-white border border-green-200 rounded-xl shadow-sm hover:shadow-md hover:bg-green-50 transition-all active:scale-95">
                    <div className="bg-green-50 p-3 rounded-full mb-2"><Car className="h-6 w-6 text-green-600" /></div>
                    <span className="font-semibold text-green-700">Take Vehicle</span>
                  </button>
                  <button onClick={() => { setShowEndForm(true); setEndOdo(''); setNotes(''); setError(null); }} className="flex flex-col items-center justify-center p-4 bg-white border border-red-200 rounded-xl shadow-sm hover:shadow-md hover:bg-red-50 transition-all active:scale-95 col-span-2">
                    <div className="bg-red-100 p-3 rounded-full mb-2"><Flag className="h-6 w-6 text-red-600" /></div>
                    <span className="font-bold text-red-700">End Shift</span>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Overlay modals */}
        {showReportFault && (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto"><ReportDefectForm onBack={() => setShowReportFault(false)} /></div>
        )}
        {showLogCharge && currentVehicle && (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto"><LogChargeForm onBack={() => setShowLogCharge(false)} activeVehicle={currentVehicle} /></div>
        )}
        {showLogRefuel && currentVehicle && (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto"><LogRefuelForm onBack={() => setShowLogRefuel(false)} activeVehicle={currentVehicle} /></div>
        )}
      </main>
    </div>
  );
};

export default ActiveShift;