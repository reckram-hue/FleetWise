import React, { useRef, useState } from 'react';
import { economyApi, EconomyReport } from '../../services/economyApi';
import { formatEconomyStatus } from '../../lib/economyPresentation';

type Vehicle = EconomyReport['vehicles'][number];
const n = (value: number | null) => value === null ? 'Not available' : value.toLocaleString('en-ZA', { maximumFractionDigits: 1 });
const control = 'min-h-11 w-full rounded border border-gray-300 bg-white px-3 py-2';
export default function VehicleEvidencePanel({ vehicle, period, includeTest, onSaved }: {
    vehicle: Vehicle; period: '30' | '90' | 'ALL'; includeTest: boolean; onSaved: () => void;
}) {
    const [purpose, setPurpose] = useState<'consumption' | 'cost'>('consumption');
    const [normal, setNormal] = useState(''), [complete, setComplete] = useState(''), [comparable, setComparable] = useState('');
    const [notes, setNotes] = useState(''), [override, setOverride] = useState(false), [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submitting = useRef(false);
    const d = vehicle.readiness[purpose];
    const changePurpose = (value: 'consumption' | 'cost') => {
        setPurpose(value); setNormal(''); setComplete(''); setComparable(''); setNotes(''); setOverride(false); setReason(''); setError('');
    };
    const save = async () => {
        if (submitting.current || !normal || !complete || !comparable || (override && !reason.trim())) return;
        submitting.current = true; setBusy(true); setError('');
        try {
            await economyApi.saveReview({ vehicleId: vehicle.vehicleId, purpose: d.purpose, period, includeTest,
                fingerprint: d.fingerprint, methodologyVersion: 'v1', normalDutyConfirmed: normal === 'yes',
                recordingCompletenessConfirmed: complete === 'yes', configurationComparableConfirmed: comparable === 'yes',
                notes, overrideSoftTriggers: override, softOverrideReason: override ? reason : '' });
            onSaved();
        } catch { setError('Review could not be saved. Evidence may have changed; reload Fleet Economics before retrying.'); }
        finally { submitting.current = false; setBusy(false); }
    };
    const variance = vehicle.manufacturerComparison;
    return <details className="mt-3 text-sm font-normal"><summary className="min-h-11 cursor-pointer font-semibold">Evidence diagnostics</summary>
        <div className="space-y-3 min-w-64">
            <p>Consumption evidence: {formatEconomyStatus(vehicle.readiness.consumption.state)}</p>
            <p>Whole-period cost evidence: {formatEconomyStatus(vehicle.readiness.cost.state)}</p>
            <p>Evidence sufficiency supports analysis of this metric and scope. Soft triggers alone do not establish normal duty.</p>
            <p>Observed manufacturer variance: {variance.variancePercent === null ? variance.message : `${variance.variancePercent > 0 ? '+' : ''}${n(variance.variancePercent)}% versus manufacturer reference`}</p>
            {variance.variancePercent !== null && <p>{variance.variancePercent === 0 ? 'Observed consumption equals the reference.' : `Observed consumption is ${n(Math.abs(variance.variancePercent))}% ${variance.variancePercent > 0 ? 'higher' : 'lower'} than manufacturer reference.`} {vehicle.readiness.consumption.state !== 'SUFFICIENT_FOR_ANALYSIS' ? 'Provisional observation — Limited evidence.' : 'Sufficient for analysis of the reviewed metric.'} Operating conditions may differ.</p>}
            <label>Review purpose<select className={control} value={purpose} disabled={busy} onChange={e => changePurpose(e.target.value as typeof purpose)}>
                <option value="consumption">{vehicle.powertrain === 'ICE' ? 'ICE consumption evidence' : 'EV consumption evidence'}</option><option value="cost">Whole-period operating cost evidence</option>
            </select></label>
            <p>Eligible distance: {n(d.D)} km · Consumption coverage: {n(d.E)} km · Cost coverage: {n(d.C)} km</p>
            <p>Selected-purpose coverage: {n(d.coveragePercent)}{d.coveragePercent === null ? '' : '%'} of eligible recorded distance · {d.sampleCount} valid {vehicle.powertrain === 'ICE' ? 'cycles' : 'intervals'}</p>
            <p>Observation span: {n(d.spanDays)} days · {d.operatingDays} recorded activity days · {d.distinctWeeks} distinct weeks</p>
            <p>First observation: {d.firstObservation || 'Not available'} · Latest: {d.latestObservation || 'Not available'}</p>
            <p>Provenance: {formatEconomyStatus(d.provenance)}{vehicle.powertrain === 'EV' && ` · Usable-capacity evidence: ${n(d.capacityEvidencePercent)}${d.capacityEvidencePercent === null ? '' : '%'}`}</p>
            <p>{d.unknownAssignments} unknown/invalid assignments · {d.excludedReturnEvents} return-charging events excluded</p>
            {d.excludedEnergyAssignments !== null && <p>{d.excludedEnergyAssignments} otherwise eligible assignments have no qualifying battery-energy balance.</p>}
            {d.influence && <p>Largest leave-one-interval-out rate change: {n(d.influence.maxChangePercent)}%. Review sensitivity; no valid records were removed.</p>}
            <h4 className="font-semibold">Hard data gates</h4>{d.hard.length ? <ul className="list-disc pl-5">{d.hard.map(r => <li key={r}>{r}</li>)}</ul> : <p>No detected hard data failures. Reviewer confirmations are assessed separately.</p>}
            <h4 className="font-semibold">Soft review triggers</h4>{d.soft.length ? <ul className="list-disc pl-5">{d.soft.map(r => <li key={r}>{r}</li>)}</ul> : <p>All provisional soft triggers met.</p>}
            {d.confirmation.map(r => <p key={r}>{r}</p>)}
            {d.review && <div className="border-t pt-2"><p>{d.review.current ? 'Current review' : 'Stale review'} · Reviewer: {d.review.reviewedBy} · {d.review.reviewedAt} · Method {d.review.methodologyVersion}</p><p>{d.review.notes}</p>{d.review.softOverrideReason && <p>Soft-trigger exception: {d.review.softOverrideReason}</p>}</div>}
            <p>Review scope: {period === 'ALL' ? 'All eligible history' : `Last ${period} days`} · UTC scope date {d.scopeDay} · Method {d.methodologyVersion}{includeTest ? ' · QA selection' : ''}. Reviews expire when the UTC date, method, scope or evidence changes.</p>
            <fieldset disabled={busy} className="space-y-3 border-t pt-3"><legend className="font-semibold">Admin confirmation</legend>
                {([{ label: 'Normal duty confirmed', value: normal, set: setNormal }, { label: 'Recording completeness confirmed', value: complete, set: setComplete }, { label: 'Configuration comparability confirmed', value: comparable, set: setComparable }]).map(item => <label key={item.label} className="block">{item.label}<select className={control} value={item.value} onChange={e => item.set(e.target.value)}><option value="">Choose confirmation</option><option value="yes">Confirm</option><option value="no">Decline / not established</option></select></label>)}
                <label className="block">Review notes<textarea className={control} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
                {d.soft.length > 0 && <details><summary className="min-h-11 cursor-pointer">Exceptional soft-trigger override</summary><p>This cannot override hard data failures.</p><label className="block"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /> Explicitly override unmet soft triggers</label>{override && <label>Required exception reason<textarea className={control} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>}</details>}
                <button type="button" className={control} disabled={!normal || !complete || !comparable || (override && !reason.trim())} onClick={save}>{busy ? 'Saving review…' : 'Save scoped review'}</button>
            </fieldset>
            {error && <p role="alert">{error}</p>}
        </div>
    </details>;
}
