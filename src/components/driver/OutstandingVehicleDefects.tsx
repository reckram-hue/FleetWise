import React, { useEffect, useState } from 'react';
import api from '../../services/firebaseApi';
import { getDriverSession } from '../../store/session';
import { outstandingDefects, defectSeverityClasses } from '../../lib/driverVehiclePresentation';
import type { DefectReport } from '../../types';

export function OutstandingDefectList({ defects }: { defects: DefectReport[] }) {
  return <ul className="space-y-3 max-h-64 overflow-y-auto">{outstandingDefects(defects).map(defect =>
    <li key={defect.id} className={`min-w-0 rounded-lg border-l-4 border p-3 break-words ${defectSeverityClasses(defect.urgency)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">{defect.category}</p>
        <span className="text-sm font-bold">Severity: {defect.urgency}</span>
      </div>
      <p className="mt-2 text-sm">{defect.description}</p>
      <p className="mt-2 text-xs font-medium">Status: {defect.status}</p>
    </li>)}</ul>;
}

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
      <h3 className="border-l-4 border-amber-400 pl-2 font-bold text-gray-900">Outstanding defects — review before pickup</h3>
      {onReport && <button type="button" disabled={disabled} onClick={onReport} className="min-h-11 rounded-lg bg-red-50 px-3 py-2 text-red-800 disabled:opacity-50">Report a new defect</button>}
    </div>
    {loading ? <p role="status">Checking reported defects...</p> : failed ? <div role="alert">
      <p>Could not check this vehicle’s defects. Retry before continuing.</p>
      <button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 underline">Retry defect check</button>
    </div> : defects.length === 0 ? <p>No outstanding defects reported. Still check the vehicle before accepting it.</p> :
      <OutstandingDefectList defects={defects} />}
  </section>;
}
