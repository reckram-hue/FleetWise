# FleetWise release-readiness evidence and identity package

Date: 2026-09-08. Branch: fleetwise-v2. Starting commit: ebf41bdbf0dec991f8c09775c3174a5d231cf937.

## Outcome and scope

Implemented private server-mediated accident and defect evidence delivery, vehicle identity presentation and new accident/defect snapshots, TEST defect filtering, Firebase-backed admin refresh restoration, truthful economy unknown states, and bounded release polish. No push, deployment, migration, live business-data writes, rule changes, public Storage grants or IAM changes were performed. The protected migration script was not read, modified, staged or committed.

## Accident photo diagnosis: what is and is not proven

The supplied walkthrough observed successful upload and persisted photo metadata, followed by the same view failure for driver and admin. The request reached Johannesburg getAccidentPhoto. Source used bucket.file(storedPath).getSignedUrl for a five-minute read URL; the frontend suppressed all failures behind a generic retry message. Production bucket initialization explicitly targets fleetwise-prod-jhb.firebasestorage.app, shared by upload and retrieval. Upload builds accident-reports/{orgId}/{reportId}/{uploadId}.{extension}; retrieval resolves the attachment in that report and validates its prefix.

This confirms the signing dependency and the poor error visibility, but does NOT establish that deployed signBlob IAM is the exact root cause. No live Firebase logs, service-account permission inspection, or independent live object metadata read were available. The actual persisted object existence/path and deployed storage.objects.get capability remain unverified. Browser image CORS is not established as a cause: the observed failure was at the callable/view request. These limits must not be represented as a proven IAM diagnosis.

## Secure evidence delivery

getAccidentPhoto now returns validated private image bytes as imageDataUrl through the authorized callable, avoiding signed URLs, download tokens and direct browser-to-Storage reads. The owner must pass an active driver session; an admin must pass the existing active-admin contract. The request contains report/photo IDs, never an arbitrary path. The server chooses a report attachment, validates path linkage, checks metadata size, pins object generation when available, bounds its read, validates PNG/JPEG/WebP signatures and verifies the accident attachment SHA-256. Maximum raw image size is 5 MiB. Missing, invalid and unavailable evidence produce distinct safe errors; diagnostics omit object paths and credentials.

getDefectPhotoAdmin requires active-admin authorization and accepts only defectId/photoIndex. It resolves the stored attachment and checks the vehicle-defects path, vehicle linkage and driver filename prefix. Legacy embedded raster data is validated under the same size/type policy. Manage Defects opens a read-only detail with captured fields, registration, TEST badge, evidence and support references. Existing explicit status/assignment actions remain separate. Neither viewer writes report fields or evidence.

The delivered bytes stay in component memory, with no public or reusable Storage URL. As with any authorized image display, a recipient can retain bytes already received. This is private delivery, not revocable access to already-downloaded content.

## Identity policy and audit

A central formatVehicleIdentity helper prefers historical registration snapshot, resolved event registration, then live registration. Make/model/alias provide secondary context; a name is a fallback and an explicitly labelled shortened vehicle reference is last resort. Database vehicleId relationships remain unchanged.

Updated: accident draft discovery, accident list/detail, defects list/detail, incident/fine/damage/discrepancy labels, cost rows, dashboard critical defects and service dialogs/lists. Full report, vehicle, driver, assignment and shift IDs remain inside labelled diagnostic details where useful; search can still match internal references.

Inspected inspection/pickup/return UI, charging and refuelling forms, current driver dashboard, printable reports, vehicle maintenance history and leaderboard. Existing operational vehicle labels already use registration and remain intact; leaderboard is driver-based. This package does not add separate charging/refuelling history screens or mechanically replace database keys and request payloads.

## Snapshots and TEST provenance

New accident drafts and session-authenticated defects receive vehicleRegistrationSnapshot and vehicleDisplayNameSnapshot from authoritative server vehicle documents. Client snapshot values cannot override them. Legacy records use live lookup at read time; nothing is backfilled. Snapshots for chargingSessions, chargingEvents, refuelRecords, vehicleInspections, vehicleAssignments and legacy damages are deferred to avoid lifecycle/schema churn. If an old vehicle no longer exists, the explicitly labelled short reference remains available.

Manage Defects excludes isTestData===true by default and exposes an Include TEST defects checkbox. For records with a missing marker only, an explicitly marked parent driver or vehicle establishes TEST provenance. Explicit false remains authoritative; names such as Test Test are never guessed. Summary counts use the same status/urgency/QA-filtered rows. QA records and duplicate profiles are preserved.

## Admin trust and bounded polish

App startup waits for Firebase authStateReady and calls the existing server-validated getAdminProfile before restoring a role=admin, employmentStatus=Active profile. No stored profile grants admin access. Existing driver restoration keeps priority. Admin logout now signs out Firebase before clearing the app role, preventing refresh resurrection. Callable authorization is unchanged.

Economy measurements that are missing, non-finite or non-positive remain null; undefined comparisons show Unknown/Insufficient Data. Only vehicles with current and baseline measurements enter healthy/attention counts. ICE L/100km and EV kWh/100km remain separate. No baseline engine or driver scoring was implemented.

Telegram renders a deferred notice without localhost calls; driver link and vehicle sync controls are disabled. Admin password visibility uses an accessible eye toggle without changing its value. Active-shift elapsed time clamps future/invalid dates to zero. The driver safety card explicitly bounds its legacy damage/fine metric and says accident reports are separate.

## Test evidence

