# Maintenance and vehicle availability integrity

Implemented locally on `fleetwise-v2`, from baseline `37022caa633d26d9ffb14977f140b31c457af6a1`. This package is not pushed or deployed and does not establish production verification. No live records, migration script, dependency versions, secrets or deployment configuration were changed.

## Domain behavior

| Operation | Authoritative result |
| --- | --- |
| Schedule/book | Saves the existing `scheduledServices` record, workshop snapshot, due/booked information and explicit defect links. Does not change availability. |
| Dispatch | Requires a booked, undispatched service and an idle, non-disposed vehicle. Sets vehicle status to `In Service`, records dispatch actor/time and business date. |
| Complete work | Requires actual completion date, odometer, nonnegative actual cost and work notes. Creates exactly one canonical maintenance record; optionally resolves selected linked defects. Vehicle remains unavailable. |
| Release | Separate admin command with a reason. Makes the vehicle `Active` only after current blockers are checked; marks completed services released. |
| Manual hold/disposal | Separate lifecycle command, never a descriptive edit. Requires no custody/charging. Disposal also requires dispatched work completed. Disposed vehicles cannot be reactivated through this package. |
| Manual maintenance | Creates a durable record with actual evidence and a stable request identity. Rejects a vehicle with an unreleased dispatched service, directing the user to its completion flow. Does not release the vehicle. |

The existing `VehicleStatus` remains the operational availability truth: `Active`, `In Service`, `Repairs`, `Sold`, `End of Life`. The service board distinguishes Scheduled/Booked, In Service, Work Completed/Awaiting Release and Released/Completed. It gives completed legacy returns the awaiting-release label rather than continuing to call them In Service.

Dispatch, completion, release and manual maintenance check both vehicle pointers and open records in assignments, shifts and charging collections. They do not clear or fabricate custody/charging pointers. The existing assignment transaction reads vehicle status; the older `startShift` transaction now rechecks availability inside its transaction as well.

Release fails for any dispatched uncompleted service, any unresolved Critical defect, any unresolved defect explicitly linked to an unreleased dispatched service, or an unconfirmed separate manual hold. An unlinked Low/Medium/High report is not inferred to be a universal operational hold; use explicit service links or the existing manual Repairs/In Service status when it blocks use. Resolving a defect alone never releases a vehicle. Completion of one service never resolves unselected or unrelated defects. Existing unexplained unavailable status requires explicit manual-hold confirmation.

## Field ownership and rules

`vehicleDescriptiveUpdate` uses an explicit allow-list for identity, specification, finance, insurance, tracking, warranty, workshop and licence information. The client sends only those fields plus `updatedAt`, then reloads the current vehicle. Firestore rules independently restrict affected keys to the same descriptive fields.

Ordinary edits cannot change custody/charging pointers, `status`, status date/notes, odometers, embedded history, TEST marker, holds, availability timestamps, release actor/time or other server-owned fields. New vehicles start Active and accept only the documented initial baseline odometers and descriptive fields; pointers cannot be injected during creation. Direct vehicle deletion is denied; the UI directs the owner to Sold/End of Life.

Direct client mutations of defects, scheduled services and maintenance records are denied, including for active admins. Existing admin reads remain available. History subcollections, `maintenanceOperations` and `vehicleMaintenanceLocks` remain server-only under default-deny rules. No client access was broadened. Server commands independently validate the active admin again inside each transaction because the Admin SDK bypasses rules.

## Transaction and replay model

Each command validates a strict payload and reads current related records before writing. Booking uses an expected revision to reject stale edits. Completion writes the service, maintenance record, selected defect resolutions and odometers atomically. Release writes current vehicle state, completed service releases, audit history and its receipt atomically.

Vehicle reads/writes conflict with custody/charging transitions. The server-only per-vehicle `vehicleMaintenanceLocks` document serializes changes to service/defect blockers against release. Driver defect creation also advances this lock. It is deliberately outside the vehicle document to avoid adding a volatile lock counter to the economics evidence fingerprint.

| Operation | Retry identity |
| --- | --- |
| Booking | Service ID, normalized booking fingerprint and revision |
| Dispatch | Service ID and immutable dispatch fingerprint |
| Completion | Service ID and immutable completion fingerprint; maintenance ID `service-{serviceId}` |
| Lifecycle/release | Caller-supplied request ID, vehicle ID, actor and payload fingerprint in `maintenanceOperations` |
| Defect transition | Defect ID, request ID, actor and payload fingerprint |
| Manual maintenance | Actor and request ID; deterministic `manual-{hash}` record and receipt |

Identical dispatch/completion replays preserve original actor, timestamps and recorded cost/history. Conflicting payloads fail instead of overwriting saved evidence. Receipt-based commands preserve request IDs across UI retries. Replaying an old successful release after a new manual hold returns the current vehicle without reapplying the release. Replaying completion after a defect was reopened does not resolve it again. Reload the saved result after an uncertain response; changing details on a consumed identity is intentionally rejected. Reopening a dialog and submitting a genuinely new manual record is a new operation, not an automatic semantic deduplication of all similar work.

