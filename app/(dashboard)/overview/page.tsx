import { ArrowUpRight, ArrowDownRight, DollarSign, Home, TrendingUp, BarChart3, Activity, ExternalLink } from "lucide-react"
import Link from "next/link"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { RevenueChart, type RevenueDataPoint   } from "@/components/overview/revenue-chart"
import { OccupancyChart, type OccupancyDataPoint } from "@/components/overview/occupancy-chart"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import { computeHealthScore, healthColor, type HealthInput } from "@/lib/health-score"
import { cn } from "@/lib/utils"

// ── Date helpers (UTC-safe, no external deps) ─────────────────────────────────

function utcToday() {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000)
}

// First day of the month N months before d
function prevMonthStart(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1))
}

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Nights in a booking that overlap [start, end)
function overlap(arrival: string, departure: string, start: Date, end: Date) {
  const a = new Date(arrival   + "T00:00:00Z")
  const d = new Date(departure + "T00:00:00Z")
  const s = a > start ? a : start
  const e = d < end   ? d : end
  return Math.max(0, (e.getTime() - s.getTime()) / 86_400_000)
}

// ── Metric types ──────────────────────────────────────────────────────────────

type BookingRow = {
  property_id  : string
  arrival      : string
  departure    : string
  total_amount : number | null
  status       : string
}

type PropertyRow = {
  id            : string
  external_name : string
  internal_name : string | null
  is_active     : boolean
}

type KPIs = { revenue: number; occupancy: number; adr: number; revpar: number }

// ── KPI computation ───────────────────────────────────────────────────────────

function computeKPIs(
  bookings    : BookingRow[],
  activeCount : number,
  start       : Date,
  end         : Date,
): KPIs {
  const days            = (end.getTime() - start.getTime()) / 86_400_000
  const availableNights = activeCount * days

  // Attribute revenue + nights to the booking's arrival month
  const inRange = bookings.filter(b => {
    if (b.status === "cancelled") return false
    const a = new Date(b.arrival + "T00:00:00Z")
    return a >= start && a < end
  })

  const revenue = inRange.reduce((s, b) => s + (b.total_amount ?? 0), 0)

  const bookedNights = inRange.reduce((s, b) => {
    const a = new Date(b.arrival   + "T00:00:00Z")
    const d = new Date(b.departure + "T00:00:00Z")
    return s + (d.getTime() - a.getTime()) / 86_400_000
  }, 0)

  const occupancy = availableNights > 0 ? (bookedNights / availableNights) * 100 : 0
  const adr       = bookedNights > 0 ? revenue / bookedNights : 0
  const revpar    = availableNights > 0 ? revenue / availableNights : 0

  return { revenue, occupancy, adr, revpar }
}

function momChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / previous) * 100
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000)     return "$" + (n / 1_000).toFixed(1)     + "K"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number) { return n.toFixed(1) + "%" }

function fmtDate(ymd: string) {
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  })
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  delta,
  icon: Icon,
  fmt,
}: {
  label : string
  value : number
  delta : number | null
  icon  : React.ElementType
  fmt   : (n: number) => string
}) {
  const up   = delta !== null && delta >= 0
  const down = delta !== null && delta < 0

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </div>
      </div>

      <p className="text-3xl font-semibold tracking-tight text-foreground">{fmt(value)}</p>

      {delta !== null && (
        <div className={cn(
          "flex items-center gap-1 text-xs font-medium",
          up   && "text-emerald-400",
          down && "text-red-400",
        )}>
          {up   && <ArrowUpRight   className="size-3.5" />}
          {down && <ArrowDownRight className="size-3.5" />}
          <span>
            {up ? "+" : ""}{delta.toFixed(1)}% vs prior period
          </span>
        </div>
      )}
    </div>
  )
}

// ── Health KPI card ───────────────────────────────────────────────────────────

