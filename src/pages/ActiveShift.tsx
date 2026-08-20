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
import VehicleInspectionForm, { VehicleInspectionResult } from '../components/driver/VehicleInspectionForm';
import ReportDefectForm from '../components/driver/ReportDefectForm';
import LogChargeForm from '../components/driver/LogChargeForm';
import LogRefuelForm from '../components/driver/LogRefuelForm';
import {
  Clock, Car, User, Gauge, Battery, Loader, AlertCircle,
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
  const [notes] = useState<string>('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shiftDuration, setShiftDuration] = useState<string>('');
  const [showLogCharge, setShowLogCharge] = useState(false);
  const [showLogRefuel, setShowLogRefuel] = useState(false);
  const [showReportFault, setShowReportFault] = useState(false);
  const [reconciling, setReconciling] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<'PICKUP' | 'RETURN' | null>(null);
  const [returnReason, setReturnReason] = useState<'VEHICLE_SWAP' | 'SHIFT_END' | null>(null);
  const [takingVehicle, setTakingVehicle] = useState(false);

  // Resolve shift + active assignment + the required inspection boundary from the server.
  // The server remains authoritative; never invent a "safe to use" state on failure.
  const resolveAll = async () => {
    if (!currentUser) return;
    const state = await resolveActiveShiftState(currentUser);
    if (!state) {
      clearActiveShift();
      setInspecting(null);
      return;
    }
    setActiveShift(state);
    if (state.assignmentId) {
      const session = getDriverSession();
      if (!session) { setInspecting(null); return; }
      const inspections = await api.getAssignmentInspections(session.driverId, session.sessionToken, state.assignmentId);
      const pickupDone = inspections.some(i => i.boundaryType === 'PICKUP' && i.status === 'COMPLETED');
      if (!pickupDone) {
        setInspecting('PICKUP');
      } else if (inspections.some(i => i.boundaryType === 'RETURN' && i.status === 'PENDING')) {
        const ret = inspections.find(i => i.boundaryType === 'RETURN' && i.status === 'PENDING');
        const intent = ret?.returnIntent;
        if (intent === 'VEHICLE_SWAP' || intent === 'SHIFT_END') {
          setReturnReason(intent);
          setInspecting('RETURN');
        } else {
          // Fail closed — never guess the return intent.
          throw new Error('Return inspection intent is missing or invalid. Please contact support.');
        }
      } else {
        setInspecting(null);
      }
    } else {
      setInspecting(null);
    }
  };

  // Reconcile local state with the authoritative server path on mount.
  useEffect(() => {
    let cancelled = false;
    const reconcile = async () => {
      if (!currentUser) { setReconciling(false); return; }
      setReconciling(true);
      setLookupError(null);
      try {
        await resolveAll();
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

  // Retry after a failed lookup.
  const retryAll = async () => {
    setReconciling(true);
    setLookupError(null);
    try {
      await resolveAll();
    } catch (e: any) {
      setLookupError(e?.message || 'Failed to look up active shift');
    } finally {
      setReconciling(false);
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

  // ---- Begin a return (create the PENDING RETURN inspection with the chosen intent) ----
  const startReturn = async (intent: 'VEHICLE_SWAP' | 'SHIFT_END') => {
    if (!activeShift || !activeShift.assignmentId) return;
    const session = getDriverSession();
    if (!session) { setError('Your session has expired. Please log in again.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      // Persist the return intent server-side NOW so refresh/reopen cannot lose it.
      await api.createVehicleInspection(activeShift.driverId, session.sessionToken, activeShift.assignmentId, 'RETURN', intent);
      setReturnReason(intent);
      setInspecting('RETURN');
    } catch (e: any) {
      const code = String(e?.code || '');
      let msg = e?.message || 'Failed to start return inspection';
      if (code.includes('failed-precondition')) { const m = msg.match(/failed-precondition: (.+)/); if (m) msg = m[1]; }
      else if (code.includes('invalid-argument')) { const m = msg.match(/invalid-argument: (.+)/); if (m) msg = m[1]; }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Complete a PICKUP or RETURN inspection (called by VehicleInspectionForm) ----
  const handleInspectionCompleted = async (result: VehicleInspectionResult) => {
    if (!activeShift || !activeShift.assignmentId) return;

    // PICKUP — return to the normal Active Shift screen.
    if (inspecting !== 'RETURN') {
      setInspecting(null);
      setError(null);
      return;
    }

    // Use the server-authoritative return intent from the completed inspection response.
    // Fall back to local state only defensively — never trust stale React state as truth.
    const reason: 'VEHICLE_SWAP' | 'SHIFT_END' | undefined = result.returnIntent || returnReason || undefined;
    if (!reason) {
      setError('Return intent is missing. Please contact support.');
      setSubmitting(false);
      setInspecting(null);
      await resolveAll();
      return;
    }
    const session = getDriverSession();
    if (!session) {
      setError('Your session has expired. Please log in again.');
      return;
    }

    setSubmitting(true);
    setError(null);

    // Step 1 — end the vehicle assignment (RETURN inspection already completed server-side).
    try {
      await api.endVehicleAssignment({
        driverId: activeShift.driverId,
        sessionToken: session.sessionToken,
        assignmentId: activeShift.assignmentId,
        endOdometer: result.endOdometer,
        endChargePercent: result.endChargePercent,
        transitionReason: reason,
        deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
      });
    } catch (err: any) {
      const code = String(err?.code || '');
      let msg = err?.message || 'Failed to return vehicle';
      if (code.includes('failed-precondition')) { const m = msg.match(/failed-precondition: (.+)/); if (m) msg = m[1]; }
      else if (code.includes('not-found')) msg = 'This vehicle assignment was already ended.';
      setError(msg);
      setSubmitting(false);
      setInspecting(null);
      await resolveAll(); // decide actual state authoritatively before further action
      return;
    }

    if (reason === 'SHIFT_END') {
      // Step 2 — end the work shift (vehicle already returned).
      try {
        await api.endShiftWithSession(activeShift.shiftId, {
          driverId: activeShift.driverId,
          sessionToken: session.sessionToken,
          endOdometer: result.endOdometer,
          endChargePercent: result.endChargePercent,
          notes: notes.trim() || undefined,
          deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
        });
        clearActiveShift();
        onShiftEnded();
      } catch (err: any) {
        console.error('End shift after final return failed:', err);
        setError('Vehicle returned, but ending the shift failed. Please retry End Shift.');
        setSubmitting(false);
        setInspecting(null);
        await resolveAll(); // shift stays active with no assignment -> retry End Shift
      }
      return;
    }

    // SWAP — keep the shift active and route to vehicle selection.
    clearVehicleAssignment();
    setInspecting(null);
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
    setInspecting('PICKUP'); // a new assignment always requires a PICKUP inspection
    setError(null);
  };

  // ---- End the work shift (when no vehicle assignment is active) ----
  const handleEndShift = async () => {
    if (!activeShift) { setError('No active shift found'); return; }
    // If called while an assignment is still active, route to return flow first
    if (hasAssignment && currentVehicle) {
      startReturn('SHIFT_END');
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
            <button onClick={retryAll} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold">Retry</button>
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
          <Card className="text-center py-8">
            <h3 className="text-xl font-bold text-gray-800 mb-2">No Active Shift Found</h3>
            <p className="text-gray-600 mb-6">You don't have an active shift in the system right now.</p>
            <button onClick={onBack} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg transition duration-300">
              Return to Dashboard
            </button>
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
        <button onClick={onBack} className="mb-4 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
          ← Back to Dashboard
        </button>

        {lookupError && (
          <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800">
            {lookupError}
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded text-sm text-red-800 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-700 font-bold ml-2">×</button>
          </div>
        )}

        {/* Shift details card */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Current Shift Details</h2>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
              Active Shift
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {inspecting && hasAssignment && currentVehicle ? (
          <VehicleInspectionForm
            boundaryType={inspecting}
            assignmentId={activeShift.assignmentId || ''}
            driverId={activeShift.driverId}
            vehicle={currentVehicle}
            startOdo={activeShift.assignmentStartOdo}
            returnIntent={returnReason ?? undefined}
            onCompleted={handleInspectionCompleted}
            onBack={inspecting === 'RETURN' ? () => { setInspecting(null); setError(null); } : undefined}
          />
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
              {hasAssignment && currentVehicle && (
                <>
                  <button onClick={() => setShowReportFault(true)} className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                    <div className="bg-red-50 p-3 rounded-full mb-2"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
                    <span className="font-medium text-gray-800">Report Fault</span>
                  </button>
                  {currentVehicle.vehicleType === 'EV' ? (
                    <button onClick={() => setShowLogCharge(true)} className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                      <div className="bg-teal-50 p-3 rounded-full mb-2"><Bolt className="h-6 w-6 text-teal-600" /></div>
                      <span className="font-medium text-gray-800">Log Charge</span>
                    </button>
                  ) : (
                    <button onClick={() => setShowLogRefuel(true)} className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95">
                      <div className="bg-orange-50 p-3 rounded-full mb-2"><Fuel className="h-6 w-6 text-orange-600" /></div>
                      <span className="font-medium text-gray-800">Log Refuel</span>
                    </button>
                  )}
                </>
              )}

              {hasAssignment ? (
                <>
                  <button onClick={() => startReturn('VEHICLE_SWAP')} className="flex flex-col items-center justify-center p-4 bg-white border border-blue-200 rounded-xl shadow-sm hover:shadow-md hover:bg-blue-50 transition-all active:scale-95">
                    <div className="bg-blue-50 p-3 rounded-full mb-2"><Car className="h-6 w-6 text-blue-600" /></div>
                    <span className="font-semibold text-blue-700">Return / Change Vehicle</span>
                  </button>
                  <button onClick={() => startReturn('SHIFT_END')} className="flex flex-col items-center justify-center p-4 bg-white border border-red-200 rounded-xl shadow-sm hover:shadow-md hover:bg-red-50 transition-all active:scale-95 col-span-2">
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
                  <button onClick={handleEndShift} disabled={submitting} className="flex flex-col items-center justify-center p-4 bg-white border border-red-200 rounded-xl shadow-sm hover:shadow-md hover:bg-red-50 transition-all active:scale-95 col-span-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <div className="bg-red-100 p-3 rounded-full mb-2"><Flag className="h-6 w-6 text-red-600" /></div>
                    <span className="font-bold text-red-700">{submitting ? 'Ending Shift...' : 'End Shift'}</span>
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Overlay modals */}
        {showReportFault && hasAssignment && currentVehicle && (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto"><ReportDefectForm onBack={() => setShowReportFault(false)} currentVehicle={currentVehicle} /></div>
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
