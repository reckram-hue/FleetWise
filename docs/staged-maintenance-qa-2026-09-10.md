# Staged maintenance QA — 10–11 September 2026 (SAST)

## 1. Executive summary

**FAIL — PROMOTION BLOCKED.** Workshop configuration, booking, dispatch, TEST driver assignment exclusion and stale-review rejection were verified. TEST ICE completion rejected both 2,516 km and its verified existing 2,515 km because of conflicting dated odometer evidence. Completion, durable completed history, repair resolution, release and reuse were therefore not certified.

The walkthrough continued through independent prerequisites, availability, stale approvals and mobile checks. Bounded frontend fixes were tested locally and committed. They do not resolve the production completion block. Local fixtures and tests are explicitly distinguished from staged production evidence below.

## 2. Staged target verified

- Starting branch/head: `fleetwise-v2`, `47bc0b376b414bb38ec50b1f3a9de58b69d3808f`.
- Tested URL: `https://fleet-wise-gnghhqud5-richards-projects-3e9c4ddd.vercel.app`.
- Vercel deployment `dpl_5oPtxy9deFWaenLFqiM1XG5kwaic`: Ready, production-target deployment, created 10 September 2026 at 23:21:26 SAST. Its inspected aliases did not include `fleet-wise-flax.vercel.app`.
- Authenticated CLI read of deployed `/assets/index-CbjN1lmR.js` confirmed `projectId: fleetwise-prod-jhb`, `authDomain: fleetwise-prod-jhb.firebaseapp.com` and Functions initialization with `africa-south1`. Verification was not based solely on the URL.
- Owner entered admin credentials and subsequently the TEST driver PIN directly in the page. No credentials were collected in chat.
- No push, deployment, promotion, Firebase configuration/environment/rules change, migration or genuine fleet mutation was performed.

## 3. QA entities used

| Entity | Baseline / scope |
| --- | --- |
| TEST ICE, `VZExr8elHqnoGaud6huU` | Explicit TEST marker; Active; 2,515 km; 10,000 km service interval; next service in 7,485 km. Only vehicle mutated. |
| TEST EV | Read-only: Active; 10,711 km; overdue by 711 km. No EV lifecycle or charging changes. |
| Test Test, `3MBpEbymKURd7sKQURpk` | Designated TEST driver identified through inspection/defect references; owner signed in. No active shift; no shift or assignment created. |
| Defect `ADj4kwtIm7fsBwGm0RCe` | `QA walkthrough 2026-09-08 TEST ONLY — simulated RETURN damage branch; no physical damage.` Initially Open/Low/unassigned; explicitly linked. |
| Unrelated TEST ICE defect | `WP8B test: defect against current vehicle (should succeed).` Open/Low/unassigned; not linked or changed. |

The TEST driver's existing accident-report draft was observed and left untouched. Genuine entries visible alongside TEST records were not modified.

## 4. QA records created

Three named top-level production TEST records:

1. `STAGED QA WORKSHOP — TEST ONLY`: saved, then deactivated for exclusion testing.
2. `STAGED QA WORKSHOP — TEST ONLY — ACTIVE FIXTURE`: saved and confirmed Active; used after the inactive-provider screen crashed.
3. `STAGED QA 2026-09-10 — maintenance lifecycle test`: TEST ICE booking, subsequently dispatched; remains at workshop.

The UI did not expose the new provider/booking document IDs. These exact unique names, vehicle ID and dates identify them. Server-generated service history, vehicle lifecycle audit/operation records and maintenance lock revisions associated with these commands should be retained with the fixture; their IDs were not read through the UI.

## 5. First-time admin experience

Maintenance entry is obvious. The original empty workshop selector gives no inline recovery route. Provider setup requires leaving the form and returning via Dashboard. Booking and dispatch work after configuration. Completion becomes a dead end because the conflicting odometer evidence is not identified.

Source inspection was used to diagnose observed failures and assess fixes, not counted as UI success. It was necessary to explain the provider crash, required-field mismatch and odometer guard; a first-time administrator lacks that assistance.

## 6. Maintenance navigation

