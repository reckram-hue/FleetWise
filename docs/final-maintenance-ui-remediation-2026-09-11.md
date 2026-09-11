# Final maintenance UI remediation — 2026-09-11

## 1. Executive summary

The frontend now uses consistent evidence-based service labels, stage filters and available actions. The existing workshop-history fix is retained and verified without duplication. Both explicit service release and the observed separate vehicle-lifecycle release render Released / Completed; ambiguous legacy work receives a neutral status. No backend or production-data changes were made. Local validation passed; the revised frontend has not been pushed, deployed or certified on a new stage.

## 2. Starting commit

Branch `fleetwise-v2`; starting HEAD `ed73ecf9ffde02bceb7befa28ef71095ad786483`, `fix(admin): improve maintenance setup and review feedback`. This is the prior frontend QA commit and was already current HEAD, one commit ahead of the local `origin/fleetwise-v2` tracking ref. Its provider, workshop navigation, stale-review, responsive layout and workshop-history fixes remain intact. No remote ref was refreshed and no push occurred.

## 3. Remediation commit

One commit: `fix: correct maintenance history and release status`. This report belongs to that commit; obtain its full immutable hash with `git log -1 --format=%H -- docs/final-maintenance-ui-remediation-2026-09-11.md`. The completion response records the resulting hash. No earlier commit was amended.

## 4. Workshop history root cause

Renderer-only omission in the staged frontend. The previous staged reconciliation verified persisted `maintenanceRecords.serviceProvider` and `serviceProviderId`. Read-only source inspection confirms `completeServiceAdmin` snapshots those fields into canonical history, and `firebaseApi.getMaintenanceRecords` spreads the persisted document through `convertTimestamps` without renaming/dropping the provider. No field-name or conversion mismatch was found.

## 5. Workshop history fix

Already present in starting HEAD: `MaintenanceModal` renders `record.serviceProvider || 'Not recorded'` from canonical records. Both ServiceManagement and Manage Vehicles use this modal. No current provider lookup or current vehicle default supplies a historical name; deleting, deactivating or renaming a current provider does not erase the snapshot. Registration-first context remains in the shared modal heading. This package adds stronger regression coverage and a missing-workshop preview example instead of repeating the renderer edit.

## 6. Release status root cause

The former card, filter and action code independently treated `returnedFromService && !releasedAt` as awaiting release. The backend intentionally sets service `releasedAt` only for completed services whose `holdId` matches the current hold being released. In the observed TEST case, work retained its old service hold ID while a newer manual hold was separately released. Vehicle `lastReleasedAt`/`lastReleasedBy` were persisted, but the old service correctly did not acquire ownership of that newer hold.

## 7. Release status fix

One `servicePresentation` decision now drives card status, filter counts, release controls, scheduling/completion actions and reminder eligibility. It reads existing data only:

| Evidence | Display / action |
| --- | --- |
| Valid service `releasedAt` | Released / Completed; history only, even if vehicle later has another hold |
| No service release timestamp, but service has `holdId` and valid `completedAt`; matching vehicle has valid `lastReleasedAt` strictly after completion, a release actor, Active status, explicitly null hold and false manual hold | Released / Completed; explains separate lifecycle review; no release action |
| Completed service and current unavailable vehicle hold matches service hold | Work completed / Awaiting release; normal reviewed release action |
| Completed modern service with a different current unavailable hold | Awaiting release with separate-hold guidance; no service-owned release action |
| Missing/ambiguous release evidence | Work completed — release status unavailable; history and lifecycle-review guidance |
| Dispatched, not completed | At workshop; Record completed work |
| Scheduled | Scheduled / Booked; normal booking/dispatch actions |

Vehicle Active alone is insufficient. The fallback describes a dated vehicle release after work, not service ownership of another hold. Older release timestamps, equal timestamps, malformed timestamps, missing actor/completion/hold, wrong vehicle identity and uncleared holds do not fabricate release. No metadata is written to make a label true. If a later vehicle hold removes the evidence of a currently cleared lifecycle and the service still lacks its own release metadata, presentation remains conservative and directs lifecycle review.

Frontend `Vehicle` typing now names existing `lastReleasedAt` and `lastReleasedBy` fields. Readers already preserve them. Callable payloads, backend enums and revision/hold approval semantics are unchanged.

## 8. Legacy display behavior

Old completed records without reliable release evidence appear under the new Release status unavailable filter. They are not all labeled released based on current vehicle availability. A record with valid explicit service release metadata remains completed even when older dispatch/completion flags are incomplete; obsolete booking/completion actions and reminders are suppressed. No legacy record is rewritten.

## 9. Files changed

Seven files: one production TSX component, frontend types, three test files, local preview mocks, and this report. The exact paths are in section 19. The workshop renderer and other previously fixed components were reviewed and retained unchanged.

## 10. Tests added / changed

New `maintenanceReleasePresentation.test.cjs`: 18 tests covering explicit release, separate lifecycle release after completion, refresh/remount, successful normal release and persisted re-fetch, stage/action consistency, mismatched current hold, conservative missing/invalid evidence, timestamp conversion, historical provider independence, registration-first history, and incomplete legacy flags.

