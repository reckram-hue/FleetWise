import React, { useContext, useEffect, useState } from 'react';
import { UserContext } from '../../contexts/UserContext';
import api from '../../services/firebaseApi';
import type { EconomyReport } from '../../services/economyApi';
import type { ChargingLocation, Vehicle } from '../../types';
import { calculateFleetScenario, fleetScenarioMethodVersion, locationTariff, observedScenarioAllowed, parseScenarioNumber, scenarioAdminAllowed, scenarioMoney, ScenarioInputs, ScenarioVehicle } from '../../lib/fleetScenario';
import { formatEconomyStatus } from '../../lib/economyPresentation';

const control = 'min-h-11 w-full rounded border border-gray-300 bg-white px-3 py-2';
const number = (n: number | null) => n === null ? 'Not available' : n.toLocaleString('en-ZA', { maximumFractionDigits: 2 });
const sourceLabel = (s: string) => ({ OBSERVED_COST: 'Observed whole-period fuel cost/km', OBSERVED_VEHICLE: 'FleetWise observed consumption', MANUFACTURER_REFERENCE: 'Manufacturer reference assumption', USER_SCENARIO: 'User-supplied consumption' }[s] || 'Not selected');
function Evidence({ vehicle: v, catalogue }: { vehicle: ScenarioVehicle; catalogue: Vehicle[] }) {
    const metadata = catalogue.find(c => c.id === v.vehicleId);
    return <article className="min-w-0 rounded border p-4 space-y-2">
        <h4 className="font-bold">{v.registration || 'Registration unavailable'}{v.isTestData && ' — TEST / QA'}</h4>
        {metadata && <p>{metadata.make} {metadata.model}</p>}
        <p>Period: {v.periodStart || 'Start unavailable'} to {v.periodEnd}</p>
        <p>Eligible observed distance: {number(v.distanceSampleCount ? v.distanceKm : null)} km</p>
        <p>Observed Economy: {number(v.economy.value)} {v.economy.unit}</p>
        <p>Observed operating {v.powertrain === 'ICE' ? 'fuel' : 'energy'} cost/km: {v.cost.value === null ? 'Insufficient cost data' : scenarioMoney(v.cost.value)}</p>
        <p>Consumption evidence: {formatEconomyStatus(v.readiness.consumption.state)} · Cost evidence: {formatEconomyStatus(v.readiness.cost.state)}</p>
        <p>Coverage: {number(v.economy.coverageKm)} km · {v.economy.sampleCount} samples · {formatEconomyStatus(v.economy.provenance)} · {formatEconomyStatus(v.economy.quality)}</p>
        <p>Cost coverage: {number(v.cost.coverageKm)} km · {v.cost.sampleCount} samples · {formatEconomyStatus(v.cost.provenance)}</p>
        <p>Manufacturer reference: {number(v.manufacturerReference)} {v.economy.unit}. Reference only; not an observed baseline.</p>
        {v.powertrain === 'EV' && <p>Reference energy basis not verified; EV manufacturer reference is informational only.</p>}
        {!observedScenarioAllowed(v, 'consumption') && <p>Observed FleetWise evidence is insufficient for use as this scenario’s consumption baseline. Choose an explicit alternative below.</p>}
        <details><summary className="min-h-11 cursor-pointer">Source evidence references</summary><div className="break-words">
            <p>Evidence fingerprint: {v.readiness.consumption.fingerprint} · Method {v.readiness.consumption.methodologyVersion}</p>
            {v.evidence.map((e, i) => <p key={i}>{e.recordIds.join(', ')} · {formatEconomyStatus(e.provenance)}{e.capacityUsed && ` · Usable capacity ${e.capacityUsed.valueKWh} kWh; ${e.capacityUsed.source}; ${e.capacityUsed.recordedAt}`}</p>)}
        </div></details>
    </article>;
}

