// src/components/driver/VehicleInspectionForm.tsx — PICKUP/RETURN inspection capture (WP7D2).
// Photos are captured, compressed client-side, uploaded via the server-mediated callable,
// and persisted as Cloud Storage object paths (never public URLs).
import React, { useState, useEffect } from 'react';
import api from '../../services/firebaseApi';
import { ChargingLocationForDriver, VehicleReturnIntent, VehicleInspectionPhotoRole, ReturnFinalizationDraft } from '../../types';
import { getDriverSession } from '../../store/session';
import ChargingLocationPicker from './ChargingLocationPicker';
import { ReturnReadings } from './VehicleReadings';
import ReturnChargingChoice from './ReturnChargingChoice';
import SavedReturnNotice from './SavedReturnNotice';
import Card from '../shared/Card';
import { Camera, CheckCircle, AlertCircle, Loader, Car, RefreshCw } from 'lucide-react';

export interface VehicleInspectionResult {
  endOdometer?: number;
  endChargePercent?: number;
  endPredictedRangeKm?: number;
  leftForCharging?: boolean;
  chargingLocationId?: string;
  publicChargeReference?: string;
  publicChargeCost?: number;
  chargingNotes?: string;
  returnIntent?: VehicleReturnIntent;
}

interface VehicleInspectionFormProps {
  boundaryType: 'PICKUP' | 'RETURN';
  assignmentId: string;
  driverId: string;
  vehicle: { registration: string; alias?: string; vehicleType: 'ICE' | 'EV' };
  startOdo?: number;
  returnIntent?: VehicleReturnIntent;
  onCompleted: (result: VehicleInspectionResult) => void | Promise<void>;
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

const PhotoField = ({ label, slot, role, onFile }: { label: string; slot: PhotoSlot; role: VehicleInspectionPhotoRole; onFile: (role: VehicleInspectionPhotoRole, file: File) => void }) => (
  <div className='border border-gray-200 rounded-lg p-4'>
    <p className='block text-sm font-semibold text-gray-700 mb-2'>{label} <span className='text-red-500'>*</span></p>
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
      <label className='flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500'>
        <Camera className='h-8 w-8 text-gray-400 mb-1' />
        <span className='text-sm text-gray-600 font-medium'>Take Photo</span>
        <input type='file' aria-label={label} accept='image/*' capture='environment' onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onFile(role, f); }} className='sr-only' />
      </label>
    )}
    <label className='mt-2 inline-flex min-h-11 items-center text-sm text-blue-600 font-medium cursor-pointer focus-within:ring-2 focus-within:ring-blue-500'>
      <RefreshCw className='h-4 w-4 mr-1' /> {slot.preview || slot.status === 'uploaded' ? 'Replace' : 'Retake'}
      <input type='file' aria-label={`Replace ${label}`} accept='image/*' capture='environment' onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onFile(role, f); }} className='sr-only' />
    </label>
    <p className='text-xs text-gray-500 mt-1'>Photo is stored as chain-of-custody evidence after upload.</p>
  </div>
);

