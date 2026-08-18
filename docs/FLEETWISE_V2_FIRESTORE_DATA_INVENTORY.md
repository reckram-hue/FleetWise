# FleetWise V2 — Firestore Data Inventory & Preservation

> Work Package 3.5 — READ-ONLY data preservation audit. No Firestore writes were performed.
> Contains no secrets, PIN hashes, tokens, or unnecessary personal data.

## Scope & read-only statement
- This work package performed **zero Firestore writes**. No documents were created, updated,
  deleted, or migrated. No rules/functions/deploys were performed and nothing was pushed.
- **Remote Firestore inspection was NOT possible** in this environment: outbound network egress
  is blocked (all HTTPS connections, including to Firestore, were closed at receive time).
- Therefore this document records the **schema the current application code expects** (from
  `src/types.ts` and `src/services/firebaseApi.ts`) and the **schema the Cloud Functions expect**
  (from `functions/src/index.ts`). Actual stored document counts and the exact fields of real
  records could **not** be verified remotely and are marked "unverified".

## Project identity
- Firebase project ID: **fleetwise-9ab3a** (verified via `.firebaserc` and `VITE_FIREBASE_PROJECT_ID`).
- Firestore database ID: **(default)** (verified: `firebase.json` has no `databases` key).

## Audit date
- 2026-08-18

## Collection inventory (what the code references)
Collections referenced by the active client (`firebaseApi.ts`):

| Collection | Referenced by client | Referenced by Cloud Functions | Likely purpose | Status |
|---|---|---|---|---|
| users | yes | yes | drivers + admins | current |
| vehicles | yes | yes | vehicle records | current |
| shifts | yes | yes | shift records | current (schema conflict — see below) |
| defects | yes | no | defect reports | current |
| costs | yes | no | cost entries | current |
| maintenanceRecords | yes | no | maintenance history | current |
| scheduledServices | yes | no | service scheduling | current |
| driverFines | yes | no | driver fines | current |
| vehicleDamages | yes | no | damage reports | current |
| refuelRecords | yes | no | fuel events | current (unwired — see below) |
| chargeRecords | yes | no | charge events | current (unwired — see below) |
| serviceProviders | yes | no | workshops/providers | current |
| settings | yes | no | app settings | current |
| fuelEconomyAlerts | yes | no | economy alerts | current |
| fw_health | yes (firebaseHealth.ts) | no | health probe | dev utility |
| rateLimits | no | yes | PIN rate limiting | functions-only |

> Actual Firestore collection presence/counts are **unverified** (remote blocked).

## Vehicle schema (from src/types.ts — what the app reads/writes)
Core identity: `id, registration, alias?, make, model, year?, vin?, engineNumber?, bodyStyle?, colour?, fuelType?, vehicleType, status, statusDate?, statusNotes?`
- EV fields: `batteryCapacityKwh?`
- Odometer/service: `serviceIntervalKm?, lastServiceOdometer?, currentOdometer?, freeServicesUntilKm?, maintenanceHistory?`
- Economy: `manufacturerFuelConsumption?, manufacturerEnergyConsumption?, baselineFuelConsumption?, baselineEnergyConsumption?, currentFuelConsumption?, currentEnergyConsumption?, economyVarianceThreshold?, lastEconomyAlert?, economyTrendDirection?`
- Finance/insurance/tracking/warranty: multiple optional string/number fields.
- Service providers: `defaultServiceProviderId?, warrantyServiceProviderId?`
- Licensing: `licenseExpiryDate?, licenseRenewalReminderDays?, lastLicenseRenewalDate?, licenseNumber?, licenseDiscNumber?`

## Driver/user schema (from src/types.ts)
`id, firstName, surname, role, email, idNumber?, driversLicenceNumber?, driversLicenceExpiry?, contactNumber?, driversLicenceImageUrl?, area?, department?, employmentStatus?, employmentEndDate?, pinHash?, pinLastUpdated?`
- Active/inactive representation: `employmentStatus` = `Active | Inactive | Terminated`.
- Driver licence: `driversLicenceNumber?, driversLicenceExpiry?` (string YYYY-MM-DD).
- PIN: `pinHash?` (bcrypt) + `pinLastUpdated?`. **Values never displayed in this audit.**

## Shift schema — CRITICAL CONFLICT (two incompatible schemas)
The repository contains **two different shift schemas**.

### A. Active client schema (src/types.ts + firebaseApi.ts)
`id, driverId, vehicleId, startTime, endTime?, startOdometer, endOdometer?, startChargePercent?, endChargePercent?, status`
- status values: `'Active' | 'Completed'`
- field names: `startTime / endTime / startOdometer / endOdometer`

### B. Cloud Functions schema (functions/src/index.ts)
`driverId, vehicleId, startAt, endAt, startOdo, endOdo, startChargePercent, endChargePercent, notes, status, createdAt`
- status values: `'active' | 'ended'`
- field names: `startAt / endAt / startOdo / endOdo`
- additionally maintains `activeShiftId` pointer fields on the driver `users` doc and the `vehicles` doc.

These two schemas **do not share field names or status values**. See Cloud Function risks below.

## Licensing / expiry data location
- Vehicle licence: stored on the **vehicle** document — `licenseExpiryDate`, `lastLicenseRenewalDate`, `licenseNumber`, `licenseDiscNumber`, `licenseRenewalReminderDays`.
- Driver licence: stored on the **user/driver** document — `driversLicenceNumber`, `driversLicenceExpiry`.
- Consumed by `VehicleLicenseRenewal.tsx` (vehicle) and `ManageDrivers.tsx` (driver).

