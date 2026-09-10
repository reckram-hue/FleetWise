# Maintenance and availability integrity

This document describes the maintenance candidate plus its release-blocker remediation, based on commit `522c7adb184a82a19f516b932606c1dfbd9f3e74` on `fleetwise-v2`. Validation below is local and synthetic. No production verification, push, deployment or production data change is claimed.

## Scope and operations

The six admin-only callables are `saveScheduledServiceAdmin`, `dispatchServiceAdmin`, `completeServiceAdmin`, `changeVehicleLifecycleAdmin`, `addMaintenanceRecordAdmin` and `transitionDefectAdmin`. Both maintained implementations (`functions-prod-jhb` and `functions`) remain identical. The isolated `functions-jhb` benchmark is outside this package.

Booking stores the workshop snapshot and explicit defect links. Dispatch makes the vehicle unavailable. Completion records actual work, date, odometer, cost and selected repaired defects in one transaction, leaving the vehicle unavailable. Release is a separate reviewed operation. Manual maintenance records evidence without releasing the vehicle. Disposal remains irreversible through these commands.

`VehicleStatus` remains operational availability truth. Service completion is distinct from operational release. Due odometers and estimated costs never substitute for actual completion evidence. Canonical maintenance records do not create another costs-ledger entry.

## Current hold ownership and revision

The vehicle has one server-owned `maintenanceHold` object: `{ id, source, sourceId, reason, setAt }`. Source is `SERVICE` or `MANUAL`. The existing `manualMaintenanceHold` flag remains a conservative compatibility guard; it cannot grant release authority or substitute for the hold identity.

- Dispatch from Active creates a service-owned hold whose ID is derived from the dispatch operation and whose source ID is the service ID.
- Dispatch while already unavailable retains the existing hold and its reason. Each dispatched service stores that hold's `holdId`. A legacy unavailable vehicle without a hold object gets an explicit MANUAL hold requiring confirmation; historical services are never used to explain its current state.
- A new non-Active lifecycle operation creates a new MANUAL hold tied to its operation receipt, even if the status is already Repairs. A later brake issue therefore replaces the earlier hold identity.
- Completion preserves the current hold and leaves the vehicle unavailable. Completing a legacy dispatched service without current hold metadata creates a conservative MANUAL hold, records the service association and requires explicit confirmation before release.
- Successful release clears the hold, clears the compatibility flag and records release actor/time. Only completed services explicitly associated with the released hold receive `releasedAt`. An arbitrary old completed service never receives ownership of a newer hold.

`lifecycleRevision` increases on every successful dispatch, completion and lifecycle transition. Exact successful replays do not increase it. Booking and defect changes retain the separate maintenance lock mechanism; release checks their current blockers transactionally. Descriptive edits do not change hold identity/revision.

Every lifecycle request, including non-Active transitions, must carry `expectedLifecycleRevision` and nullable `expectedHoldId`. The transaction compares both with the current vehicle before writing. Missing fields reject. The server checks a successful operation receipt first, so replaying a previously successful release returns current state without clearing a subsequently created hold. Stale first-time requests have no receipt and fail the comparison.

The service release UI also sends `releaseServiceId`; the service must be completed and its nonempty hold ID must match the current hold. A refreshed old-service dialog cannot release a newer unrelated hold, even with manual confirmation checked. Vehicle lifecycle is the explicit path for reviewing that newer hold.

Both UIs capture the hold and revision when the approval context opens. A refresh or parent rerender cannot silently rebind an existing draft. The form shows the reviewed reason. After a stale rejection, cancel/reopen and review the current condition. A reason and explicit manual/legacy confirmation are required where applicable.

Lifecycle history records previous hold, previous/new revision, state, actor, reason and downtime start. Dispatch and completion histories record hold association and revision. Identity, service association, state changes and receipts are written transactionally.

## Conservative legacy compatibility

