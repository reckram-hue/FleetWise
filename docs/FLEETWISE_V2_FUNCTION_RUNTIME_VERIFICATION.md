# FleetWise V2 — Cloud Function Runtime Verification (WP5A)

> Result: the WP4/WP5A bridge was deployed and verified against the real Firebase project by a
> human in a network-enabled environment. Four serialization/state defects were found and fixed.
> Contains no secrets, raw PINs, or PIN hashes.

## Firebase project
- Project ID: **fleetwise-9ab3a**.
- Firestore database: **(default)**.
- Functions source: `functions`, codebase `default`, runtime **Node 22** (upgraded because Firebase
  no longer accepts Node 18).
- Functions region: **us-central1**.

## Deployment result
- **PASS** — the six bridge callables were deployed successfully:
  `validateDriverPin`, `startShiftWithPin`, `endShift`, `getActiveShift`, `adminSetDriverPin`,
  `driverChangePin`.

## Runtime test results (human-run on real project)
| Test | Result |
|---|---|
| Correct driver PIN login | PASS |
| Incorrect PIN rejected | PASS |
| Start Shift (legacy-compatible schema) | PASS |
| ICE start shift requires no charge % | PASS (bug found + fixed) |
| Active shift survives reload/login | PASS |
| getActiveShift recovers authoritative server state | PASS (bug found + fixed) |
| Callable timestamp serialization normalized | PASS (bug found + fixed) |
| End Shift succeeds | PASS |
| Blank notes are optional | PASS (bug found + fixed) |
| ICE end shift stores no null charge field | PASS |
| Same shift Active → Completed | PASS |
| Post-end lookup returns no active shift | PASS |
| Historical Firestore data intact | PASS |
| Firestore schema preserved (no startAt/startOdo, no null charge) | PASS |

## Defects found during runtime testing (all fixed, frontend and/or functions)
1. ICE start shift rejected: `startChargePercent: Expected number, received null` — fixed by omitting
   the charge field for ICE and normalizing null in the function (commit `3a6f9f2`).
2. Active Shift page showed "No Active Shift" while the dashboard showed the shift — fixed by
   reconciling ActiveShift with the authoritative `getActiveShift` callable (commit `f313bd0`).
3. "Could not check your shift / Invalid time value" — fixed by normalizing the callable's
   `{_seconds,_nanoseconds}` timestamp shape in `convertTimestamps` (commit `d4b67f3`).
4. End shift rejected: `notes: Expected string, received null` — fixed by omitting blank notes and
   normalizing optional strings in the function (commit `b44bedf`).

## Historical data integrity
- No existing Firestore records were modified. The only writes were the controlled test shift
  (created then completed) and its additive `activeShiftId` pointer fields.

## Explicit statement
- Firestore rules were **not** changed or deployed during WP5A.