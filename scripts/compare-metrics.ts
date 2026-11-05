// Run: npx tsx --env-file=.env.local scripts/compare-metrics.ts
//
// Prints old-vs-new occupancy and ADR per property for the last 30 and 90 days.
// Old = arrival-based full booking length (most current pages).
// New = window-overlap clipped with today cap (lib/metrics.ts).

import { createClient } from "@supabase/supabase-js"
import { nightsInWindow, occupancyInWindow, adrInWindow } from "../lib/metrics"

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL
const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !svcKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const sb = createClient(url, svcKey, { auth: { persistSession: false } })

const DAY_MS = 86_400_000
const today  = new Date().toISOString().slice(0, 10)

function ymd(ms: number) { return new Date(ms).toISOString().slice(0, 10) }
function windowStart(daysBack: number) {
  return ymd(new Date(today + "T00:00:00Z").getTime() - daysBack * DAY_MS)
}
function windowEnd() {
  // inclusive, up to but not including today
  return ymd(new Date(today + "T00:00:00Z").getTime() - DAY_MS)
}

// Old method: arrival-based, full booking length
function oldOcc(bks: any[], pid: string, ws: string, we: string): number {
  const wsDate = new Date(ws + "T00:00:00Z")
  const weDate = new Date(new Date(we + "T00:00:00Z").getTime() + DAY_MS)
  const days   = (weDate.getTime() - wsDate.getTime()) / DAY_MS
  const inRange = bks.filter(b => {
    const a = new Date(b.arrival + "T00:00:00Z")
    return b.property_id === pid && a >= wsDate && a < weDate
  })
  const nights = inRange.reduce((s: number, b: any) => {
    const a = new Date(b.arrival   + "T00:00:00Z")
    const d = new Date(b.departure + "T00:00:00Z")
    return s + Math.max(0, (d.getTime() - a.getTime()) / DAY_MS)
  }, 0)
  return days > 0 ? Math.min(100, (nights / days) * 100) : 0
}

function oldAdr(bks: any[], pid: string, ws: string, we: string): number {
  const wsDate = new Date(ws + "T00:00:00Z")
  const weDate = new Date(new Date(we + "T00:00:00Z").getTime() + DAY_MS)
  const inRange = bks.filter(b => {
    const a = new Date(b.arrival + "T00:00:00Z")
    return b.property_id === pid && a >= wsDate && a < weDate
  })
  let nights = 0, revenue = 0
  for (const b of inRange) {
    const a = new Date(b.arrival   + "T00:00:00Z")
    const d = new Date(b.departure + "T00:00:00Z")
    nights  += Math.max(0, (d.getTime() - a.getTime()) / DAY_MS)
    revenue += Number(b.net_revenue ?? b.total_amount ?? 0)
  }
  return nights > 0 ? revenue / nights : 0
}

async function main() {
  // Fetch active non-hidden properties (use visible_properties)
  const { data: props, error: pe } = await (sb as any)
    .from("visible_properties")
    .select("id, internal_name, external_name, parent_property_id")
    .eq("is_active", true)
    .order("external_name")
  if (pe) { console.error("Props fetch failed:", pe.message); process.exit(1) }

  // Child set — exclude children from per-row display (absorbed into parent)
  const childSet = new Set<string>()
  for (const p of props) {
    if (p.parent_property_id) childSet.add(p.id)
  }
  // Group map: parent → all member IDs
  const groupMap = new Map<string, string[]>()
  for (const p of props) {
    if (p.parent_property_id) {
      const arr = groupMap.get(p.parent_property_id) ?? [p.parent_property_id]
      arr.push(p.id)
      groupMap.set(p.parent_property_id, arr)
    }
  }

  // Fetch bookings from 150 days ago (buffer for long stays overlapping window)
  const fetchStart = windowStart(150)
  const { data: bks, error: be } = await (sb as any)
    .from("visible_bookings")
    .select("property_id, arrival, departure, net_revenue, total_amount")
    .neq("status", "cancelled")
    .eq("is_block", false)
    .gte("departure", windowStart(90))  // must depart after window start
  if (be) { console.error("Bookings fetch failed:", be.message); process.exit(1) }

  const ws30 = windowStart(30)
  const ws90 = windowStart(90)
  const we   = windowEnd()

  const rows: string[] = []
  const header = [
    "Property".padEnd(32),
    "30d Occ Old", "30d Occ New", "Δ30 Occ",
    "30d ADR Old", "30d ADR New", "Δ30 ADR",
    "90d Occ Old", "90d Occ New", "Δ90 Occ",
    "90d ADR Old", "90d ADR New", "Δ90 ADR",
  ].join("  ")

  rows.push(header)
  rows.push("-".repeat(header.length))

  let changed30occ = 0, changed30adr = 0, changed90occ = 0, changed90adr = 0, n = 0

  for (const p of props) {
    if (childSet.has(p.id)) continue
    const memberIds = groupMap.get(p.id) ?? [p.id]
    const name = (p.internal_name || p.external_name).slice(0, 31)

    const o30old = oldOcc(bks, p.id, ws30, we)
    const o30new = occupancyInWindow(bks, memberIds, ws30, we, 1, today)
    const a30old = oldAdr(bks, p.id, ws30, we)
    const a30new = adrInWindow(bks, memberIds, ws30, we, today)

    const o90old = oldOcc(bks, p.id, ws90, we)
    const o90new = occupancyInWindow(bks, memberIds, ws90, we, 1, today)
    const a90old = oldAdr(bks, p.id, ws90, we)
    const a90new = adrInWindow(bks, memberIds, ws90, we, today)

    const fmt = (v: number) => v.toFixed(1).padStart(8)
    const fmtD = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1).padStart(7)
    const fmtR = (v: number) => "$" + Math.round(v).toString().padStart(7)
    const fmtRD = (v: number) => (v >= 0 ? "+" : "") + "$" + Math.round(v).toString().padStart(6)

    rows.push([
      name.padEnd(32),
      fmt(o30old) + "%",
      fmt(o30new) + "%",
      fmtD(o30new - o30old) + "pp",
      fmtR(a30old),
      fmtR(a30new),
      fmtRD(a30new - a30old),
      fmt(o90old) + "%",
      fmt(o90new) + "%",
      fmtD(o90new - o90old) + "pp",
      fmtR(a90old),
      fmtR(a90new),
      fmtRD(a90new - a90old),
    ].join("  "))

    if (Math.abs(o30new - o30old) > 0.1) changed30occ++
    if (Math.abs(a30new - a30old) > 1)   changed30adr++
    if (Math.abs(o90new - o90old) > 0.1) changed90occ++
    if (Math.abs(a90new - a90old) > 1)   changed90adr++
    n++
  }

  rows.push("-".repeat(header.length))
  rows.push(`${n} properties  |  occ changed: 30d=${changed30occ} 90d=${changed90occ}  |  ADR changed: 30d=${changed30adr} 90d=${changed90adr}`)
  rows.push("")
  rows.push(`Windows: 30d = ${ws30} to ${we}  |  90d = ${ws90} to ${we}  (today = ${today}, future nights excluded)`)

  console.log(rows.join("\n"))
}

main().catch(e => { console.error(e); process.exit(1) })
