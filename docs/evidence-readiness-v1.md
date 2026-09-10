# Vehicle evidence readiness diagnostics — v1

## Approved scope

Purpose-specific diagnostics extend Fleet Economics. They do not recommend replacement, score drivers, judge manufacturer honesty, calculate ROI/TCO or aggregate customers. EV manufacturer variance is deliberately withheld with “Reference energy basis not verified”, as approved after the source audit. Existing EV reference fields identify units but not battery-versus-grid energy boundaries. No historical meaning is inferred or backfilled.

The existing economy calculations and eligibility rules remain authoritative. Diagnostic samples add timing/activity information alongside those results. ICE full/partial/unknown handling, opening-fill exclusion, compatible cost denominators, battery-capacity snapshots, return-custody exclusion and TEST filtering are preserved.

## States and purposes

- Insufficient data: no valid covered value/denominator for the purpose.
- Limited evidence: a covered value exists, but a hard gate, unmet soft trigger or absent/declined/stale reviewer confirmation prevents sufficiency.
- Sufficient for analysis: detected hard gates pass, soft triggers pass or have an explicit reasoned exception, and current scoped normal-duty, recording-completeness and configuration confirmations all pass.

Purposes are ICE consumption, EV consumption and whole-period operating cost. A valid covered cost/km can remain visible while whole-period cost evidence is Limited. No single vehicle-wide readiness score exists. Existing Measured/Estimated/Mixed provenance and Limited data coverage quality remain separate concepts.

## v1 thresholds and diagnostics

Code-level versioned soft triggers: 1,000 covered km; six ICE full-to-full cycles or twenty EV energy balances; sixty elapsed days; six distinct Monday-based UTC weeks; 90% coverage of eligible recorded distance; latest observation at most thirty elapsed days old. EV additionally uses ten recorded activity days. For cost purposes these triggers use cost-covered samples and kilometres, while completeness is a separate hard gate.

The default management window is now 90 days in the UI and callable. Explicit 30 and ALL requests remain supported. D is eligible assignment distance, E consumption-covered distance, C cost-covered distance. Missing D stays null. Coverage is the selected purpose's covered km divided by positive D; no denominator means unavailable.

Observation span is first qualifying sample start to last qualifying sample end, not the selected window length. Days/weeks count distinct UTC dates of recorded boundaries: ICE refuel dates and assignment endpoints inside each full-to-full cycle; EV assignment start/end dates. A long interval does not invent activity on intervening days. These are recorded activity dates, not proof of uninterrupted operation or a complete trip log. Span and recency retain unrounded values for comparisons.

EV estimates retain Estimated provenance; every included estimate must have a usable-capacity value, source and valid snapshot. Capacity evidence percentage concerns included estimates only. Otherwise eligible assignments without a valid energy balance are reported separately. Return charging remains excluded.

Leave-one-interval-out sensitivity reports the largest absolute percentage change in the selected aggregate rate when one qualifying interval is omitted. It is unavailable without a positive base rate and remaining distance. It does not remove valid records, create a pass/fail threshold or claim statistical confidence.

## Hard gates and unknowns

Hard gates include absent denominator/metric, unsupported purpose/powertrain, unresolved unknown/invalid assignment activity, detectable capture/ownership/correction ambiguity, missing included usable capacity, and different capacity value/source configurations pooled together. Malformed non-boolean TEST markers block sufficiency. Historical absent/null TEST markers continue the existing explicit-TEST policy; absence cannot prove that history contains no unmarked QA activity. Recording-completeness review must address limitations of historical provenance, not silently rewrite it.

Whole-period cost additionally requires C = D and no unreconciled return-charging events. Missing costs do not become free. An Admin can record their confirmations or decline a review when hard gates fail, but cannot override those failures or produce Sufficient from them.

Unsupported route/payload/normal-duty context remains a human review. Historical powertrain/configuration changes cannot be invented; the reviewer must establish comparability. Detectable incompatible usable-capacity segments block sufficiency. This package does not segment history automatically or modify the existing factual pooled economy result. It labels that result as unsuitable for a sufficient-evidence conclusion until a comparable scope is available.

## Reviewer workflow and persisted schema

In each registration-first row, open Evidence diagnostics. Consumption and whole-period cost states are both visible. Select a purpose, read hard/soft diagnostics and explicitly Confirm or Decline each of:

