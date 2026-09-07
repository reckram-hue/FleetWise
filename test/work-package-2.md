# Work Package 2 — driver lifecycle integrity

Local implementation only. No Firebase deployment, live data migration, rule change,
IAM change, Auth change, or push is part of this package.

## Accounting and compatibility

- A completed assignment is the authoritative vehicle interval: finite, non-negative
  `endOdometer - startOdometer`. Zero is valid only when both readings actually equal.
- Completed shifts with any assignment records use those intervals exclusively. A
  missing/invalid/incomplete interval contributes to `unknownDistanceIntervals`, not
  invented mileage. `totalKmDriven` remains the known-distance subtotal for API
  compatibility; it is not a claim that unknown intervals travelled zero kilometres.
- Only a shift with **no** assignment records falls back to its historical start/end
  odometer. Ambiguous historical mileage is not reconstructed or rewritten.
- Personal stats preserve their driver-scoped inclusion policy. Leaderboard still
  excludes flagged drivers and shifts, and now also excludes flagged assignments.
  Broader mixed-provenance/reporting policy belongs to WP3.
- Shift closure stores a compatibility end odometer/SOC only for an exact single
  completed assignment matching the shift's original vehicle/start reading. Multiple
  assignments leave these end fields null; no artificial cross-vehicle odometer or
  redundant distance aggregate is stored. Legacy shifts retain the original contract.
- Ending an already-completed shift or assignment is an ownership-checked no-op.
  Shift/vehicle/user pointers are only cleared when they still belong to that workflow.

## Two independent charging lifecycles

`chargingSessions` means the driver retains the vehicle. Charge start transactionally
reads the current assignment, shift, vehicle, location, and vehicle-scoped session
records. Return reads the same assignment/vehicle and rejects an OPEN session, even
if `activeChargingSessionId` is missing. Thus either transition wins; they cannot
commit a completed assignment plus a newly OPEN session on that assignment.
The frontend disables both return actions while the guard is present and keeps End
Charge accessible, including when a pending return inspection exists.

`chargingEvents` means return/handover for charging. Return creates exactly one OPEN
event in the assignment-closing transaction. The next `startVehicleAssignment`
closes that event in the same transaction as pickup and clears the exact pointer it
read. It records pickup driver/shift/assignment, odometer, SOC, predicted range, and
closure time. The event retains return facts and financial fields unchanged.

Outcome is deliberately `UNKNOWN`: pickup readings alone do not establish whether
charging occurred. Pickup does not mark a bill reconciled or invent energy/costs.
Financial reconciliation remains a separate future operation; a CLOSED event may
legitimately still have financialStatus PENDING. Duplicate pickup requests with the
same current assignment and readings return its existing ID, without closing again.

New return events inherit `isTestData` from the session driver, assignment, or vehicle.
Historical events without that marker remain unmodified: absence means unknown
provenance, not proof of production data. Any later reporting should fall back to
linked return assignment/driver/vehicle flags and retain unknown when unresolvable.

### Exceptional recovery (no new admin UI)

`recoverReturnChargingEvent({ vehicleId, expectedEventId, reason })` requires Firebase
Auth and the existing active-admin profile contract. Reason is 10–500 trimmed
characters. An operator must inspect the exact vehicle/event before requesting it.
No wildcard/prefix discovery or deletion is supported.

It compares the exact pointer inside a transaction, refuses an assigned vehicle or
OPEN mid-shift charge, closes a matching OPEN event with outcome UNKNOWN, and clears
the selected vehicle's pointer. A missing event or a wrong-vehicle pointer can be
cleared, but another vehicle's event is never modified. Existing closed/cancelled
event evidence is not rewritten. Every actual repair creates an append-only
`chargingEventRecoveries/{generatedId}` record with admin UID, reason, timestamp,
event existence/match/prior-state facts, and vehicle/event IDs. Repeating an already
successful recovery reports `repaired: false` and writes no duplicate audit record.
This new collection is already covered by default-deny rules; there is no client
read/write permission or public bootstrap endpoint.

## Durable return and inspection concurrency

`createVehicleInspection` accepts optional `returnFinalization` containing the
existing end-assignment readings, charging choice/details, and transition reason.
The frontend submits it **before** photo uploads/completion. The server validates
it against the assignment and vehicle and stores it separately from evidence.

