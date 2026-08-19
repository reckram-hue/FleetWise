// src/components/driver/VehicleInspectionForm.tsx — PICKUP/RETURN inspection capture (WP7D2).
// Photos are captured, compressed client-side, uploaded via the server-mediated callable,
// and persisted as Cloud Storage object paths (never public URLs).
import React, { useState, useEffect } from 'react';
import api from '../../services/firebaseApi';
import { VehicleReturnIntent, VehicleInspectionPhotoRole } from '../../types';
import { getDriverSession } from '../../store/session';
import Card from '../shared/Card';
import { Camera, CheckCircle, AlertCircle, Loader, Car, RefreshCw } from 'lucide-react';

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

type PhotoStatus = 'empty' | 'ready' | 'uploading' | 'uploaded' | 'failed';

interface PhotoSlot {
  status: PhotoStatus;
  preview: string | null;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read the image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or unreadable image format.'));
    img.src = src;
  });
}

// Compress + normalize to JPEG. Strips EXIF via Canvas re-encode (privacy) and applies
// the browser's EXIF orientation automatically on decode.
async function compressImage(file: File): Promise<string> {
  if (file.type === 'image/heic' || file.type === 'image/heif') {
    throw new Error('HEIC/HEIF images are not supported on this device. Please take a JPEG photo.');
  }
  const raw = await readFileAsDataURL(file);
  const img = await loadImage(raw);
  const maxEdge = 1600;
  const w0 = img.naturalWidth || 1;
  const h0 = img.naturalHeight || 1;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to process the image.');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.8);
}