## Other operational schemas (from src/types.ts)
- **defects**: `id, vehicleId, driverId, reportedDateTime, category, description, urgency, status, location?, photos?, notes?, acknowledgedBy?, acknowledgedDateTime?, assignedTo?, estimatedCost?, actualCost?, resolvedBy?, resolvedDateTime?, duplicateOf?, isVisibleToDriver`
- **costs**: `id, vehicleId, date, cost, category, description`
- **maintenanceRecords**: `id, vehicleId, date, odometer, serviceType, cost, notes?`
- **scheduledServices**: `id, vehicleId, serviceType, dueDate, dueOdometer, isBooked, bookedDate?, bookedTime?, serviceProvider?, reminderSent?, notes?, sentForService?, sentDate?, returnedFromService?, returnDate?, actualCost?, serviceNotes?`
- **refuelRecords**: `id, vehicleId, driverId, shiftId?, date, odometer, litresFilled, fuelCost, oilCost?, notes?` — **note:** `LogRefuelForm` does not currently call `addRefuelRecord` (unwired).
- **chargeRecords**: `id, vehicleId, driverId, shiftId?, date, odometer, kwhAdded, chargeCost, startChargePercent, endChargePercent, notes?` — **note:** `LogChargeForm` does not currently call `addChargeRecord` (unwired).
- **driverFines**: `id, driverId, vehicleId, date, time?, fineType, amount, description, fineNumber?, location?, issuingAuthority?, dueDate?, isPaid, paidDate?, notes?, allocatedAutomatically?, allocationMethod?`
- **vehicleDamages**: `id, vehicleId, driverId, date, damageType, severity, estimatedCost, actualCost?, description, location?, isRepaired, repairedDate?, insuranceClaim, claimNumber?, notes?, photos?`
- **serviceProviders**: `id, name, contactPerson, primaryPhone, secondaryPhone?, email, address, city, province, postalCode, specializations, isActive, notes?, createdDate?, lastModified?`

## TypeScript compatibility assessment
- `src/types.ts` ↔ `firebaseApi.ts`: **COMPATIBLE** (WP3 aligned them; 0 TypeScript errors).
- Cloud Functions shift schema ↔ `types.ts`/client: **INCOMPATIBLE** (different field names + status values).
- Real Firestore data ↔ `types.ts`: **UNCERTAIN** (remote not inspectable; most likely written by the
  active client, so likely **COMPATIBLE WITH OPTIONAL FIELDS**, but this must be verified before WP4).

## Cloud Function compatibility risks (do not deploy/use until addressed)
The Cloud Functions (`startShiftWithPin`, `endShift`, `getActiveShift`, `adminSetDriverPin`,
`driverChangePin`, `validateDriverPin`) expect a **different** shift schema than the client wrote:
1. `startShiftWithPin` writes `startAt/endAt/startOdo/status: 'active'` and sets `activeShiftId`
   on driver + vehicle. Existing client records use `startTime/startOdometer/status: 'Active'`
   and have **no** `activeShiftId` pointers.
2. `endShift` reads `shiftData.status === 'active'` and `shiftData.startOdo`; it would not
   recognise client records (`status: 'Active'`, `startOdometer`), and it clears
   `activeShiftId` pointers that may never have been set.
3. `getActiveShift` looks up `driverDoc.activeShiftId`; a client-created driver has none, so it
   would report "no active shift" even when a client `Active` shift exists.
4. `validateDriverPin`/PIN functions read `pinHash` (same as client) — compatible in principle,
   but PIN validation currently happens client-side; the switch must be done carefully.

**Consequence:** deploying/using these functions as-is would write records the current client
cannot read, fail to find existing records, and could clear pointers inconsistently. WP4 must be
rewritten to either (a) adapt the functions to the client schema, or (b) add read adapters so both
schemas remain readable, **without** destructive migration.

## Data preservation strategy (proposed — NOT implemented)
- **Default principle: existing real records remain in place. Never re-keyed, never deleted.**
- Prefer backward-compatible readers and additive fields over destructive rewrites.
- For the future Shift → VehicleAssignment redesign, keep historical one-vehicle `shifts` documents
  as-is and read them through an adapter; new `vehicleAssignments` documents are added alongside,
  not instead of, existing `shifts`. A shift with no assignments = legacy single-vehicle shift
  (read-only compatibility view).
- Do not rename collections or fields; do not rewrite status values in place.
- Add a `schemaVersion` field to any new document shape going forward.

## Proposed backup/export approach (planning only — NOT executed)
- Recommended method: **Google Cloud Firestore managed export** to Cloud Storage
  (`gcloud firestore export gs://<bucket>/<prefix>`) — the authoritative, restore-capable option.
- Requirements: a Cloud Storage bucket (billing may be required), and the IAM role
  `roles/datastore.importExportAdmin` (or Owner) on the project `fleetwise-9ab3a`.
- Alternative: a read-only script using the Firebase Admin SDK to dump collections to JSON
  (requires a valid service-account key with Firestore read access).
- Restoration: `gcloud firestore import` from the same export prefix.
- **Not initiated** in this work package, per instructions.

## Explicit statement
No Firestore reads could be performed (network egress blocked) and **no Firestore writes were
performed**. This is a static, code-based inventory only. Remote schema/count verification is
required in a network-enabled environment before any migration work begins.
