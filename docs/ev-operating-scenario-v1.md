# EV replacement operating-cost scenario — v1

## Scope and source audit

Fleet Economics now offers **Compare with EV** on an ICE row. The selected source and selectable EVs come from the existing admin-only economy response for the current 30/90/ALL period and QA selection. This is an indicative fuel/energy comparison, never a replacement recommendation. Driver scoring remains deferred.

Audited `vehicle-economy-foundation.md`, `fleet-economics-foundation.md`, `evidence-readiness-v1.md`, both identical production `economyMetrics.ts` files, readiness helpers, `FuelEconomyMonitor.tsx`, economy service contracts and vehicle/charging-location types. The existing engine supplies assignment distance, ICE full-to-full litres, EV battery-energy balances, cost coverage, provenance, period, references and purpose-specific readiness. None are recomputed or changed. No placeholder vehicle statistics are used.

The catalogue metadata already passed to Fleet Economics provides make/model when available. Registration and powertrain come from the reporting selection; internal IDs are not vehicle labels. Existing report catalogue metadata excludes TEST entries, so TEST names still render from the economy response even when make/model is unavailable. No additional catalogue scan or backend projection is required.

## Inputs and evidence policy

`ScenarioInputs` records source/target vehicle IDs, planned annual km, explicit ICE and EV input-source choices, energy boundary, fuel price, charging-loss percentage, and a single custom or selected location tariff. The pure result retains the resolved numeric basis, report timestamp, source/target evidence references and fingerprints, selected period/QA state, calculation time, readiness version and independent scenario method `v1`. This trace exists in memory only.

Observed sources require the current purpose-specific **Sufficient for analysis** state, a current review, matching UTC scope date and no hard/confirmation failures. Limited or insufficient observations remain visible with their coverage and provenance, but cannot be selected as a scenario baseline. No additional representativeness threshold or override is introduced.

ICE supports:

- Sufficient whole-period observed ZAR fuel cost/km, preferred when available. Annual cost is that rate multiplied by planned km; no fuel price is inferred. Annual litres are shown only if consumption evidence is independently sufficient.
- Sufficient observed L/100 km combined with an explicit scenario fuel price.
- Explicit compatible manufacturer L/100 km reference assumption with scenario fuel price.
- Explicit user-supplied L/100 km and scenario fuel price.

EV supports sufficient observed FleetWise battery consumption or user-supplied battery/grid consumption. Existing manufacturer kWh/100 km lacks a verified energy boundary: it remains informational and is rejected as a calculation source even if supplied directly to the pure function. Estimated EV evidence retains its provenance and capacity references.

## Annual distance and calculations

V1 accepts **planned annual distance only**, explicitly entered and greater than zero. The existing readiness method concerns covered metric evidence; it does not approve a calendar/run-rate denominator or seasonality adjustment for annualizing activity. Therefore annualized observed distance is rejected even for sufficient consumption evidence. The requested positive annualization test is not applicable until that separate method is approved; tests prove planned distance acceptance and annualized-source rejection. This distinction does not block the planned-distance scenario.

- Annual ICE litres = planned km × selected L/100 km / 100.
- Scenario ICE annual cost = annual litres × explicit ZAR/L; observed-cost mode uses observed ZAR/km × planned km.
- Battery-side annual energy = planned km × battery kWh/100 km / 100.
- Battery-side grid energy = battery energy / (1 − loss percentage / 100).
- Grid-side annual energy = planned km × billed kWh/100 km / 100; no second loss adjustment. Battery energy stays unavailable in grid mode.
- Annual EV cost = grid kWh × selected ZAR/kWh.
- Annual difference = ICE annual cost − EV annual cost; monthly equivalent divides by 12 and per-km difference divides by planned km.

Positive and negative differences are factual and use the same neutral styling. Inputs and energy calculations remain unrounded; monetary display uses ZAR to two decimal places, and quantities display up to two decimals. Binary floating-point precision is not an accounting ledger guarantee. Nonfinite/overflow inputs and outputs fail closed. Consumption and annual distance must be positive; prices may be explicitly zero. Missing input is never zero.

Battery input requires an explicit loss assumption from 0% to less than 100%, without a suggested/default value. Grid input ignores stale loss values and exposes “not applied”. Switching boundary/source clears the form's loss input.

Charging tariffs are fetched once on opening through existing `listChargingLocationsAdmin`. The Admin explicitly chooses a custom ZAR/kWh value or an active location with PER_KWH evidence; explicit FREE maps to zero. Inactive, missing, invalid or PER_SESSION tariffs cannot supply an energy price. No tariff is averaged. The selected location name and value are shown as an assumption, not as historical observed expenditure. An unavailable location list leaves custom entry possible. This uses FleetWise's existing ZAR tariff convention; no tax, rate escalation or charging mix is inferred.

## Presentation, access and persistence