Existing maintenance/navigation test fixtures now explicitly model service hold ownership rather than expecting legacy unknown holds to authorize release. The non-TEST navigation expectation names the two non-TEST service cards. Existing suites cover booking/dispatch/completion payloads, stale approval revisions/request identity, history links, workshop empty/setup-return guidance, inactive/malformed providers, defect and other admin navigation regressions.

## 11. Exact test results

Final command:

```powershell
node --test test/maintenanceUx.test.cjs test/maintenanceNavigationUx.test.cjs test/stagedMaintenanceQaUx.test.cjs test/maintenanceReleasePresentation.test.cjs test/driverDefectUx.test.cjs test/postCutoverUx.test.cjs test/adminChargingSettings.test.cjs
```

**72 tests, 72 passed, 0 failed, 0 skipped, 0 cancelled**, duration 9887.7086 ms. Negative-path tests intentionally log simulated failures. Full local output: `%TEMP%\fleetwise-maintenance-ui-tests-2026-09-11.txt`.

An earlier run had one navigation fixture-count failure after moving an awaiting service to the held non-TEST vehicle. The assertion was corrected to check the expected card IDs; final results above include that fix and the added legacy-action test. No backend/emulator or live mutation test ran in this frontend-only task.

## 12. Typecheck / build

`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.frontend.json`: passed, exit 0 after final source edits. `npm run build`: passed, 2392 modules, 12.51 seconds, output `dist/assets/index-DdCDLmIM.js`, 1,661.03 kB / gzip 427.85 kB. Existing large-chunk warning remains; no build error.

Sandboxed Vite initially could not read the config's parent directory. The same local build/preview commands succeeded with approved execution outside that sandbox restriction; no config was changed. `git diff --check` passed. Git's line-ending/global-ignore permission warnings did not affect validation.

## 13. Visual QA

Used the existing local synthetic read-only preview at `http://127.0.0.1:5187/?maintenanceUx=1&screen=admin`, with Firebase API aliases directed to local fixtures. Verified desktop scheduled, at-workshop, completed/awaiting, explicitly released, separately released, and ambiguous legacy cards. Correct stage counts: 1 scheduled, 1 workshop, 1 awaiting, 2 completed, 1 unavailable. Released cards show only history actions.

Viewed saved workshop and Not recorded history through Maintenance & Service and Manage Vehicles. Browser refresh, closing/reopening history, navigation away/back and vehicle-context return retained the correct display. Unit tests independently confirm successful-command fresh reads and new mounts. These are local fresh fixture/API reads and source/DTO verification, not a claim that new code was deployed to or read from production.

Clean final browser load: meaningful content, working navigation, no error overlay and no console errors. The preview's Tailwind CDN warning remains. A development hot reload while editing the fixture caused a duplicate-createRoot warning; a fresh browser tab loading final files had zero errors. No production configuration change was made for a fixture-only hot-reload warning.

## 14. Mobile QA

Viewport 375 × 812, with 360 px document content width after the browser scrollbar. Screenshot review covered history, released and neutral legacy status, booking and completion forms. Document scrollWidth equaled clientWidth (360); no critical main buttons/selects or form controls extended horizontally outside the content area. History dialog width/scrollWidth were also equal. Status filters wrap, workshop snapshots wrap, and controls remain reachable by vertical scrolling. The temporary viewport override was reset.

## 15. Self-QA findings

Canonical workshop data is already mapped and rendered correctly in HEAD; no duplicate implementation or backend persistence change was needed. Status/action/filter decisions now share the same evidence rule. Explicit service metadata wins; vehicle Active alone never creates release proof. Unknown legacy state stays neutral, service hold ownership is not reassigned, and open approval snapshots continue to use their reviewed revisions after refresh.

Self-review found and fixed a contradictory legacy case where explicit release metadata could coexist with booking/completion controls because old flags were incomplete. Regression test added. Preview completion/release dates were kept coherent. Only one production TSX component changed; no unrelated UI refactor was introduced.

## 16. Backend changes

**NONE.** Cloud Functions were read for semantics only. No backend schema, production data, Firebase environment/configuration, lifecycle validator or Vercel configuration changed.

## 17. Firestore rule changes

**NONE.** No rules, index or permission change.

## 18. Deployment requirement

**Frontend only**, including the retained prior unpushed workshop fix and this remediation. A future authorized push/re-stage is still required to verify these changes against the real deployment before promotion. This task performs no push, deploy or promotion.

## 19. Exact committed files

```text
src/components/admin/ServiceManagement.tsx
src/types.ts
test/admin-operations-preview/mocks.ts
test/maintenanceNavigationUx.test.cjs
test/maintenanceUx.test.cjs
test/maintenanceReleasePresentation.test.cjs
docs/final-maintenance-ui-remediation-2026-09-11.md
```

## 20. Final git status

Commit scope is the explicit seven-file allowlist above. No tracked implementation work remains after that commit. The original untracked files are preserved outside it:

```text
?? docs/test-ice-odometer-evidence-2026-09-11.md
?? docs/test-ice-reconciliation-applied-2026-09-11.md
?? docs/test-ice-reconciliation-review-2026-09-11.md
?? scripts/drift-check-jhb-migration.mjs
```

The protected migration script was not read, modified, staged or deleted. Final post-commit hash/status are verified in the completion response. No push or deployment occurred.

FLEETWISE FINAL MAINTENANCE UI REMEDIATION COMPLETE — COMMITTED — NOT PUSHED — NOT DEPLOYED
