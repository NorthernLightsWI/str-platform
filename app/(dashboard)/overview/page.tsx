import { ArrowUpRight, ArrowDownRight, DollarSign, Home, TrendingUp, BarChart3 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { RevenueChart, type RevenueDataPoint   } from "@/components/overview/revenue-chart"
import { OccupancyChart, type OccupancyDataPoint } from "@/components/overview/occupancy-chart"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
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

  const day30Start = addDays(today, -29)                 // rolling 30 days
  const day30End   = addDays(today, 1)

  // ── Queries ────────────────────────────────────────────────────────────────

  const [{ data: propData }, { data: bkData }, { data: recentData }, hiddenIds] = await Promise.all([
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

    getHiddenPropertyIds(),
  ])

  const properties : PropertyRow[] = (propData ?? []) as PropertyRow[]
  const bookings   : BookingRow[]  = (bkData   ?? []) as BookingRow[]

  const activeProps  = properties.filter(p => p.is_active && !hiddenIds.has(p.id))
  const activeCount  = activeProps.length

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

    </div>
  )
}
