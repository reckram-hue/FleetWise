# Charging Locations in Settings — Preview checklist

Navigation: Admin Dashboard → Settings → Charging Locations.

The existing dashboard removal is retained. The former Settings full-page sub-view
is replaced with a normal Settings section using ManageChargingLocations embedded.
Settings owns the page header and navigation; CRUD handlers and tariff payloads
remain unchanged. Existing admin role gating, backend, rules and configuration are
unchanged. Settings sections continue to use local state, without adding browser
history entries or changing browser Back behavior.

Manual acceptance checks (not performed by the local handler tests):

- A. Admin Dashboard loads with its existing statistics and other destinations.
- B. No Charging Locations tile appears on the dashboard.
- C. Settings opens normally; Back to Dashboard returns to the landing page.
- D. Charging Locations is visible alongside Areas, Departments, Service Booking
  and Admin Users, and receives the same selected-section styling.
- E. Selecting it loads existing locations within Settings, with one page header.
- F. Edit an existing location; confirm type, cost owner, tariff, provider, charger
  type, description and active state are preserved and changes persist.
- G. Add Charging Location opens the existing form; Cancel returns to the list.
- H. Save a FREE tariff with blank optional fields. Confirm success without a rate.
- I. Save a paid tariff with a numeric rate, then edit and confirm the saved rate.
- J. Deactivate/reactivate a location and verify the Show Inactive filter.
- K. Switch back to Areas or another Settings section; confirm its content works.
  Check browser Back behaves as it did before; section selection adds no URL route.
- At a narrow/mobile viewport, confirm the Settings navigation and location toolbar
  wrap and the locations table scrolls horizontally without widening the page.
- Confirm non-admin users cannot access the admin Settings page.

Use Preview test records for writes. No deployment or push is part of this patch.
Only a future frontend deployment is needed; no functions require redeployment.