Missing lifecycle revision means revision zero; missing hold means null. These are explicit reviewed expectations, not permission to ignore concurrency. Once a server transition occurs, the revision changes.

An old completed service with `sentForService` but no `releasedAt` does not establish current hold ownership. Its service release action rejects when it has no matching hold ID. An admin can review the vehicle's actual current condition in Vehicle Lifecycle and explicitly confirm a manual/legacy release, subject to all live service, defect and custody checks. Old completed services are not bulk marked released or reinterpreted.

Legacy dispatched work can still be completed, obtaining an explicit conservative hold association, and then released with current-state confirmation. No destructive migration, bulk backfill or mandatory production rewrite is required. Historical completed service rows without ownership may remain labelled awaiting release; that label does not authorize vehicle release.

## Effective duplicate safety

Release evaluates every Critical report and every unreleased dispatched-service link through its Duplicate chain to the effective original. An unresolved original blocks release even when its own raw severity is Low. A set of effective original IDs avoids counting the same issue repeatedly. Resolving that original resolves the effective condition; reopening it restores blocking.

Original severity, description, photos and inspection evidence are preserved. Duplicate relationships and actor/reason are audited. Targets must be outstanding non-Duplicate reports on the same vehicle and cannot be self. Chains can arise when an original is later deduplicated; the outstanding-target rule prevents new cycles, including concurrent attempts through transactional reads. Existing relevant cycles, missing originals and cross-vehicle targets fail closed at release.

A Duplicate cannot be directly marked Resolved: resolve its effective original, or reopen the report to assess and resolve it independently. Reopening removes the current duplicate/resolution metadata and retains prior history. Service-linked reports still require explicit resolution rather than duplicate hiding. An open Critical report blocks independently even when another original has already been resolved. No automated severity downgrade is introduced.

## Current custody and charging

Maintenance never clears or fabricates custody pointers. Any vehicle `activeAssignmentId`, `activeShiftId`, `activeChargingSessionId` or `openChargingEventId` blocks the operation. An open assignment, charging session or return-for-charging event also blocks even if its convenience pointer is missing.

An Active shift's original `vehicleId` is historical after a valid return/swap. It is ignored only when that vehicle has a matching COMPLETED assignment with an end timestamp for the same shift/driver. If the shift has a current assignment pointer, it must resolve to an ACTIVE assignment for the same shift/driver on another vehicle, and that vehicle's assignment/shift pointers must agree. Missing, stale or contradictory relationships reject conservatively. An Active legacy shift without affirmative return evidence still blocks.

This allows start A -> complete pickup/return inspections -> return A -> same-shift pickup B -> maintenance dispatch A. The actual driver and inspection handlers are used in the emulator regression. Held A, a stale A pointer and a missing current assignment are rejected; B remains assigned after A dispatch. Existing return, swap, charging and recovery behavior is unchanged.

## Date-aware manual odometers

Manual maintenance uses its supplied business date, with UTC date boundaries matching existing commands. Future dates reject. `currentOdometer` and `lastServiceOdometer` must be finite nonnegative baselines when present.

Historical entries (before today) require a known current odometer and cannot exceed it. They never lower or advance current odometer. Current-day entries must be at least the current and last-service baselines, as well as same-day known readings, and may advance current odometer.

The transaction reads assignments, shifts, refuels, canonical maintenance, charging sessions and charging events for the vehicle:

| Reading | Business/event time |
| --- | --- |
| Refuel/maintenance `odometer` | `date` |
| Assignment/session `startOdometer` | `startedAt` |
| Assignment/session `endOdometer` | `endedAt` |
| Legacy shift boundaries | `startTime` / `endTime` |
| Charging-event `returnOdometer` | `returnedAt` |
| Charging-event `pickupOdometer` | `closedAt` |

Assignment-aware shift summary odometers are excluded: they cannot reliably be attributed to the shift's original vehicle after a swap. Assignment evidence remains included. Timestamp dates are normalized to UTC; invalid calendar dates are treated as undated evidence.

