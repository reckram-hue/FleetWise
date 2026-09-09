# Vehicle economy foundation — conservative methodology

This package calculates an active-admin-only, read-only projection on demand. It makes no production writes, performs no migration or backfill, adds no scheduled jobs, and does not update vehicle current-consumption fields. It is a vehicle observation foundation, with driver scoring, rankings, replacement economics and total ownership cost deferred.

## Source audit

| Source | Finding and treatment |
| --- | --- |
| `refuelRecords` | Current authoritative ICE capture is `logRefuelWithSession`, linking vehicle, driver, shift and assignment. Existing date, odometer, litres and fuel cost do not prove a full tank or duplicate/correction status. Only explicitly eligible new captures enter full-to-full calculations. |
| `fuelLogs` | No current source references found. Deployed existence, original migration history and whether it was superseded remain **UNVERIFIED**; no cloud schema assertion is made from a local source audit. |
| `vehicleAssignments` | COMPLETED intervals with finite nonnegative odometer endpoints and valid ordered timestamps supply vehicle distance. Existing driver-distance helpers have a legacy shift fallback; this engine never calls that fallback or consumes shift distances. |
| `chargingSessions` | Mid-assignment sessions contain SOC, optional reported charger energy/cost and location snapshots. Historical estimates used generic capacity without a preserved usable-capacity source. Such historical estimates are not authoritative here. |
| `chargingEvents` | Return-for-charging custody lifecycle is separate. Closing a custody event does not prove delivered energy. These events contribute neither energy nor cost; their exclusion is reported. |
| `chargeRecords` | Legacy API/type remains; direct writes are denied by existing rules. It is not a metrics source. |
| Vehicle fields | `batteryCapacityKwh` has ambiguous gross/usable semantics. Manufacturer and manually editable baseline/reference fields are not observations. No authoritative writer for `currentFuelConsumption` / `currentEnergyConsumption` was identified. None are consumed. |
| Mock/default statistics | `getVehicleStats` and its placeholder/default distance/energy values are not consumed. |
| Currency | Existing capture convention is ZAR/R; no existing settings currency model was found. New capture stores ZAR explicitly. Historical missing currency is not silently supplied to the engine. |

This is source and local synthetic/emulator verification. Live collection contents and deployed schema were not inspected for this package.

## Period, distance and attribution

Trailing 30 and 90 days use exact elapsed-day UTC cutoffs; ALL uses all valid history. An assignment must lie wholly within the selected period. Boundary-crossing intervals are excluded rather than apportioned. ICE full-to-full boundaries must also lie within the period. The response includes period start/end and calculation time; display dates use the viewer's locale.

Distance is `endOdometer - startOdometer` on completed assignments. Zero distance is valid distance but never a rate denominator. Missing, negative, nonfinite, time-reversed, overlapping or duplicate assignments are not repaired. Contradictory time/odometer ordering rejects both affected assignments. Unknown/invalid intervals are counted separately, so known kilometres do not imply complete history. There is no cross-vehicle shift subtraction or shift fallback.

TEST filtering defaults off and inherits explicit TEST status from drivers, vehicles and assignment parents as well as individual records. A TEST fill or charge cannot simply be subtracted out of an otherwise genuine consumption balance: it invalidates that balance. Include TEST / QA is an explicit admin option, with no data deletion. Missing historical flags are not rewritten; filtering follows the existing explicit-TEST policy.

## ICE full-to-full

New captures explicitly record `fillLevel: FULL | PARTIAL | UNKNOWN`, default UNKNOWN. The old safety checklist is not evidence of historical tank state. No historical FULL values are inferred.

An eligible chain starts at an explicitly FULL fill and ends at the next defensible FULL fill. Consumption is the sum of every intervening PARTIAL fill plus the closing FULL fill, divided by the exactly covered assignment kilometres, multiplied by 100. The opening fill's litres and cost are excluded. Example: FULL at 0 km, PARTIAL 10 L at 100 km, FULL 20 L at 300 km gives 30 L / 300 km = 10 L/100 km.

