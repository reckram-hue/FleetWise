# Driver UX cleanup — manual Preview acceptance

This change is frontend-only. Do not deploy or run live workflows as part of local
validation. The checklist below is for an explicitly authorized later Preview run
using isolated test drivers/vehicles. No production data or backend code changed.

## Automated validation

Run `node --test test/driverUx.test.cjs`, `npm.cmd run build`, and
`npm.cmd run typecheck`. The focused tests compile frontend modules in memory,
render controlled components, exercise callbacks/state mapping, and explicitly
stub Firebase access. They do not invoke functions, cameras or cloud services.

Coverage: EV/ICE/unknown/zero readings; three return reading controls and limits;
charging YES/NO conditional fields; saved-return completion/disabled state; exact
QR matching against the available list; exclusion of Resolved/Duplicate defects;
predicted-range hydration, swap, persistence and clearing; shared pickup wiring
and return component order. These are assertions, not whole-page snapshots.

## Preview checklist

- **A — EV active vehicle:** start a test assignment with known readings. Confirm
  Start Odometer, Start State of Charge and Start Predicted Range. Reload; verify
  values persist. Swap vehicles and verify the new vehicle's range replaces the
  old one. Unknown range is omitted; a recorded zero still displays. Check narrow
  portrait and wider layouts.
- **B — ICE active vehicle:** confirm odometer is shown, with no EV SOC/range
  fields, even after swapping from an EV.
- **C — EV normal return:** check order: end odometer, End State of Charge, End
  Predicted Range, charging-handover choice, photos, damage declaration. Required
  readings and existing bounds remain enforced; keyboard focus follows the form.
- **D — Return-for-charging YES:** read the handover explanation; location must
  be selected. OFFICE shows no public receipt/cost inputs. PUBLIC location permits
  optional receipt/cost. No charger-delivered kWh is requested. Finish the normal
  WP2 flow, including next-pickup closure, without altered backend semantics.
- **E — Return-for-charging NO:** location/receipt/cost/notes are hidden. Toggle
  YES then NO and verify irrelevant values are cleared. No field should remain
  hidden-but-required.
- **F — Mid-shift charging:** Log Charge still opens the mandatory safety
  checklist. Start/end readings use State of Charge. Charging In Progress still
  offers End Charge, while both return actions remain disabled with explanation.
  End the charge and confirm normal assignment/return actions resume.
- **G — Replacement selection:** use manual selection and QR scanning. Test a
  valid available vehicle, unknown/unavailable code, camera denial, cancel and
  leaving the screen while permission is pending. Confirm the camera stops after
  selection/cancel/navigation and manual selection remains available. Selected
  readings must be entered before Take Vehicle; normal pickup inspection follows.
- **H — Outstanding defects and reporting:** both initial and replacement pickup
  show the session-authenticated outstanding list. Resolved and Duplicate records
  stay excluded. Simulate a lookup failure: no healthy/empty success message and
  acceptance stays disabled until Retry succeeds. Initial Report a new defect
  uses the standard category/urgency/location/description/notes/photo form; Back
  returns to the same pickup and refreshes defects. Double submission/back during
  an in-flight report must be blocked.
- **I — Interrupted return:** use WP2's authorized interruption rehearsal. Confirm
  “Return inspection saved” explains that photos/damage are recorded. Complete
  vehicle return retries without repeating evidence, with a disabled progress
  button. Legacy completed evidence stays read-only while missing readings are
  collected. Confirm no duplicate lifecycle effects.

## Accessibility and scope

Check all touched screens on a real mobile browser: readable touch targets, input
labels, radio keyboard selection, visible error/loading text, photo field focus,
and no color-only status. The scanner retains the existing pinned html5-qrcode
2.3.8 script source, now shared and loaded only on demand. Camera/CDN/CSP/mobile
behavior cannot be proven by the local render tests and remains a manual check.

No backend, rules, Firebase config, dependency version, admin UI or migration-script
change belongs in this commit. Existing root typecheck errors in
`functions-jhb/src/index.ts` at lines 743 and 888 are outside this task. Do not fix
them opportunistically. No scoring, accident reporting or wider UI redesign is
included. Do not push or deploy this commit as part of the task.