Every strictly earlier dated reading supplies a lower bound; every strictly later reading supplies an upper bound. A dated vehicle last-service baseline also supplies those bounds even without canonical history. This permits a truthful 1,000 km event between earlier 900 km and later 1,400 km evidence while the vehicle is currently at 1,500 km. Contradictory bounds reject.

Date-only maintenance does not claim intraday order. Same-day historical captures can be inserted without ordering them relative to one another, subject to other bounds and the current ceiling. They cannot replace an existing same-day last-service state. An undated numeric capture allows a historical insertion only at the same reading; otherwise its ordering cannot be established. Current-day entries must be at least all undated captures. Malformed numeric evidence rejects for review. No custody/economy evidence is rewritten.

`lastServiceDate` is stored with new service-state evidence. A historical entry can advance last-service state only if the existing vehicle baseline is dated, is strictly older, no canonical same-day/newer or undated service exists, and the reading does not decrease. A newer, same-day or undated baseline is preserved conservatively. Current-day records use the same no-rollback/no-newer-service conditions but can establish a previously undated baseline. Older canonical records remain visible without changing newer convenience state.

Completion remains a current unavailable-service operation requiring actual odometer at least existing current/service/historical readings. It is not a historical import. Both completion and manual records retain deterministic replay identity, so retries create one maintenance record and no duplicate cost.

## Rules and field protection

Vehicle descriptive writes retain the existing explicit client and Firestore allow-lists. `maintenanceHold`, nested hold fields, `lifecycleRevision` and `lastServiceDate` are excluded, including at creation. Rules tests prove direct admin injection and stale-snapshot replacement fail while permitted descriptive edits preserve server state. No rules text change was needed.

Direct writes to defects, scheduled services and maintenance records remain denied. Histories, operation receipts and maintenance lock documents remain server-only. Active admin authorization is rechecked inside every transaction. Vehicle transactions serialize with pickup/return; the separate `vehicleMaintenanceLocks` document serializes blocker changes without adding a busy counter to the economics vehicle fingerprint.

## Validation commands and results (2026-09-10)

Backend and frontend checks:

```powershell
node functions-prod-jhb/node_modules/typescript/bin/tsc -p functions-prod-jhb/tsconfig.json
node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.frontend.json
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Both maintained backend compiles, frontend typecheck and production build pass. Vite retains its existing large-chunk advisory. Root TypeScript reports only the two known TS2345 errors in untouched `functions-jhb/src/index.ts:743` and `:888`. Diff whitespace validation passes.

Real emulator startup (installed Java and cached official jar; loopback only):

```powershell
& 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot\bin\java.exe' -jar 'C:\Users\User\.cache\firebase\emulators\cloud-firestore-emulator-v1.20.2.jar' --host 127.0.0.1 --port 8090 --project_id demo-fleetwise-maintenance
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8090'
node --test test/maintenance.emulator.test.cjs test/firestore.rules.test.cjs test/driverLifecycle.emulator.test.cjs test/accidentReporting.emulator.test.cjs test/inspectionHistory.emulator.test.cjs test/evidenceReview.emulator.test.cjs
```

Final result: **193 passed, 0 failed, 0 cancelled, 0 skipped**. This includes all five counterexamples, exact stale first submission, concurrent replacement/release, same-hold revision changes, replay after newer holds, legacy adoption, duplicate chains/cycles/reopening, real return/swap, charging, chronology and rules. Tests call actual compiled handlers with real Firestore transactions. Auth/Storage cloud effects are disabled or replaced with in-memory evidence; this does not claim deployed transport verification.

The earlier focused command (`node --test test/maintenance.emulator.test.cjs test/driverLifecycle.emulator.test.cjs test/firestore.rules.test.cjs`) passed 106 handler tests, but cancelled 36 rules tests because rules setup fetch failed during emulator startup. It exited nonzero and was not accepted as complete. The ready-emulator rules-only rerun passed 36/36, and the final full run above passed all suites. An additional dated baseline chronology check and concurrent hold test were added before the final full run.

```powershell
node --test test/maintenanceUx.test.cjs test/releaseReadiness.test.cjs test/postCutoverUx.test.cjs test/driverDefectUx.test.cjs test/economyUx.test.cjs test/economyMetrics.test.cjs test/evidenceReadiness.test.cjs test/fleetScenario.test.cjs test/fleetScenarioUx.test.cjs test/adminChargingSettings.test.cjs functions-prod-jhb/test/portParity.test.cjs functions-prod-jhb/test/chargingSession.test.cjs functions-prod-jhb/test/adminAuthorization.test.cjs functions/test/adminAuthorization.test.cjs
```

Result: **300 passed, 0 failed**. Focused UI/parity command `node --test test/maintenanceUx.test.cjs functions-prod-jhb/test/portParity.test.cjs` passes **14/14**. The UI tests prove both approval contexts retain hold identity/revision across refresh/rerender before first submission and retain request identity on failure. Canonical history reload remains covered.

## Self-QA and second adversarial pass

Self-review added protection against resolving the duplicate itself to erase inherited Critical blocking, dated last-service bounds without canonical history, correct charging pickup `closedAt` chronology, preservation of assignment-aware shift attribution, and audit hold/revision details. Blank EOF whitespace was corrected. The rules startup failure was rerun to completion; no package failure was accepted.

The second pass attempted stale first submissions, replay after a newer hold, refreshed release through an old service, same-hold revision changes, concurrent new hold/release, Critical-to-Low chains, direct duplicate resolution, cycles/missing originals, reopening after resolution, missing/stale custody pointers, impossible historical neighbors, absent dates and service-state rollback. Final emulator and UI results support the stated invariants. Existing completion retries still produce one record, and one service cannot clear another unfinished service or unresolved linked/Critical condition.

Local browser QA used the dedicated `demo-fleetwise-maintenance-preview` fixture at `http://127.0.0.1:5187/?screen=admin&maintenance=1`. It dispatched the TEST vehicle, completed at 1,100 km / R123.45 with explicit repaired-link selection, and opened the hold-specific release form. A second real local handler call created newer brake Hold B. First submission of the old approval, even with manual confirmation checked, visibly rejected as stale. Vehicle Management showed Repairs and the current brake reason. Fresh explicit review of Hold B released successfully; the vehicle showed Active at 1,100 km and canonical history retained the recorded service. Desktop feedback layout was inspected. These are local synthetic checks, not production or real-handset certification.

## Future deployment and migration

No Firebase configuration, indexes, dependencies, Storage rules or function exports change in this remediation. Shared helper changes affect five existing maintenance callables: dispatch, completion, lifecycle, manual history and defect transition. Booking code is unchanged.

A future coordinated release of the entire candidate still needs all six maintenance callables plus the candidate's changed existing `startShift` and `reportDefectWithSession`, the frontend and the candidate's protected Firestore rules. Use the Johannesburg `functions-prod-jhb` codebase/configuration (`africa-south1`, 256 MiB, no warm instances). Do not deploy the isolated benchmark or default-region configuration by mistake.

Deploy the updated callables before enabling the matching frontend and rules, then require client reload. Previous lifecycle payloads without expected hold/revision fail closed and cannot be kept as a fallback. Legacy data remains safe through explicit reviewed transitions; no destructive migration or historical rewrite is required. No new composite index is required by these single-field vehicle queries.

After a separately authorized rollout, the owner must verify authenticated callable transport, deployed rules, designated TEST workflows and actual handset layout. Telematics, historical bulk imports, cost accounting redesign, downtime dashboards, audit viewers and production rollout remain outside this remediation.