1. Normal duty for the stated scope.
2. Recording completeness, including unknown/unrecorded activity and TEST provenance limitations.
3. Configuration comparability.

Notes are optional. Unmet soft triggers can only be accepted through the separate exceptional-override control with a nonempty reason. There are no preselected confirmations. Saving refreshes the report; switching purpose clears unsaved confirmations so they cannot silently transfer.

Dedicated collection: `vehicleEvidenceReviews/{scopeId}`. Identity is a server hash of organisation, vehicle, purpose, period selector, QA selection and methodology version. The document holds the latest review for that identity. Every save also creates an immutable `history/{revisionId}` subdocument in the same transaction.

Fields: server-derived orgId, vehicleId, purpose, period, includeTest, methodologyVersion, evidence fingerprint, UTC scopeDay, reviewedBy, server-timestamp reviewedAt, three confirmation booleans, notes, optional softOverrideReason, isTestData, revisionId and diagnosticsAtReview (hard/soft reasons, D/E/C and exact period boundaries). Raw assignments/refuels/charging documents are never changed.

There is no live migration. Existing Firestore catch-all denial already prohibits direct browser reads/writes to the new collection and its history. Access is through active-Admin callables only; no rules/configuration changes are required. Reviewer identity, timestamps and organisation cannot be submitted by the browser. Unknown fields are rejected.

## Scope, staleness and auditability

v1 reviews are valid only for the same vehicle, purpose, period, QA selection, methodology, UTC scope date and evidence fingerprint. They expire on UTC date change. This deliberately conservative daily review scope avoids silently transferring a decision to a different rolling window. It is a current-scope assessment, not a durable certification. Exact boundaries at save are recorded for audit; same-day validity additionally requires the same qualifying samples and raw evidence fingerprint.

The fingerprint covers same-vehicle raw history, conflicting ownership, parent TEST markers, current vehicle/reference metadata, qualifying samples and exclusions. Changed data invalidates a review even when displayed rounded metrics are identical. Current implementation includes the bounded driver-marker inventory; changes there may conservatively invalidate unrelated reviews. A stale review remains visible with author/date and an explanation. Method changes must create a new version, never silently grandfather old decisions.

Save recomputes diagnostics and checks the submitted fingerprint in a Firestore transaction. Changed evidence causes a reload-required error. Active Admin status is rechecked within that transaction. Current review and immutable revision are written atomically. Retries after a lost network response can add an identical audit revision; they cannot alter source evidence or bypass eligibility.

## Organisation and performance boundary

This deployment uses the existing server-owned single-tenant `default` organisation. Legacy records with absent orgId remain part of that deployment. An explicitly different admin organisation is denied; explicitly conflicting organisation evidence fails closed. This is not a new multi-tenant authorization system or a claim that missing orgId proves future tenant ownership.

The existing economy request reads seven bounded collections in parallel (six operational collections plus current reviews), with a 5,000-document limit per collection and no per-row callable. Review history is not scanned for the reporting page. The write path intentionally rereads bounded evidence transactionally for consistency. Larger fleets require a separately designed indexed/paginated projection; do not lift bounds or return partial totals. Audit history retention remains a future governed policy; this package does not delete revisions.

## Manufacturer comparison

ICE variance is `(observed - reference) / reference * 100` only for positive finite values with ICE L/100 km semantics. Missing/invalid/incompatible values produce explanatory text. Positive is higher consumption, negative lower, exact zero equal. Evidence status is shown beside the variance; Limited observations are provisional. Operating conditions may differ. No manufacturer-accuracy judgement is made.

EV variance is always unavailable in v1 because reference energy basis is unverified. Manufacturer references remain visible in their separate column. A future source/basis capture decision is required before comparison can be enabled; identical units alone are insufficient.

## Future benchmarking and governance seam — not implemented

Preserve method version, metric purpose, source traceability, units/energy boundaries, QA provenance and review scope for future lawful analysis. Derivative/engine, transmission, vehicle class, market/geography and duty context may be needed in addition to existing make/model/year/powertrain; these missing cohort dimensions must not be inferred.

Any future cross-customer cohort requires separately approved subscriber opt-in/contractual permission, purpose limitation, tenant isolation, anonymization and re-identification assessment, retention, auditable participation and opt-out/deletion behavior. No permission or consent is assumed here. Minimum cohort size and small-cell suppression need a separate governance decision; no universal size is invented. QA evidence must be excluded regardless of any positive QA review.