## History, defects and downtime

`maintenanceRecords` is the source of truth. The vehicle maintenance modal queries it on every mount and after saves. Service completion and manual maintenance both write this existing collection, with source, vehicle/service linkage, actual date/odometer/cost, actor and server creation time. Embedded `vehicle.maintenanceHistory` is preserved as separately labelled legacy reference only; it is neither appended nor counted as new canonical history. There is no automatic historical backfill or rewrite.

Actual odometers cannot be below authoritative current/last-service readings or existing historical readings in assignments, shifts, refuels, maintenance or charging. Due odometers and estimates never substitute for completion evidence. A historical correction/import with older readings is intentionally outside this command. Service completion writes no `costs` ledger entry, so retries cannot add a second financial representation. Maintenance cost remains on the service and linked canonical maintenance evidence; no new economics sum is introduced.

Booking links only outstanding defects on the same vehicle. Completion resolves only explicitly selected linked reports and stores service/maintenance references. Original description, photos, inspection linkage and driver evidence remain unchanged. Acknowledgement, assignment, resolution and reopening use the existing defect statuses with an append-only `history` subcollection containing actor, timestamp, reason and prior state. Reopening clears current resolution metadata while preserving historical service linkage in the audit. Duplicate marking requires an outstanding original on the same vehicle and cannot hide an unreleased service-linked report.

`dispatchedAt`, `completedAt`, `releasedAt` and their actors record when the system accepted each operation. `sentDate` and `returnDate` are supplied business dates; neither is a fabricated precise event time. `unavailableSince` starts at dispatch/manual hold and survives completion or overlapping holds. Release records the prior interval start in vehicle history before clearing the convenience field; `lastReleasedAt/By` records the release. These facts support future interval calculations, but this package does not create a downtime dashboard or infer missing historical interval starts.

TEST records inherit their parent vehicle marker. Service and defect fleet views exclude TEST by default with explicit opt-in; vehicle management and individual history remain available with TEST labelling. Existing economics source inputs, provenance and readiness/scenario logic are unchanged. Real new odometer/status evidence can legitimately invalidate a prior current-vehicle review fingerprint; historical evidence is not rewritten to improve readiness.

## Validation evidence (local, synthetic)

The two maintained function trees (`functions-prod-jhb` and `functions`) contain identical maintenance implementations. `functions-jhb` remains the unrelated isolated benchmark. The parity contract includes all six new callables and the maintenance implementation.

Both backend compiles and the frontend typecheck passed:

```powershell
node functions-prod-jhb/node_modules/typescript/bin/tsc -p functions-prod-jhb/tsconfig.json
node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.frontend.json
```

Started a fresh real Firestore emulator using the installed Java runtime and cached official emulator jar:

```powershell
& 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot\bin\java.exe' -jar 'C:\Users\User\.cache\firebase\emulators\cloud-firestore-emulator-v1.20.2.jar' --host 127.0.0.1 --port 8090 --project_id demo-fleetwise-maintenance
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8090'
node --test test/maintenance.emulator.test.cjs test/firestore.rules.test.cjs test/driverLifecycle.emulator.test.cjs test/accidentReporting.emulator.test.cjs test/inspectionHistory.emulator.test.cjs test/evidenceReview.emulator.test.cjs
```

Result: **167 passed, 0 failed**, including real cross-document transactions, actual exported backend handlers and real rules evaluation. Auth/Storage cloud side effects are disabled in the handler harness; this is not a deployed callable transport test. An earlier rerun on an already-used emulator had **165 passed, 2 failed** because the existing inspection pagination fixture queries a fixed timestamp without cleaning prior runs. The fresh-emulator run removed that fixture contamination without changing inspection implementation or tests.

```powershell
node --test test/maintenanceUx.test.cjs test/releaseReadiness.test.cjs test/postCutoverUx.test.cjs test/driverDefectUx.test.cjs test/economyUx.test.cjs test/economyMetrics.test.cjs test/evidenceReadiness.test.cjs test/fleetScenario.test.cjs test/fleetScenarioUx.test.cjs test/adminChargingSettings.test.cjs functions-prod-jhb/test/portParity.test.cjs functions-prod-jhb/test/chargingSession.test.cjs functions-prod-jhb/test/adminAuthorization.test.cjs functions/test/adminAuthorization.test.cjs
```

Result: **298 passed, 0 failed**. After the final small form/table refinements, `node --test test/maintenanceUx.test.cjs` passed **5/5** again and frontend TypeScript passed. The initial new UI harness assertions needed whitespace normalization; all failures were corrected.

