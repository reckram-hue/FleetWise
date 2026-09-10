import React, { useEffect, useState } from 'react';
import type { Vehicle } from '../../types';
import { economyApi, EconomyReport } from '../../services/economyApi';
import { formatEconomyStatus, formatEconomyReason } from '../../lib/economyPresentation';
import VehicleEvidencePanel from './VehicleEvidencePanel';

const number = (v: number | null, decimals = 1) => v === null ? formatEconomyStatus('INSUFFICIENT_DATA') : v.toLocaleString('en-ZA', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const percentage = (v: number | null) => typeof v === 'number' && Number.isFinite(v) ? `${number(v)}%` : formatEconomyStatus('INSUFFICIENT_DATA');
const money = (v: number | null) => v === null ? formatEconomyStatus('INSUFFICIENT_COST_DATA') : `R${number(v, 2)}/km`;
const amount = (v: number | null) => v === null ? formatEconomyStatus('INSUFFICIENT_COST_DATA') : `R${number(v, 2)}`;
const control = 'min-h-11 rounded border border-gray-300 bg-white px-3 py-2';

export default function FuelEconomyMonitor(_props: { vehicles: Vehicle[] }) {
    const [period, setPeriod] = useState<'30' | '90' | 'ALL'>('90'), [includeTest, setIncludeTest] = useState(false);
    const [report, setReport] = useState<EconomyReport | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false; setBusy(true); setError(''); setReport(null);
        economyApi.get(period, includeTest).then(data => { if (!cancelled) setReport(data); })
            .catch(() => { if (!cancelled) setError('Economy data could not load. Retry or contact support. No partial totals are shown.'); })
            .finally(() => { if (!cancelled) setBusy(false); });
        return () => { cancelled = true; };
    }, [period, includeTest, retry]);
    return <section className="space-y-5" aria-label="Vehicle economy metrics">
        <h2 className="text-2xl font-bold">Fleet Economics</h2>
        <p>Completed vehicle assignments define distance. Unknown evidence stays unknown. These are vehicle observations, not driver scores.</p>
        <div className="flex flex-wrap gap-4 items-center">
            <label>Period <select className={control} value={period} onChange={e => setPeriod(e.target.value as typeof period)}>
                <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="ALL">All eligible history</option>
            </select></label>
            <label className="min-h-11 flex gap-2 items-center"><input type="checkbox" checked={includeTest} onChange={e => setIncludeTest(e.target.checked)} />Include TEST / QA</label>
        </div>
        {busy && <p role="status">Loading observed economy…</p>}
        {error && <div role="alert"><p>{error}</p><button className={control} onClick={() => setRetry(n => n + 1)}>Retry economy</button></div>}
        {report && <>
            <p className="text-sm text-gray-600">Calculated {new Date(report.updatedAt).toLocaleString()}. Whole intervals only; boundary-crossing intervals are excluded. Eligible samples have limited data; no confidence rating is assigned.</p>
            <p className="text-lg font-semibold">Total eligible EV/ICE distance: {number(report.fleet.totalEligibleKm)} km</p>
            <p>{report.fleet.distanceSampleCount} qualifying assignment intervals · {report.fleet.unknownAssignments} unknown/invalid intervals excluded; their distance is unknown. {report.fleet.excludedPowertrainAssignments} intervals excluded from EV/ICE totals because powertrain is unavailable.</p>
            <p>Shares describe eligible EV/ICE distance only. Missing intervals are not represented by zero kilometres.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[report.fleet.ev, report.fleet.ice].map(f => <article key={f.powertrain} className="rounded border bg-white p-4 space-y-2">
                    <h3 className="font-bold">{f.powertrain} fleet</h3>
                    <p>{number(f.eligibleDistanceKm)} km · {percentage(f.powertrain === 'EV' ? report.fleet.evSharePercent : report.fleet.iceSharePercent)} of known EV/ICE distance</p>
                    <p>Distance: {formatEconomyStatus(f.distanceProvenance)} · {f.distanceSampleCount} assignments · {f.unknownAssignments} unknown/invalid intervals</p>
                    <p>Observed Economy: {number(f.per100Km)} {f.powertrain === 'EV' ? 'kWh/100 km' : 'L/100 km'}</p>
                    <p>Covered consumption: {number(f.quantity)} {f.powertrain === 'EV' ? 'kWh (estimated battery energy)' : 'litres'}</p>
                    <p>Coverage: {number(f.coverageKm)} km · {f.sampleCount} samples</p>
                    <p>{f.provenance === 'INSUFFICIENT_DATA' ? 'Not enough data to calculate a reliable baseline.' : formatEconomyStatus(f.provenance)}</p>
                    <p>Data quality: {formatEconomyStatus(f.quality)}</p>
                    <p>Operating {f.powertrain === 'EV' ? 'energy' : 'fuel'} cost/km: {money(f.costPerKm)}</p>
                    <p>Recorded covered cost: {amount(f.cost)} · {formatEconomyStatus(f.costProvenance)} · cost coverage {number(f.costCoverageKm)} km · {f.costSampleCount} samples</p>
                    {f.partialCostCoverage && <p>Partial cost coverage: this rate applies only to covered intervals.</p>}
                </article>)}
            </div>
            <p className="text-sm">Cost/km is recorded fuel/energy replenishment expense over its covered distance, not total ownership cost. EV cost requires matching SOC boundaries and known metered charge costs. Unknown costs and charging losses are never filled in.</p>
            {!report.vehicles.length && <p>No vehicles match this selection.</p>}
            <p>Consumption units differ by powertrain and are not ranked against each other. Cost rates apply to each vehicle’s own covered intervals.</p>
            <div className="overflow-x-auto rounded border bg-white" role="region" aria-label="Vehicle comparison" tabIndex={0}>
            <table className="w-full text-sm text-left"><caption className="p-3 text-left font-bold">Vehicle comparison · {report.period === 'ALL' ? 'All eligible history' : `Last ${report.period} days`}</caption>
                <thead><tr>{['Registration / provenance', 'Powertrain', 'Eligible distance', 'Observed Economy', 'Coverage / Data quality', 'Operating fuel/energy cost', 'Cost/km', 'Manufacturer Reference'].map(label => <th key={label} scope="col" className="p-3 align-top border-b">{label}</th>)}</tr></thead>
                <tbody>{report.vehicles.map(v => <tr key={v.vehicleId} className="border-t">
                <th scope="row" className="p-3 align-top min-w-64 font-normal"><strong>{v.registration || 'Registration unavailable'}{v.isTestData ? ' — TEST' : ''}</strong>
                <p className="text-sm">Period: {v.periodStart ? new Date(v.periodStart).toLocaleDateString() : 'No valid start recorded'} – {new Date(v.periodEnd).toLocaleDateString()}</p>
                {v.reasons.length > 0 && <p className="text-sm break-words">Coverage limitations: {v.reasons.map(formatEconomyReason).join('; ')}.</p>}
                <details className="text-sm break-words"><summary className="cursor-pointer min-h-11">Calculation provenance</summary>
                    <p>Vehicle reference: {v.vehicleId} · method version {report.methodVersion} · {formatEconomyStatus(v.provenance)}</p>
                    <p>Return-charging events excluded: {v.excludedReturnEvents}. No charging energy inferred across custody.</p>
                    {v.evidence.map((e, i) => <div key={i} className="mt-2 border-t pt-2"><p>{formatEconomyStatus(e.provenance)} · records: {e.recordIds.join(', ')}</p>
                        {e.capacityUsed && <p>Usable capacity used: {e.capacityUsed.valueKWh} kWh; source: {e.capacityUsed.source}; snapshot: {e.capacityUsed.recordedAt}</p>}
                    </div>)}
                </details>
                {v.readiness && <VehicleEvidencePanel key={`${v.vehicleId}-${v.readiness.consumption.fingerprint}`} vehicle={v} period={period} includeTest={includeTest} onSaved={() => setRetry(n => n + 1)} />}
                </th>
                <td className="p-3 align-top">{v.powertrain}</td>
                <td className="p-3 align-top"><p>{number(v.distanceSampleCount ? v.distanceKm : null)} km</p><p>{v.distanceProvenance === 'INSUFFICIENT_DATA' ? 'No usable driving data yet' : formatEconomyStatus(v.distanceProvenance)}</p><p>{v.distanceSampleCount} qualifying intervals</p><p>{v.unknownAssignments} unknown/invalid intervals</p></td>
                <td className="p-3 align-top"><p>{number(v.economy.value)} {v.economy.unit}</p><p>{formatEconomyStatus(v.economy.provenance)}</p>
                    {v.powertrain === 'EV' && <details><summary>Meter-reported charger energy</summary><p>{v.chargerEnergy.valueKWh === null ? 'No metered charging data yet' : `${number(v.chargerEnergy.valueKWh)} kWh · ${formatEconomyStatus(v.chargerEnergy.provenance)}`}</p><p>Separate from battery consumption; not a consumption denominator. {v.chargerEnergy.sampleCount} meters · {number(v.chargerEnergy.coverageKm)} km</p></details>}
                </td>
                <td className="p-3 align-top"><p>{number(v.economy.coverageKm)} km · {v.economy.sampleCount} samples</p><p>{formatEconomyStatus(v.economy.quality)}</p></td>
                <td className="p-3 align-top"><p>{amount(v.cost.amount)}</p><p>{formatEconomyStatus(v.cost.provenance)}</p></td>
                <td className="p-3 align-top"><p>{money(v.cost.value)}</p><p>Coverage {number(v.cost.coverageKm)} km · {v.cost.sampleCount} samples</p>{v.cost.value !== null && (v.cost.coverageKm < v.distanceKm || v.unknownAssignments > 0) && <p>Partial cost coverage</p>}</td>
                <td className="p-3 align-top"><p>{v.manufacturerReference === null ? 'Not recorded' : `${number(v.manufacturerReference)} ${v.economy.unit}`}</p><p>Reference only; not an observed baseline.</p></td>
            </tr>)}</tbody></table></div>
        </>}
    </section>;
}
