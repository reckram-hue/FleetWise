import React, { useState } from 'react';
import api from '../../services/firebaseApi';
import { Vehicle, VehicleStatus } from '../../types';

export default function VehicleLifecycleActions({ vehicle, onSaved }: { vehicle: Vehicle; onSaved: () => void }) {
  const [reviewedVehicle, setReviewedVehicle] = useState(vehicle);
  const [status, setStatus] = useState(vehicle.status), [notes, setNotes] = useState(''), [clearManualHold, setClear] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    if (!notes.trim() || busy) { setError('A lifecycle reason is required.'); return; }
    setBusy(true); setError('');
    try { const saved = await api.changeVehicleLifecycleAdmin({ vehicleId: reviewedVehicle.id, status, notes, clearManualHold, requestId,
        expectedLifecycleRevision: reviewedVehicle.lifecycleRevision || 0, expectedHoldId: reviewedVehicle.maintenanceHold?.id || null });
      setReviewedVehicle(saved); setNotes(''); setClear(false); setRequestId(crypto.randomUUID()); onSaved();
    } catch (e: any) { setError(e.message || 'Could not update lifecycle.'); } finally { setBusy(false); }
  }
  return <div className="border rounded p-3 my-3">
    <h4 className="font-semibold">Operational lifecycle: {reviewedVehicle.status}</h4>
    <p>Current hold: {reviewedVehicle.maintenanceHold?.reason || reviewedVehicle.statusNotes || 'Legacy or unspecified hold; confirm the current condition before release.'}</p>
    <p>Lifecycle changes are separate from saving vehicle details. Active custody, charging and outstanding service work are checked before changes.</p>
    <label>New lifecycle state<select value={status} onChange={e => setStatus(e.target.value as VehicleStatus)} className="block border p-2">
      {Object.values(VehicleStatus).map(s => <option key={s}>{s}</option>)}</select></label>
    <label className="block">Lifecycle reason<input value={notes} onChange={e => setNotes(e.target.value)} className="block border p-2 w-full" /></label>
    {status === VehicleStatus.Active && <label className="block"><input type="checkbox" checked={clearManualHold} onChange={e => setClear(e.target.checked)} /> Confirm any separate manual maintenance/repair hold has been addressed</label>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    <button type="button" disabled={busy} onClick={save} className="underline min-h-11">{busy ? 'Saving…' : 'Apply lifecycle change'}</button>
  </div>;
}
