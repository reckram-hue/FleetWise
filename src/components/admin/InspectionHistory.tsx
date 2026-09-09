import React, { useEffect, useRef, useState } from 'react';
import { AdminInspection, InspectionHistoryCursor, InspectionHistoryFilters, User, Vehicle } from '../../types';
import api from '../../services/firebaseApi';
import { inspectionApi } from '../../services/inspectionApi';
import { formatVehicleIdentity } from '../../lib/vehicleIdentity';
import Header from '../shared/Header';
import EvidencePhoto from '../shared/EvidencePhoto';

const control = 'w-full min-h-11 rounded border border-gray-300 bg-white px-3 py-2';
const action = 'min-h-11 rounded border border-blue-700 px-4 py-2 text-blue-800 disabled:opacity-50';
const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
const emptyFilters = { vehicleId: '', driverId: '', boundaryType: '', from: '', until: '', assignmentId: '', shiftId: '', includeTest: false };
// Missing display data must never promote a Firestore reference into the heading.
const inspectionIdentity = (r: AdminInspection) => formatVehicleIdentity({ vehicleRegistration: r.vehicleRegistration, vehicleDisplayName: r.vehicleDisplayName });

export default function InspectionHistory({ onBack, onOpenDefect }: { onBack: () => void; onOpenDefect: (id: string) => void }) {
    const [draft, setDraft] = useState(emptyFilters), [filters, setFilters] = useState<InspectionHistoryFilters>({ includeTest: false });
    const [vehicles, setVehicles] = useState<Vehicle[]>([]), [drivers, setDrivers] = useState<User[]>([]);
    const [rows, setRows] = useState<AdminInspection[]>([]), [cursor, setCursor] = useState<InspectionHistoryCursor | null>(null);
    const [selected, setSelected] = useState<AdminInspection | null>(null), [busy, setBusy] = useState(false), [detailBusy, setDetailBusy] = useState(false);
    const [error, setError] = useState(''), [directoryError, setDirectoryError] = useState(''), [version, setVersion] = useState(0);
    const requests = useRef(0), details = useRef(0), pageLock = useRef(false);
    useEffect(() => {
        let cancelled = false;
        Promise.all([api.getVehicles(), api.getUsers()]).then(([v, u]) => {
            if (!cancelled) { setVehicles(v); setDrivers(u.filter(d => d.role === 'driver')); }
        }).catch(() => { if (!cancelled) setDirectoryError('Vehicle and driver filters could not load. Reload this page to retry. History remains available.'); });
        return () => { cancelled = true; details.current++; };
    }, []);
    useEffect(() => {
        const request = ++requests.current;
        setRows([]); setCursor(null); setSelected(null); setBusy(true); setError(''); pageLock.current = true;
        inspectionApi.list(filters).then(page => {
            if (request === requests.current) { setRows(page.inspections); setCursor(page.nextCursor); }
        }).catch(() => { if (request === requests.current) setError('Inspection history could not load. Retry or sign in again.'); })
            .finally(() => { if (request === requests.current) { setBusy(false); pageLock.current = false; } });
        return () => { requests.current++; details.current++; };
    }, [filters, version]);
    const more = async () => {
        if (!cursor || pageLock.current) return;
        pageLock.current = true; setBusy(true); setError(''); const request = requests.current;
        try { const page = await inspectionApi.list({ ...filters, cursor });
            if (request === requests.current) {
                setRows(previous => [...previous, ...page.inspections.filter(r => !previous.some(p => p.id === r.id))]); setCursor(page.nextCursor);
            }
        } catch { if (request === requests.current) setError('More inspections could not load. Retry loading older records.'); }
        finally { if (request === requests.current) { setBusy(false); pageLock.current = false; } }
    };
    const open = async (id: string) => {
        const request = ++details.current; setDetailBusy(true); setError('');
        try { const record = await inspectionApi.detail(id); if (request === details.current) setSelected(record); }
        catch { if (request === details.current) setError('Inspection could not open. Retry or sign in again.'); }
        finally { if (request === details.current) setDetailBusy(false); }
    };
    const apply = (event: React.FormEvent) => {
        event.preventDefault();
        if (draft.from && draft.until && draft.from > draft.until) { setError('The end date must be on or after the start date.'); return; }
        const until = draft.until ? new Date(`${draft.until}T00:00:00`) : null;
        until?.setDate(until.getDate() + 1);
        const next: InspectionHistoryFilters = { includeTest: draft.includeTest };
        for (const key of ['vehicleId', 'driverId', 'assignmentId', 'shiftId'] as const) if (draft[key]) next[key] = draft[key].trim();
        if (draft.boundaryType) next.boundaryType = draft.boundaryType as 'PICKUP' | 'RETURN';
        if (draft.from) next.from = new Date(`${draft.from}T00:00:00`).toISOString();
        if (until) next.until = until.toISOString();
        setFilters(next);
    };
    return <div className="min-h-screen bg-gray-100">
        <Header title="Inspection History" />
        <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
            <button className={action} onClick={onBack}>Back to Admin Dashboard</button>
            <h2 className="text-2xl font-bold">Inspection History</h2>
            <p className="text-gray-600">Review pickup and return evidence. This history is read-only.</p>
            {directoryError && <p role="alert">{directoryError}</p>}
            {error && <p role="alert" className="text-red-800">{error} {!selected && !cursor && <button className={action} disabled={busy} onClick={() => setVersion(v => v + 1)}>Retry history</button>}</p>}
            {selected ? <>
                <button className={action} onClick={() => { setSelected(null); setError(''); }}>Back to inspection history</button>
                <InspectionDetail key={selected.id} inspection={selected} onOpenDefect={onOpenDefect} />
            </> : <>
                <form onSubmit={apply} className="bg-white rounded-lg border p-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <label>Vehicle<select className={control} value={draft.vehicleId} onChange={e => setDraft(d => ({ ...d, vehicleId: e.target.value }))}>
                            <option value="">All vehicles</option>{vehicles.map(v => <option key={v.id} value={v.id}>{formatVehicleIdentity({ ...v, id: undefined }).primary}{v.isTestData ? ' — TEST' : ''}</option>)}
                        </select></label>
                        <label>Driver<select className={control} value={draft.driverId} onChange={e => setDraft(d => ({ ...d, driverId: e.target.value }))}>
                            <option value="">All drivers</option>{drivers.map(d => <option key={d.id} value={d.id}>{[d.firstName, d.surname].filter(Boolean).join(' ') || 'Name unavailable'}{d.isTestData ? ' — TEST' : ''}</option>)}
                        </select></label>
                        <label>Inspection type<select className={control} value={draft.boundaryType} onChange={e => setDraft(d => ({ ...d, boundaryType: e.target.value }))}>
                            <option value="">PICKUP and RETURN</option><option>PICKUP</option><option>RETURN</option>
                        </select></label>
                        <label>Created from (local date)<input type="date" className={control} value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} /></label>
                        <label>Created through (local date)<input type="date" className={control} value={draft.until} onChange={e => setDraft(d => ({ ...d, until: e.target.value }))} /></label>
                    </div>
                    <details><summary className="cursor-pointer min-h-11">Filter by shift / assignment reference</summary><div className="grid sm:grid-cols-2 gap-4">
                        {(['shiftId', 'assignmentId'] as const).map(key => <label key={key}>{key === 'shiftId' ? 'Shift reference' : 'Assignment reference'}<input className={control} value={draft[key]} maxLength={128} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} /></label>)}
                    </div></details>
                    <div className="flex flex-wrap gap-4 items-center"><label className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={draft.includeTest} onChange={e => setDraft(d => ({ ...d, includeTest: e.target.checked }))} />Include TEST / QA</label>
                        <button type="submit" className={action} disabled={busy || detailBusy}>Apply filters</button>
                        <button type="button" className={action} disabled={busy || detailBusy} onClick={() => { setDraft(emptyFilters); setFilters({ includeTest: false }); }}>Reset filters</button>
                    </div>
                </form>
                <p role="status">{busy ? 'Loading inspections…' : `${rows.length} matching inspections loaded${cursor ? ' — older records available' : ''}.`}</p>
                {!busy && !rows.length && <p>{cursor ? 'No matches in this page. Load older records to continue searching.' : 'No inspections match these filters.'}</p>}
                <div className="space-y-3">{rows.map(r => {
                    const identity = inspectionIdentity(r);
                    return <button key={r.id} className="block w-full min-h-11 text-left rounded-lg border bg-white p-4 disabled:opacity-50" disabled={detailBusy} onClick={() => void open(r.id)}>
                        <strong className="block text-lg">{identity.primary}{r.isTestData ? ' — TEST' : ''}</strong>
                        {identity.secondary && <span className="block text-gray-600">{identity.secondary}</span>}
                        <span className="block">{r.boundaryType} · {r.driverName || 'Driver name unavailable'}</span>
                        <span className="block text-sm">Created {date(r.createdAt)} · {r.status || 'Status unavailable'}</span>
                    </button>;
                })}</div>
                {detailBusy && <p role="status">Opening inspection…</p>}
                {cursor && <button className={action} disabled={busy || detailBusy} onClick={() => void more()}>Load older records</button>}
            </>}
        </main>
    </div>;
}