One click from Admin home opens Maintenance & Service, the first main-navigation action, with “Bookings, workshop returns & history.” Selectors/cards are registration-first. TEST scope is explicit. Vehicle and defect links converge on the same maintenance workflow.

## 7. Workshop prerequisite

The deployed booking contract requires an existing active workshop. No workshop-free booking option exists. Configuration is in Service Providers, linked from maintenance as “Workshops / service providers.” Initially no active options existed; that does not mean the collection was empty.

Both created providers use synthetic contact `TEST QA CONTACT — NOT A PERSON`, phone `0000000000`, email `fleetwise-qa@example.invalid`, address `TEST ONLY — no physical workshop`, city `TEST CITY`, province `TEST PROVINCE`, postal `0000`, ICE + General specializations, and explicit TEST-only notes. No genuine supplier, contact, invoice or payment was invented.

The inactive TEST provider disappeared from booking options. Showing inactive providers then caused a Critical Application Error. Reload recovered Dashboard. A second active TEST provider allowed QA to continue without deploying a fix.

Local remediation explains the prerequisite, links to existing setup, retains the selected vehicle on return and states that unsaved booking fields must be re-entered. It does not duplicate configuration screens.

## 8. Service booking

Saved through staged UI:

- Vehicle: TEST ICE — TEST.
- Service: `STAGED QA 2026-09-10 — maintenance lifecycle test`.
- Due/booked dates: `2026-09-10`; due odometer: `2515`; booked time: `23:45`.
- Workshop: `STAGED QA WORKSHOP — TEST ONLY — ACTIVE FIXTURE`.
- Linked defect: only `ADj4kwtIm7fsBwGm0RCe`.
- Notes: `TEST ONLY — synthetic staged maintenance and linked simulated-damage repair. Baseline 2515 km. No physical damage, genuine workshop work, invoice or payment. KEEP AS TEST FIXTURE.`

“Saved.” appeared, the list refreshed, and Scheduled / Booked displayed the correct vehicle, workshop, dates/time and due odometer. A separate tab later read the persisted dispatched booking.

Vehicle, type, due date/odometer, booked date/time and workshop are required; notes and defect links are optional. The local fix states this before submission.

## 9. Dispatch

“Send to workshop” names TEST ICE and requests the actual dispatch date. Saving `2026-09-10` produced “Saved.” and At workshop with the sent date. Manage Vehicles showed In Service and reason `Sent for STAGED QA 2026-09-10 — maintenance lifecycle test`.

## 10. Vehicle unavailability

Confirmed in maintenance, Manage Vehicles and vehicle details. Vehicle details explain the hold reason and separate lifecycle changes from descriptive edits. The TEST driver's Start New Shift selector included TEST EV but omitted TEST ICE. Searching exactly `TEST ICE` returned “No vehicles found.” at 375px. No vehicle was selected and no assignment was created.

The driver selector does not explain the hold reason; admin vehicle details provide that context.

## 11. Completion

The form starts actual odometer/cost blank, requires notes, offers explicit resolution of the linked defect and explains that completion does not release the vehicle. Workshop is visible on the card. Completion captures a date rather than editable time; the server records a timestamp on success.

Two clearly synthetic submissions for `2026-09-10`, with R125.00 and explicit TEST-only notes, attempted 2,516 km and then stationary 2,515 km. Both returned:

> Maintenance odometer contradicts earlier or later dated evidence.

The latest TEST ICE RETURN inspection, completed 8 September 2026 at 11:34 SAST, shows 2,515 km. Canonical maintenance history returned no records. Fleet Economics reports seven unknown/invalid TEST ICE assignments, but does not identify the conflicting record here. This corroborates fixture-quality concerns without proving the precise cause.

The validator reads assignments, shifts, refuels, maintenance and charging evidence. The offending collection/document/date/value was not established. No arbitrary higher odometer, historical edit, bypass or backdated workaround was used. Neither submission saved maintenance history, cost or defect resolution. TEST ICE remains held.

## 12. Awaiting release

**Not reached in production** because completion failed. The local read-only fixture shows Work Completed / Awaiting Release with explicit release guidance. This is presentation verification only.

