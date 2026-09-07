# Driver defect UX patch — Preview acceptance

Frontend-only; no deployment or live workflow run is authorized by local validation.
Use an explicitly authorized Preview test driver/vehicle for the checks below.

## Source audit

- `/driver/shift/active`: ActiveShift Report Fault already renders ReportDefectForm,
  with the current assignment vehicle. It now receives the shared form improvements.
- `/driver`: DriverDashboard Report a Fault also renders ReportDefectForm, guarded
  by an active assignment and using its vehicle, not the original shift vehicle.
- `/driver/shift/start`: initial pickup already renders the full ReportDefectForm
  for the selected vehicle, with pickup context and defect refresh on return.
- ActiveShift replacement pickup: TakeVehicleForm previously showed outstanding
  defects but offered no report action. It now opens that same full form for the
  selected vehicle, preserving start readings and refreshing defects on return.
- VehicleInspectionForm's short damage declaration is inspection evidence, not a
  reduced Report Fault form. Its required inspection photos and lifecycle are
  unchanged. Optional photos in this patch apply to standalone defect reporting.

No reduced standalone driver fault form was found in current source. The reported
Preview discrepancy is not proven: capture its exact URL, screen and deployed
commit if it remains. Do not infer a stale build without checking it.

## Manual checks

- A. Low outstanding defects: pale amber card/accent, readable category/description,
  textual Low severity; not an all-red screen. Check narrow mobile width.
- B. Medium uses orange; High uses pale red; Critical has a stronger danger border.
  Severity and status remain readable without color. Resolved/Duplicate excluded.
- C. Active Shift → Report Fault: Category, Urgency, editable Vehicle Location,
  required Description, optional Notes and optional Photos; correct current vehicle
  after a swap, with no vehicle selector. Check Driver Dashboard entry too.
- D. Initial pickup → Report a new defect: same fields; selected vehicle retained;
  Back/success returns to pickup and refreshes outstanding defects.
- E. Replacement pickup → Report a new defect: same fields; selected vehicle and
  start readings preserved; refreshed defect review completes before Take Vehicle.
  QR, assignment creation and pickup inspection sequence must remain unchanged.
- F. Submit a fault without a photo: success, form closes once; no image requested.
- G. Submit with one photo: camera and file chooser work via keyboard/touch; gallery
  selection still works after using camera. Preparing/uploading prevents duplicate
  submission and Back. Upload failure shows an error and preserves form/photos;
  retry works. Remove-photo button is visible and keyboard/touch accessible.
- H. Reopen pickup review and confirm the new defect appears with correct severity.
  Verify normal return/charging/recovery behavior remains unchanged.

## Local validation

`node --test test/driverDefectUx.test.cjs test/driverUx.test.cjs`

The focused tests use real form handlers with a deterministic hook harness and
stubbed browser/API effects. Route composition is checked through TSX AST; this is
not a browser end-to-end test. No Firebase calls or photo uploads are performed.

Also run `npm.cmd run build`, frontend-only TypeScript checking, root
`npm.cmd run typecheck`, and `git diff --check`. Known root TypeScript baseline:
functions-jhb/src/index.ts lines 743 and 888; leave backend files unchanged.