Each contributing record must have explicit ACTIVE capture status, version 1, a unique capture request ID, finite positive litres, valid date/odometer and matching assignment/vehicle/driver/shift ownership. Duplicate request IDs, duplicate odometers, conflicting timestamps, unknown fill states, missing correction status, invalid data or excluded TEST records break the chain. Cancelled, superseded and duplicate-marked records are not counted or guessed through. An undated vehicle refuel prevents locating a safe chain; the vehicle remains insufficient. Completed assignments must cover the odometer span exactly once, without gaps or overlap.

These are driver-reported full boundaries and quantities, marked MEASURED as an evidence category, not independently certified fuel measurements. Unrecorded fills cannot be detected from absent evidence. Unknown chains return INSUFFICIENT_DATA, never a manufacturer or default substitute.

## EV battery energy and capacity

`usableBatteryCapacityKWh` and `usableBatteryCapacitySource` are explicit optional vehicle settings. Both a positive value and a nonempty source are required for new assignment snapshots. Admins should cite evidence explicitly identifying usable capacity. The old `batteryCapacityKwh` remains reference data and is never automatically copied or reinterpreted.

New assignments preserve `usableCapacitySnapshot: { valueKWh, source, recordedAt }` and `energyCaptureVersion: 1`. Mid-shift charging sessions inherit that exact assignment snapshot, so later vehicle edits do not change a historical estimate. Missing capacity at assignment start stays unknown even if a capacity is later entered. Every returned battery estimate exposes the value, source, snapshot time and ESTIMATED provenance.

Battery consumption over an eligible assignment is:

`usable capacity × (start SOC - end SOC) / 100 + sum(usable capacity × each charge SOC gain / 100)`.

This represents estimated energy used by driving and vehicle systems, not traction-only energy. It assumes SOC fractions map approximately to usable capacity; temperature, degradation and SOC resolution can affect accuracy. All arithmetic uses unrounded values; rounding occurs at display only. The existing stored charge-gain helper still rounds its display estimate, but the metrics engine recomputes from raw SOC and snapshots.

Charges must be CLOSED, explicitly ACTIVE/versioned, match the assignment's ownership and capacity source/value, have valid SOC, odometer and ordered non-overlapping timestamps inside the assignment. Unknown, open, conflicting, TEST-excluded or boundary-spanning charges invalidate the balance. Unlocatable same-vehicle charge records cannot silently disappear. SOC increases outside recorded charging also invalidate it; regeneration or an unrecorded charge is not guessed. Nonpositive energy over positive distance is insufficient.

Reported charger-delivered kWh is a separate MEASURED metric with source `METERED_CHARGER_ENERGY`. It is never substituted for battery consumption: charging losses remain unquantified. It can be shown without usable capacity, provided the meter record itself is valid; overlapping/duplicate meters are not summed. Its coverage kilometres describe associated completed assignments, **not** a denominator converting charger input into driving consumption. Meter records, counts, source and coverage are exposed.

Return-custody `chargingEvents` never enter this balance. No energy is inferred from SOC movement across unknown charging custody, and no return-custody costs are allocated.

## Cost and aggregation

Cost/km is recorded replenishment expense on completely attributable cost-covered intervals, not inventory valuation or total ownership cost.

* ICE requires every partial and closing full fill in an eligible interval to have a finite nonnegative fuel cost and explicit ZAR currency. Opening fill and oil costs are excluded.
* EV requires an eligible energy balance, matching assignment start/end SOC, at least one valid charge, and explicit reported metered energy, reported nonnegative charge cost and ZAR currency for every intervening charge. Equal SOC boundaries avoid valuing an unknown opening battery inventory. This remains a narrow recorded replenishment-expense metric, not proof of charging efficiency or total trip cost.
* Explicit zero cost is zero. Missing cost is not free charging. Location tariffs, missing meter readings, prices and losses are never invented or multiplied into fabricated costs.
* An interval with missing cost returns `INSUFFICIENT_COST_DATA`. Complete intervals may produce a value over their disclosed cost coverage; uncovered vehicle kilometres are never included in its denominator or represented as zero cost. Partial-period cost coverage is flagged.

