# Maintenance and availability integrity

This document describes the maintenance candidate and final release remediation, starting from commit `a721b49f2d8d34e0f78caa647e7387b39c164bd4` on `fleetwise-v2`. Validation below is local and synthetic. No production verification, push, deployment or production data change is claimed.

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

Every newly reported defect starts with server-owned `defectRevision: 0`, including inspection-linked reports. Missing revisions on legacy defects are read as zero without rewriting old documents. Invalid stored revisions fail for review. Every authoritative direct transition (acknowledgement, assignment/In Progress, resolution, duplicate, reopen, or a same-status lifecycle update) and completion-driven resolution increments the revision once. History records previous/new revisions; original evidence remains unchanged.

`transitionDefectAdmin` requires both `expectedStatus` and `expectedDefectRevision`. `completeServiceAdmin` requires `expectedDefectRevisions`, with exactly one ID-to-revision entry per selected `resolvedDefectIds` and an empty object when none are selected. Comparisons occur inside the transaction. Thus an approval prepared at Open/revision N rejects after Open -> Resolved -> Open/revision N+2. Status equality alone grants no authority. Successful operation receipts/completion fingerprints are checked before current-state comparisons: identical saved replay returns without resolving a reopened defect or advancing its revision again. Changed replay details reject.

Completion and direct-action dialogs capture the reviewed revision when opened. Completion retains the displayed defect evidence and selection context across refresh; status/assignment dialogs retain their reviewed status/revision. A refresh cannot silently upgrade an old approval. After a stale rejection, close/reopen and review again. Clients omitting revision expectations fail closed; no automatic fresh-revision retry is permitted.

Release evaluates every Critical report and every unreleased dispatched-service link through its Duplicate chain to the effective original. An unresolved original blocks release even when its own raw severity is Low. A set of effective original IDs avoids counting the same issue repeatedly. Resolving that original resolves the effective condition; reopening it restores blocking.

Original severity, description, photos and inspection evidence are preserved. Duplicate relationships and actor/reason are audited. Targets must be outstanding non-Duplicate reports on the same vehicle and cannot be self. Chains can arise when an original is later deduplicated; the outstanding-target rule prevents new cycles, including concurrent attempts through transactional reads. Existing relevant cycles, missing originals and cross-vehicle targets fail closed at release.

A Duplicate cannot be directly marked Resolved: resolve its effective original, or reopen the report to assess and resolve it independently. Reopening removes the current duplicate/resolution metadata and retains prior history. Service-linked reports still require explicit resolution rather than duplicate hiding. An open Critical report blocks independently even when another original has already been resolved. No automated severity downgrade is introduced.

## Current custody and charging

Maintenance never clears or fabricates custody pointers. Any vehicle `activeAssignmentId`, `activeShiftId`, `activeChargingSessionId` or `openChargingEventId` blocks the operation. An open assignment, charging session or return-for-charging event also blocks even if its convenience pointer is missing.

An Active shift's original `vehicleId` is historical after a valid return/swap. It is ignored only when that vehicle has a matching COMPLETED assignment with an end timestamp for the same shift/driver. If the shift has a current assignment pointer, it must resolve to an ACTIVE assignment for the same shift/driver on another vehicle, and that vehicle's assignment/shift pointers must agree. Missing, stale or contradictory relationships reject conservatively. An Active legacy shift without affirmative return evidence still blocks.

This allows start A -> complete pickup/return inspections -> return A -> same-shift pickup B -> maintenance dispatch A, or Driver 2 starting a new shift with A. `startShift` now uses this shared current-custody guard inside its transaction instead of rejecting every Active shift with historical `vehicleId: A`. Driver-level collision protection and fresh Active vehicle status checks remain in place. Held A, In Service/Repairs, stale A pointers, a missing current assignment, and orphan open activity reject. B remains assigned when A is reused.

For `startShift` only, a matching single OPEN return-for-charging event may remain on a returned vehicle. Its vehicle query, pointer, lifecycle state and organization must agree. Starting the shift reserves custody but does not close the event; the existing actual assignment pickup closes it. Active charging sessions and orphan/inconsistent events still block. Both `status` and `lifecycleStatus` open markers remain conservative blockers. Maintenance retains its stricter rule that every open return-charging event blocks.

## Shared maintenance chronology

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