export function InspectionDetail({ inspection: r, onOpenDefect }: { inspection: AdminInspection; onOpenDefect: (id: string) => void }) {
    const identity = inspectionIdentity(r);
    return <article className="bg-white rounded-lg border p-4 sm:p-6 space-y-4">
        <h3 className="text-xl font-bold">{identity.primary}{r.isTestData ? ' — TEST' : ''}</h3>
        {identity.secondary && <p>{identity.secondary}</p>}
        <p>{r.boundaryType} · {r.driverName || 'Driver name unavailable'} · {r.status || 'Status unavailable'}</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['Created', date(r.createdAt)], ['Photos captured', date(r.capturedAt)], ['Completed', date(r.completedAt)],
                ['Odometer', r.odometer == null ? 'Not recorded' : `${r.odometer.toLocaleString()} km`],
                ['Battery charge', r.chargePercent == null ? 'Not recorded' : `${r.chargePercent}%`],
                ['Predicted range', r.predictedRangeKm == null ? 'Not recorded' : `${r.predictedRangeKm} km`]].map(([label, value]) =>
                <div key={label}><dt className="text-sm text-gray-600">{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <p>Damage: {r.status !== 'COMPLETED' ? 'Inspection not completed' : r.hasDamage === null ? 'Not recorded' : r.hasDamage ? 'Reported' : 'No new damage recorded'}</p>
        {r.damageDescription && <p className="whitespace-pre-wrap break-words">{r.damageDescription}</p>}
        {r.linkedDefectId && <button className={action} onClick={() => onOpenDefect(r.linkedDefectId!)}>Open linked defect</button>}
        <section aria-label="Inspection photo evidence" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['EXTERIOR', 'INTERIOR'] as const).map(role => <div key={role}>
                <h4 className="font-bold">{role === 'EXTERIOR' ? 'Exterior photo' : 'Interior / dashboard photo'}</h4>
                {r.photos[role === 'EXTERIOR' ? 'exterior' : 'interior']
                    ? <EvidencePhoto key={`${r.id}-${role}`} caption={role === 'EXTERIOR' ? 'Exterior' : 'Interior / dashboard'} load={() => inspectionApi.photo(r.id, role)} />
                    : <p>No attached photo recorded.</p>}
            </div>)}
        </section>
        <details className="text-sm break-all"><summary className="cursor-pointer min-h-11">Inspection diagnostics</summary>
            <p>Inspection: {r.id}</p><p>Assignment: {r.assignmentId || 'Not recorded'}</p><p>Shift: {r.shiftId || 'Not recorded'}</p>
            <p>Vehicle reference: {r.vehicleId}</p><p>Driver reference: {r.driverId}</p><p>Vehicle identity from: {r.identitySource}</p>
            <p>Return purpose: {r.returnIntent || 'Not applicable'}</p><p>Return finalization: {r.returnFinalizationStatus || 'Not recorded'}</p>
            <p>Retention: {r.retentionClass || 'Not recorded'}</p><p>Recorded expiry: {date(r.expiresAt)}</p>
        </details>
    </article>;
}
