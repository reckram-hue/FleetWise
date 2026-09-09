# Post-cutover Admin operations and driver UX

Target: `fleetwise-v2`, Johannesburg production project `fleetwise-prod-jhb`, region `africa-south1`. This package is local and committed only; deployment and production verification are separate steps.

## Behavior

- Admin Dashboard has direct **Manage Defects** and **Inspection History** destinations. Direct defect navigation clears a previous selection. High/Critical cards and inspection-linked defects retain their deep links. Existing defect filters, counts, TEST inclusion, status editing and private photos are reused.
- Inspection history is read-only. Filters cover vehicle, driver, creation date, PICKUP/RETURN, assignment and shift. Date controls use local midnight through the end of the selected day. Rows show registration, vehicle description, driver, boundary, creation time and status. Detail includes capture/completion timestamps, recorded readings, original damage description, linked defect, two photo controls and expandable diagnostics.
- Stored registration snapshots take priority over the current vehicle record; diagnostics identify the source. Current driver names are used when no stored name snapshot exists. Missing names/readings are explicitly unavailable rather than invented. Internal IDs remain diagnostic; missing registration never makes an ID the heading.
- Accident reporting remains an Active Shift action, hidden while pickup, return or replacement vehicle capture is open. Historical draft recovery, save/resume, submission and Admin review are unchanged.
- Every shared driver fault form asks **Where on the vehicle is the problem?** The backend `location` field and validation are unchanged. Description prompts use simpler English.
- Successful fault reporting emits **Fault reported successfully** in a polite live region for 4.5 seconds. The notice survives navigation and does not capture pointer input. Existing entry-point callbacks return the driver to the appropriate flow. Submission stays locked after success, including delayed navigation; failures retain inputs/photos and permit retry.
- Driver description/notes, accident narratives/witness notes/photo captions, and charging/refuelling/return notes explicitly request spellcheck with `lang="en-ZA"`. Browser/keyboard dictionaries still determine actual spelling suggestions. No automatic text replacement was added.
- Startup now says **Restoring session…**. Authentication and restoration logic are unchanged.

## API and private evidence

The same `inspectionHistory.ts` handler module is present in `functions-prod-jhb` and `functions`. JHB exports use the existing regional callable wrapper; legacy exports use their existing wrapper.

| Callable | Input and output |
| --- | --- |
| `listVehicleInspectionsAdmin` | Optional vehicle/driver/boundary/assignment/shift/date/TEST filters, cursor and bounded limit; display DTOs and continuation cursor |
| `getVehicleInspectionAdmin` | Inspection ID; one display DTO |
| `getInspectionPhotoAdmin` | Inspection ID and EXTERIOR/INTERIOR role; private image bytes as a data URL |

Every operation checks Firebase authentication and the current server-side user profile: `role === 'admin'` and `employmentStatus === 'Active'`, before parsing or reading evidence. Frontend gating is insufficient by design. Unknown input properties are rejected. Responses whitelist display fields and never serialize full user documents, credentials or raw object paths.

Photos resolve only the role path already attached to the inspection. Validation binds the object to that inspection's organization, assignment, boundary and role filename. Both canonical historical and unique role filenames are supported. Arbitrary client paths, other assignments/organizations/boundaries/roles, traversal and URLs are rejected. The existing bounded, MIME-validated, generation-bound private evidence reader is reused. No public URL, signing permission, bucket change or direct client Storage access is introduced. Missing, changed or unauthorized evidence uses the existing clear error/retry presentation.

Retention fields are diagnostic only. The package does not update inspections, TTL/expiry, photos, lifecycle records or retention policy.

### Bounded history and TEST data

The server scans 50 records by default (maximum 100) in descending `createdAt` and document-ID order. Timestamp/ID cursors preserve timestamp ties. Date bounds are Firestore predicates; remaining filters and parent TEST markers are evaluated server-side within each scanned page. A page can have zero matches and still supply a cursor; **Load older records** continues the search. Counts describe matching records loaded, not a global total. Sparse filters may require several page loads. This avoids a reporting engine and new composite indexes, at the cost of reading unrelated records within each bounded page.

TEST defaults off. Explicit TEST markers on the inspection, matching assignment, driver or vehicle exclude the record, including older inspections with missing/false local markers but TEST parents. The opt-in does not alter or delete data. Current parent markers and identity fallback reflect current records when historical snapshots are absent.

History ordering requires `createdAt`; documents missing that field will not appear in the chronological list. No backfill is included. Production query/index and private Storage IAM behavior must still be checked after an authorized deployment; emulator tests do not prove production IAM.

## Wording assistance and isiXhosa: designed, deferred

No suitable existing secure model route was found. No model dependency, API key, external service, schema migration or AI action was added.

A future optional **Improve wording** or **Translate to English** action should preserve the exact original statement and language separately from any suggested version. The user explicitly selects the action and reviews/accepts the suggestion. Store the original reference/hash, source/target language, suggested text, action, model/version, timestamp and acceptance provenance separately; never overwrite the original or fill gaps with guessed facts. Admin exports must label assisted text and retain access to the original. Failed assistance must never block reporting.