## 13. Maintenance history

Production history opened from the TEST service and showed no records after rejected completion. A completed QA record could not be verified through both paths or reload because none was created.

A local canonical record containing a workshop snapshot exposed a display omission. The fix renders `serviceProvider`, with “Not recorded” when absent. Local 375px browser and regression checks verify it. Existing tests verify fresh canonical reads rather than embedded history as authority. Staged completed-history durability remains outstanding.

## 14. Defect-linked repair

Only the simulated RETURN-damage defect was linked/selected. Rejected completion did not resolve it. Original description, category, urgency, report date and QA location were inspected. Its detail had no directly attached photos; the originating RETURN inspection exposes exterior and interior/dashboard photo controls. Evidence was not edited or removed.

For stale review, a fresh assignment to `STAGED QA TEST ONLY — synthetic review fixture` saved and moved this defect to In Progress. The stale assignment failed. The unrelated WP8B defect remained Open/Low/unassigned in the fresh list. Successful repair-driven resolution and post-resolution evidence preservation remain unverified in production.

## 15. Release to service

No successful release followed the rejected completion. For concurrent review, a fresh same-state In Service command saved:

`STAGED QA TEST ONLY — hold retained while completion odometer evidence is reviewed; concurrent lifecycle QA.`

Existing backend semantics create a newer manual hold for this command. It remains as a negative-test fixture. After completion is possible, review this current hold explicitly in vehicle lifecycle; do not assume the original service owns it. The ownership guard may require vehicle-lifecycle release and leave the old service's release presentation needing separate review. No ownership semantics were changed.

## 16. Vehicle reuse

**Not verified after release.** TEST ICE was neither completed nor released. Its exclusion while held was verified; unchanged TEST EV availability does not establish TEST ICE reuse.

## 17. Stale-approval UX

- Lifecycle: retain old vehicle review; save newer TEST In Service hold elsewhere; submit Active from the old form. Rejected with `Vehicle hold changed. Reload and review the current hold before submitting a new request.` Clear, fail-closed behavior.
- Defect: retain original assignment review; assign from a fresh review; submit `STAGED QA TEST ONLY — stale attempt must not persist` from the old form. Server rejected with `Defect changed. Reload and review before changing its status.` Staged alert reduced it to `Error assigning defect.`

The defect feedback is a LOW UX / DISCOVERABILITY issue, a non-safety defect. The local fix displays the server explanation inline. Tests confirm retries retain the originally reviewed revision and request identity.

## 18. Legacy / safe-failure UX

The inactive-provider crash is a real legacy-tolerance failure. Missing/malformed specialization fixtures now render and open for review without production data repair.

The newer manual hold correctly invalidated old lifecycle approval. No verified safe production fixture of a completed legacy service without hold ownership was available; that full path was not manufactured or certified. Source confirms that service release cannot claim a different hold. Local release guidance and existing reviewed-approval UI tests passed, which is distinct from a staged legacy success test.

## 19. Mobile QA

Actual 375px staged checks covered maintenance navigation/booking, workshop setup and TEST driver exclusion. Workshop setup had crowded columns, colliding specialization text and horizontal-scroll-dependent provider actions.

Local read-only 375px checks covered corrected setup guidance, booking, provider list/form, service cards, completion, release controls, history and defect assignment. The local defect list additionally exposed offscreen actions and heading/back-button collision. Responsive rows, wrapping and visible action labels now resolve these. Long forms still require vertical scrolling.

Desktop fresh-load verification rendered incomplete providers without runtime errors. A transient local hot-reload root warning disappeared on a clean load. Deliberate read-only assignment failure displayed inline. Existing Tailwind CDN and build chunk-size warnings remain.

## 20. Configuration / onboarding findings