export default function EVReplacementScenario({ report, source, catalogue, onClose }: {
    report: EconomyReport; source: ScenarioVehicle; catalogue: Vehicle[]; onClose: () => void;
}) {
    const { currentUser } = useContext(UserContext);
    const allowed = scenarioAdminAllowed(currentUser);
    const [locations, setLocations] = useState<ChargingLocation[]>([]), [locationError, setLocationError] = useState('');
    const [input, setInput] = useState<ScenarioInputs>(() => ({ sourceVehicleId: source.vehicleId, targetVehicleId: '', distanceSource: 'PLANNED', annualKm: null,
        iceSource: observedScenarioAllowed(source, 'cost') ? 'OBSERVED_COST' : '', iceLitresPer100Km: null, fuelPricePerLitre: null,
        evSource: '', evKWhPer100Km: null, energyBoundary: '', chargingLossPercent: null,
        tariffSource: '', tariffPerKWh: null, chargingLocationId: '' }));
    const [result, setResult] = useState<ReturnType<typeof calculateFleetScenario> | null>(null);
    useEffect(() => {
        if (!allowed) return;
        let cancelled = false;
        api.listChargingLocationsAdmin().then(rows => { if (!cancelled) setLocations(rows); })
            .catch(() => { if (!cancelled) setLocationError('Charging location tariffs could not load. Enter a custom scenario tariff.'); });
        return () => { cancelled = true; };
    }, [allowed]);
    if (!allowed) return <p role="alert">Active Admin access required.</p>;
    const targets = report.vehicles.filter(v => v.powertrain === 'EV' && (report.includeTest || !v.isTestData));
    const target = targets.find(v => v.vehicleId === input.targetVehicleId);
    const update = (patch: Partial<ScenarioInputs>) => { setInput(old => ({ ...old, ...patch })); setResult(null); };
    const numeric = (label: string, key: 'annualKm' | 'iceLitresPer100Km' | 'fuelPricePerLitre' | 'evKWhPer100Km' | 'chargingLossPercent' | 'tariffPerKWh') =>
        <label className="block">{label}<input className={control} type="number" step="any" min="0" value={input[key] ?? ''} onChange={e => update({ [key]: parseScenarioNumber(e.target.value) })} /></label>;
    const battery = input.evSource === 'OBSERVED_VEHICLE' || input.energyBoundary === 'BATTERY';
    return <section aria-label="EV Replacement Scenario" className="space-y-5 rounded border bg-white p-4 md:p-6">
        <div className="flex flex-wrap justify-between gap-3"><h3 className="text-xl font-bold">EV Replacement Operating-Cost Scenario</h3><button className="min-h-11 underline" onClick={onClose}>Back to Fleet Economics</button></div>
        <div className="rounded border bg-slate-50 p-4 space-y-2">
            <p className="font-bold">Indicative operating energy/fuel comparison</p>
            <p>Excludes vehicle purchase price, finance, depreciation, maintenance, insurance, infrastructure and residual value.</p>
            <p>FleetWise has not assessed whether the selected EV is operationally suitable to replace the ICE vehicle.</p>
            <p>Suitability requires separate assessment of payload, seating, towing, route, duty cycle, range, charging access and downtime.</p>
        </div>
        <p>Scenario method {fleetScenarioMethodVersion} · {report.period === 'ALL' ? 'All eligible history' : `Last ${report.period} days`} · {report.includeTest ? 'Includes TEST / QA' : 'TEST / QA excluded'}. Unsaved scenario; closing or changing the evidence selection clears it.</p>
        <label className="block">Target EV<select className={control} value={input.targetVehicleId} onChange={e => update({ targetVehicleId: e.target.value, evSource: '', evKWhPer100Km: null, energyBoundary: '', chargingLossPercent: null })}>
            <option value="">Choose an EV</option>{targets.map(v => { const c = catalogue.find(c => c.id === v.vehicleId); return <option key={v.vehicleId} value={v.vehicleId}>{v.registration || 'Registration unavailable'}{c ? ` · ${c.make} ${c.model}` : ''}{v.isTestData ? ' — TEST / QA' : ''}</option>; })}
        </select></label>
        {!targets.length && <p>No EVs in this selection. Designated TEST vehicles are available through Include TEST / QA in Fleet Economics.</p>}
        <section aria-label="FleetWise observed evidence" className="space-y-3"><h3 className="text-lg font-bold">FleetWise observed evidence</h3>
            <p>Report calculated {report.updatedAt}. These observations remain separate from the assumptions below.</p>
            <div className="grid gap-4 lg:grid-cols-2"><Evidence vehicle={source} catalogue={catalogue} />{target && <Evidence vehicle={target} catalogue={catalogue} />}</div>
        </section>
        <form onSubmit={e => { e.preventDefault(); setResult(calculateFleetScenario(report, input, locations)); }} className="space-y-4">
            <fieldset className="rounded border p-4 space-y-4"><legend className="text-lg font-bold">Scenario assumptions</legend>
                <p>Planned annual distance is user supplied. Observed annualization is unavailable until a separate methodology is approved.</p>
                {numeric('Planned annual distance (km)', 'annualKm')}
                <label className="block">ICE baseline source<select className={control} value={input.iceSource} onChange={e => update({ iceSource: e.target.value as ScenarioInputs['iceSource'] })}>
                    <option value="">Choose an ICE baseline</option>
                    <option value="OBSERVED_COST" disabled={!observedScenarioAllowed(source, 'cost')}>Observed whole-period fuel cost/km</option>
                    <option value="OBSERVED_VEHICLE" disabled={!observedScenarioAllowed(source, 'consumption')}>Observed consumption with scenario fuel price</option>
                    <option value="MANUFACTURER_REFERENCE" disabled={!(source.manufacturerReference > 0)}>Manufacturer L/100 km reference assumption</option>
                    <option value="USER_SCENARIO">User-supplied ICE consumption</option>
                </select></label>
                {input.iceSource === 'USER_SCENARIO' && numeric('Scenario ICE consumption (L/100 km)', 'iceLitresPer100Km')}
                {input.iceSource && input.iceSource !== 'OBSERVED_COST' && numeric('Scenario fuel price (ZAR/L)', 'fuelPricePerLitre')}
                <label className="block">EV consumption source<select className={control} value={input.evSource} onChange={e => update({ evSource: e.target.value as ScenarioInputs['evSource'], energyBoundary: '', chargingLossPercent: null })}>
                    <option value="">Choose EV consumption</option><option value="OBSERVED_VEHICLE" disabled={!target || !observedScenarioAllowed(target, 'consumption')}>FleetWise observed battery consumption</option><option value="USER_SCENARIO">User-supplied EV consumption</option>
                </select></label>
                {input.evSource === 'USER_SCENARIO' && <>{numeric('Scenario EV consumption (kWh/100 km)', 'evKWhPer100Km')}
                    <label className="block">EV energy boundary<select className={control} value={input.energyBoundary} onChange={e => update({ energyBoundary: e.target.value as ScenarioInputs['energyBoundary'], chargingLossPercent: null })}>
                        <option value="">Choose energy boundary</option><option value="BATTERY">Battery energy used by vehicle</option><option value="GRID">Grid / billed energy including charging losses</option>
                    </select></label></>}
                {battery && <><p>Battery consumption needs extra billed energy to cover charging losses. Enter your assumption explicitly.</p>{numeric('Charging loss assumption (%)', 'chargingLossPercent')}</>}
                {input.energyBoundary === 'GRID' && <p>Charging losses are already included in grid/billed consumption. No additional loss is applied.</p>}
                <label className="block">Electricity tariff source<select className={control} value={input.tariffSource} onChange={e => update({ tariffSource: e.target.value as ScenarioInputs['tariffSource'], chargingLocationId: '', tariffPerKWh: null })}>
                    <option value="">Choose a tariff source</option><option value="CUSTOM">Custom scenario tariff</option><option value="LOCATION" disabled={!locations.some(l => locationTariff(l) !== null)}>FleetWise charging location</option>
                </select></label>
                {locationError && <p role="status">{locationError}</p>}
                {input.tariffSource === 'CUSTOM' && numeric('Electricity tariff (ZAR/kWh)', 'tariffPerKWh')}
                {input.tariffSource === 'LOCATION' && <label className="block">Charging location tariff<select className={control} value={input.chargingLocationId} onChange={e => update({ chargingLocationId: e.target.value })}>
                    <option value="">Choose a location tariff</option>{locations.filter(l => locationTariff(l) !== null).map(l => <option key={l.id} value={l.id}>{l.name} · {scenarioMoney(locationTariff(l)!)}/kWh</option>)}
                </select></label>}
                <p>One explicitly selected tariff applies to all scenario grid energy. No tariff averaging or charging mix is assumed.</p>
            </fieldset>
            <button className="min-h-11 rounded bg-slate-800 px-4 py-2 text-white" type="submit">Calculate operating scenario</button>
        </form>
        {result && !result.ok && <div role="alert"><p>Complete or correct these inputs:</p><ul className="list-disc pl-5">{result.errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
        {result?.ok && <section aria-label="Calculated scenario outputs" className="rounded border bg-slate-50 p-4 space-y-4" aria-live="polite">
            <h3 className="text-lg font-bold">Calculated scenario outputs</h3><p>Indicative operating energy/fuel comparison · ZAR · Scenario method {result.methodVersion}</p>
            <p>Calculated {result.trace.calculatedAt}; source report {result.trace.reportUpdatedAt}. Planned annual distance: {number(result.outputs.annualKm)} km.</p>
            <div className="grid gap-4 md:grid-cols-2"><article className="space-y-2"><h4 className="font-bold">ICE · {source.registration}</h4>
                <p>{sourceLabel(result.basis.iceSource)} · {number(result.basis.litresPer100Km)} L/100 km</p>
                <p>{result.basis.iceSource === 'OBSERVED_COST' ? 'Observed cost/km applied to planned kilometres; no fuel price is inferred.' : `Scenario fuel price: ${scenarioMoney(result.basis.fuelPricePerLitre!)}/L`}</p>
                <p>Estimated annual fuel: {number(result.outputs.annualIceLitres)} litres</p><p>Estimated annual fuel cost: {scenarioMoney(result.outputs.annualIceFuelCost)}</p><p>Fuel cost/km: {scenarioMoney(result.outputs.iceCostPerKm)}</p>
            </article><article className="space-y-2"><h4 className="font-bold">EV · {target?.registration}</h4>
                <p>{sourceLabel(result.basis.evSource)} · {number(result.basis.energyPer100Km)} kWh/100 km · {result.basis.energyBoundary === 'BATTERY' ? 'Battery energy' : 'Grid / billed energy'}</p>
                <p>Charging loss assumption: {result.basis.chargingLossPercent === null ? 'Not applied; already grid/billed energy' : `${number(result.basis.chargingLossPercent)}%`}</p>
                <p>Estimated annual battery energy: {number(result.outputs.annualBatteryKWh)} kWh</p><p>Grid energy required: {number(result.outputs.annualGridKWh)} kWh</p>
                <p>Tariff assumption: {result.basis.tariffName} · {scenarioMoney(result.basis.tariffPerKWh)}/kWh</p><p>Estimated annual EV energy cost: {scenarioMoney(result.outputs.annualEvEnergyCost)}</p><p>Energy cost/km: {scenarioMoney(result.outputs.evCostPerKm)}</p>
            </article></div>
            <p className="font-bold">Indicative annual operating difference: {scenarioMoney(result.outputs.annualOperatingDifference)}</p>
            <p>Monthly equivalent: {scenarioMoney(result.outputs.monthlyOperatingDifference)} · Per-km difference: {scenarioMoney(result.outputs.perKmDifference)}</p>
            <p>{result.outputs.annualOperatingDifference > 0 ? 'EV scenario has lower fuel/energy operating cost.' : result.outputs.annualOperatingDifference < 0 ? 'EV scenario has higher fuel/energy operating cost.' : 'Scenario fuel/energy operating costs are equal.'}</p>
            <p>Excludes vehicle purchase price, finance, depreciation, maintenance, insurance, infrastructure and residual value. Vehicle suitability is not assessed by this scenario.</p>
        </section>}
    </section>;
}
