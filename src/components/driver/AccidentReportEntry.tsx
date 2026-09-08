import React, { useEffect, useRef, useState } from 'react';
import { AccidentReport } from '../../types';
import { accidentApi } from '../../services/accidentApi';
import AccidentReportForm from './AccidentReportForm';

export default function AccidentReportEntry({ assignmentId }: { assignmentId?: string }) {
    const [reports, setReports] = useState<AccidentReport[]>([]);
    const [selected, setSelected] = useState<AccidentReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [version, setVersion] = useState(0);
    const lock = useRef(false), requestId = useRef<string | null>(null);
    useEffect(() => {
        let cancelled = false; setLoading(true); setError('');
        (assignmentId ? accidentApi.list(assignmentId) : accidentApi.drafts()).then(r => { if (!cancelled) setReports(r); })
            .catch(() => { if (!cancelled) setError('Could not load accident reports. Retry lookup before starting a report.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [assignmentId, version]);
    const open = async (report?: AccidentReport) => {
        if (lock.current || (!report && !assignmentId)) return; lock.current = true; setLoading(true); setError('');
        try { requestId.current ||= crypto.randomUUID();
            const current = report ? await accidentApi.get(report.id) : await accidentApi.create(assignmentId!, requestId.current);
            setSelected(current); requestId.current = null;
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not open report. Retry.'); }
        finally { setLoading(false); lock.current = false; }
    };
    return <section className="my-4 rounded-xl border-2 border-red-800 p-4 bg-red-50">
        <h3 className="font-bold text-red-900">Accident / Collision</h3>
        {loading && <p role="status">Checking accident reports...</p>}
        {error && <p role="alert">{error} <button className="min-h-11 underline" onClick={() => setVersion(v => v + 1)}>Retry accident lookup</button></p>}
        {assignmentId && <button className="min-h-11 my-2 rounded bg-red-800 text-white px-4 py-2 font-bold disabled:opacity-50" disabled={loading || !!error} onClick={() => open()}>Report Accident / Collision</button>}
        {reports.map(r => <div key={r.id} className="flex flex-wrap gap-2 items-center">
            <span className="text-sm break-all">{r.fields.accidentAt || r.createdAt?.toLocaleString()} · Vehicle {r.vehicleId} · Report {r.id}</span>
            <span>{r.status === 'DRAFT' ? 'Accident report in progress' : 'Accident report submitted'}</span>
            <button className="min-h-11 underline text-red-900" disabled={loading} onClick={() => open(r)}>{r.status === 'DRAFT' ? 'Resume Report' : 'View Report'}</button>
        </div>)}
        {selected && <div className="fixed inset-0 z-50 bg-white overflow-y-auto"><AccidentReportForm key={selected.id} initialReport={selected} backLabel={assignmentId ? 'Back to Active Shift' : 'Back to Dashboard'} onBack={() => { setSelected(null); setVersion(v => v + 1); }} /></div>}
    </section>;
}
