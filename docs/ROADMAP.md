# FCCH Platform Roadmap

## Parked: Thermostat automation (paused Oct 30, 2026)
Goal: change thermostat temps from bookings (vacant setback, pre-arrival warm-up, occupied temp, freeze floor never below ~55F in winter).
- Hardware: Honeywell Home/Resideo T5 wifi (confirm exact model number before buying).
- Blocker: Resideo developer portal (developer.honeywellhome.com) is closed to public sign-up. Owner is requesting access; no answer yet.
- Fallback: Seam API. 14-day free trial, then $5 per device per month, 5 actions per device per day. Seam has a sandbox with virtual devices, so we can build before buying hardware. Confirm thermostat pricing and T5 support with Seam first.
- Design: vendor adapter so Resideo/Seam/other can be swapped. Per-property thermostat link, occupied/vacant/freeze-floor temps, cron job driven by bookings, manual override, change log, offline alerts (ties into the alerts engine). Handle grouped listings (309 Morrison) as one physical unit.
- Start with the units that sit vacant most. Test on one unit first.
- To resume, need: Resideo answer, T5 model number, thermostat count.

## Parked: Guest grocery stocking service
Goal: guests order groceries before arrival at our prices; groceries are in the unit at check-in.
- Model: guest pays us (Stripe) at fixed menu prices plus a delivery fee. We build the order as a cart in our own Pick 'n Save (Kroger) account using Kroger's cart API, pick it up curbside (store shoppers load the trunk), drive to the unit, unload using the stored access code, leave.
- Walmart: no public ordering API; affiliate flow only. Start with Pick 'n Save.
- Build as a SEPARATE guest-facing project (own repo and Vercel project), linked to this platform for staff tasks, access codes and an Orders page.
- Unit economics: batch orders into one pickup run, minimum order size, cleaners deliver on turnover trips. Margin on a single small order is thin.
- Check first: Kroger developer policies on resale (developer.kroger.com/manage/documentation/policies), pickup fees and minimums at local stores, substitutions, cold chain, alcohol (leave out), sales tax (ask accountant).
- Validate demand manually for 2-3 months (simple order form) before building.
- Alternative: Noshable (own-staff option). Ask them whether it covers this model.

## Open items from the Oct 2026 audit
- Alerts engine (UI exists, nothing evaluates or sends rules).
- Pagination on reviews, recommendations, maintenance.
- Stub pages: /reservations, /financials, /messages.
- "as any" casts on tables missing from generated types.
- Cleaner invite flow improvements.

## Ideas
- Expenses and profit per property (fill the /financials stub): track cleaning, maintenance and supplies against revenue.
- Digital guidebook per property using existing WiFi, trash day and access info (amenity audit flagged local guide as missing everywhere).
- Cleaner SMS or push when a clean is due; calendar turnover markers.
- Revenue by booking channel after fees; repeat guest flag to push direct bookings.
- Supplies par levels per unit with a restock list.
- Reminders for licenses, permits and insurance renewals.