Observed evidence, scenario assumptions and calculated outputs occupy separate labelled panels. Evidence includes source registration, period, distance, economy, cost/km, both readiness states, provenance, sample count, coverage, manufacturer reference and expandable record/capacity references. Results retain their explicit source choices and assumptions. Changing any form input clears old results. Changing report period/QA selection or refreshing evidence unmounts the scenario; closing discards it.

Prominent exclusions appear above the form and with results: vehicle purchase price, finance, depreciation, maintenance, insurance, infrastructure and residual value. FleetWise has not assessed operational suitability; payload, seating, towing, route, duty cycle, range, charging access and downtime require separate assessment.

V1 is deliberately **not persisted**. It performs arithmetic locally and introduces no scenario writes, auth rules, collections or server identity protocol. This avoids adding saved-scenario staleness, immutable audit history and tenant authorization to a small initial calculator. Existing active-Admin authenticated reporting supplies the evidence; both the action and panel additionally check the current active Admin context. Tariffs retain their existing active-Admin callable authorization. UI checks are not a security boundary for arbitrary local maths. Any future saved scenario must revalidate/recalculate server-side and derive org/user/timestamps server-side.

## Future seams and exclusions

Scenario versioning is separate from readiness v1. Source selection is an explicit discriminated choice; a future anonymized cohort source requires a new provenance/evidence contract and must not silently enter as observed vehicle data. No cohort source is currently accepted. A future charging mix can resolve to a separately documented tariff model instead of changing observed evidence.

Capital/TCO work remains separate: purchase/disposal prices, finance, depreciation, maintenance, insurance, infrastructure, residual value, tax and holding period. No placeholder zero fields are included for these. Annualization, EV reference-boundary verification, limited-evidence use, suitability assessment, saving/export and multi-customer benchmarking remain deferred.

## Validation and future Preview checklist

Pure tests cover observed/manufacturer/user ICE sources, missing/limited/stale evidence, observed/user EV battery sources, grid sources, loss boundaries/no double loss, EV manufacturer rejection, tariffs/free/missing rates, positive/negative/zero differences, invalid/overflow inputs, planned km and unsupported annualization, trace immutability, monetary display and active Admin/TEST guards. Frontend tests cover separate panels, disclaimers, explicit source controls, errors, inactive/driver denial, and invalidation of previous outputs. Existing economy/readiness tests remain unchanged and run as regressions.

Validation result: 230 scenario, frontend, economy, readiness and backend-parity tests passed. Frontend build and frontend-only TypeScript passed; the build retains the existing large-bundle warning. Root TypeScript reports only the known functions-jhb errors at lines 743 and 888. No backend code changed, so no backend build/emulator deployment cycle was introduced for this package.

Local browser verification uses only synthetic TEST ICE/TEST EV via the existing isolated fixture with application cloud APIs disabled. The battery example (25,000 km; 10 L/100 km; R24/L; 18 battery kWh/100 km; 10% losses; R2.50/kWh) produces 2,500 L, 5,000 grid kWh, R60,000 ICE cost, R12,500 EV cost and R47,500 annual difference. Switching to 18 billed kWh/100 km with R20/kWh produces 4,500 grid kWh and −R30,000 annual difference. Desktop and 375px form controls were inspected; no console errors observed. No production or Preview runtime verification is claimed.

After a separately authorized frontend deployment:

1. Sign in as active Admin; open Fleet Economics. Confirm TEST excluded, default 90-day period, and ICE-only Compare with EV action.
2. Include TEST / QA; open TEST ICE and select TEST EV. Check registration, source evidence, scope and manufacturer information.
3. With insufficient/limited evidence, verify observed choices are disabled; explicitly enter the battery example above and reconcile all outputs.
4. Switch to billed energy, verify no loss is applied, then test a higher tariff and neutral negative difference.
5. Verify a current sufficiently reviewed synthetic observed source can be selected; stale/missing/cost-incomplete evidence cannot. Never modify genuine vehicles to establish a fixture.
6. Choose an eligible charging location explicitly; check its displayed rate/name. Per-session/missing-rate locations must not be silently converted.
7. Edit an input, change target, change period/QA selection, or close: verify previous results/scenario are cleared as described.
8. Confirm exclusions/suitability text, narrow-screen readability, and absence of recommendation language. Driver/inactive Admin must not access the scenario through app navigation.

Release scope: **frontend redeployment only**. Exact JHB functions requiring future deployment: **none**. No backend source, database schema, configuration, migration or genuine/TEST live record is changed. Existing `getFleetEconomySummaryAdmin` and `listChargingLocationsAdmin` are reused. The protected untracked migration script is untouched. Root TypeScript retains only the known unrelated functions-jhb errors at 743 and 888.

Exact package files:

```text
docs/ev-operating-scenario-v1.md
src/components/admin/EVReplacementScenario.tsx
src/components/admin/FuelEconomyMonitor.tsx
src/lib/fleetScenario.ts
test/fleetScenario.test.cjs
test/fleetScenarioUx.test.cjs
test/scenarioFixtures.cjs
test/admin-operations-preview/mocks.ts
test/admin-operations-preview/vite.config.mjs
test/uiHarness.cjs
```
