# WP3 accident / collision reporting

## Source audit and scope

ManageIncidents manages driverFines, vehicleDamages, cost/insurance-claim flags,
analytics and odometer discrepancies. Those records are not roadside driver accident
reports. Vehicle insurance profile fields are not third-party incident evidence.
No partial driver accident-reporting implementation was found. Existing defects,
fines, damage accounting and WP1/WP2 lifecycle logic remain separate and unchanged.

Driver: Active Shift → Accident / Collision → Report Accident / Collision.
Admin: Dashboard → Reports → Incidents → Accident Reports.
The new admin surface is an embedded section, not a new dashboard tile.

## Data and authentication

- accidentReports holds server-derived orgId, driverId, vehicleId, shiftId,
  assignmentId, isTestData, createdByDriverId, createdAt, updatedAt, submittedAt,
  status, revision, lastMutationId, fields and photos.
- accidentDrafts holds only the assignment-to-current-draft pointer. It serializes
  concurrent creation without writing to vehicle, shift or assignment records.
  One unfinished report per assignment; a deliberate later incident can create a
  new report after the previous report is submitted.
- DRAFT and SUBMITTED are the only statuses. Creation still requires the active
  assignment, active shift and matching current pointers. Existing drafts instead
  validate original owner/creator, historical assignment vehicle/shift/org linkage
  and shift ownership; historical state does not need to remain active.
- Driver sessions still require an active account and valid current credentials.
  Owner reads, updates, photo uploads and submission remain available after return,
  swap or shift end. Identity/provenance is never rebound. Dashboard discovery uses
  an authenticated owner query and lists every DRAFT across assignments.
  One unfinished draft per assignment is retained, so multiple historical drafts
  are possible and each row identifies its date, original vehicle and report ID.
- Active-admin callables provide paged listing, detail and photo viewing. TEST
  reports are excluded on the server unless explicitly requested. Detail displays
  driver name/registration plus authoritative IDs and audit timestamps. Current
  app admin authorization is single-tenant, matching existing admin callables.

## Required versus optional information

Final submission requires incident date/time, typed location, narrative, explicit
injury indication (YES/NO/UNKNOWN) and acknowledgement that details may be incomplete.
Date/time defaults to server creation time and can be corrected. No acknowledgement
is preselected. No unanswered yes/no value is converted into false.

Police/reference, emergency attendance, GPS, other driver/contact/licence details,
other vehicle, owner, insurer/policy/claim/insured party, witnesses, damage and
vehicle condition are optional. Tri-state fields retain UNKNOWN or an unanswered
null/absent value. GPS is a one-time, user-requested browser lookup with typed
location available after permission denial. Up to 20 witnesses are supported.

## Draft, retry and evidence integrity

- The six steps cover basics, other party/vehicle, insurance/witnesses, damage,
  photos, and review. Save Draft remains accessible; text autosaves after edits.
- Browser recovery is best-effort: failed reads/writes/cleanup never block server
  saving, submission or read-only display. A non-blocking warning identifies when
  unsaved refresh recovery is unavailable. Pending retry identity stays in memory.
  Session credentials also remain in this tab if browser storage fails; explicit
  logout clears that fallback. Server authorization continues on every request.
- Local recovery text is scoped to project/driver/report and supplements the
  server draft. No credential is copied into recovery records. It preserves edits
  made before autosave and exact pending mutation IDs across lost responses.
- Revision checks reject concurrent stale edits. Recovery offers an explicit
  server-version reload that discards local text only when the user selects it.
- Submitted reports are immutable in the driver API. Repeated submit returns the
  original report and submittedAt without creating another document.
- Optional photos use server-authorized uploads: JPEG/PNG/WebP MIME and signature
  checks, decoded size 1 byte–5 MB, at most 20 photos, unique Storage object paths,
  create-only generation precondition, report/driver/vehicle/hash metadata.
- Firestore stores Storage paths and metadata, never photo bytes or data URLs.
  Photo retry IDs deduplicate attachments. Attachment and submission transactions
  serialize on the report; an upload losing to submission cannot attach or replace
  submitted evidence. Existing linked objects are never overwritten or deleted.
- Reads authorize the report and its photo ID, validate the stored report prefix,
  and issue a five-minute signed read URL. No public download token is created.
- Reporting does not create a defect, return, charge, shift end or vehicle status
  change. Not-driveable reports are highlighted; recovery operations are deferred.

## Manual Preview acceptance — not executed by local tests

Use Preview test drivers/vehicles. Check both desktop and a narrow mobile viewport.

- A. Start from an active assignment. Accident / Collision is distinct from Report
  Fault; context is fixed to the actual assignment and current vehicle.
- B–D. Enter a partial narrative, save, leave, refresh, and Resume Report. Also
  refresh immediately after typing and interrupt a save response. Text survives;
  retry does not create another draft. Check the server-saved confirmation.
- E–H. Enter other driver/vehicle/owner and insurance details. Leave police
  reference absent. Add one witness, remove it, and verify zero witnesses works.
- I–J. Submit once without photos. On another report, upload one and multiple
  photos with captions; retry an upload. Verify server-linked photos survive a
  refresh and remain distinct from inspection/defect photos. Try invalid MIME,
  over-5-MB files and GPS permission denial.
