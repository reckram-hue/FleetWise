import React, { useEffect, useState } from 'react';
import type { Vehicle } from '../../types';
import { economyApi, EconomyReport } from '../../services/economyApi';
import { formatEconomyStatus, formatEconomyReason } from '../../lib/economyPresentation';

const number = (v: number | null, decimals = 1) => v === null ? formatEconomyStatus('INSUFFICIENT_DATA') : v.toLocaleString('en-ZA', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const percentage = (v: number | null) => typeof v === 'number' && Number.isFinite(v) ? `${number(v)}%` : formatEconomyStatus('INSUFFICIENT_DATA');
const money = (v: number | null) => v === null ? formatEconomyStatus('INSUFFICIENT_COST_DATA') : `R${number(v, 2)}/km`;
const control = 'min-h-11 rounded border border-gray-300 bg-white px-3 py-2';

export default function FuelEconomyMonitor(_props: { vehicles: Vehicle[] }) {
    const [period, setPeriod] = useState<'30' | '90' | 'ALL'>('30'), [includeTest, setIncludeTest] = useState(false);
    const [report, setReport] = useState<EconomyReport | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false; setBusy(true); setError(''); setReport(null);
        economyApi.get(period, includeTest).then(data => { if (!cancelled) setReport(data); })
            .catch(() => { if (!cancelled) setError('Economy data could not load. Retry or contact support. No partial totals are shown.'); })
            .finally(() => { if (!cancelled) setBusy(false); });
        return () => { cancelled = true; };
    }, [period, includeTest, retry]);
    return <section className="space-y-5" aria-label="Vehicle economy metrics">
        <h2 className="text-2xl font-bold">Observed Economy</h2>
        <p>Completed vehicle assignments define distance. Unknown evidence stays unknown. These are vehicle observations, not driver scores.</p>
        <div className="flex flex-wrap gap-4 items-center">
            <label>Period <select className={control} value={period} onChange={e => setPeriod(e.target.value as typeof period)}>
                <option value="30">Trailing 30 days</option><option value="90">Trailing 90 days</option><option value="ALL">All valid history</option>
            </select></label>
            <label className="min-h-11 flex gap-2 items-center"><input type="checkbox" checked={includeTest} onChange={e => setIncludeTest(e.target.checked)} />Include TEST / QA</label>
        </div>
        {busy && <p role="status">Loading observed economy…</p>}
        {error && <div role="alert"><p>{error}</p><button className={control} onClick={() => setRetry(n => n + 1)}>Retry economy</button></div>}
        {report && <>
            <p className="text-sm text-gray-600">Calculated {new Date(report.updatedAt).toLocaleString()}. Whole intervals only; boundary-crossing intervals are excluded. Eligible samples have limited data; no confidence rating is assigned.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[report.fleet.ev, report.fleet.ice].map(f => <article key={f.powertrain} className="rounded border bg-white p-4 space-y-2">
                    <h3 className="font-bold">{f.powertrain} fleet</h3>
                    <p>{number(f.distanceKm)} km · {percentage(f.powertrain === 'EV' ? report.fleet.evSharePercent : report.fleet.iceSharePercent)} of known EV/ICE distance</p>
                    <p>Observed: {number(f.per100Km)} {f.powertrain === 'EV' ? 'kWh/100 km' : 'L/100 km'}</p>
                    <p>Covered consumption: {number(f.quantity)} {f.powertrain === 'EV' ? 'kWh (estimated battery energy)' : 'litres'}</p>
                    <p>Coverage: {number(f.coverageKm)} km · {f.sampleCount} samples</p>
                    <p>{f.provenance === 'INSUFFICIENT_DATA' ? 'Not enough data to calculate a reliable baseline.' : formatEconomyStatus(f.provenance)}</p>
                    <p>Cost/km: {money(f.costPerKm)} · cost coverage {number(f.costCoverageKm)} km</p>
                </article>)}
            </div>
            <p className="text-sm">Cost/km is recorded fuel/energy replenishment expense over its covered distance, not total ownership cost. EV cost requires matching SOC boundaries and known metered charge costs. Unknown costs and charging losses are never filled in.</p>
            {!report.vehicles.length && <p>No vehicles match this selection.</p>}
            <div className="space-y-4">{report.vehicles.map(v => <article key={v.vehicleId} className="rounded border bg-white p-4 space-y-3">
                <h3 className="text-xl font-bold">{v.registration || 'Registration unavailable'}{v.isTestData ? ' — TEST' : ''} · {v.powertrain}</h3>
                <p className="text-sm">Period: {v.periodStart ? new Date(v.periodStart).toLocaleDateString() : 'No valid start recorded'} – {new Date(v.periodEnd).toLocaleDateString()}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div><h4 className="font-semibold">Assignment distance</h4><p>{v.distanceProvenance === 'INSUFFICIENT_DATA' ? 'No usable driving data yet' : formatEconomyStatus(v.distanceProvenance)}</p><p>{number(v.distanceKm)} km coverage · {v.distanceSampleCount} qualifying intervals</p><p>{v.unknownAssignments} unknown/invalid intervals</p></div>
                    <div><h4 className="font-semibold">Observed FleetWise Baseline</h4><p>{number(v.economy.value)} {v.economy.unit}</p>{v.economy.provenance !== 'INSUFFICIENT_DATA' && <p>{formatEconomyStatus(v.economy.provenance)}</p>}</div>
                    <div><h4 className="font-semibold">Coverage / Data Quality</h4><p>{number(v.economy.coverageKm)} km · {v.economy.sampleCount} samples</p><p>{formatEconomyStatus(v.economy.quality)}</p></div>
                    <div><h4 className="font-semibold">Cost/km</h4><p className="break-words">{money(v.cost.value)}</p><p>Coverage {number(v.cost.coverageKm)} km · {v.cost.sampleCount} samples{v.cost.provenance !== 'INSUFFICIENT_DATA' && ` · ${formatEconomyStatus(v.cost.provenance)}`}</p></div>
                    <div><h4 className="font-semibold">Manufacturer Reference</h4><p>{v.manufacturerReference === null ? 'Not recorded' : `${number(v.manufacturerReference)} ${v.economy.unit}`}</p><p>Reference only; not an observed baseline.</p></div>
                    {v.powertrain === 'EV' && <div><h4 className="font-semibold">Charger energy (meter-reported)</h4><p>{v.chargerEnergy.valueKWh === null ? 'No metered charging data yet' : `${number(v.chargerEnergy.valueKWh)} kWh · ${formatEconomyStatus(v.chargerEnergy.provenance)}`}</p><p>{v.chargerEnergy.sampleCount} meters within assignments covering {number(v.chargerEnergy.coverageKm)} km. Separate from battery consumption; not a consumption denominator.</p></div>}
                </div>
                {v.reasons.length > 0 && <p className="text-sm break-words">Coverage limitations: {v.reasons.map(formatEconomyReason).join('; ')}.</p>}
                <details className="text-sm break-words"><summary className="cursor-pointer min-h-11">Calculation provenance</summary>
                    <p>Vehicle reference: {v.vehicleId} · method version {report.methodVersion} · {formatEconomyStatus(v.provenance)}</p>
                    <p>Return-charging events excluded: {v.excludedReturnEvents}. No charging energy inferred across custody.</p>
                    {v.evidence.map((e, i) => <div key={i} className="mt-2 border-t pt-2"><p>{formatEconomyStatus(e.provenance)} · records: {e.recordIds.join(', ')}</p>
                        {e.capacityUsed && <p>Usable capacity used: {e.capacityUsed.valueKWh} kWh; source: {e.capacityUsed.source}; snapshot: {e.capacityUsed.recordedAt}</p>}
                    </div>)}
                </details>
            </article>)}</div>
        </>}
    </section>;
}