const VehicleInspectionForm: React.FC<VehicleInspectionFormProps> = ({
  boundaryType, assignmentId, driverId, vehicle, startOdo, returnIntent, onCompleted, onBack,
}) => {
  const [exterior, setExterior] = useState<PhotoSlot>({ status: 'empty', preview: null });
  const [interior, setInterior] = useState<PhotoSlot>({ status: 'empty', preview: null });
  const [hasDamage, setHasDamage] = useState(false);
  const [damageDescription, setDamageDescription] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [endCharge, setEndCharge] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReturn = boundaryType === 'RETURN';
  const isEV = vehicle.vehicleType === 'EV';

  // Restore already-uploaded photo state on resume (partial upload recovery).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const session = getDriverSession();
      if (!session) return;
      try {
        const inspections = await api.getAssignmentInspections(driverId, session.sessionToken, assignmentId);
        const insp = inspections.find(i => i.boundaryType === boundaryType);
        if (cancelled) return;
        if (insp && insp.exteriorPhotoPath) setExterior({ status: 'uploaded', preview: null });
        if (insp && insp.interiorPhotoPath) setInterior({ status: 'uploaded', preview: null });
      } catch {
        // Ignore — the form will create/upload on submit.
      }
    };
    load();
    return () => { cancelled = true; };
  }, [driverId, assignmentId, boundaryType]);

  const handleFile = async (role: VehicleInspectionPhotoRole, file: File) => {
    try {
      const dataUrl = await compressImage(file);
      if (role === 'EXTERIOR') setExterior({ status: 'ready', preview: dataUrl });
      else setInterior({ status: 'ready', preview: dataUrl });
      setError(null);
    } catch (e: any) {
      if (role === 'EXTERIOR') setExterior({ status: 'failed', preview: null });
      else setInterior({ status: 'failed', preview: null });
      setError(e?.message || 'Failed to process image.');
    }
  };

  const doUpload = async (role: VehicleInspectionPhotoRole, sessionToken: string): Promise<boolean> => {
    const slot = role === 'EXTERIOR' ? exterior : interior;
    if (!slot.preview) return false;
    const setSlot = role === 'EXTERIOR' ? setExterior : setInterior;
    setSlot({ status: 'uploading', preview: slot.preview });
    try {
      await api.uploadInspectionPhoto(driverId, sessionToken, assignmentId, boundaryType, role, slot.preview);
      setSlot({ status: 'uploaded', preview: null });
      return true;
    } catch (e: any) {
      setSlot({ status: 'failed', preview: slot.preview });
      const code = String(e?.code || '');
      let msg = e?.message || 'Upload failed.';
      if (code.includes('invalid-argument')) { const m = msg.match(/invalid-argument: (.+)/); if (m) msg = m[1]; }
      setError(`${role === 'EXTERIOR' ? 'Exterior' : 'Interior'} photo: ${msg}`);
      return false;
    }
  };

  const handleSubmit = async () => {
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

      // Idempotent create (deterministic doc ID).
      const created = await api.createVehicleInspection(driverId, session.sessionToken, assignmentId, boundaryType, returnIntent);

      // Upload any photo not already stored (resume keeps previously uploaded photos).
      if (exterior.status !== 'uploaded') {
        if (exterior.status !== 'ready' || !exterior.preview) { setError('Please capture the exterior photo.'); setSubmitting(false); return; }
        const ok = await doUpload('EXTERIOR', session.sessionToken);
        if (!ok) { setSubmitting(false); return; }
      }
      if (interior.status !== 'uploaded') {
        if (interior.status !== 'ready' || !interior.preview) { setError('Please capture the interior/dashboard photo.'); setSubmitting(false); return; }
        const ok = await doUpload('INTERIOR', session.sessionToken);
        if (!ok) { setSubmitting(false); return; }
      }

      // Complete (server verifies both Storage objects exist).
      const completed = await api.completeVehicleInspection({
        driverId,
        sessionToken: session.sessionToken,
        inspectionId: created.id,
        hasDamage,
        damageDescription: hasDamage ? damageDescription.trim() : undefined,
      });
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

  const PhotoField = ({ label, slot, role }: { label: string; slot: PhotoSlot; role: VehicleInspectionPhotoRole }) => (
    <div className='border border-gray-200 rounded-lg p-4'>
      <label className='block text-sm font-semibold text-gray-700 mb-2'>{label} <span className='text-red-500'>*</span></label>
      {slot.preview ? (
        <div className='relative'>
          <img src={slot.preview} alt={label} className='w-full h-40 object-cover rounded-lg' />
          <span className={`absolute top-2 right-2 text-white text-xs px-2 py-1 rounded-full flex items-center ${slot.status === 'ready' ? 'bg-blue-600' : slot.status === 'uploading' ? 'bg-yellow-600' : 'bg-red-600'}`}>
            {slot.status === 'ready' ? 'Ready' : slot.status === 'uploading' ? 'Uploading...' : 'Failed — retake'}
          </span>
        </div>
      ) : slot.status === 'uploaded' ? (
        <div className='flex items-center justify-center w-full h-24 border-2 border-green-300 bg-green-50 rounded-lg'>
          <span className='text-green-700 font-semibold flex items-center'><CheckCircle className='h-5 w-5 mr-2' /> Uploaded</span>
        </div>
      ) : (
        <label className='flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400'>
          <Camera className='h-8 w-8 text-gray-400 mb-1' />
          <span className='text-sm text-gray-600 font-medium'>Take Photo</span>
          <input type='file' accept='image/*' capture='environment' onChange={e => { const f = e.target.files && e.target.files[0]; if (f) handleFile(role, f); }} className='hidden' />
        </label>
      )}
      <label className='mt-2 inline-flex items-center text-sm text-blue-600 font-medium cursor-pointer'>
        <RefreshCw className='h-4 w-4 mr-1' /> {slot.preview || slot.status === 'uploaded' ? 'Replace' : 'Retake'}
        <input type='file' accept='image/*' capture='environment' onChange={e => { const f = e.target.files && e.target.files[0]; if (f) handleFile(role, f); }} className='hidden' />
      </label>
      <p className='text-xs text-gray-500 mt-1'>Photo is stored as chain-of-custody evidence after upload.</p>
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
        <PhotoField label='Exterior condition photo' slot={exterior} role='EXTERIOR' />
        <PhotoField label='Interior / dashboard photo' slot={interior} role='INTERIOR' />
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