/**
 * Part 2a verification: check that every visible_* view leaks 0 rows
 * for hidden properties, and report hidden property revenue.
 *
 * Run: node scripts/verify-part2a.mjs
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

// Load .env.local so the script works without exporting env vars manually
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) process.env[m[1]] ??= m[2].trim()
  }
} catch { /* .env.local not present — fall through to process.env */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const admin = createClient(URL, KEY, { auth: { persistSession: false } })

// ── 1. Build hidden-property ID set ────────────────────────────────────────
const { data: allProps } = await admin
  .from("properties")
  .select("id, internal_name, external_name, is_hidden, is_active")

const hiddenProps = (allProps ?? []).filter(p => p.is_hidden)
const hiddenIds   = hiddenProps.map(p => p.id)
const totalProps  = (allProps ?? []).length

console.log(`\n=== HIDDEN PROPERTIES (${hiddenProps.length} of ${totalProps} total) ===`)
for (const p of hiddenProps) {
  console.log(`  "${p.internal_name || p.external_name}"  active=${p.is_active}  id=${p.id}`)
}

// ── 2. Revenue / booking counts for hidden props (trailing 12m) ─────────────
const cutoff12m = new Date()
cutoff12m.setFullYear(cutoff12m.getFullYear() - 1)
const cutoffStr = cutoff12m.toISOString().slice(0, 10)

const { data: rawBk } = await admin
  .from("bookings")
  .select("property_id, total_amount")
  .neq("status", "cancelled")
  .eq("is_block", false)
  .gte("arrival", cutoffStr)

console.log("\n=== HIDDEN PROPERTY REVENUE (trailing 12m, raw table) ===")
let grandTotal = 0
for (const p of hiddenProps) {
  const bks = (rawBk ?? []).filter(b => b.property_id === p.id)
  const rev = bks.reduce((s, b) => s + Number(b.total_amount ?? 0), 0)
  grandTotal += rev
  const flag = rev > 0 ? " ← has real revenue" : ""
  console.log(`  "${p.internal_name || p.external_name}"  bookings=${bks.length}  revenue=$${Math.round(rev).toLocaleString()}  active=${p.is_active}${flag}`)
}
console.log(`  TOTAL hidden revenue: $${Math.round(grandTotal).toLocaleString()}`)

if (hiddenIds.length === 0) {
  console.log("  (no hidden properties to check)")
  process.exit(0)
}

// ── 3. Check views for hidden-property row leakage ──────────────────────────
// For each table, query the VIEW filtered to hidden property IDs.
// If the view is correct, count must be 0 for all property-scoped tables.

async function countInView(viewTable, propIdCol = "property_id") {
  const { count, error } = await admin
    .from(viewTable)
    .select("*", { count: "exact", head: true })
    .in(propIdCol, hiddenIds)
  if (error) return { leaks: `ERR: ${error.message}`, viewTotal: "?" }

  // Also get view total for reference
  const { count: total } = await admin
    .from(viewTable)
    .select("*", { count: "exact", head: true })

  return { leaks: count ?? 0, viewTotal: total ?? 0 }
}

const checks = [
  ["visible_bookings",               "bookings (view)"],
  ["visible_reviews",                "reviews (view)"],
  ["visible_cleaning_records",       "cleaning_records (view)"],
  ["visible_maintenance_issues",     "maintenance_issues (view)"],
  ["visible_property_amenities",     "property_amenities (view)"],
  ["visible_listing_changes",        "listing_changes (view)"],
  ["visible_recommendations",        "recommendations (view)"],
  ["visible_tasks",                  "tasks (view)"],
  ["visible_vendor_contacts",        "vendor_contacts (view)"],
  ["visible_recurring_maintenance",  "recurring_maintenance (view)"],
  ["visible_property_info_changelog","property_info_changelog (view)"],
  ["visible_property_operational_info","property_operational_info (view)"],
]

// alert_settings: nullable property_id; query differently
const { count: alertLeaks } = await admin
  .from("visible_alert_settings")
  .select("*", { count: "exact", head: true })
  .in("property_id", hiddenIds)
const { count: alertTotal } = await admin
  .from("visible_alert_settings")
  .select("*", { count: "exact", head: true })

// visible_properties: by definition excludes is_hidden=true
const { count: visPropsTotal } = await admin
  .from("visible_properties")
  .select("*", { count: "exact", head: true })

console.log("\n=== VIEW ISOLATION CHECK (hidden-property row leakage) ===")
console.log("View".padEnd(38) + "Leaks".padEnd(10) + "ViewTotal".padEnd(12) + "Status")
console.log("-".repeat(72))

let allClean = true

for (const [view, label] of checks) {
  const r = await countInView(view)
  const ok = typeof r.leaks === "number" && r.leaks === 0
  if (!ok) allClean = false
  const status = ok ? "✓" : "✗ LEAK"
  console.log(`${label.padEnd(38)}${String(r.leaks).padEnd(10)}${String(r.viewTotal).padEnd(12)}${status}`)
}

// alert_settings
{
  const ok = (alertLeaks ?? 0) === 0
  if (!ok) allClean = false
  console.log(`${"alert_settings (view)".padEnd(38)}${String(alertLeaks ?? 0).padEnd(10)}${String(alertTotal ?? 0).padEnd(12)}${ok ? "✓" : "✗ LEAK"}`)
}

// visible_properties
{
  const { count: hiddenInVisProp } = await admin
    .from("visible_properties")
    .select("*", { count: "exact", head: true })
    .in("id", hiddenIds)
  const ok = (hiddenInVisProp ?? 0) === 0
  if (!ok) allClean = false
  console.log(`${"visible_properties".padEnd(38)}${String(hiddenInVisProp ?? 0).padEnd(10)}${String(visPropsTotal ?? 0).padEnd(12)}${ok ? "✓" : "✗ LEAK"}`)
}

console.log("\n" + (allClean
  ? "ALL CHECKS PASSED — no hidden-property rows in any view."
  : "FAILURES DETECTED — see ✗ rows above."))

// ── 4. properties/[id] direct URL for hidden property ──────────────────────
console.log("\n=== properties/[id] DIRECT URL ACCESS ===")
const hiddenId = hiddenIds[0]
const hiddenName = hiddenProps[0].internal_name || hiddenProps[0].external_name

const { data: viaView } = await admin
  .from("visible_properties")
  .select("id")
  .eq("id", hiddenId)
  .maybeSingle()

const { data: viaRaw } = await admin
  .from("properties")
  .select("id, is_hidden")
  .eq("id", hiddenId)
  .maybeSingle()

console.log(`Hidden property tested: "${hiddenName}"`)
console.log(`  visible_properties lookup: ${viaView ? "RETURNED ROW (accessible)" : "null → 404"}`)
console.log(`  raw properties lookup:     ${viaRaw ? `RETURNED ROW (is_hidden=${viaRaw.is_hidden})` : "null"}`)