Scheduled completion now uses the same date-aware evidence validator, with its actual completion date constrained between dispatch and today. Completing newer work at 1,500 km on February 1 and then older work at 1,200 km on January 15 is accepted when other evidence permits; an older 1,600 km completion rejects. Later known lower readings supply an upper bound, even when today's numerical maximum is higher. Canonical records keep the supplied factual dates and odometers.

Unlike historical manual insertion, a dispatched service can establish a reading above an outdated current convenience value when dated evidence permits it. Completion writes `currentOdometer = max(existing, actual)` and never rolls it back. It updates last-service state only with a strictly later service date, no same-day/newer or undated canonical service, and no odometer decrease. Backdated completion preserves an existing undated vehicle service baseline because its order is unknown; it may initialize entirely absent service state. Current-day completion follows the same rules as current-day manual evidence. Existing dated newer/same-day state is retained. Both completion and manual records retain deterministic replay identity, so retries create one maintenance record and no duplicate cost.

## Rules and field protection

Vehicle descriptive writes retain the existing explicit client and Firestore allow-lists. `maintenanceHold`, nested hold fields, `lifecycleRevision` and `lastServiceDate` are excluded, including at creation. Rules tests prove direct admin injection and stale-snapshot replacement fail while permitted descriptive edits preserve server state. No rules text change was needed.

Direct writes to defects (including revision injection), scheduled services and maintenance records remain denied. Histories, operation receipts and maintenance lock documents remain server-only. Active admin authorization is rechecked inside every transaction. Vehicle transactions serialize with pickup/return; the separate `vehicleMaintenanceLocks` document serializes blocker changes without adding a busy counter to the economics vehicle fingerprint.

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
& 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot\bin\java.exe' -Xmx512m -jar 'C:\Users\User\.cache\firebase\emulators\cloud-firestore-emulator-v1.20.2.jar' --host 127.0.0.1 --port 8093 --project_id demo-fleetwise-maintenance
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8093'
node --test --test-concurrency=1 test/maintenance.emulator.test.cjs test/driverLifecycle.emulator.test.cjs test/firestore.rules.test.cjs test/accidentReporting.emulator.test.cjs
```

Final result: **190 passed, 0 failed, 0 cancelled, 0 skipped** (268,673.2869 ms). The command includes the complete maintenance, driver lifecycle, rules and accident suites, including 14 new backend cases across both maintained trees. Coverage includes stale first completion/direct resolution after Open -> Resolved -> Open, successful replay after reopen, explicit missing/mismatched revision rejection, legacy lifecycle progression, ordered service history, undated baseline preservation, real second-driver reuse after swap, charging and return-charging. Tests call actual compiled handlers with real Firestore transactions. Auth/Storage cloud effects are disabled or replaced with in-memory evidence; this does not claim deployed transport verification.

Two broader six-file runs (also including `test/inspectionHistory.emulator.test.cjs` and `test/evidenceReview.emulator.test.cjs`) each reported **204 passed / 1 failed** before the final legacy-baseline regression was added. The first failed concurrent maintenance replay with emulator `INVALID_ARGUMENT: Transaction is invalid or closed`; that exact case then passed **2/2** in isolation. The second used `--test-concurrency=1`: all maintenance/driver/rules checks passed, but the concurrent accident draft test failed with an internal operation error. Neither nonzero run was treated as a clean gate. Inspection-history and evidence-review checks passed **17/17** in those runs. The final four-file rerun retains concurrency inside the race tests while running test files sequentially.

```powershell
node --test test/maintenanceUx.test.cjs test/releaseReadiness.test.cjs test/postCutoverUx.test.cjs test/driverDefectUx.test.cjs test/economyUx.test.cjs test/economyMetrics.test.cjs test/evidenceReadiness.test.cjs test/fleetScenario.test.cjs test/fleetScenarioUx.test.cjs test/adminChargingSettings.test.cjs functions-prod-jhb/test/portParity.test.cjs functions-prod-jhb/test/chargingSession.test.cjs functions-prod-jhb/test/adminAuthorization.test.cjs functions/test/adminAuthorization.test.cjs
```

Result: **303 passed, 0 failed, 0 skipped**. Focused UI/parity command `node --test test/maintenanceUx.test.cjs functions-prod-jhb/test/portParity.test.cjs` passes **17/17**, including a rerun after final backend edits. Three new UI cases prove the completion, direct status and assignment dialogs retain reviewed defect revisions across refresh/rerender before first submission. Existing hold approval freshness, canonical history reload and retry identity remain covered. Parity checks now include `startShift`, `reportDefectWithSession` and the shared custody helper.

## Self-QA and second adversarial pass

Self-review corrected a TypeScript narrowing error in the extracted custody helper, retained both legacy open-state markers (`status` and `lifecycleStatus`), and added explicit orphan-marker checks. The second review preserved undated legacy last-service baselines on backdated completion, with a regression proving both preservation and initialization of absent state. The complete diff was reviewed for missed revision paths, replay writes, date-neighbor errors, pointer bypasses, frontend payload mismatch and legacy dead ends. Original descriptions/photos, prior history, duplicate-root safety, hold ownership and explicit release remain intact.

The second pass exercised all 13 requested invariants: stale completion and direct requests reject; fresh reviewed actions work; duplicate/reopen revisions progress; legacy defects adopt revisions; impossible history rejects while plausible older work records; date/current odometer state cannot roll back; returned A can be reused while Shift 1 holds B; held/inconsistent A rejects; maintenance dispatch/completion/release and both charging paths remain intact. Successful saved replay after a later reopen does not resolve that new generation. Existing hold and Critical-root release blockers remain covered.

Local browser QA used the dedicated `demo-fleetwise-maintenance-preview` fixture at `http://127.0.0.1:5187/?screen=admin&maintenance=1`. After dispatch, a completion draft selected a legacy revision-zero linked defect. Independent real handler calls resolved it at revision 1 and reopened it at revision 2. The draft's first submission rejected with the stale-review message. Cancel/refresh/reopen enabled a fresh completion at 1,100 km / R123.45, advancing the defect once to revision 3 and showing Work Completed / Awaiting Release. Explicit release then succeeded. Local readback confirmed Active, current/last-service odometer 1,100, defect Resolved/revision 3 and one canonical record. The form layout was inspected. These are local synthetic checks, not production or real-handset certification.