| Prerequisite | Location / requirement | Result |
| --- | --- | --- |
| Active workshop | Required for booking; Service Providers | Original empty guidance missing; fixed locally with contextual return. |
| Provider details | Name/contact/phone/email and one specialization | False address/city/province/postal required labels corrected; validation policy unchanged. |
| Service interval / last-service baseline | Vehicle details; affects next-service calculation | TEST ICE interval 10,000 km. No maintenance shortcut to interval configuration; booking asks due odometer. No values changed. |
| Consistent dated odometer evidence | Existing assignment/shift/refuel/maintenance/charging records | Completion prerequisite exposed only at failure; conflict diagnostics unresolved. |
| Active admin privileges | Settings → Admin Users; server authorization | Admin session worked. No roles/users modified; inactive-role denial not tested in production. |
| Booking reminders | Settings → Service Booking | Read-only: enabled, 14-day lead time, 250 km/day default. Not required to submit booking. |
| EV custody / charging state | Driver workflow; Settings → Charging Locations | Lifecycle guidance mentions both guards; active locations exist. No charging setup needed for ICE; EV maintenance untested. |

## 21. All findings

| ID | Severity | Type | Location / reproduction | Expected | Actual | Recommended fix / status |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | HIGH | TEST-DATA PREREQUISITE | Dispatch TEST ICE, complete at 2516 then verified 2515 km on 2026-09-10 | Valid actual evidence accepted or exact conflict identifiable | Both reject chronology; latest return 2515; conflicting row unknown | Read TEST-only evidence; determine fixture versus validator cause and remediate separately. Gate blocked; no unproven backend defect asserted. |
| F2 | HIGH | FUNCTIONAL DEFECT | Show inactive providers after TEST deactivation | Render incomplete rows | Critical Application Error from undefined `.map`; unguarded specializations | Guard list/form arrays. Fixed locally; re-stage/retest pending. |
| F3 | MEDIUM | CONFIGURATION / ONBOARDING | Schedule without active workshops | Explain setup and route there | Empty selector; draft/context loss; return via Dashboard | Inline guidance, setup link, contextual return and draft warning. Fixed locally. |
| F4 | LOW | UX / DISCOVERABILITY | Add provider | Required labels match accepted fields | Four optional address fields marked required | Accurate labels, accessible names and required-field feedback. Fixed locally. |
| F5 | MEDIUM | UX / DISCOVERABILITY | Provider setup/list at 375px | Readable fields and visible actions | Crowded columns/text; actions offscreen | Responsive fields/rows. Fixed locally and visually verified. |
| F6 | LOW | UX / DISCOVERABILITY | Stale TEST defect assignment | Show server recovery guidance | Only “Error assigning defect.” | Inline server explanation. Fixed locally; non-safety UX defect. |
| F7 | MEDIUM | UX / DISCOVERABILITY | Local history record with saved workshop | Show workshop snapshot | Renderer omitted it | Display snapshot or “Not recorded”. Fixed locally; staged persistence unverified. |
| F8 | MEDIUM | UX / DISCOVERABILITY | Completion chronology rejection | Identify conflicting evidence and recovery route | No date/value/document reference | Scoped evidence diagnostics in a separately reviewed change; unresolved. |
| F9 | MEDIUM | UX / DISCOVERABILITY | Local defect list at 375px | Actions visible without horizontal scrolling | Actions beyond table scroll; heading/back collision | Responsive rows, wrapping and action labels. Fixed locally. |
| F10 | LOW | UX / DISCOVERABILITY | Same-state In Service command during stale QA | Explain new manual-hold ownership | Old review invalidated; service ownership not transferred | Clarify consequences. Existing semantics retained; review fixture before release. |
| F11 | INFO | EXPECTED SAFE BLOCK | Deactivate TEST provider, reload selector | Inactive workshop excluded | Correctly excluded | Preserve behavior; no workshop-free policy introduced. |
| F12 | INFO | EXPECTED SAFE BLOCK | Held TEST ICE / stale lifecycle review | Prevent assignment and stale approval | In Service, absent from selector, stale-hold rejection | Preserve protections; successful release/reuse still needs verification. |
| F13 | INFO | EXPECTED SAFE BLOCK | Conflicting completion evidence | Reject without corrupting history or releasing | No completion record/cost; vehicle held | Preserve guard while investigating F1/F8. |

## 22. Frontend changes made