- K. Select driveable NO and towing YES. Confirm the visible warning without
  automatic shift, assignment, vehicle-status or charging transitions.
- L–N. Review all captured data and missing optional values. Submission refuses
  missing minimum fields/acknowledgement. Submit, simulate a lost response, retry,
  then reopen the submitted report and confirm it is read-only.
- O–Q. In Reports → Incidents → Accident Reports, enable Include TEST reports,
  locate the report, open all fields/linkage/timestamps, and view photographs.
  Check the default list excludes TEST and status/date/driver-ID/vehicle-ID filters.
  Verify private photo viewing in Preview, including runtime signed-URL capability.
- R–S. Report Fault still works. Exercise pickup, mid-shift charge/end charge,
  return damage, interrupted return, vehicle swap and multi-vehicle shift closure.
- Start a partial report, complete the real return and end the shift. Refresh/log
  in again, then find it on Driver Dashboard, save, upload and submit. Repeat after
  a vehicle swap; verify the report still names the original vehicle/assignment.
  Check multiple historical drafts appear, while another driver sees none of them.
- Simulate blocked/full browser recovery storage: successive saves and submission
  succeed on the server, warning copy remains non-blocking, and reopening uses
  saved server state. Verify logout and a later login with browser storage restored.
- Test two browser windows editing the same draft: stale saves must conflict,
  preserve local text and allow explicitly loading the server version.

## Validation and deployment boundary

Accident backend tests run real compiled callables and Firestore emulator
transactions for both backends. Storage bytes/metadata and signed-URL calls use a
local double: no production Firestore, Auth or Storage operations run in tests.
Frontend tests exercise real handlers, the draft controller, review and entry
components with deterministic hooks/API doubles. They do not replace device/camera
or deployed IAM/Storage checks.

Commands (PowerShell, local Firestore emulator on 127.0.0.1:8087):

    npm --prefix functions run build
    npm --prefix functions-prod-jhb run build
    $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8087'
    node --test test/accidentReporting.emulator.test.cjs
    node --test test/driverLifecycle.emulator.test.cjs
    node --test test/accidentReportingUx.test.cjs test/driverUx.test.cjs test/driverDefectUx.test.cjs test/pickupInspectionUx.test.cjs test/adminChargingSettings.test.cjs
    npm run build
    npm run typecheck
    git diff --check

Frontend-only TypeScript uses the root compiler options with include restricted to
src/**/*.ts and src/**/*.tsx. Root typecheck has the known functions-jhb baseline
errors at lines 743 and 888; that benchmark backend is unchanged.

Future JHB deployment requires exactly these eight new callables:
createAccidentReportDraft, updateAccidentReportDraft, getAccidentReportForDriver,
uploadAccidentPhoto, submitAccidentReport, listAccidentReportsAdmin,
getAccidentReportAdmin, getAccidentPhoto. Deploy the backend before the frontend.
No Firestore rules, Storage rules, indexes or Firebase configuration changed:
existing default-deny rules cover the new server-only collection/prefix. Both
backend domain modules are identical. No migration or backfill is needed.

Recovery-hardening redeployment changes only four existing JHB callables:
updateAccidentReportDraft, uploadAccidentPhoto, submitAccidentReport,
getAccidentReportForDriver. The other four WP3 callables must still be deployed if
WP3 has not been deployed yet. Frontend redeployment is required.

No push or deployment is included in this work package.

## Local verification results — 8 September 2026

- Accident emulator tests: 24 passed across both backends, including historical
  return/swap/shift-end recovery, later login, ownership denial and mixed provenance.
- Existing lifecycle emulator regression tests: 38 passed.
- Frontend behavioral/recovery tests: 19 passed; existing frontend regressions:
  37 passed (56 total). Recovery covers dashboard discovery, unavailable browser
  storage, server success warnings, retry identity and session/logout fallback.
- Frontend production build, frontend-only TypeScript, and both backend builds
  passed. The frontend build retains its large-bundle warning.
- Root typecheck reports only the known benchmark errors in functions-jhb at
  lines 743 and 888. The benchmark source was not changed.
- Backend accident modules are byte-identical. Git whitespace checks passed.
- Preview/device checks and deployed private-photo signing remain unexecuted.

## Remaining limits / deliberate deferrals

- Manual Preview and deployed private-photo signing must be checked before release.
- No full offline mode. Creation and server saves need a connection; local recovery requires
  available browser storage. Unsaved text may be lost on refresh if recovery writes
  fail; saved server drafts remain discoverable. If all credential storage is blocked,
  a fresh page load requires login again. Historical linkage records must remain
  present and consistent; a missing/tampered assignment or shift fails closed.
  Selected but unuploaded photos must be reselected after refresh. Recovery text stays on the same browser until submission or
  explicit discard; it is not a substitute for shared-device access controls.
- A retried/racing upload can leave an unreferenced Storage object. It never
  replaces evidence or creates another attachment. Cleanup/retention policy is
  deferred; accident evidence has no routine inspection expiry.
- No amendments, insurance claim processing, admin status mutations, automatic
  defects, towing orchestration or automatic vehicle unavailability.
- Admin listing uses server pagination and client-side filters over fetched pages;
  very large incident volumes may merit indexed server filters in a later package.
