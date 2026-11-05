# FCCH Platform — Development Conventions

## Hidden properties

Read property-scoped data **only** through the `visible_*` views or `lib/visible.ts`. Never query raw tables (`bookings`, `reviews`, `recommendations`, `tasks`, `proposed_changes`, `listing_changes`, `recurring_maintenance`, `property_amenities`, etc.) outside the files listed in `scripts/visibility-allowlist.json`.

The `prebuild` script (`scripts/check-visibility.mjs`) enforces this automatically and exits 1 on violations.

**When adding a new table with a `property_id` column:**
1. Create a `visible_<table>` view in a Supabase migration (`WHERE NOT p.is_hidden` join on `properties`).
2. Add the table name to the scanned list in `scripts/check-visibility.mjs`.
3. Use `(admin as any).from("visible_<table>")` in all reads outside the allowlist.

**Allowlisted files** (may read raw tables):
- Sync routes (`app/api/sync/**`) — must write all properties including hidden
- Settings visibility and groups tabs — the UI that controls which properties are hidden
- `app/(dashboard)/properties/[id]/page.tsx` — admin direct-URL for hidden properties (admin-role gate in page)
- `lib/visible.ts`, `lib/hidden-properties.ts` — visibility utilities
- `supabase/migrations/`, `scripts/`, `lib/sync/` — infra / migration code

The server action `createProposal` additionally refuses hidden properties by querying `visible_properties` before inserting; `applyProposal` reads `visible_proposed_changes` for every guard check.

## Inactive properties

Historical pages (financials, reservations, changes, cleaning history) **include** inactive properties that had bookings in the period — removing them retroactively would corrupt revenue totals.

Forward-looking features (recommendations, proposals, amenity gap, benchmark comparables, listing audit) use **active properties only** (`is_active = true`). Filter with `.eq("is_active", true)` or by joining `visible_properties` which already carries the flag.

## PriceLabs writes

- `pricelabs_writes_enabled` defaults to `false`. No PriceLabs API write occurs unless this setting is explicitly `"true"` in `app_settings`.
- All writes must go through the guardrails in `app/actions/proposed-changes.ts`:
  - Proposal must be in `approved` status
  - Change must not exceed `pricelabs_max_change_pct` (default 10 %)
  - Proposed value must be ≥ `pricelabs_price_floor` for the property
  - Only one active proposal per property at a time
  - One applied change per property per 30-day window
  - Change types in `MANUAL_ONLY_CHANGE_TYPES` cannot be applied via API
- Tag-write endpoints are disabled until before/after PriceLabs snapshots exist to validate correctness.
- Every write attempt (success or failure) is logged to `sync_log` with `sync_type = "pricelabs_write"` and the full request/response payload.

## Commits

Use a single-line title with multiple `-m` flags:

```bash
git commit -m "feat: short imperative title" -m "Co-Authored-By: ..."
```

Never use PowerShell here-strings (`@'...'@`) for commit messages — they produce CRLF line endings that corrupt the message on Windows.