EV and ICE totals stay separate: known assignment kilometres and shares, covered battery kWh or fuel litres, sample counts, coverage, weighted per-100-km rates, recorded covered costs and cost/km. Aggregates divide sums by their actual covered distance, never average vehicle rates. Zero known fleet distance yields unknown shares. L/100 km and kWh/100 km are never ranked against each other.

## Projection and data quality

`getFleetEconomySummaryAdmin` requires an active Admin before reading any collection. It returns a method-versioned whitelist containing vehicle identity, period, known distance, unknown interval count, economy/cost/charger metrics, counts, coverage, manufacturer reference, diagnostic reasons and source record references. Driver PINs, session credentials and personal profile data are not returned. User reads select only TEST provenance.

The projection is calculated in memory and does not persist a `vehicleEconomyBaselines` collection. Each source collection is bounded to 5,001 reads; if any exceeds 5,000 records the call fails closed with no partial totals. This is an initial small-fleet implementation. Indexed period queries/pagination or a separately designed materialized projection will be needed beyond that boundary. Separate parallel collection reads are not a historical database snapshot.

Evidence provenance is MEASURED, ESTIMATED, MIXED or INSUFFICIENT_DATA. ICE observations and known assignment distance are measured/report-derived; EV SOC energy is estimated; a vehicle with measured distance and estimated energy exposes MIXED combined provenance while each metric retains its own category. Unknown is never converted to zero energy or cost. Manufacturer values have a separate REFERENCE-only field/display.

Coverage quality stays INSUFFICIENT for zero usable samples and LIMITED for eligible observations. A GOOD/confidence threshold is deliberately deferred: sample volume alone is not evidence of representativeness, and no arbitrary kilometre/sample threshold is introduced. The UI exposes actual counts, covered and known kilometres, unknown intervals and MEASURED/ESTIMATED/MIXED/INSUFFICIENT_DATA provenance. It has no Performing Well/Normal/Poor judgments or statistical-confidence claims.

## Forward schema and compatibility

| Record | Optional additions for future capture |
| --- | --- |
| vehicles | usableBatteryCapacityKWh, usableBatteryCapacitySource |
| vehicleAssignments | energyCaptureVersion, usableCapacitySnapshot |
| refuelRecords | fillLevel, clientRequestId, captureVersion, recordStatus, captureFingerprint, currency |
| chargingSessions | economyCaptureVersion, recordStatus, usableCapacitySnapshot, batteryEnergyProvenance, chargerEnergyProvenance, costProvenance, currency |

Old callers may omit new refuel fields. Their new records remain UNKNOWN/UNVERIFIED and therefore ineligible as full boundaries. A stable request ID gives new clients an immutable refuel record, enforced by a Firestore transaction and canonical payload fingerprint. Concurrent retries with the same request ID return one saved record; changed details under the same ID are rejected. The UI freezes the in-memory payload for retry and blocks duplicate clicks. This is not durable browser-refresh recovery; reloading loses that in-memory pending request. Existing active-session/assignment authorization still applies on retry, including after assignment closure.

No correction UI or destructive deduplication is introduced. Old correction status is unknown, not assumed ACTIVE. Future corrections require explicit audit semantics; cancelled/superseded records presently break a chain conservatively. No rules, indexes, Firebase/Vercel environment configuration, production data or protected migration script are changed.

Source references retain the seam for later driver-relative work: assignment → vehicle period baseline → eligible consumption interval. A future package must define allocation, comparable conditions, uncertainty and driver policy before producing deviations or rankings. This package produces none.

## Validation and manual verification

Pure tests cover both backend copies: full-to-full with partial fills; UNKNOWN historical state; duplicate, invalid and correction rejection; explicit usable capacity; missing capacity; one/multiple mid-shift charges; meter/battery separation; return-custody exclusion; TEST parents; assignment-only distances; period boundaries; insufficient energy/cost; weighted aggregates and measured/estimated/mixed provenance.

Emulator tests exercise real collection joins, active-admin authorization, TEST inclusion, whitelisted responses, concurrent refuel capture and changed-payload rejection. Lifecycle tests call the real capture handlers and verify that assignments/sessions retain explicit capacity snapshots, that generic capacity stays ineligible and that old refuel clients remain UNKNOWN. All use local Firestore plus synthetic storage/auth doubles; no production operations are needed.

