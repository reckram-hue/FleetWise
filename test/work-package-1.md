# Work Package 1 regression checks

Run `npm run test:contracts` from the repository root.

The PIN integration tests require a dedicated, disposable local Firestore emulator.
They refuse to start without an explicit loopback `FIRESTORE_EMULATOR_HOST`, use
only project `demo-fleetwise-pin-test`, and inject that database into both real
compiled production callable handlers. Firebase callable transport is stubbed;
Firestore transactions and bcrypt verification are real. Auth and Storage access
are forbidden by the test harness. This is not a deployed HTTP/IAM test.

Start the installed Firestore emulator on port 18081 with project
`demo-fleetwise-pin-test`, no import/export options, and single-project mode.
In a separate PowerShell terminal:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:18081'
npm run test:pin-attempts:emulator
```

Stop the disposable emulator afterward; its synthetic records need not be retained.
Never point this test at a shared emulator containing data that must be retained.

## Limiter contract

Both production backends use a hashed account key in the existing server-only
`rateLimits` collection. Six failed or outstanding attempts fit in one fixed
ten-minute window. Every PIN comparison first reserves a slot transactionally.
Device IDs still accompany login sessions but do not influence this budget.

Correct PIN verification refunds only its own unique reservation. It does not
reset other failures. Repeated refunds and late successes from an older window
cannot erase newer attempts. Errors or abandoned requests retain their slot until
window expiry. A full budget blocks even correct credentials until expiry or an
authorized admin reset. In-flight successes may release their reserved slots.

Self-service PIN change keeps existing sessions valid. Admin PIN reset retains
active-admin authorization and session revocation, then clears the new account
budget. Existing per-device limit documents are not migrated or consulted; the
first deployment starts a fresh account-level budget. No rules/index change is
needed. The separate JHB benchmark backend has no shared compile dependency on
these helpers and is outside this production mirror change.
