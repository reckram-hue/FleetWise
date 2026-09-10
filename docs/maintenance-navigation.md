# Maintenance navigation refinement

Admin now reaches **Maintenance & Service** in one action from the first dashboard navigation button. This destination renders the existing `ServiceManagement` component; its booking, dispatch, completion and release callables are unchanged.

## Before and after

Previously, Service Management appeared below the dashboard navigation and critical defects, with no navigation destination of its own. Maintenance history required opening Vehicles and finding an icon at the right of the vehicle table. Settings contains booking configuration, while Service Providers maintains workshops; neither is the operational service workflow.

The dashboard now places navigation before fleet metrics. A single Maintenance & Service entry describes “Bookings, workshop returns & history”; it replaces the embedded service board rather than duplicating it. Existing fleet metrics and other admin destinations remain.

The landing page provides vehicle and progress filters: All services, Scheduled, At workshop, Awaiting release and Completed. Counts describe services in the current vehicle/TEST selection, not distinct vehicles. Registration appears first, followed by make/model. A released service is historical; its label does not assert the vehicle's current availability after subsequent events.

Vehicle rows show History and Service beneath the registration, with corresponding links in vehicle detail. Service links open the same board with that vehicle selected. History reuses the existing canonical maintenance-record modal. Its manual past-work form is collapsed initially, and saved history uses responsive cards.

Defect detail offers Plan service / repair. It selects the vehicle in Maintenance & Service; it does not create a booking, resolve a defect or automatically link one. Administrators explicitly select defects in the existing booking form. Workshop/provider and defect links remain available on the maintenance page.

## First-time administrator walkthrough

1. **CA 123-456 is due for service:** choose Maintenance & Service, select the registration, then Schedule service or Book / edit an existing booking.
2. **Vehicle has returned:** choose At workshop, then Record completed work. Enter actual readings, cost and repaired defects. Completion records work but keeps the vehicle unavailable. Choose Awaiting release and Release vehicle to review the existing hold and defect checks.
3. **Show maintenance history:** select the vehicle and Maintenance history, use View maintenance history on a service card, or choose History beneath its registration in Vehicles. History remains accessible when no service booking exists.

Presentation labels “At workshop,” “Send to workshop” and “Record completed work” clarify the progression. Stored status values, callable names, payload fields, captured defect revisions, lifecycle revisions, hold identities and retry request identities remain unchanged. TEST records remain excluded from the global board by default; an explicit TEST vehicle link displays its labelled context.

## Validation

Run from the repository root:

```powershell
node --test test/maintenanceNavigationUx.test.cjs test/maintenanceUx.test.cjs test/postCutoverUx.test.cjs test/driverDefectUx.test.cjs test/releaseReadiness.test.cjs test/adminChargingSettings.test.cjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.frontend.json
node node_modules/vite/bin/vite.js build
git diff --check
```

Focused coverage includes the main entry, one reused workflow, Vehicles and defect navigation, registration-first history, context selection, TEST isolation, all service stages, unchanged booking/dispatch payloads, completion/release safety regressions and inline release errors. Existing admin navigation, authentication/logout, charging settings and driver-defect regressions are included.

Final validation on 2026-09-10: **59 tests passed, 0 failed, 0 skipped** (9 navigation, 10 maintenance regressions, 8 post-cutover UX, 13 driver-defect UX, 12 release-readiness and 7 admin charging-settings tests). Frontend TypeScript and `git diff --check` passed. The production build passed in 36.23 seconds, transforming 2,392 modules; Vite reported its large-chunk advisory for the 1,656.07 kB JavaScript bundle (426.50 kB gzip).

For visual QA, run the existing preview **without** `FIRESTORE_EMULATOR_HOST`:

```powershell
node node_modules/vite/bin/vite.js --config test/admin-operations-preview/vite.config.mjs
```

Open `http://127.0.0.1:5187/?screen=admin&maintenanceUx=1`. This mode uses static display-only examples, rejects Firebase API mutations, and propagates through Toggle 375px width. No fleet or maintenance records need to be created. Do not use the separate emulator-backed `maintenance=1` mode for read-only navigation review.

Desktop and 375px browser review covered navigation, stage selection, booking/completion/release forms, vehicle context, shared history and defect-to-service links. The narrow maintenance document measured 360px client width and 360px scroll width inside the 375px frame, including its scrollbar. Service and history cards fit without horizontal scrolling. The existing wide vehicle table retains horizontal scrolling for other columns; maintenance links are visible in its first column. Browser warning/error logs were empty during these checks.

Self-review corrected mobile access to vehicle history, full-width form controls, operation-form focus/scrolling, and save errors appearing outside the active form. Filters/history controls are disabled during a pending operation. The existing React state-based navigation and shared components are retained; no new router, store or dependency was added.

The staged tab initially required Admin Login. At cleanup, a read-only accessibility inspection of its authenticated dashboard confirmed the original layout: no Maintenance navigation item and Service Management below critical defects. Updated-frontend interaction and visual QA used the local fixture. No staged or production fleet data was modified. This refinement requires only a future frontend redeploy; backend functions and Firestore rules are unchanged. Push, deploy and promotion are outside this work package.
