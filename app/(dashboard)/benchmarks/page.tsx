import { createAdminClient } from "@/lib/supabase/admin"
import {
  BenchmarksClient,
  type PropertyRow,
  type PortfolioSummary,
} from "@/components/benchmarks/benchmarks-client"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"

// ── Market baselines — Appleton, WI ──────────────────────────────────────────
// Defined here (server-side) to avoid importing runtime values from a
// "use client" file, which resolves to undefined in the server context.

const MARKET_OCC    = 57           // percent
const MARKET_ADR    = 206.60       // dollars
const MARKET_REVPAR = Math.round(MARKET_ADR * MARKET_OCC) / 100  // 117.76

// ── Score formula ─────────────────────────────────────────────────────────────
// 50 = at market, 100 = 2× market, 0 = no activity. Capped 0–100.

function scoreComponent(value: number, market: number): number {
  if (!market || !isFinite(market)) return 0
  return Math.min(100, Math.max(0, (value / market / 2) * 100))
}

function computeScore(occ: number, adr: number, revpar: number): number {
  const s =
    (scoreComponent(occ,    MARKET_OCC)    +
     scoreComponent(adr,    MARKET_ADR)    +
     scoreComponent(revpar, MARKET_REVPAR)) / 3
  return isFinite(s) ? Math.round(s) : 0
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BenchmarksPage() {
  const admin = createAdminClient()

  const PERIOD_DAYS    = 365
  const periodStart    = new Date()
  periodStart.setFullYear(periodStart.getFullYear() - 1)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const todayStr       = new Date().toISOString().slice(0, 10)

  const [{ data: propData }, { data: bookingData }, hiddenIds] = await Promise.all([
    admin
      .from("properties")
      .select("id, internal_name, external_name")
      .eq("is_active", true)
      .order("external_name"),

    admin
      .from("bookings")
      .select("property_id, arrival, departure, net_revenue, total_amount")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("arrival", periodStartStr)
      .lt("arrival", todayStr),

    getHiddenPropertyIds(),
  ])

  const visibleProps = (propData ?? []).filter(p => !hiddenIds.has(p.id))

  // Group bookings by property_id
  const byProperty = new Map<string, NonNullable<typeof bookingData>>()
  for (const b of bookingData ?? []) {
    const arr = byProperty.get(b.property_id) ?? []
    arr.push(b)
    byProperty.set(b.property_id, arr)
  }

  const rows: PropertyRow[] = visibleProps.map(p => {
    const bookings     = byProperty.get(p.id) ?? []
    let   bookedNights = 0
    let   revenue      = 0

    for (const b of bookings) {
      // Supabase returns DATE columns as "YYYY-MM-DD" strings.
      // Appending T00:00:00 keeps both dates in the same timezone
      // so the difference is always a whole number of days.
      const arrMs  = new Date(b.arrival   + "T00:00:00").getTime()
      const depMs  = new Date(b.departure + "T00:00:00").getTime()
      const nights = Math.max(0, (depMs - arrMs) / 86_400_000)
      bookedNights += nights

      // Supabase serialises NUMERIC as a string in the JSON payload.
      // Always coerce explicitly to avoid string-concatenation bugs.
      const rev = Number(b.net_revenue ?? b.total_amount ?? 0)
      revenue  += isFinite(rev) ? rev : 0
    }

    const occupancy = bookedNights > 0 ? (bookedNights / PERIOD_DAYS) * 100 : 0
    const adr       = bookedNights > 0 ? revenue / bookedNights : 0
    const revpar    = PERIOD_DAYS  > 0 ? revenue / PERIOD_DAYS  : 0

    return {
      id       : p.id,
      name     : p.internal_name || p.external_name,
      occupancy: +occupancy.toFixed(2),
      adr      : +adr.toFixed(2),
      revpar   : +revpar.toFixed(2),
      score    : computeScore(occupancy, adr, revpar),
    }
  })

  // ── Portfolio summary ───────────────────────────────────────────────────────
  const totalAvail = PERIOD_DAYS * Math.max(rows.length, 1)
  let   totalBooked  = 0
  let   totalRevenue = 0

  for (const r of rows) {
    totalBooked  += (r.occupancy / 100) * PERIOD_DAYS
    totalRevenue += r.revpar * PERIOD_DAYS
  }

  const portOcc    = totalAvail  > 0 ? (totalBooked  / totalAvail) * 100 : 0
  const portADR    = totalBooked > 0 ? totalRevenue  / totalBooked       : 0
  const portRevPAR = totalAvail  > 0 ? totalRevenue  / totalAvail        : 0
  const portScore  = rows.length > 0
    ? Math.round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length)
    : 0

  const summary: PortfolioSummary = {
    occupancy : +portOcc.toFixed(2),
    adr       : +portADR.toFixed(2),
    revpar    : +portRevPAR.toFixed(2),
    score     : portScore,
  }

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Benchmarks</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Trailing 12-month performance vs. Appleton market averages ·{" "}
          {rows.length} active propert{rows.length !== 1 ? "ies" : "y"}
        </p>
      </div>

      <BenchmarksClient rows={rows} summary={summary} />
    </div>
  )
}
