import React, { useEffect, useState } from 'react';
import { AccidentReport } from '../../types';
import { accidentApi } from '../../services/accidentApi';
import AccidentReportDetails from '../shared/AccidentReportDetails';

export default function AccidentReports() {
    const [reports, setReports] = useState<AccidentReport[]>([]), [selected, setSelected] = useState<AccidentReport | null>(null);
    const [includeTest, setIncludeTest] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [status, setStatus] = useState(''), [search, setSearch] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('');
    const [version, setVersion] = useState(0);
    useEffect(() => { let cancelled = false; setBusy(true); setError(''); setReports([]);
        (async () => { try {
            let cursor: string | undefined; const all: AccidentReport[] = [];
            do { const page = await accidentApi.listAdmin(includeTest, cursor); if (cancelled) return;
                all.push(...page.reports); cursor = page.nextCursor || undefined;
            } while (cursor);
            setReports(all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        } catch { if (!cancelled) setError('Could not load accident reports. Retry.'); }
        finally { if (!cancelled) setBusy(false); } })();
        return () => { cancelled = true; };
    }, [includeTest, version]);
    const visible = reports.filter(r => (!status || r.status === status) && `${r.driverId} ${r.vehicleId}`.toLowerCase().includes(search.toLowerCase())
        && (!from || (r.fields.accidentAt || '').slice(0, 10) >= from) && (!to || (r.fields.accidentAt || '').slice(0, 10) <= to));
    return <section className="space-y-4"><h3 className="text-xl font-bold">Accident Reports</h3>
        {error && <p role="alert">{error} <button onClick={() => setVersion(v => v + 1)}>Retry</button></p>}
        {busy && <p role="status">Loading accident reports...</p>}
        {selected ? <><button className="min-h-11 underline" onClick={() => setSelected(null)}>Back to accident reports</button><AccidentReportDetails report={selected} admin /></> : <>
            <div className="flex flex-wrap gap-4">
                <label><input type="checkbox" checked={includeTest} onChange={e => setIncludeTest(e.target.checked)} /> Include TEST reports</label>
                <label>Status <select className="min-h-11 border" value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option><option>DRAFT</option><option>SUBMITTED</option></select></label>
                <label>Driver / vehicle ID<input className="min-h-11 border" value={search} onChange={e => setSearch(e.target.value)} /></label>
                <label>From<input className="min-h-11 border" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
                <label>To<input className="min-h-11 border" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            </div>
            {!busy && !visible.length && <p>No matching accident reports.</p>}
            {visible.map(r => <button className="block w-full text-left rounded border p-4 min-h-11" key={r.id} disabled={busy} onClick={async () => {
                setBusy(true); setError(''); try { setSelected(await accidentApi.getAdmin(r.id)); }
                catch { setError('Could not open report. Retry opening it.'); } finally { setBusy(false); }
            }}><strong>{r.status} {r.isTestData ? '— TEST' : ''}</strong><p>{r.fields.accidentAt || 'Date not provided'} · {r.fields.locationDescription || 'Location not provided'}</p>
                <p className="text-sm break-all">Driver {r.driverId} · Vehicle {r.vehicleId}</p>{r.fields.vehicleDriveable === 'NO' && <p className="text-red-800 font-bold">Vehicle not driveable</p>}</button>)}
        </>}
    </section>;
}