const VehicleInspectionForm: React.FC<VehicleInspectionFormProps> = ({
  boundaryType, assignmentId, driverId, vehicle, startOdo, returnIntent, onCompleted, onBack,
}) => {
  const [exterior, setExterior] = useState<PhotoSlot>({ status: 'empty', preview: null });
  const [interior, setInterior] = useState<PhotoSlot>({ status: 'empty', preview: null });
  const [hasDamage, setHasDamage] = useState(false);
  const [damageDescription, setDamageDescription] = useState('');
  const [endOdo, setEndOdo] = useState('');
  const [endCharge, setEndCharge] = useState('');
  const [endPredictedRange, setEndPredictedRange] = useState('');
  const [leftForCharging, setLeftForCharging] = useState<boolean | null>(null);
  const [chargingLocation, setChargingLocation] = useState<ChargingLocationForDriver | null>(null);
  const [publicChargeReference, setPublicChargeReference] = useState('');
  const [publicChargeCost, setPublicChargeCost] = useState('');
  const [chargingNotes, setChargingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [evidenceCompleted, setEvidenceCompleted] = useState(false);
  const [savedDraft, setSavedDraft] = useState<ReturnFinalizationDraft | null>(null);

  const isReturn = boundaryType === 'RETURN';
  const isEV = vehicle.vehicleType === 'EV';
  const chargingSession = leftForCharging ? getDriverSession() : null;

  // Restore already-uploaded photo state on resume (partial upload recovery).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const session = getDriverSession();
      setLoading(true);
      setLoadFailed(false);
      try {
        if (!session) throw new Error('Your session has expired. Please log in again.');
        const inspections = await api.getAssignmentInspections(driverId, session.sessionToken, assignmentId);
        const insp = inspections.find(i => i.boundaryType === boundaryType);
        if (cancelled) return;
        if (insp && insp.exteriorPhotoPath) setExterior({ status: 'uploaded', preview: null });
        if (insp && insp.interiorPhotoPath) setInterior({ status: 'uploaded', preview: null });
        setEvidenceCompleted(insp?.status === 'COMPLETED');
        setHasDamage(insp?.hasDamage === true);
        setDamageDescription(insp?.damageDescription || '');
        const draft = insp?.returnFinalization;
        setSavedDraft(draft || null);
        if (draft) {
          setEndOdo(String(draft.endOdometer));
          setEndCharge(draft.endChargePercent == null ? '' : String(draft.endChargePercent));
          setEndPredictedRange(draft.endPredictedRangeKm == null ? '' : String(draft.endPredictedRangeKm));
          setLeftForCharging(draft.leftForCharging ?? null);
          setPublicChargeReference(draft.publicChargeReference || '');
          setPublicChargeCost(draft.publicChargeCost == null ? '' : String(draft.publicChargeCost));
          setChargingNotes(draft.chargingNotes || '');
          if (draft.chargingLocationId && insp?.status !== 'COMPLETED') {
            const locations = await api.listChargingLocationsForSession(driverId, session.sessionToken);
            if (cancelled) return;
            setChargingLocation(locations.find(l => l.id === draft.chargingLocationId) || null);
          }
        }
      } catch {
        if (!cancelled) { setLoadFailed(true); setError('Unable to restore inspection. Retry before continuing.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [driverId, assignmentId, boundaryType, loadVersion]);

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
    if (loading || loadFailed || submitting) return;
    if (isReturn && hasDamage && !damageDescription.trim()) { setError('Please describe the damage.'); return; }

    let endOdometer: number | undefined;
    let endChargePercent: number | undefined;
    let endPredictedRangeKm: number | undefined;
    let parsedPublicChargeCost: number | undefined;
    if (isReturn) {
      const odo = parseFloat(endOdo);
      if (!endOdo || isNaN(odo) || odo < 0) { setError('Please enter a valid ending odometer reading.'); return; }
      if (startOdo != null && odo < startOdo) { setError(`Ending odometer (${odo} km) must be greater than or equal to starting odometer (${startOdo} km).`); return; }
      endOdometer = odo;
      if (isEV) {
        const c = parseFloat(endCharge);
        if (!endCharge || isNaN(c) || c < 0 || c > 100) { setError('Please enter a valid End State of Charge (0-100%).'); return; }
        endChargePercent = c;
        const range = Number(endPredictedRange);
        if (!endPredictedRange || !Number.isFinite(range) || range < 0 || range > 2000) {
          setError('Please enter a valid predicted range between 0 and 2000 km.');
          return;
        }
        endPredictedRangeKm = range;
        if (leftForCharging === null) {
          setError('Please indicate whether the vehicle is being left for charging.');
          return;
        }
        if (leftForCharging) {
          if (!chargingLocation) {
            setError('Please select the charging location.');
            return;
          }
          if (chargingLocation.type === 'PUBLIC_THIRD_PARTY' && publicChargeCost.trim()) {
            const cost = Number(publicChargeCost);
            if (!Number.isFinite(cost) || cost < 0) {
              setError('Please enter a valid public charging cost.');
              return;
            }
            parsedPublicChargeCost = cost;
          }
        }
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const session = getDriverSession();
      if (!session) throw new Error('Your session has expired. Please log in again.');

      const draft: ReturnFinalizationDraft | undefined = isReturn && returnIntent ? {
        endOdometer: endOdometer!, endChargePercent, endPredictedRangeKm,
        leftForCharging: isEV ? leftForCharging === true : undefined,
        chargingLocationId: leftForCharging ? chargingLocation?.id : undefined,
        publicChargeReference: leftForCharging && chargingLocation?.type === 'PUBLIC_THIRD_PARTY' ? publicChargeReference.trim() || undefined : undefined,
        publicChargeCost: parsedPublicChargeCost,
        chargingNotes: leftForCharging ? chargingNotes.trim() || undefined : undefined,
        transitionReason: returnIntent,
      } : undefined;
      // Persist readings before uploads/completion. The server freezes this draft on completion.
      const created = await api.createVehicleInspection(driverId, session.sessionToken, assignmentId, boundaryType, returnIntent, draft);

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
        // PICKUP records photographic custody evidence, not a second defect declaration.
        // The backend retains PICKUP evidence independently of this compatibility value.
        hasDamage: isReturn ? hasDamage : false,
        damageDescription: isReturn && hasDamage ? damageDescription.trim() : undefined,
      });
      const authoritativeDraft = completed.returnFinalization || draft;
      await onCompleted(authoritativeDraft
        ? { ...authoritativeDraft, returnIntent: completed.returnIntent ?? undefined }
        : { returnIntent: completed.returnIntent ?? undefined });
      setSubmitting(false);
    } catch (e: any) {
      const code = String(e?.code || '');
      let msg = e?.message || 'Failed to complete inspection.';
      if (code.includes('failed-precondition')) { const m = msg.match(/failed-precondition: (.+)/); if (m) msg = m[1]; }
      else if (code.includes('invalid-argument')) { const m = msg.match(/invalid-argument: (.+)/); if (m) msg = m[1]; }
      setError(msg);
      setSubmitting(false);
    }
  };

  if (loading) return <Card><p role="status">Restoring inspection...</p></Card>;
  if (loadFailed) return <Card><p role="alert">{error}</p><button onClick={() => setLoadVersion(v => v + 1)}>Retry inspection lookup</button></Card>;
  if (isReturn && evidenceCompleted && savedDraft) return (
    <Card>
      <SavedReturnNotice odometer={savedDraft.endOdometer} busy={submitting} error={error}
        onComplete={async () => {
          if (submitting) return;
          setSubmitting(true); setError(null);
          try { await onCompleted({ ...savedDraft, returnIntent: savedDraft.transitionReason }); }
          catch { setError('Could not complete the vehicle return. Your inspection is saved; please try again.'); }
          finally { setSubmitting(false); }
        }} />
    </Card>
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
          <ReturnReadings isEV={isEV} odometer={endOdo} stateOfCharge={endCharge} predictedRange={endPredictedRange}
            disabled={submitting} onOdometerChange={setEndOdo} onStateOfChargeChange={setEndCharge} onPredictedRangeChange={setEndPredictedRange} />
          {isEV && (
            <ReturnChargingChoice value={leftForCharging} disabled={submitting} onChange={value => {
              setLeftForCharging(value);
              if (!value) { setChargingLocation(null); setPublicChargeReference(''); setPublicChargeCost(''); setChargingNotes(''); }
            }}>
              {leftForCharging && (chargingSession ? (
                <div className='mt-4 space-y-3'>
                    <ChargingLocationPicker
                      driverId={driverId}
                      sessionToken={chargingSession.sessionToken}
                      value={chargingLocation?.id ?? ''}
                      onChange={setChargingLocation}
                      disabled={submitting}
                    />
                    {chargingLocation?.type === 'PUBLIC_THIRD_PARTY' && (
                      <>
                        <label htmlFor='return-receipt' className='block text-sm font-medium'>Receipt reference (optional)</label>
                        <input id='return-receipt' type='text' value={publicChargeReference} onChange={e => setPublicChargeReference(e.target.value)} placeholder='Public charge / receipt reference (optional)' className='w-full px-4 py-3 border border-gray-300 rounded-lg' />
                        <label htmlFor='return-cost' className='block text-sm font-medium'>Known charging cost (optional)</label>
                        <input id='return-cost' type='number' min='0' step='0.01' value={publicChargeCost} onChange={e => setPublicChargeCost(e.target.value)} placeholder='Known public charge cost (optional)' className='w-full px-4 py-3 border border-gray-300 rounded-lg' />
                      </>
                    )}
                    <label htmlFor='return-charging-notes' className='block text-sm font-medium'>Charging note (optional)</label>
                    <textarea id='return-charging-notes' value={chargingNotes} onChange={e => setChargingNotes(e.target.value)} rows={3} maxLength={500} placeholder='Charging note (optional)' className='w-full px-4 py-3 border border-gray-300 rounded-lg' />
                </div>
              ) : <p className='mt-3 text-sm text-red-700'>Your session has expired. Please log in again.</p>)}
            </ReturnChargingChoice>
          )}

        </div>
      )}

      {evidenceCompleted && <p role="status">Your inspection and photos are already saved. Enter the return readings above; you do not need to repeat the inspection.</p>}
      <fieldset disabled={evidenceCompleted || submitting} className='space-y-4'>
        <PhotoField label='Exterior condition photo' slot={exterior} role='EXTERIOR' onFile={handleFile} />
        <PhotoField label='Interior / dashboard photo' slot={interior} role='INTERIOR' onFile={handleFile} />
      </fieldset>

      {isReturn && <fieldset disabled={evidenceCompleted || submitting} className='mt-4'>
        <legend className='block text-sm font-semibold text-gray-700 mb-2'>Any new damage? <span className='text-red-500'>*</span></legend>
        <div className='flex gap-3'>
          <button aria-pressed={!hasDamage} onClick={() => setHasDamage(false)} className={`flex-1 py-3 rounded-lg font-bold border-2 ${!hasDamage ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-500'}`}>No</button>
          <button aria-pressed={hasDamage} onClick={() => setHasDamage(true)} className={`flex-1 py-3 rounded-lg font-bold border-2 ${hasDamage ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 text-gray-500'}`}>Yes</button>
        </div>
        {hasDamage && (
          <textarea aria-label='Damage description' value={damageDescription} onChange={e => setDamageDescription(e.target.value)} rows={3} placeholder='Describe the damage...' className='w-full px-4 py-3 border border-gray-300 rounded-lg mt-3' />
        )}
      </fieldset>}

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