- Creation is transactional create-if-absent, retaining deterministic boundary IDs.
- While PENDING, the owning driver can revise the draft. Completion checks that the
  draft and exact selected photo paths still equal the version it read/verified.
- Completion freezes damage, intent, retention and selected photo evidence, plus
  the submitted draft. Concurrent duplicate completion returns the first result.
- Every photo still has a unique server-generated permanent Storage path. Its
  metadata is written only by a transaction finding a PENDING owned inspection and
  ACTIVE matching assignment. No delayed upload can replace completed evidence.
- On uncertain failure the new unique object is **not deleted**. It may be orphaned;
  this is preferable to deleting evidence after an uncertain successful commit.
  Orphan retention/reconciliation is a follow-up, not a broad deletion job here.
- A completed historical RETURN lacking a draft may attach its first operational
  draft without modifying evidence. Once attached it is immutable. Missing or
  invalid legacy return intent remains fail-closed and requires operator review.
- Operational state/login summaries carry the draft and finalization status. The
  form restores pending readings; a completed return offers Finalize saved return
  without redoing photos/damage. Legacy completed evidence is read-only while the
  missing readings are entered. Lookup failure blocks form submission until retry.
- Assignment closure uses the frozen draft authoritatively and atomically stamps
  `returnFinalizationStatus: COMPLETED` and `returnFinalizedAt`. It no-ops on a lost
  response retry without duplicating events or disturbing a later assignment.
- If assignment return succeeds but shift closure fails, the active unassigned
  shift retains the existing End Shift retry path. Initial pickup, swapping and QR
  entry routes remain unchanged.

## Validation and limits

Run a locally installed Firestore emulator, without export/import, for the demo
project `demo-fleetwise-wp2-test` on loopback port 18081. Then in PowerShell:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:18081'
npm.cmd run test:lifecycle:emulator
```

The harness rejects a missing/non-loopback emulator host before SDK initialization.
It invokes the real compiled handlers in both production trees with demo Firestore
clients and an in-memory Storage double. Storage timing barriers force the race
orderings; no real bucket or Cloud Auth service is contacted. Synthetic non-test
flags appear only in the demo DB to exercise leaderboard inclusion/exclusion.

The 26 behavioral tests cover both odometer directions (200 km), shift retry,
charging/return exclusion with and without pointers, concurrent charge/return,
return-charging pickup closure, event/recovery retry, admin denial/ownership,
interrupted drafts and returns, late uploads, concurrent completion, exact evidence
binding, legacy draft attachment, unknown intervals and test exclusions.

Validation at preparation:

- Both production TypeScript builds: PASS.
- JHB backend tests: 36 PASS (existing 34 plus 2 mirrored-domain parity checks).
- New lifecycle emulator tests: 26 PASS.
- Existing converter tests: 3 PASS.
- Existing WP1 PIN/authorization emulator tests: 14 PASS, using a separate local
  `demo-fleetwise-pin-test` emulator on loopback port 18082.
- Root typecheck: only pre-existing `functions-jhb/src/index.ts` TS2345 errors at
  lines 743 and 888; benchmark code is untouched.
- Frontend production build: PASS; existing large-bundle warning remains.
- Firestore/Storage rules and indexes: unchanged. New queries use single-field
  equality with in-memory OPEN filtering, not new composite indexes.

The Storage double verifies domain concurrency, not GCS/IAM/network behavior.
Before a later rollout, rehearse initial pickup, swapping, refresh/resume and charge
return on a real mobile browser against an isolated environment. No live/browser
workflow is executed by this package. Existing cloud permissions are unchanged.

## Later rollout scope (not executed)

Deploy backend support before the frontend. JHB callable changes requiring rollout:

- `endShiftWithSession`
- `getDriverStatsWithSession`
- `getLeaderboard`
- `startVehicleAssignment`
- `endVehicleAssignment`
- `startChargingSession`
- `createVehicleInspection`
- `uploadInspectionPhoto`
- `completeVehicleInspection`
- `recoverReturnChargingEvent` (new active-admin-only callable)
- `getDriverOperationalState` and `driverLogin` (shared inspection summary changes)

All 39 prior callables remain; the one recovery callable makes 40 in each production
backend. JHB retains africa-south1/256 MiB/no minInstances. No rules or live data
migration is required. Frontend redeployment is required for the new controls and
recovery view. Do not treat a backend-only rollout as full recovery UI availability.
