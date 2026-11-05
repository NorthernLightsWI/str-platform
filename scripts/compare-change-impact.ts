// Run: npx tsx --env-file=.env.local scripts/compare-change-impact.ts
//
// Compares OLD (inline window-overlap logic in computePropertyMetrics) vs
// NEW (nightsInWindow from lib/metrics) for all visible active properties
// over 30d and 90d windows (yesterday = inclusive end).
//
// Excludes bookingsMade — no equivalent in lib/metrics.
// Prints diffs exceeding a tiny epsilon; "✓ No differences" if all match.

import { createClient } from "@supabase/supabase-js"
import { nightsInWindow } from "../lib/metrics"

const url    = process.env.NEXT_PUBLIC_SUPABASE_URL
const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !svcKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const sb    = createClient(url, svcKey, { auth: { persistSession: false } })
const DAY_MS = 86_400_000

function dateToMs(ymd: string): number {
  return new Date(ymd + "T00:00:00Z").getTime()
}

const todayStr = new Date().toISOString().slice(0, 10)
const todayMs  = dateToMs(todayStr)

function windowStart(daysBack: number): string {
  return new Date(todayMs - daysBack * DAY_MS).toISOString().slice(0, 10)
}
// yesterday = inclusive end (past-only window so today-cap never fires)
function yesterday(): string {
  return new Date(todayMs - DAY_MS).toISOString().slice(0, 10)
}

// ── OLD implementation (copy of computePropertyMetrics inline logic) ──────────

function oldMetrics(
  bookings   : any[],
  propertyId : string,
  windowStart: string,
  windowEnd  : string,
  windowDays : number,
): { nightsBooked: number; occupancyPct: number; adr: number; revpar: number; revenue: number } {
  const wsMs = dateToMs(windowStart)
  const weMs = dateToMs(windowEnd) + DAY_MS  // exclusive upper bound

  let nightsBooked = 0
  let revenue      = 0

  for (const b of bookings) {
    if (b.property_id !== propertyId) continue
    const aMs = dateToMs(b.arrival)
    const dMs = dateToMs(b.departure)
    const totalNights = Math.max(1, (dMs - aMs) / DAY_MS)
    const overlapStart = Math.max(aMs, wsMs)
    const overlapEnd   = Math.min(dMs, weMs)
    const nights       = Math.max(0, (overlapEnd - overlapStart) / DAY_MS)
    if (nights > 0) {
      nightsBooked += nights
      const rev = Number(b.net_revenue ?? b.total_amount ?? 0)
      revenue  += (nights / totalNights) * (isFinite(rev) ? rev : 0)
    }
  }

  const occ    = windowDays > 0 ? (nightsBooked / windowDays) * 100 : 0
  const adr    = nightsBooked > 0 ? revenue / nightsBooked : 0
  const revpar = windowDays > 0 ? revenue / windowDays : 0

  return {
    nightsBooked : Math.round(nightsBooked * 10) / 10,
    occupancyPct : occ,
    adr,
    revpar,
    revenue      : Math.round(revenue * 100) / 100,
  }
}

// ── NEW implementation (nightsInWindow from lib/metrics) ─────────────────────

function newMetrics(
  bookings   : any[],
  propertyId : string,
  windowStart: string,
  windowEnd  : string,
  windowDays : number,
): { nightsBooked: number; occupancyPct: number; adr: number; revpar: number; revenue: number } {
  let nightsBooked = 0
  let revenue      = 0

  for (const b of bookings) {
    if (b.property_id !== propertyId) continue
    // today-cap: for past-only windows it never fires, but pass it anyway for parity
    const n = nightsInWindow(b, windowStart, windowEnd, todayStr)
    if (n > 0) {
      const fullN = Math.max(1, (dateToMs(b.departure) - dateToMs(b.arrival)) / DAY_MS)
      const rev   = Number(b.net_revenue ?? b.total_amount ?? 0)
      nightsBooked += n
      revenue      += isFinite(rev) ? (n / fullN) * rev : 0
    }
  }

  const occ    = windowDays > 0 ? (nightsBooked / windowDays) * 100 : 0
  const adr    = nightsBooked > 0 ? revenue / nightsBooked : 0
  const revpar = windowDays > 0 ? revenue / windowDays : 0

  return {
    nightsBooked : Math.round(nightsBooked * 10) / 10,
    occupancyPct : occ,
    adr,
    revpar,
    revenue      : Math.round(revenue * 100) / 100,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { data: props, error: pe } = await (sb as any)
    .from("visible_properties")
    .select("id, internal_name, external_name")
    .eq("is_active", true)
    .order("external_name")
  if (pe) { console.error("Props fetch failed:", pe.message); process.exit(1) }

  const ws30 = windowStart(30)
  const ws90 = windowStart(90)
  const we   = yesterday()

  // Fetch bookings that could overlap 90d window
  const { data: bks, error: be } = await (sb as any)
    .from("visible_bookings")
    .select("property_id, arrival, departure, net_revenue, total_amount")
    .neq("status", "cancelled")
    .eq("is_block", false)
    .gte("departure", ws90)
    .lt("arrival", todayStr)
  if (be) { console.error("Bookings fetch failed:", be.message); process.exit(1) }

  const EPSILON = 1e-6
  type DiffRow = {
    property: string
    window  : string
    metric  : string
    old     : number
    new_    : number
    diff    : number
  }
  const diffs: DiffRow[] = []

  const header = ["Property", "Window", "Metric", "OLD", "NEW", "Diff"].join(" | ")
  const sep    = "-".repeat(header.length)
  console.log(header)
  console.log(sep)

  for (const p of props) {
    const name = p.internal_name || p.external_name

    for (const [ws, days, label] of [[ws30, 30, "30d"], [ws90, 90, "90d"]] as [string, number, string][]) {
      const o = oldMetrics(bks, p.id, ws, we, days)
      const n = newMetrics(bks, p.id, ws, we, days)

      const checks: [string, number, number][] = [
        ["nightsBooked", o.nightsBooked, n.nightsBooked],
        ["occupancyPct", o.occupancyPct, n.occupancyPct],
        ["adr",          o.adr,          n.adr],
        ["revpar",       o.revpar,       n.revpar],
        ["revenue",      o.revenue,      n.revenue],
      ]

      for (const [metric, oldVal, newVal] of checks) {
        const diff = newVal - oldVal
        if (Math.abs(diff) > EPSILON) {
          const row = `${name.padEnd(30)} | ${label.padEnd(6)} | ${metric.padEnd(12)} | ${oldVal.toFixed(4).padStart(10)} | ${newVal.toFixed(4).padStart(10)} | ${diff > 0 ? "+" : ""}${diff.toFixed(4)}`
          console.log(row)
          diffs.push({ property: name, window: label, metric, old: oldVal, new_: newVal, diff })
        }
      }
    }
  }

  if (diffs.length === 0) {
    console.log("✓ No differences")
  } else {
    console.log(sep)
    console.log(`${diffs.length} differences found across ${(props as any[]).length} properties`)
  }

  console.log(`\nWindows: 30d = ${ws30} to ${we}  |  90d = ${ws90} to ${we}  (today = ${todayStr})`)
}

main().catch(e => { console.error(e); process.exit(1) })
