// src/components/driver/VehicleInspectionForm.tsx — PICKUP/RETURN inspection capture (WP7D1).
// Photo fields are local previews only (NOT uploaded). Cloud Storage arrives in WP7D2.
import React, { useState } from 'react';
import api from '../../services/firebaseApi';
import { VehicleReturnIntent } from '../../types';
import { getDriverSession } from '../../store/session';
import Card from '../shared/Card';
import { Camera, CheckCircle, AlertCircle, Loader, Car, Gauge, Battery } from 'lucide-react';

export interface VehicleInspectionResult {
  endOdometer?: number;
  endChargePercent?: number;
  returnIntent?: VehicleReturnIntent;
}

interface VehicleInspectionFormProps {
  boundaryType: 'PICKUP' | 'RETURN';
  assignmentId: string;
  driverId: string;
  vehicle: { registration: string; alias?: string; vehicleType: 'ICE' | 'EV' };
  startOdo?: number;
  returnIntent?: VehicleReturnIntent;
  onCompleted: (result: VehicleInspectionResult) => void;
  onBack?: () => void;
}

const VehicleInspectionForm: React.FC<VehicleInspectionFormProps> = ({
  boundaryType, assignmentId, driverId, vehicle, startOdo, returnIntent, onCompleted, onBack,
}) => {
  const [exteriorPreview, setExteriorPreview] = useState<string | null>(null);
  const [interiorPreview, setInteriorPreview] = useState<string | null>(null);
  const [hasDamage, setHasDamage] = useState(false);
  const [damageDescription, setDamageDescription] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [endCharge, setEndCharge] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReturn = boundaryType === 'RETURN';
  const isEV = vehicle.vehicleType === 'EV';

  const readFile = (setter: (v: string | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    // Photo capture markers (local preview only — no upload in WP7D1).
    if (!exteriorPreview) { setError('Please capture the exterior condition photo.'); return; }
    if (!interiorPreview) { setError('Please capture the interior/dashboard photo.'); return; }
    if (hasDamage && !damageDescription.trim()) { setError('Please describe the damage.'); return; }

    let endOdometer: number | undefined;
    let endChargePercent: number | undefined;
    if (isReturn) {
      const odo = parseFloat(endOdo);
      if (!endOdo || isNaN(odo) || odo < 0) { setError('Please enter a valid ending odometer reading.'); return; }
      if (startOdo != null && odo < startOdo) { setError(`Ending odometer (${odo} km) must be greater than or equal to starting odometer (${startOdo} km).`); return; }
      endOdometer = odo;
      if (isEV) {
        const c = parseFloat(endCharge);
        if (!endCharge || isNaN(c) || c < 0 || c > 100) { setError('Please enter a valid end charge % (0-100).'); return; }
        endChargePercent = c;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const session = getDriverSession();
      if (!session) throw new Error('Your session has expired. Please log in again.');
      // Idempotent create (deterministic doc ID) then complete.
      const created = await api.createVehicleInspection(driverId, session.sessionToken, assignmentId, boundaryType, returnIntent);
      const completed = await api.completeVehicleInspection({
        driverId,
        sessionToken: session.sessionToken,
        inspectionId: created.id,
        hasDamage,
        damageDescription: hasDamage ? damageDescription.trim() : undefined,
        exteriorPhotoCaptured: true,
        interiorPhotoCaptured: true,
      });
      // Use the server-authoritative return intent (never stale local state).
      onCompleted({ endOdometer, endChargePercent, returnIntent: completed.returnIntent ?? undefined });
    } catch (e: any) {
      const code = String(e?.code || '');
      let msg = e?.message || 'Failed to complete inspection.';
      if (code.includes('failed-precondition')) { const m = msg.match(/failed-precondition: (.+)/); if (m) msg = m[1]; }
      else if (code.includes('invalid-argument')) { const m = msg.match(/invalid-argument: (.+)/); if (m) msg = m[1]; }
      setError(msg);
      setSubmitting(false);
    }
  };

  const PhotoField = ({ label, preview, onFile }: { label: string; preview: string | null; onFile: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div className='border border-gray-200 rounded-lg p-4'>
      <label className='block text-sm font-semibold text-gray-700 mb-2'>{label} <span className='text-red-500'>*</span></label>
      {preview ? (
        <div className='relative'>
          <img src={preview} alt={label} className='w-full h-40 object-cover rounded-lg' />
          <span className='absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-1 rounded-full flex items-center'><CheckCircle className='h-3 w-3 mr-1' /> Captured</span>
        </div>
      ) : (
        <label className='flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400'>
          <Camera className='h-8 w-8 text-gray-400 mb-1' />
          <span className='text-sm text-gray-600 font-medium'>Take Photo</span>
          <input type='file' accept='image/*' capture='environment' onChange={onFile} className='hidden' />
        </label>
      )}
      <p className='text-xs text-gray-500 mt-2'>Local preview only — cloud upload arrives in a later update.</p>
    </div>
  );

  return (
    <Card>
      <h3 className='text-xl font-bold text-gray-800 mb-1'>Vehicle Inspection</h3>
      <p className='text-sm text-gray-500 mb-4'>{isReturn ? 'Return' : 'Pickup'} inspection</p>

      <div className='flex items-center space-x-2 bg-gray-50 p-3 rounded-lg mb-4'>
        <Car className='h-5 w-5 text-gray-500' />
        <span className='font-semibold text-gray-800'>{vehicle.registration}</span>
        {vehicle.alias && <span className='text-gray-500'>({vehicle.alias})</span>}
        <span className={isEV ? 'text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full' : 'text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full'}>{vehicle.vehicleType}</span>
      </div>

      {error && <div className='mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium flex items-center'><AlertCircle className='h-4 w-4 mr-2' />{error}</div>}

      {isReturn && (
        <div className='space-y-4 mb-4'>
          <div>
            <label className='block text-sm font-semibold text-gray-700 mb-1'>End Odometer (km) <span className='text-red-500'>*</span></label>
            <input type='number' value={endOdo} onChange={e => setEndOdo(e.target.value)} placeholder='e.g. 10600' className='w-full px-4 py-3 border border-gray-300 rounded-lg text-lg' />
          </div>
          {isEV && (
            <div>
              <label className='block text-sm font-semibold text-gray-700 mb-1'>End Charge (%) <span className='text-red-500'>*</span></label>
              <input type='number' min='0' max='100' value={endCharge} onChange={e => setEndCharge(e.target.value)} placeholder='e.g. 75' className='w-full px-4 py-3 border border-gray-300 rounded-lg text-lg' />
            </div>
          )}
        </div>
      )}

      <div className='space-y-4'>
        <PhotoField label='Exterior condition photo' preview={exteriorPreview} onFile={readFile(setExteriorPreview)} />
        <PhotoField label='Interior / dashboard photo' preview={interiorPreview} onFile={readFile(setInteriorPreview)} />
      </div>

      <div className='mt-4'>
        <label className='block text-sm font-semibold text-gray-700 mb-2'>Any new damage? <span className='text-red-500'>*</span></label>
        <div className='flex gap-3'>
          <button onClick={() => setHasDamage(false)} className={`flex-1 py-3 rounded-lg font-bold border-2 ${!hasDamage ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-500'}`}>No</button>
          <button onClick={() => setHasDamage(true)} className={`flex-1 py-3 rounded-lg font-bold border-2 ${hasDamage ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 text-gray-500'}`}>Yes</button>
        </div>
        {hasDamage && (
          <textarea value={damageDescription} onChange={e => setDamageDescription(e.target.value)} rows={3} placeholder='Describe the damage...' className='w-full px-4 py-3 border border-gray-300 rounded-lg mt-3' />
        )}
      </div>

      <div className='mt-6 space-y-3'>
        <button onClick={handleSubmit} disabled={submitting} className='w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center'>
          {submitting ? <Loader className='animate-spin h-6 w-6' /> : (isReturn ? 'Complete Return Inspection' : 'Complete Pickup Inspection')}
        </button>
        {onBack && (
          <button onClick={onBack} disabled={submitting} className='w-full py-3 text-gray-600 font-semibold disabled:opacity-50'>Cancel</button>
        )}
      </div>
    </Card>
  );
};

export default VehicleInspectionForm;