function HealthKPICard({ score, count }: { score: number; count: number }) {
  const color  = healthColor(score)
  const numCls =
    color === "green"  ? "text-emerald-400" :
    color === "yellow" ? "text-amber-400"   :
    "text-red-400"

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Portfolio Health</p>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Activity className="size-4" />
        </div>
      </div>
      <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", numCls)}>{score}</p>
      <p className="text-xs text-muted-foreground">
        avg across {count} active {count === 1 ? "property" : "properties"}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OverviewPage() {
  const supabase = await createClient()
  const today    = utcToday()

  // Date ranges
  const cmStart  = monthStart(today)
  const cmEnd    = addDays(today, 1)                     // exclusive — includes today
  const cmDays   = (cmEnd.getTime() - cmStart.getTime()) / 86_400_000

  const pmStart  = prevMonthStart(today, 1)              // first of last month
  const pmEnd    = addDays(pmStart, cmDays)              // same span length

  const chart12Start = prevMonthStart(today, 11)         // 12 months of data

  const day30Start  = addDays(today, -29)                // rolling 30 days
  const day30End    = addDays(today, 1)
  const day60Start  = addDays(today, -60)                // recent cleaning window

  // ── Queries ────────────────────────────────────────────────────────────────

  const admin = createAdminClient()

  const [
    { data: propData },
    { data: bkData },
    { data: recentData },
    { data: reviewData },
    { data: cleaningData },
    { data: maintData },
    hiddenIds,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, external_name, internal_name, is_active"),

    supabase
      .from("bookings")
      .select("property_id, arrival, departure, total_amount, status")
      .neq("is_block", true)
      .gte("departure", toYMD(chart12Start)),   // catch bookings overlapping the window

    supabase
      .from("bookings")
      .select("id, guest_name, arrival, departure, total_amount, listing_site, status, properties(external_name)")
      .neq("is_block", true)
      .neq("status", "cancelled")
      .order("arrival", { ascending: false })
      .limit(10),

    admin
      .from("reviews")
      .select("property_id, overall_rating"),

    admin
      .from("cleaning_records")
      .select("property_id")
      .eq("status", "completed")
      .gte("scheduled_date", toYMD(day60Start)),

    admin
      .from("maintenance_issues")
      .select("property_id")
      .in("status", ["open", "in_progress"])
      .in("priority", ["high", "urgent"]),

    getHiddenPropertyIds(),
  ])

  const properties : PropertyRow[] = (propData ?? []) as PropertyRow[]
  const bookings   : BookingRow[]  = (bkData   ?? []) as BookingRow[]

  const activeProps  = properties.filter(p => p.is_active && !hiddenIds.has(p.id))
  const activeCount  = activeProps.length

  // ── Health score inputs ───────────────────────────────────────────────────

  const reviewMap = new Map<string, { ratingTotal: number; ratedCount: number; reviewCount: number }>()
  for (const r of (reviewData ?? [])) {
    if (!r.property_id) continue
    const cur    = reviewMap.get(r.property_id) ?? { ratingTotal: 0, ratedCount: 0, reviewCount: 0 }
    const rating = r.overall_rating != null ? Number(r.overall_rating) : null
    reviewMap.set(r.property_id, {
      ratingTotal : cur.ratingTotal + (rating ?? 0),
      ratedCount  : cur.ratedCount  + (rating != null ? 1 : 0),
      reviewCount : cur.reviewCount + 1,
    })
  }
  const recentCleanSet = new Set((cleaningData ?? []).map(c => c.property_id))
  const maintCountMap  = new Map<string, number>()
  for (const m of (maintData ?? [])) {
    if (!m.property_id) continue
    maintCountMap.set(m.property_id, (maintCountMap.get(m.property_id) ?? 0) + 1)
  }

  // ── Health leaderboard rows ───────────────────────────────────────────────

  type HealthRow = { id: string; name: string; healthScore: number; mtdRevenue: number; mtdOccupancy: number }

  const healthRows: HealthRow[] = activeProps.map(p => {
    const pbMTD = bookings.filter(b => {
      if (b.status === "cancelled") return false
      const a = new Date(b.arrival + "T00:00:00Z")
      return b.property_id === p.id && a >= cmStart && a < cmEnd
    })
    const mtdRevenue = pbMTD.reduce((s, b) => s + (b.total_amount ?? 0), 0)
    const mtdNights  = pbMTD.reduce((s, b) => {
      const a = new Date(b.arrival   + "T00:00:00Z")
      const d = new Date(b.departure + "T00:00:00Z")
      return s + (d.getTime() - a.getTime()) / 86_400_000
    }, 0)
    const mtdOccupancy = cmDays > 0 ? Math.min(100, (mtdNights / cmDays) * 100) : 0

    const pb12m     = bookings.filter(b => b.property_id === p.id && b.status !== "cancelled")
    const rev12m    = pb12m.reduce((s, b) => s + (b.total_amount ?? 0), 0)
    const nights12m = pb12m.reduce((s, b) => {
      const a = new Date(b.arrival   + "T00:00:00Z")
      const d = new Date(b.departure + "T00:00:00Z")
      return s + (d.getTime() - a.getTime()) / 86_400_000
    }, 0)
    const occ12m = nights12m > 0 ? Math.min(100, (nights12m / 365) * 100) : 0
    const adr12m = nights12m > 0 ? rev12m / nights12m : 0

    const rws = reviewMap.get(p.id)
    const input: HealthInput = {
      occupancy12m          : occ12m,
      adr12m,
      reviewCount           : rws?.reviewCount ?? 0,
      avgRating             : rws && rws.ratedCount > 0 ? rws.ratingTotal / rws.ratedCount : 0,
      hasRecentCleaning     : recentCleanSet.has(p.id),
      openHighPriorityIssues: maintCountMap.get(p.id) ?? 0,
    }
    const hs = computeHealthScore(input)

    return {
      id          : p.id,
      name        : p.internal_name || p.external_name,
      healthScore : hs.total,
      mtdRevenue  : Math.round(mtdRevenue),
      mtdOccupancy: +mtdOccupancy.toFixed(1),
    }
  }).sort((a, b) => a.healthScore - b.healthScore)   // worst first

  const avgHealthScore = healthRows.length > 0
    ? Math.round(healthRows.reduce((s, r) => s + r.healthScore, 0) / healthRows.length)
    : 0

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpiCM = computeKPIs(bookings, activeCount, cmStart, cmEnd)
  const kpiPM = computeKPIs(bookings, activeCount, pmStart, pmEnd)

  // ── 12-month revenue ──────────────────────────────────────────────────────

  const revenueByMonth: RevenueDataPoint[] = Array.from({ length: 12 }, (_, i) => {
    const mStart = prevMonthStart(today, 11 - i)
    const mEnd   = i < 11 ? prevMonthStart(today, 10 - i) : cmEnd

    const rev = bookings
      .filter(b => {
        if (b.status === "cancelled") return false
        const a = new Date(b.arrival + "T00:00:00Z")
        return a >= mStart && a < mEnd
      })
      .reduce((s, b) => s + (b.total_amount ?? 0), 0)

    return {
      month   : mStart.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
      revenue : Math.round(rev),
    }
  })

  // ── Occupancy by property (rolling 30 days) ───────────────────────────────

  const occupancyByProperty: OccupancyDataPoint[] = activeProps
    .map(p => {
      const booked = bookings
        .filter(b => b.property_id === p.id && b.status !== "cancelled")
        .reduce((s, b) => s + overlap(b.arrival, b.departure, day30Start, day30End), 0)

      const label = (p.internal_name || p.external_name)
      return {
        name      : label.length > 36 ? label.slice(0, 35) + "…" : label,
        occupancy : Math.min(100, Math.round((booked / 30) * 100)),
      }
    })
    .sort((a, b) => b.occupancy - a.occupancy)

  // ── Recent bookings ───────────────────────────────────────────────────────

  type RecentRow = {
    id           : string
    guest_name   : string | null
    arrival      : string
    departure    : string
    total_amount : number | null
    listing_site : string | null
    status       : string
    properties   : { external_name: string } | null
  }
  const recentBookings = (recentData ?? []) as RecentRow[]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Portfolio Overview
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Month-to-date performance · {activeCount} active {activeCount === 1 ? "property" : "properties"}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KPICard
          label="Revenue (MTD)"
          value={kpiCM.revenue}
          delta={momChange(kpiCM.revenue, kpiPM.revenue)}
          icon={DollarSign}
          fmt={fmtMoney}
        />
        <KPICard
          label="Avg Occupancy (MTD)"
          value={kpiCM.occupancy}
          delta={momChange(kpiCM.occupancy, kpiPM.occupancy)}
          icon={Home}
          fmt={fmtPct}
        />
        <KPICard
          label="Avg Daily Rate"
          value={kpiCM.adr}
          delta={momChange(kpiCM.adr, kpiPM.adr)}
          icon={TrendingUp}
          fmt={fmtMoney}
        />
        <KPICard
          label="RevPAR"
          value={kpiCM.revpar}
          delta={momChange(kpiCM.revpar, kpiPM.revpar)}
          icon={BarChart3}
          fmt={fmtMoney}
        />
        <HealthKPICard score={avgHealthScore} count={activeCount} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">

        {/* 12-month revenue */}
        <div className="xl:col-span-3 rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">12-Month Revenue</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-5">Portfolio revenue by arrival month</p>
          <RevenueChart data={revenueByMonth} />
        </div>

        {/* Occupancy by property */}
        <div className="xl:col-span-2 rounded-xl border border-border bg-card p-5 overflow-y-auto max-h-[480px]">
          <p className="text-sm font-semibold text-foreground">Occupancy by Property</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-5">Rolling 30 days · green ≥70% · yellow ≥40%</p>
          <OccupancyChart data={occupancyByProperty} />
        </div>
      </div>

      {/* Recent bookings */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Recent Bookings</p>
            <p className="text-xs text-muted-foreground mt-0.5">10 most recent confirmed reservations</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Guest", "Property", "Channel", "Check-in", "Check-out", "Revenue"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider",
                      i === 5 ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No bookings found
                  </td>
                </tr>
              ) : recentBookings.map(b => (
                <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground whitespace-nowrap">
                    {b.guest_name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground max-w-[200px] truncate">
                    {b.properties?.external_name ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground capitalize">
                      {b.listing_site ?? "Direct"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtDate(b.arrival)}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtDate(b.departure)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-foreground tabular-nums whitespace-nowrap">
                    {b.total_amount != null
                      ? "$" + b.total_amount.toLocaleString("en-US", { maximumFractionDigits: 0 })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portfolio Health leaderboard */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Portfolio Health</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active properties sorted by health score — lowest first
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {[
                  { label: "Property",      cls: "text-left   px-5" },
                  { label: "Score",         cls: "text-center px-4" },
                  { label: "Revenue (MTD)", cls: "text-right  px-5" },
                  { label: "Occ % (MTD)",   cls: "text-right  px-5" },
                  { label: "",              cls: "text-center px-4" },
                ].map(({ label, cls }) => (
                  <th key={label || "_action"} className={cn(
                    "py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground",
                    cls,
                  )}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {healthRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No active properties
                  </td>
                </tr>
              ) : healthRows.map(row => {
                const color = healthColor(row.healthScore)
                return (
                  <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground max-w-[240px] truncate">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                        color === "green"  && "bg-emerald-400/15 text-emerald-500",
                        color === "yellow" && "bg-amber-400/15   text-amber-500",
                        color === "red"    && "bg-red-400/15     text-red-500",
                      )}>
                        {row.healthScore}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-foreground">
                      {row.mtdRevenue > 0 ? fmtMoney(row.mtdRevenue) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className={cn(
                        "font-medium",
                        row.mtdOccupancy >= 70 ? "text-emerald-400" :
                        row.mtdOccupancy >= 40 ? "text-yellow-400"  :
                        row.mtdOccupancy  > 0  ? "text-red-400"     :
                        "text-muted-foreground",
                      )}>
                        {row.mtdOccupancy > 0 ? row.mtdOccupancy.toFixed(1) + "%" : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/properties/${row.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        View
                        <ExternalLink className="size-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
