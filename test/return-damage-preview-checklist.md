# Return damage unification — Preview acceptance

## Contract and implementation

Previously, completeVehicleInspection required nonempty damageDescription whenever
hasDamage was true. It persisted both fields and derived RETURN retention solely
from hasDamage: EVIDENCE with no expiry, or ROUTINE with the existing seven-day
expiry. No downstream application consumer of inspection.damageDescription was
found. The mini textarea was a separate legacy inspection declaration, not the
shared operational defect form.

RETURN Yes now opens ReportDefectForm with Category, Urgency, Vehicle Location,
Description, Notes and optional photos. Return readings and selected inspection
photos remain in the parent component while the report is open. No completes the
usual inspection flow. Yes blocks completion until report submission succeeds.

The report prepares the deterministic RETURN inspection, then uses the existing
optional-photo uploads before reporting. reportDefectWithSession atomically creates
the defect and sets inspection.linkedDefectId and hasDamage. The defect stores
sourceInspectionId, vehicleId, driverId, assignmentId and shiftId, with context
validated against the authenticated session and active assignment. Repeated or
concurrent submissions return the existing defect ID. Refresh restores this link.

Linked reports allow damageDescription=null; legacy unlinked declarations retain
the old validation. Completion rejects a No declaration after linkage and detects
concurrent linkage changes. hasDamage remains authoritative for retention. No
migration, rules or Firebase configuration changes are required.

## Manual Preview checks (not executed by automated validation)

Use Preview test records after the two updated JHB callables are available.

- A. RETURN No: enter readings and both required inspection photos; confirm no
  damage textarea or defect form appears and return finalization succeeds.
- B/C. RETURN Yes: confirm the full standard form shows Category, Urgency, Vehicle
  Location, Description, Notes and optional photos, locked to the returned vehicle.
- D. Submit without a defect photo. Confirm success returns to inspection and the
  required custody photos/readings are preserved. Complete the return.
- E. Repeat on another assignment with one defect photo. Confirm it uploads via
  the existing Storage flow and stays separate from the two custody photos.
- F. Go Back before reporting: return completion remains disabled until the report
  succeeds (or No is selected). Simulate report/upload failure; confirm inputs and
  selected photos remain and retry succeeds.
- G. After successful report submission, interrupt return completion and refresh.
  Confirm the saved-report notice, disabled No choice, and no repeated report.
  Retry finalization; verify exactly one defect linked to the return. Also test a
  lost report response and a lost inspection-completion response.
- H. PICKUP still shows only exterior and interior/dashboard custody photos.
- I. Active Shift Report Fault retains all standard fields, current vehicle and
  optional-photo behavior.

## Future deployment and residual limits

Do not deploy as part of this patch. Deploy JHB reportDefectWithSession and
completeVehicleInspection before the frontend. Frontend redeployment is required.
Other callables, Storage/Firestore rules and Firebase configuration are unchanged.

No broad offline support: photos/readings not yet uploaded or saved can be lost
on refresh and must be recaptured/re-entered. A saved defect survives refresh.
Retrying optional uploads can leave unused Storage objects, as in the existing
standard flow, but cannot create a second linked defect. Browser Preview checks
remain manual; automated UI handlers and local Firestore emulator tests do not
exercise a real device camera or production Cloud Storage.