UI behavior tests exercise units, manufacturer separation, unknowns, period/TEST requests, loading/failure/retry and immutable refuel submission. The local browser fixture disables application cloud APIs and supplies synthetic data. Its Economy screen supports desktop and an actual 375px iframe for mobile verification.

Future exact-preview checklist, after separately authorized deployment:

1. Sign in as active Admin; open Fuel Economy; verify 30/90/ALL, TEST off by default, distinct units and coverage, manufacturer reference, honest unknowns and calculation provenance.
2. Verify historical refuels/capacities remain unknown without any migration. Check empty/error behavior and permission denial for driver/inactive Admin.
3. In a designated TEST workflow only, capture FULL/PARTIAL/FULL with completed assignments and confirm complete litres/cost coverage. Retry one request to verify no duplicate record; check UNKNOWN breaks an interval.
4. Enter explicitly evidenced usable capacity on a designated TEST vehicle, start a new assignment, and inspect the snapshot. Verify a charge retains it after a vehicle-setting change; verify a no-capacity assignment stays insufficient.
5. Check mid-shift energy balance and reported meter/cost separation; return-for-charging must remain excluded. Confirm mobile layout and no ranking/judgment labels.

These future deployed checks are not claimed as run. Local build/typecheck/test and browser results are recorded in the completion report.

## Future release scope — not executed

JHB functions requiring future deployment: `getFleetEconomySummaryAdmin` (new), `startVehicleAssignment`, `startChargingSession`, `endChargingSession`, `logRefuelWithSession` (changed). The legacy `functions` code has matching behavior. Frontend redeployment is required. No schema migration, backfill, rules/index deployment or environment change is required. Coordinate backend availability before the new frontend calls the new endpoint. Production remains untouched by this package.

## Completion evidence

Validation on 9 September 2026:

* 98 pure calculation tests across both backends pass.
* 101 selected UI, contract and backend regression checks pass in the final set (including 3 economy UI behaviors and 7 port-parity checks).
* 6 economy Firestore emulator checks and 42 lifecycle emulator checks pass. Emulator projects/data are synthetic; repeated economy runs use isolated namespaces.
* Both maintained backend TypeScript builds, frontend Vite build and frontend-only TypeScript pass. The Vite build reports the existing large-bundle warning.
* Root `npm run typecheck` reports only the two pre-existing errors in `functions-jhb/src/index.ts` at lines 743 and 888; those are untouched.
* `git diff --check` passes.
* The isolated local browser fixture was visually checked on desktop and at 375px width. Period selection, TEST inclusion and expanded capacity provenance were exercised. The synthetic EV displays 10.0 kWh/100 km, ESTIMATED, with its 50 kWh source snapshot; unsupported ICE economy and costs remain insufficient. This is not a deployed-preview or production sign-off.

The single local commit is `feat: add vehicle economy metrics foundation`; its immutable hash is supplied in the completion response. No push or deployment is performed. The only expected remaining untracked file is the pre-existing protected `scripts/drift-check-jhb-migration.mjs`, which is untouched and excluded from the commit.

Exact 24-file commit manifest, relative to `C:\Users\User\Projects\FleetWise`:

```text
docs/vehicle-economy-foundation.md
functions-prod-jhb/src/economyApi.ts
functions-prod-jhb/src/economyMetrics.ts
functions-prod-jhb/src/index.ts
functions-prod-jhb/src/refuelCapture.ts
functions-prod-jhb/test/portParity.test.cjs
functions/src/economyApi.ts
functions/src/economyMetrics.ts
functions/src/index.ts
functions/src/refuelCapture.ts
src/components/admin/FuelEconomyMonitor.tsx
src/components/admin/ManageVehicles.tsx
src/components/driver/LogRefuelForm.tsx
src/services/economyApi.ts
src/services/firebaseApi.ts
src/types.ts
test/admin-operations-preview/main.tsx
test/admin-operations-preview/mocks.ts
test/admin-operations-preview/vite.config.mjs
test/driverLifecycle.emulator.test.cjs
test/economy.emulator.test.cjs
test/economyMetrics.test.cjs
test/economyUx.test.cjs
test/uiHarness.cjs
```