Start localization at the shared fault form, inspection instructions, accident step labels and session/success messages. Add a deliberate language preference, including isiXhosa, before changing spellcheck language. Preserve original-language narrative input; a later English translation is a separate, attributed view. Have fluent speakers review safety-critical labels. Full localization and assistance need a separately approved implementation.

## Validation and local browser fixture

Local Firestore emulator only; synthetic `demo-*` projects and in-memory Storage fixtures, with cloud Auth forbidden by the regression harnesses.

- Inspection emulator: 14 passing checks across both backend copies. Active Admin, anonymous/driver/inactive rejection, combined filters, TEST ancestry, timestamp ties, empty-page continuation, contextual whitelist, read-only behavior, missing evidence and exact object ownership.
- Frontend: 80 passing checks across post-cutover UX, release readiness, defects, accidents, pickup/return, driver readings, Admin charging and timestamp conversion. Covers existing restoration and accident recovery plus new navigation/filter/detail/photo/placement/success/spellcheck behavior.
- Lifecycle/accident emulator regressions: 68 passing checks across both backends.
- Backend builds and frontend-only TypeScript pass. Frontend production build passes; Vite retains its large-chunk warning.
- Root TypeScript retains only the documented `functions-jhb/src/index.ts` TS2345 errors at lines 743 and 888. Benchmark code is untouched.
- Browser fixture verifies desktop and true 375px iframe layouts, Admin destinations, TEST opt-in, detail/photo rendering, clear fault wording and a nonblocking success notice after navigation. This uses synthetic photos and local API doubles, not production evidence or authenticated deployed callables.

Commands from the repository root (set `FIRESTORE_EMULATOR_HOST` only to an already-running local emulator):

```powershell
npm --prefix functions-prod-jhb run build
npm --prefix functions run build
node --test test/postCutoverUx.test.cjs test/releaseReadiness.test.cjs test/driverDefectUx.test.cjs test/accidentReportingUx.test.cjs test/pickupInspectionUx.test.cjs test/driverUx.test.cjs test/adminChargingSettings.test.cjs test/convertTimestamps.test.cjs
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:18085'
node --test test/inspectionHistory.emulator.test.cjs
node --test test/driverLifecycle.emulator.test.cjs test/accidentReporting.emulator.test.cjs
npx tsc --noEmit -p tsconfig.frontend.json
npm run build
npm run typecheck
git diff --check
node node_modules/vite/bin/vite.js --config test/admin-operations-preview/vite.config.mjs
```

The fixture binds loopback port 5187, disables environment-file loading and replaces application APIs with local doubles. Its isolated entry point is not part of the production frontend build. It intentionally tests only supported fixture operations.

## Manual checklist after authorized deployment

Pending on the actual release. Use designated TEST data for any write; the local checks above do not mark deployed verification complete.

| Check | Expected result |
| --- | --- |
| A | Admin direct Manage Defects opens the full list without a selected defect; urgent cards still deep-link. |
| B | Include TEST defects updates the existing list/counts and defaults off. |
| C | Open a defect/photo; verify private image retrieval and existing status editing. |
| D | Inspection History opens for an active Admin. |
| E | PICKUP filter displays only pickup matches after applying filters. |
| F | RETURN filter displays only return matches. |
| G | Include TEST / QA exposes designated QA inspections; loaded counts match rows. |
| H | Open a pickup inspection; verify vehicle, driver, dates and stored readings. |
| I | Exterior photo loads; missing/denied evidence has a clear error. |
| J | Interior/dashboard photo loads independently. |
| K | Open a return inspection; verify completion time and return context. |
| L | Return damage/description, evidence and linked defect match the saved report. |
| M | Registration is primary; internal IDs are only in diagnostics. |
| N | Active Shift retains Accident / Collision and existing draft resume. |
| O | Pickup capture has no Accident banner/action. |
| P | Return capture has no Accident banner/action; historical drafts remain recoverable later. |
| Q | Fault entry points use the same explicit location question. |
| R | Narrative spellcheck is enabled; verify keyboard/dictionary suggestions on the actual driver device. |
| S | Submit one designated TEST fault: brief success notice, no OK modal, normal return navigation and no duplicate on repeated taps. |
| T | Admin refresh says Restoring session… and restores Admin after validation. |

Also verify combined driver/vehicle/date/assignment/shift filters, older-page navigation including empty filtered pages, retry after a failed read, and direct callable denial for anonymous, driver and inactive-admin identities. Check narrow-screen detail and photo layouts on an actual driver/Admin device.

## Deployment handover

Only three **new** JHB functions require deployment, using the existing JHB target and region:

- `listVehicleInspectionsAdmin`
- `getVehicleInspectionAdmin`
- `getInspectionPhotoAdmin`

Deploy the functions before releasing the frontend that calls them. Frontend redeployment is required. No Firestore rules, Storage rules, indexes, retention configuration or infrastructure deployment is required by this package. The legacy backend copy is parity code, not an instruction to deploy to the former production project. No push or deployment was performed.

The pre-existing untracked `scripts/drift-check-jhb-migration.mjs` is outside this package and must remain untouched and unstaged.