- 30 passing accidentReporting.emulator tests: both compiled backends, real Firestore transactions, injected Storage double. Covers ownership/active admin denial, private bytes when signing throws, arbitrary path rejection, missing/corrupt evidence, defect evidence, server snapshots/spoof prevention, historical recovery, concurrency, submission and upload immutability, and mixed TEST provenance.
- 70 passing focused frontend/regression tests across releaseReadiness, accidentReportingUx, adminChargingSettings, driverDefectUx, pickupInspectionUx, driverUx and convertTimestamps. Executes components with a controlled hook harness and API doubles: real App startup and Header logout, password visibility, evidence rendering/error handling, defect QA filters/detail navigation, identity, unknown economy, timer, and existing driver flows.
- 42 passing backend tests across both adminAuthorization files and JHB chargingSession/portParity. Some parity/guard assertions are source invariants; these complement behavioral tests rather than replace them.
- Both functions-prod-jhb and functions builds passed.
- Frontend-only TypeScript passed using tsconfig.frontend.json.
- npm run build passed; existing large-chunk warning remains. The initial sandbox attempt failed on filesystem access during Vite config resolution; the approved retry succeeded.
- Root npm run typecheck reports only the known TS2345 baseline errors at functions-jhb/src/index.ts:743 and :888. That backend was not changed.
- git diff --check passed.

Storage tests are a double, not a live Storage/IAM test or a Storage emulator. The browser layout and real Firebase auth refresh of this new package still require the following Preview checks. No claim is made that the existing deployed Preview contains these changes.

## Manual Johannesburg Preview checklist (pending deployment)

1. Release frontend and affected functions together: getAccidentPhoto changes response contract from url to imageDataUrl. Old frontend and new backend must not be treated as a compatible combination.
2. As Test Test, open the existing submitted QA accident and render every attachment. Refresh and repeat. Confirm immutable fields and evidence.
3. As active admin, Reports → Incidents → Accident Reports, include TEST, open the same report and view photos. Test another driver's denial using the callable without altering live reports.
4. Manage Defects: default list/counts exclude explicitly marked QA records; enable QA and check rows/counts/TEST badges. Open existing QA evidence and confirm missing evidence has a clear error.
5. Verify registration in drafts, reports, defects, costs and service dialogs, including a legacy record. Exercise snapshot rename/deleted-vehicle cases only in an emulator or dedicated disposable QA fixture.
6. Sign in as admin, refresh #/admin and confirm restoration. Log out and refresh to confirm no restoration. Inactive/non-admin denial should be checked with dedicated QA accounts.
7. Check unknown economy values remain Insufficient Data and are not counted Performing Well; confirm ICE/EV units.
8. Open Telegram and disabled link/sync controls; verify no localhost request. Exercise password keyboard toggle, non-negative timer and bounded safety wording.
9. Smoke-test pickup, Report Fault, charging/return guard, vehicle swap, return damage flow, shift end and historical accident draft completion using explicitly flagged QA entities only.

## Deployment requirements and remaining limits

No deployment was executed. Frontend redeployment is required. Exact JHB callables whose behavior changes and require deployment:

- getAccidentPhoto
- getDefectPhotoAdmin (new)
- reportDefectWithSession
- createAccidentReportDraft
- updateAccidentReportDraft
- getAccidentReportForDriver
- submitAccidentReport
- listAccidentReportsAdmin
- getAccidentReportAdmin

uploadAccidentPhoto is unchanged and need not be redeployed for this diff alone. Both backend source trees are mirrored; production target is functions-prod-jhb in africa-south1. No Firestore rules, Storage rules, indexes or IAM deployment is required by the code changes. Deployed service credentials still need object metadata/read access; verify it before release acceptance. If it fails, inspect sanitized callable logs and scoped object access rather than granting public Storage access.

Other remaining limits: base64 increases payload size by about one third; reads are on demand and capped at 5 MiB raw. New snapshots cover accidents/defects only. Unmarked duplicate test profiles are not inferred or repaired. Historical records without both snapshot and surviving vehicle can show only a short support reference. Existing root TypeScript errors and bundle size warning remain deferred.

## Exact intended commit files

- functions-prod-jhb/src/accidentReports.ts
- functions-prod-jhb/src/defectEvidence.ts
- functions-prod-jhb/src/index.ts
- functions-prod-jhb/src/privateEvidence.ts
- functions-prod-jhb/src/vehicleIdentity.ts
- functions-prod-jhb/test/portParity.test.cjs
- functions/src/accidentReports.ts
- functions/src/defectEvidence.ts
- functions/src/index.ts
- functions/src/privateEvidence.ts
- functions/src/vehicleIdentity.ts
- src/App.tsx
- src/components/admin/AccidentReports.tsx
- src/components/admin/AdminDashboard.tsx
- src/components/admin/FuelEconomyMonitor.tsx
- src/components/admin/ManageCosts.tsx
- src/components/admin/ManageDefects.tsx
- src/components/admin/ManageDrivers.tsx
- src/components/admin/ManageIncidents.tsx
- src/components/admin/ManageVehicles.tsx
- src/components/admin/TelegramDrivers.tsx
- src/components/auth/AdminLogin.tsx
- src/components/driver/AccidentReportEntry.tsx
- src/components/driver/DriverDashboard.tsx
- src/components/shared/AccidentReportDetails.tsx
- src/components/shared/EvidencePhoto.tsx
- src/components/shared/Header.tsx
- src/lib/adminSession.ts
- src/lib/defectVisibility.ts
- src/lib/elapsedTime.ts
- src/lib/fuelEconomy.ts
- src/lib/vehicleIdentity.ts
- src/pages/ActiveShift.tsx
- src/services/accidentApi.ts
- src/services/firebaseApi.ts
- src/types.ts
- test/accidentReporting.emulator.test.cjs
- test/accidentReportingUx.test.cjs
- test/adminChargingSettings.test.cjs
- test/release-readiness-report.md
- test/releaseReadiness.test.cjs
- tsconfig.frontend.json