## Future deployment and migration

The remediation changes these 15 files (no generated build output is committed):

```text
docs/maintenance-availability-integrity.md
functions-prod-jhb/src/index.ts
functions-prod-jhb/src/maintenance.ts
functions-prod-jhb/src/vehicleCustody.ts
functions-prod-jhb/test/portParity.test.cjs
functions/src/index.ts
functions/src/maintenance.ts
functions/src/vehicleCustody.ts
src/components/admin/ManageDefects.tsx
src/components/admin/ServiceManagement.tsx
src/types.ts
test/driverLifecycle.emulator.test.cjs
test/firestore.rules.test.cjs
test/maintenance.emulator.test.cjs
test/maintenanceUx.test.cjs
```

No Firebase configuration, indexes, dependencies, Storage rules or function exports change in this remediation. Shared helper changes affect five existing maintenance callables: dispatch, completion, lifecycle, manual history and defect transition. `startShift` adopts current-custody checks and `reportDefectWithSession` initializes the revision. Booking code is unchanged. No additional function is added to the expected deployment manifest.

A future coordinated release of the entire candidate still needs all six maintenance callables plus the candidate's changed existing `startShift` and `reportDefectWithSession`, the frontend and the candidate's protected Firestore rules. Use the Johannesburg `functions-prod-jhb` codebase/configuration (`africa-south1`, 256 MiB, no warm instances). Do not deploy the isolated benchmark or default-region configuration by mistake.

Use a coordinated administrative write freeze for a separately authorized rollout: deploy/verify the matching callables and protected rules before reopening admin writes with the matching frontend, then require client reload. A frontend preview against a shared production backend is not an isolated staging environment. Previous lifecycle or defect payloads without reviewed expectations fail closed and cannot be kept as a fallback. Legacy data remains safe through explicit reviewed transitions; no destructive migration or historical rewrite is required. No new composite index is required by these single-field vehicle queries.

After a separately authorized rollout, the owner must verify authenticated callable transport, deployed rules, designated TEST workflows and actual handset layout. Telematics, historical bulk imports, cost accounting redesign, downtime dashboards, audit viewers and production rollout remain outside this remediation.