```powershell
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Production frontend build passes with the existing large-chunk advisory. Root TypeScript reports only the known two TS2345 errors in untouched `functions-jhb/src/index.ts:743` and `:888`; no package errors. Diff whitespace checks pass.

## Browser and adversarial review

The existing local admin preview now has an opt-in loopback-only emulator fixture using the real production maintenance handlers and a dedicated `demo-fleetwise-maintenance-preview` project. Browser requests never select a live project. To reproduce after building the production backend, start the emulator, set `FIRESTORE_EMULATOR_HOST`, run `node node_modules/vite/bin/vite.js --config test/admin-operations-preview/vite.config.mjs --host 127.0.0.1 --port 5187`, and open `http://127.0.0.1:5187/?screen=admin&maintenance=1`.

Browser QA used the synthetic TEST vehicle: booked service -> dispatch -> complete at actual 1,100 km / R123.45 with linked fault unselected -> visible awaiting-release state -> release rejected for the linked fault -> explicit defect resolution -> successful release -> vehicle shows Active at 1,100 km -> canonical maintenance history visible after browser reload/navigation. Desktop completion/error/history layouts and a 375px service view were inspected. The narrow table scrolls horizontally. Assignment rejection and subsequent successful pickup were exercised through real handlers in the emulator suite, not through a cloud driver login. The preview fixture's missing report timestamp/normalization was fixed after browser QA exposed it.

| Adversarial claim | Evidence |
| --- | --- |
| Dispatch prevents a new assignment | Actual assignment handler rejects dispatched vehicle, permits released vehicle; concurrent pickup/dispatch test permits only one winner. |
| Stale admin snapshots cannot corrupt pointers | Rules reject the full stale snapshot and each protected field; the whitelisted edit succeeds and current pointers remain. |
| Completion cannot duplicate history/cost | Concurrent identical calls retain one deterministic record, same actor/time and unchanged cost ledger; changed replay payload fails. |
| Actual evidence cannot be fabricated from scheduling | Required strict actual fields, blank completion inputs, invalid/future/low readings rejected, including a refuel above the current convenience reading. |
| One repair cannot clear another blocker | Explicit selection, unrelated Critical defect and multiple-service tests; browser rejection with unresolved linked Low fault. |
| Completion cannot silently release | Vehicle remains unavailable; release validates current blockers/manual holds; disposed vehicles rejected. |
| History survives reload | Canonical collection query, two fresh UI mounts, real saved record and browser reload/navigation. |
| Existing driver/charging flows remain usable | Driver lifecycle, swap, return/recovery, refuel, accident/inspection/evidence regressions and charging tests pass. |
| TEST remains isolated | Parent-marker propagation, default-off TEST UI and existing economics/scenario/readiness regressions. |

Additional self-review fixes: dispatch/release blocker serialization was moved out of the economics-fingerprinted vehicle; historical odometers were checked because refuel captures do not advance `currentOdometer`; completion replay preserves a subsequently reopened defect; vehicle creation now matches Active-only rules; booking edits retain existing notes; manual maintenance accepts cents and zero odometer; final mobile table has readable minimum width. Existing appointment-reminder notices, due/overdue labels and booked/sent details are retained in the consolidated board, with TEST and completed-work filtering. No remaining package-related test failures were accepted.

## Future release requirements and owner checks

No deployment was performed. A future Johannesburg deployment needs the six new functions `saveScheduledServiceAdmin`, `dispatchServiceAdmin`, `completeServiceAdmin`, `changeVehicleLifecycleAdmin`, `addMaintenanceRecordAdmin`, `transitionDefectAdmin`, plus the changed existing `startShift` and `reportDefectWithSession`. Deploy from the existing `functions-prod-jhb` Johannesburg configuration, not the isolated benchmark or default regional config. Firestore rules and frontend redeployment are required as part of the same coordinated release; old clients using direct service/defect mutations will be denied after the new rules. Deploy callables before enabling the new frontend/rules, then require clients to reload. No migration, new composite index, dependency upgrade or historical rewrite is required by this implementation.

Owner staging/production acceptance after a separately authorized release:

1. Sign in with an active admin and use a designated TEST vehicle/workshop; confirm TEST exclusion from fleet summaries.
2. Schedule, dispatch and confirm a driver cannot pick up the vehicle. Check active custody/charging rejection messages.
3. Complete with explicit actuals and selected repaired defects; reload history and confirm exactly one saved record and unchanged unrelated evidence.
4. Leave one linked/Critical fault or another dispatched service outstanding and confirm release is blocked; resolve it explicitly and release with a reason.
5. Confirm manual holds require acknowledgement, Sold/End of Life remain unavailable, and valid pickup/return/swap/charging/refuel still work.
6. Save descriptive vehicle/licence information from an old browser view while custody changes elsewhere; confirm operational state is preserved.
7. Check authenticated callable transport, deployed rules, real handset layout and owner workflow wording. Those environment-specific checks are not claimed by local QA.

Deferred: provider-neutral telematics, automated defect severity policy, maintenance cost accounting redesign, downtime dashboards, historical correction/backfill/import, bulk cancellation, audit-history viewer, production rollout and the unrelated benchmark TypeScript errors. Original driver photos/inspections and legacy embedded history are retained.
