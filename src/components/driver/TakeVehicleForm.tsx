// src/components/driver/TakeVehicleForm.tsx — select a vehicle + capture start readings,
// then create a VehicleAssignment on an EXISTING active shift (WP7C).
// Frontend filtering is convenience only; the backend remains authoritative for availability.
import React, { useState, useEffect } from 'react';
import { Vehicle } from '../../types';
import api from '../../services/firebaseApi';
import { getDriverSession } from '../../store/session';
import Card from '../shared/Card';
import { Car, Loader, Search, AlertCircle } from 'lucide-react';

export type VehiclePick = { id: string; registration: string; alias?: string; vehicleType: 'ICE' | 'EV'; currentOdometer?: number };

export interface TakeVehicleResult {
  assignmentId: string;
  vehicle: VehiclePick;
  startOdometer?: number;
  startChargePercent?: number;
}

interface TakeVehicleFormProps {
  shiftId: string;
  driverId: string;
  suggestedVehicle?: VehiclePick | null;
  suggestedStartOdo?: number;
  suggestedStartChargePercent?: number;
  onAssigned: (result: TakeVehicleResult) => void;
  onBack: () => void;
}

const toPick = (v: Vehicle): VehiclePick => ({ id: v.id, registration: v.registration, alias: v.alias, vehicleType: v.vehicleType, currentOdometer: v.currentOdometer });