Before publishing cohort manufacturer variance, define compatible exact variants, reference test/energy basis, minimum independently evidenced vehicles and km, reviewed duty/period rules, weighting, median/mean, IQR and suppression. A review is neither customer consent nor a licence to commercialize data. Future wording may describe median observed variance for an explicitly defined cohort, not rank manufacturers as honest/dishonest. Nothing in this package aggregates customers or exposes tenant identities to other tenants.

## Validation and manual preview checklist

Pure tests exercise both backend copies, approved soft thresholds, hard gates, supported EV estimation, incompatible capacities, independent cost readiness, temporal coverage, stale scope/method/evidence, TEST isolation, variance and sensitivity. Frontend tests cover readable states/reasons, conditional variance, reviewer identity/date, confirmations, exceptional overrides and duplicate-submit locking. Emulator tests exercise real collection joins, active-admin checks, server identity, immutable history, state refresh, stale input rejection and organisation/QA isolation.

For local visual verification, build functions-prod-jhb then start `test/admin-operations-preview/vite.config.mjs`. Its economy route uses synthetic fixtures and memory-only reviews; application Firebase APIs remain mocked. No review there reaches Firestore. Production verification must be separately authorized.

Manual checks:

1. Reports → Fleet Economics defaults to 90 days; 30/ALL and QA selections remain consistent.
2. Open ICE evidence. Check D/E/C, ratio, cycles, recorded days/weeks, span, recency, reference variance and Limited evidence without confirmation.
3. Confirm the three scope statements and save; check reviewer/date/version and resulting Sufficient only when gates allow it.
4. Switch to cost purpose; verify confirmations do not transfer and partial coverage cannot become Sufficient.
5. Review supported EV estimates; verify Estimated stays visible and EV manufacturer variance stays withheld.
6. Trigger a short-period soft exception: reason required, explicit control, hard failures unchanged.
7. Change evidence/period/QA/method/date; confirm previous review is ignored or marked stale.
8. Decline a confirmation; check Limited evidence and exact reason.
9. Check narrow viewport table scrolling, focusable controls, save failure and no console errors.
10. Verify default QA exclusion, hard-gate explanations, and no replacement/ROI/driver/cohort conclusions.

## Future deployment scope

Johannesburg functions: `getFleetEconomySummaryAdmin` and `saveVehicleEvidenceReviewAdmin`, from functions-prod-jhb in africa-south1. Deploy backend additions before the frontend. Frontend redeployment is required. Both backend source trees maintain parity. No Firebase configuration change or operational-data migration is required. The known functions-jhb benchmark TypeScript errors remain outside scope.

## Local verification results and exact file manifest

183 pure/frontend/parity tests passed, plus nine emulator tests (six economy regressions and three review/security tests). Both backend builds, frontend build, frontend-only TypeScript and diff whitespace checks passed. Root TypeScript reports only the existing functions-jhb/src/index.ts errors at 743 and 888. Vite retains the existing large-chunk warning.

The synthetic browser exercised a successful scoped ICE review and resulting state refresh with server-fixture reviewer/date/version, separate cost status, EV estimated provenance and withheld variance, plus a 375px mobile panel with no document-width overflow or console errors. The review save in that preview was memory-only; real persistence and access control were tested solely in the local Firestore emulator.

Exact repository-relative files in this package:

```text
docs/evidence-readiness-v1.md
functions-prod-jhb/src/economyApi.ts
functions-prod-jhb/src/economyMetrics.ts
functions-prod-jhb/src/evidenceReadiness.ts
functions-prod-jhb/src/index.ts
functions-prod-jhb/test/portParity.test.cjs
functions/src/economyApi.ts
functions/src/economyMetrics.ts
functions/src/evidenceReadiness.ts
functions/src/index.ts
src/components/admin/FuelEconomyMonitor.tsx
src/components/admin/VehicleEvidencePanel.tsx
src/lib/economyPresentation.ts
src/services/economyApi.ts
test/admin-operations-preview/mocks.ts
test/admin-operations-preview/vite.config.mjs
test/economyUx.test.cjs
test/evidenceFixtures.cjs
test/evidenceReadiness.test.cjs
test/evidenceReview.emulator.test.cjs
test/evidenceUx.test.cjs
test/uiHarness.cjs
```
