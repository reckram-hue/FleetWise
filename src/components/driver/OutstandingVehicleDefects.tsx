import React, { useEffect, useState } from 'react';
import api from '../../services/firebaseApi';
import { getDriverSession } from '../../store/session';
import { outstandingDefects } from '../../lib/driverVehiclePresentation';
import type { DefectReport } from '../../types';

export default function OutstandingVehicleDefects({ driverId, vehicleId, onReadyChange, onReport, disabled = false }: {
  driverId: string; vehicleId: string; onReadyChange: (ready: boolean) => void; onReport?: () => void; disabled?: boolean;
}) {
  const [defects, setDefects] = useState<DefectReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setFailed(false); onReadyChange(false);
    const load = async () => {
      try {
        const session = getDriverSession();
        if (!session) throw new Error('Session expired');
        const result = await api.getVehicleDefectsForSession(driverId, session.sessionToken, vehicleId);
        if (cancelled) return;
        setDefects(outstandingDefects(result)); onReadyChange(true);
      } catch { if (!cancelled) setFailed(true); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [driverId, vehicleId, retry, onReadyChange]);
  return <section aria-label="Outstanding vehicle defects" className="mb-4 rounded-lg border p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold text-gray-800">Outstanding defects</h3>
      {onReport && <button type="button" disabled={disabled} onClick={onReport} className="min-h-11 rounded-lg bg-red-50 px-3 py-2 text-red-800 disabled:opacity-50">Report a new defect</button>}
    </div>
    {loading ? <p role="status">Checking reported defects...</p> : failed ? <div role="alert">
      <p>Could not check this vehicle’s defects. Retry before continuing.</p>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 underline">Retry defect check</button>
    </div> : defects.length === 0 ? <p>No outstanding defects reported. Still check the vehicle before accepting it.</p> :
      <ul className="space-y-3 max-h-64 overflow-y-auto">{defects.map(defect => <li key={defect.id} className="border-t pt-3">
        <p className="font-semibold">{defect.category} — {defect.urgency}</p>
        <p className="text-sm text-gray-700 break-words">{defect.description}</p>
        <p className="text-xs text-gray-600">Status: {defect.status}</p>
      </li>)}</ul>}
  </section>;
}
