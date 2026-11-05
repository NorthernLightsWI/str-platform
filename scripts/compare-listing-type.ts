// scripts/compare-listing-type.ts
// Prints old (name-based) vs new (stays-based) listing type for every visible property.
// Run: npx tsx --env-file=.env.local scripts/compare-listing-type.ts

import { createClient } from "@supabase/supabase-js"
import { inferListingType, inferListingTypeFromStays, resolveListingType } from "@/lib/benchmarks"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  const today          = new Date().toISOString().slice(0, 10)
  const year1Start     = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

  const [{ data: propRows }, { data: groupRows }, { data: bookingRows }] = await Promise.all([
    (supabase as any)
      .from("visible_properties")
      .select("id, internal_name, external_name, listing_type")
      .order("external_name"),
    (supabase as any)
      .from("visible_properties")
      .select("id, parent_property_id")
      .eq("is_active", true),
    (supabase as any)
      .from("visible_bookings")
      .select("property_id, arrival, departure")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("arrival", year1Start)
      .lt("arrival", today),
  ])

  // Build groupAllIdsMap
  const groupsByParent = new Map<string, string[]>()
  for (const p of groupRows ?? []) {
    if (p.parent_property_id) {
      const arr = groupsByParent.get(p.parent_property_id) ?? []
      arr.push(p.id)
      groupsByParent.set(p.parent_property_id, arr)
    }
  }
  const groupAllIdsMap = new Map<string, string[]>()
  for (const [parentId, children] of groupsByParent) {
    const all = [parentId, ...children]
    for (const mid of all) groupAllIdsMap.set(mid, all)
  }

  const colW = [38, 10, 10, 36]
  const sep  = colW.map(w => "-".repeat(w)).join("-+-")
  const hdr  = [
    "Property".padEnd(colW[0]),
    "Old type".padEnd(colW[1]),
    "New type".padEnd(colW[2]),
    "Basis".padEnd(colW[3]),
  ].join(" | ")

  console.log()
  console.log(hdr)
  console.log(sep)

  let changed = 0
  for (const p of propRows ?? []) {
    const name        = (p.internal_name || p.external_name) as string
    const memberIds   = groupAllIdsMap.get(p.id) ?? [p.id]
    const isManual    = p.listing_type === "nightly" || p.listing_type === "weekly" || p.listing_type === "monthly"
    const oldType     = inferListingType(name)
    const staysInf    = inferListingTypeFromStays(bookingRows ?? [], memberIds)
    const newType     = resolveListingType(p.listing_type, name, staysInf)
    const basis       = isManual    ? `override: ${p.listing_type}`
                      : staysInf   ? staysInf.basis
                      : "name keyword"

    const changed_flag = !isManual && oldType !== newType ? " ◀ CHANGED" : ""
    if (!isManual && oldType !== newType) changed++

    console.log([
      (name + (memberIds.length > 1 ? " [group]" : "")).slice(0, colW[0]).padEnd(colW[0]),
      oldType.padEnd(colW[1]),
      newType.padEnd(colW[2]),
      (basis + changed_flag).slice(0, colW[3]).padEnd(colW[3]),
    ].join(" | "))
  }

  console.log(sep)
  console.log(`${(propRows ?? []).length} properties · ${changed} type(s) changed by stays inference`)
  console.log(`Window: ${year1Start} to ${new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)} (today = ${today})`)
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) })