const TakeVehicleForm: React.FC<TakeVehicleFormProps> = ({
  shiftId, driverId, suggestedVehicle, suggestedStartOdo, suggestedStartChargePercent, onAssigned, onBack,
}) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehiclePick | null>(suggestedVehicle || null);
  const [search, setSearch] = useState('');
  const [startOdo, setStartOdo] = useState(suggestedStartOdo != null ? String(suggestedStartOdo) : (suggestedVehicle?.currentOdometer != null ? String(suggestedVehicle.currentOdometer) : ''));
  const [startCharge, setStartCharge] = useState(suggestedStartChargePercent != null ? String(suggestedStartChargePercent) : '');
  const [submitting, setSubmitting] = useState(false);

  const loadAvailable = async () => {
    setLoading(true);
    try {
      const session = getDriverSession();
      if (!session) {
        throw new Error('Your session has expired. Please log in again.');
      }
      const all = await api.listVehiclesForSession(driverId, session.sessionToken);
      setVehicles(all.filter(v => v.status === 'Active' && !v.activeAssignmentId));
    } catch {
      setError('Failed to load vehicles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAvailable(); }, []);

  const filtered = search.trim()
    ? vehicles.filter(v => (v.registration || '').toLowerCase().includes(search.toLowerCase()) || (v.alias || '').toLowerCase().includes(search.toLowerCase()) || (v.make || '').toLowerCase().includes(search.toLowerCase()) || (v.model || '').toLowerCase().includes(search.toLowerCase()))
    : vehicles;

  const handleSubmit = async () => {
    if (!selectedVehicle) return;
    const isEV = selectedVehicle.vehicleType === 'EV';
    const odometer = parseFloat(startOdo);
    if (!startOdo || isNaN(odometer) || odometer < 0) { setError('Please enter a valid starting odometer reading.'); return; }
    if (selectedVehicle.currentOdometer != null && odometer < selectedVehicle.currentOdometer) {
      setError(`Reading cannot be lower than the last recorded odometer (${selectedVehicle.currentOdometer.toLocaleString()} km).`);
      return;
    }
    let charge: number | undefined;
    if (isEV) {
      const c = parseFloat(startCharge);
      if (!startCharge || isNaN(c) || c < 0 || c > 100) { setError('Please enter a valid charge % (0-100).'); return; }
      charge = c;
    }

    setSubmitting(true);
    setError(null);
    try {
      const session = getDriverSession();
      if (!session) throw new Error('Your session has expired. Please log in again.');
      const { assignmentId } = await api.startVehicleAssignment({
        driverId,
        sessionToken: session.sessionToken,
        shiftId,
        vehicleId: selectedVehicle.id,
        startOdometer: odometer,
        startChargePercent: charge,
        transitionReason: 'VEHICLE_SWAP',
        deviceId: localStorage.getItem('fleetwise_device_id') || undefined,
      });
      onAssigned({ assignmentId, vehicle: selectedVehicle, startOdometer: odometer, startChargePercent: charge });
    } catch (e: any) {
      const code = String(e?.code || '');
      let msg = e?.message || 'Failed to take vehicle.';
      if (!code.includes('failed-precondition') && !code.includes('permission-denied') && !code.includes('invalid-argument')) {
        try {
          const session = getDriverSession();
          const existing = session ? await api.getActiveVehicleAssignment(session.driverId, session.sessionToken, shiftId) : null;
          if (existing && existing.vehicleId === selectedVehicle.id) {
            onAssigned({ assignmentId: existing.id, vehicle: selectedVehicle, startOdometer: existing.startOdometer ?? odometer, startChargePercent: existing.startChargePercent ?? charge });
            return;
          }
        } catch { /* fall through to the error path below */ }
      }
      if (code.includes('permission-denied')) msg = 'You are not authorized to use this vehicle.';
      else if (code.includes('failed-precondition')) {
        const m = msg.match(/failed-precondition: (.+)/);
        if (m) msg = m[1];
        else msg = 'This vehicle is no longer available.';
        setSelectedVehicle(null);
        await loadAvailable();
      }
      setError(msg);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className='p-8 text-center'><Loader className='animate-spin h-8 w-8 mx-auto text-blue-500' /></div>;
  }

  return (
    <div className='space-y-4'>
      {error && <div className='p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium'>{error}</div>}

      {selectedVehicle ? (
        <Card>
          <h3 className='text-lg font-bold text-gray-800 mb-4 flex items-center'><Car className='mr-2' /> {selectedVehicle.registration}</h3>
          {suggestedVehicle && selectedVehicle.id === suggestedVehicle.id && (
            <p className='text-sm text-blue-700 bg-blue-50 p-2 rounded mb-4'>Continuing with your shift vehicle.</p>
          )}
          <div className='space-y-4'>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className='block text-sm font-semibold text-gray-700'>Actual Odometer (km) *</label>
                {selectedVehicle.currentOdometer != null && (
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    Last recorded: {selectedVehicle.currentOdometer.toLocaleString()} km
                  </span>
                )}
              </div>
              <input type='number' value={startOdo} onChange={e => setStartOdo(e.target.value)} placeholder='e.g. 10500' className='w-full px-4 py-2 border border-gray-300 rounded-lg' />
              {selectedVehicle.currentOdometer != null && startOdo && !isNaN(parseFloat(startOdo)) && (
                <>
                  {parseFloat(startOdo) < selectedVehicle.currentOdometer && (
                    <p className="mt-1 text-xs text-red-600 font-medium flex items-center">
                      <AlertCircle className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                      Reading cannot be lower than the last recorded odometer ({selectedVehicle.currentOdometer.toLocaleString()} km).
                    </p>
                  )}
                  {parseFloat(startOdo) > selectedVehicle.currentOdometer && (
                    <p className="mt-1 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 flex items-start">
                      <AlertCircle className="h-4 w-4 mr-1.5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>Vehicle is {(parseFloat(startOdo) - selectedVehicle.currentOdometer).toLocaleString()} km above the last recorded odometer. This will be flagged for admin review.</span>
                    </p>
                  )}
                </>
              )}
            </div>
            {selectedVehicle.vehicleType === 'EV' && (
              <div>
                <label className='block text-sm font-semibold text-gray-700 mb-1'>Starting Charge (%) *</label>
                <input type='number' min='0' max='100' value={startCharge} onChange={e => setStartCharge(e.target.value)} placeholder='e.g. 85' className='w-full px-4 py-2 border border-gray-300 rounded-lg' />
              </div>
            )}
          </div>
          <div className='grid grid-cols-2 gap-4 mt-6'>
            <button onClick={() => { setSelectedVehicle(null); setError(null); }} className='py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300'>Back</button>
            <button onClick={handleSubmit} disabled={submitting} className='py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center'>
              {submitting ? <Loader className='animate-spin h-5 w-5' /> : 'Take Vehicle'}
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <h3 className='text-lg font-bold text-gray-800 mb-4'>Choose a Vehicle</h3>
          {suggestedVehicle && (
            <button onClick={() => { setSelectedVehicle(suggestedVehicle); setStartOdo(suggestedStartOdo != null ? String(suggestedStartOdo) : (suggestedVehicle.currentOdometer != null ? String(suggestedVehicle.currentOdometer) : '')); setStartCharge(suggestedStartChargePercent != null ? String(suggestedStartChargePercent) : ''); }} className='w-full mb-3 p-3 bg-blue-50 border border-blue-300 rounded-lg text-left hover:bg-blue-100'>
              <span className='font-semibold text-blue-800'>Continue with {suggestedVehicle.registration}</span>
              {suggestedVehicle.alias && <span className='text-blue-700 ml-2'>({suggestedVehicle.alias})</span>}
              <span className='block text-xs text-blue-600 mt-1'>Your shift started with this vehicle.</span>
            </button>
          )}
          <div className='mb-3 relative'>
            <Search className='absolute left-3 top-3 h-5 w-5 text-gray-400' />
            <input type='text' placeholder='Search vehicle...' value={search} onChange={e => setSearch(e.target.value)} className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg' />
          </div>
          <div className='space-y-2 max-h-72 overflow-y-auto'>
            {filtered.length === 0 ? (
              <p className='text-center text-gray-500 py-4'>No vehicles available.</p>
            ) : filtered.map(v => (
              <button key={v.id} onClick={() => { setSelectedVehicle(toPick(v)); setStartOdo(v.currentOdometer != null ? String(v.currentOdometer) : ''); setStartCharge(''); }} className='w-full text-left p-3 border rounded-lg hover:border-blue-500 hover:bg-blue-50 flex justify-between items-center'>
                <span>
                  <span className='font-bold text-gray-900'>{v.registration}</span>
                  {v.alias && <span className='text-gray-500 ml-2'>({v.alias})</span>}
                </span>
                <span className={v.vehicleType === 'EV' ? 'text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full' : 'text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full'}>{v.vehicleType}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <button onClick={onBack} className='w-full py-3 text-gray-600 font-semibold'>Back to Shift</button>
    </div>
  );
};

export default TakeVehicleForm;
