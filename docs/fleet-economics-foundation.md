# Fleet Economics — factual reporting

## Scope and foundation audit

Reports → Fleet Economics reuses the existing vehicle economy engine and the admin-only `getFleetEconomySummaryAdmin` callable. There is one reporting area and one on-demand request per period/TEST selection. No new collections, persistent schema fields, callables, scheduled jobs or data migrations are introduced. The legacy and Johannesburg production calculation modules remain identical.

The foundation already supplies completed-assignment distance, full-to-full ICE litres, SOC-derived EV battery energy using explicit usable-capacity snapshots, covered replenishment expense, manufacturer references, evidence IDs and capacity provenance. It already aggregates each powertrain with covered-distance weighting and supports 30-day, 90-day and all-history periods. This package extends that projection and presentation; it does not change interval eligibility, TEST rules, energy calculations or cost attribution. Placeholder/default vehicle statistics are not inputs.

## Distance, consumption and costs

- EV/ICE totals sum only eligible completed assignments. The new nullable `eligibleDistanceKm` distinguishes no qualifying assignments from an evidenced zero-distance assignment. Existing `distanceKm` is retained for API compatibility.
- `totalEligibleKm` is the EV plus ICE eligible distance, or null when neither has any qualifying assignment. Shares use that eligible denominator only and are null when it is zero. An absent powertrain can have a zero share of known eligible distance without claiming that its unrecorded activity was zero.
- Unknown/invalid interval counts remain separate; their missing kilometres are never estimated. Unknown-powertrain assignment counts are disclosed separately and excluded from the EV/ICE denominator. Whole intervals crossing a period boundary are excluded, not prorated. Counts do not claim completeness of unrecorded history.
- ICE quantity is attributable full-to-full litres including intervening partial fills. EV quantity is estimated battery energy on the existing energy-balance basis. Charger-delivered energy remains separate. Unreconciled return charging remains excluded.
- Fleet consumption rates are sum(quantity) / sum(consumption-covered km), with separate L/100 km and kWh/100 km units. They are not ranked across powertrains.
- Operating cost/km is sum(known attributable replenishment expense) / sum(the same cost-covered intervals' km). Neither all assignment distance nor all consumption-covered distance substitutes for cost coverage. Amount and rate remain null without cost evidence. Known zero cost remains valid.
- EV cost still requires equal SOC inventory boundaries, valid recorded sessions and complete metered/cost evidence. No electricity tariff, fuel price, charging loss or inventory valuation is inferred.
- Each powertrain projection adds distance provenance/count, unknown intervals, consumption quality, cost provenance/count/status, partial cost coverage and period boundaries. Partial cost coverage is true where known cost covers less than eligible distance or unknown intervals remain. All cost values are ZAR. Coverage is a factual description, not a confidence or investment assessment.

## Vehicle comparison and methodology boundary

The registration-first table shows powertrain, eligible distance, Observed Economy, coverage, samples, provenance, data quality, covered operating cost, cost/km and a separate Manufacturer Reference column. Calculation details retain record IDs, usable-capacity value/source/snapshot and excluded return events. Selected periods apply throughout; all-history row starts reflect the first eligible assignment when available.

Measured, Estimated, Mixed data, Limited data, Insufficient data and Insufficient cost data remain factual statuses. No representativeness threshold, readiness state, ranking, replacement recommendation, driver score, ROI or capital/TCO scenario is implemented. Representativeness and replacement-readiness methodology are explicitly deferred to a separate product decision and work package. That work must define and approve its own evidence criteria before adding classifications; it must not reinterpret these factual quality labels as readiness.

## Access, scalability and future release

The existing callable requires an active admin before reading. It reads six collections in parallel, with the existing 5,000-document-per-collection safety bound and fail-closed behavior rather than truncated totals. React performs no collection scans or per-vehicle requests. Aggregation reuses calculated vehicle rows. Larger fleets will need a separately designed query/pagination strategy.

Future Johannesburg deployment scope: **getFleetEconomySummaryAdmin** in **africa-south1**, from **functions-prod-jhb**. Frontend redeployment is also required to publish the table and reporting label. Deploy the additive backend projection before the frontend. No Firebase configuration, persisted schema or historical-data change is needed. Nothing was pushed or deployed for this package.

## Validation and manual checklist

Automated validation: pure calculations across both backends, frontend rendering/controls, port parity, local Firestore emulator joins/auth/date/cost/TEST tests, both backend builds, frontend build, frontend-only TypeScript and diff whitespace checks. Root TypeScript retains the known unrelated functions-jhb errors at lines 743 and 888.

Local synthetic browser verification covered desktop and 375px layouts, summary loading, 30/90/all-history controls, TEST inclusion, estimated consumption, insufficient costs, registration-first comparison, distinct manufacturer references and contained table scrolling. No browser console errors were observed. This is local verification, not production verification.

For a future authorized preview check:

1. Sign in as Admin and open Reports → Fleet Economics; verify loading/error/retry behavior.
2. Select Last 30 days, Last 90 days and All eligible history; check all displayed periods follow the selection and whole boundary intervals remain excluded.
3. Reconcile EV km plus ICE km to total eligible km, and shares to the eligible denominator. No eligible distance must show Insufficient data, without a percent suffix.
4. Check ICE litres and estimated EV battery kWh remain separate, with provenance, samples and covered distance.
5. Use approved synthetic known-cost and missing-cost examples; reconcile amounts and rates to cost-covered km, and check Partial cost coverage and Insufficient cost data states.
6. Toggle Include TEST / QA; reconcile summary and vehicle rows to the same selection, then restore default exclusion.
7. Inspect registration-first rows, separate manufacturer references and calculation details including usable-capacity provenance and return-charging exclusion.
8. On desktop and mobile, reach all table columns and expand provenance; check for page overflow and console errors.
9. Confirm there are no readiness, representativeness, replacement, performance or investment classifications.