- AdminDashboard: contextual workshop return routing.
- ServiceManagement: required-field and empty-workshop guidance with existing setup link.
- ManageServiceProviders: guarded legacy rows/form values, load/retry feedback, accurate required labels, accessible inputs/actions and responsive layout.
- ManageDefects: inline server errors, responsive list and visible actions.
- ManageVehicles/types: display existing canonical workshop snapshot.
- Regression tests and isolated read-only preview fixtures.

Self-review confirmed unchanged maintenance payloads, reviewed revisions, request identity, release ownership checks, backend and rules. Display guards do not normalize production data. Existing provider validation requirements remain intact.

## 23. Commit

Report, frontend fixes and tests are committed together as `fix(admin): improve maintenance setup and review feedback`. The exact hash is supplied in the task completion message. No push/deployment occurred.

## 24. Test results

- 65 tests passed across stagedMaintenanceQaUx, maintenanceNavigationUx, maintenanceUx, postCutoverUx, driverDefectUx, releaseReadiness and adminChargingSettings.
- After the final defect-layout change, 36 relevant maintenance/navigation/release-readiness tests passed again.
- Frontend TypeScript check passed. An intermediate narrowing error in the empty-state callback was corrected.
- Final Vite production build passed: 2,392 modules; existing large-chunk warning.
- `git diff --check` passed.
- Local desktop/375px checks passed for changed flows; clean-load console had no runtime errors, with the existing Tailwind CDN warning.
- Staged booking/dispatch/exclusion/stale rejection verified; completion, completed history, repair resolution, release and reuse remain blocked/unverified.

## 25. Production TEST data created or changed

| Exact record | Final known state |
| --- | --- |
| `STAGED QA WORKSHOP — TEST ONLY` | Inactive; synthetic details in section 7. |
| `STAGED QA WORKSHOP — TEST ONLY — ACTIVE FIXTURE` | Active; synthetic details in section 7. |
| `STAGED QA 2026-09-10 — maintenance lifecycle test`, TEST ICE | Dispatched; not completed/released; no R125 cost saved. |
| TEST ICE `VZExr8elHqnoGaud6huU` | In Service at 2515 km; newer QA manual hold from section 15. |
| TEST defect `ADj4kwtIm7fsBwGm0RCe` | In Progress, assigned `STAGED QA TEST ONLY — synthetic review fixture`; stale attempt rejected. |
| Automatic audit/operation/lock records for those commands | Retain with associated QA evidence; IDs not exposed in UI. |

No new defect, driver, shift, assignment, completed maintenance record, genuine cost, invoice or payment was created. No record was deleted.

## 26. Test data cleanup recommendation

All named QA-created records and audit evidence: **KEEP AS TEST FIXTURE**. The inactive provider supports selector/legacy regression; the active provider supports further QA; the dispatched booking and newer hold retain blocked-completion/stale-review reproduction.

Retain updated TEST vehicle/defect state until the evidence issue is resolved. Do not force Active, delete the booking, erase earlier odometer evidence or remove audit history. No automatic cleanup is recommended.

## 27. Release verdict

**FAIL — PROMOTION BLOCKED.** The required staged lifecycle did not succeed end-to-end. This is not PASS AFTER FRONTEND-ONLY FIX because a separate evidence/integrity investigation remains necessary.

## 28. Exact next action required

Read TEST ICE's dated odometer evidence across assignments, shifts, refuels, maintenance and charging, plus current/last-service baselines. Identify the exact conflicting document/date/value and distinguish inconsistent TEST data from incorrectly applied validation. Authorize any backend/data remediation separately; this task changed neither.

Then review/push/re-stage the committed frontend fixes under the owner's release process. Rerun completion with a freshly reviewed linked defect, verify durable history through both paths and reload, repair resolution/evidence, current manual-hold release and old-service ownership presentation, Active state and TEST reuse. Recheck inactive-provider recovery and mobile actions on that staged build. Do not promote until those checks pass and the owner decides to promote.

FLEETWISE STAGED MAINTENANCE QA WALKTHROUGH COMPLETE — PRODUCTION NOT PROMOTED
