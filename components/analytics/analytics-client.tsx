"use client"

import { useState, useMemo } from "react"
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export type BookingRaw = {
  arrival      : string
  departure    : string
  total_amount : number | null
  net_revenue  : number | null
  listing_site : string | null
  property_id  : string
}

export type PropertyRaw = {
  id   : string
  name : string
}

type Tab = "3m" | "6m" | "12m"

const TABS: { value: Tab; label: string; months: number }[] = [
  { value: "3m",  label: "3 Months",  months: 3  },
  { value: "6m",  label: "6 Months",  months: 6  },
  { value: "12m", label: "12 Months", months: 12 },
]

const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const CHANNEL_COLORS: Record<string, string> = {
  Airbnb : "#ff5a5f",
  Vrbo   : "#3d67ff",
  Direct : "#10b981",
  Other  : "#71717a",
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function generateMonthStarts(count: number): Date[] {
  const today = new Date()
  return Array.from({ length: count }, (_, i) =>
    new Date(today.getFullYear(), today.getMonth() - (count - 1 - i), 1),
  )
}

function normalizeChannel(site: string | null): string {
  if (!site) return "Direct"
  const s = site.toLowerCase()
  if (s.includes("airbnb"))                    return "Airbnb"
  if (s.includes("vrbo") || s.includes("homeaway")) return "Vrbo"
  if (s.includes("direct") || s === "owner")   return "Direct"
  return "Other"
}

function computeData(bookings: BookingRaw[], properties: PropertyRaw[], monthCount: number) {
  const monthStarts  = generateMonthStarts(monthCount)
  const propCount    = Math.max(properties.length, 1)
  const nameMap      = new Map(properties.map(p => [p.id, p.name]))
  const today        = new Date()
  const periodStart  = monthStarts[0]

  // ── Monthly metrics ───────────────────────────────────────────────────────
  const monthly = monthStarts.map(ms => {
    const nextMs      = new Date(ms.getFullYear(), ms.getMonth() + 1, 1)
    const lastDay     = new Date(ms.getFullYear(), ms.getMonth() + 1, 0)
    const totalNights = daysInMonth(ms) * propCount

    let revenue = 0, bookedNights = 0, revenueForADR = 0, nightsForADR = 0

    for (const b of bookings) {
      const arr = parseLocal(b.arrival)
      const dep = parseLocal(b.departure)
      const rev = b.net_revenue ?? b.total_amount ?? 0

      // Overlap nights for occupancy
      const olStart = arr  > ms     ? arr  : ms
      const olEnd   = dep  < nextMs ? dep  : nextMs
      const nights  = Math.max(0, (olEnd.getTime() - olStart.getTime()) / 86400000)
      bookedNights += nights

      // Revenue & ADR: bookings arriving this month
      if (arr >= ms && arr <= lastDay) {
        const bNights = (dep.getTime() - arr.getTime()) / 86400000
        revenue      += rev
        revenueForADR += rev
        nightsForADR  += bNights
      }
    }

    return {
      month     : `${MO[ms.getMonth()]} '${String(ms.getFullYear()).slice(2)}`,
      revenue   : Math.round(revenue),
      occupancy : totalNights > 0 ? Math.round((bookedNights / totalNights) * 1000) / 10 : 0,
      adr       : nightsForADR > 0 ? Math.round(revenueForADR / nightsForADR) : 0,
    }
  })

  // ── Period bookings (arrival within range) ────────────────────────────────
  const pb = bookings.filter(b => {
    const arr = parseLocal(b.arrival)
    return arr >= periodStart && arr <= today
  })

  // ── Channel breakdown ─────────────────────────────────────────────────────
  const chRev: Record<string, number> = {}
  for (const b of pb) {
    const ch = normalizeChannel(b.listing_site)
    chRev[ch] = (chRev[ch] ?? 0) + (b.net_revenue ?? b.total_amount ?? 0)
  }
  const totalRev = Object.values(chRev).reduce((a, v) => a + v, 0)
  const channels = Object.entries(chRev)
    .map(([name, value]) => ({
      name,
      value : Math.round(value),
      pct   : totalRev > 0 ? Math.round((value / totalRev) * 100) : 0,
      color : CHANNEL_COLORS[name] ?? "#71717a",
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)

  // ── Property revenue top 10 ───────────────────────────────────────────────
  const pRev: Record<string, number> = {}
  for (const b of pb) {
    pRev[b.property_id] = (pRev[b.property_id] ?? 0) + (b.net_revenue ?? b.total_amount ?? 0)
  }
  const propRevenue = Object.entries(pRev)
    .map(([id, revenue]) => ({
      name   : (nameMap.get(id) ?? "Unknown").slice(0, 22),
      revenue: Math.round(revenue),
    }))
    .filter(d => d.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .reverse() // highest at top of horizontal chart

  return { monthly, channels, propRevenue }
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtUSD     = (v: number) => `$${v.toLocaleString("en-US")}`
const fmtPct     = (v: number) => `${v}%`
const fmtRevAxis = (v: number) => v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
const fmtPctAxis = (v: number) => `${v}%`

// ── Tooltip components ────────────────────────────────────────────────────────

function LineTooltip({ active, payload, label, formatter }: {
  active?    : boolean
  payload?   : Array<{ value: number }>
  label?     : string
  formatter? : (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl text-sm">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-semibold text-foreground">{formatter?.(payload[0].value) ?? payload[0].value}</p>
    </div>
  )
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl text-sm">
      <p className="font-semibold text-foreground">{d.name}</p>
      <p className="text-muted-foreground">{fmtUSD(d.value)}</p>
      <p className="text-xs text-muted-foreground">{d.pct}% of revenue</p>
    </div>
  )
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl text-sm">
      <p className="text-xs text-muted-foreground mb-0.5 max-w-[180px] truncate">
        {payload[0].payload.name}
      </p>
      <p className="font-semibold text-foreground">{fmtUSD(payload[0].value)}</p>
    </div>
  )
}

// ── Shared chart style constants ──────────────────────────────────────────────

const AXIS_TICK   = { fill: "#71717a", fontSize: 11 }
const GRID_PROPS  = { stroke: "rgba(255,255,255,0.05)", strokeDasharray: "3 3" as const }

// ── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, className }: {
  title     : string
  subtitle? : string
  children  : React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">
        {subtitle ?? ""}
      </p>
      {children}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[220px]">
      <p className="text-sm text-muted-foreground">No data for this period</p>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function AnalyticsClient({
  bookings,
  properties,
}: {
  bookings   : BookingRaw[]
  properties : PropertyRaw[]
}) {
  const [tab, setTab] = useState<Tab>("12m")
  const months = TABS.find(t => t.value === tab)!.months

  const { monthly, channels, propRevenue } = useMemo(
    () => computeData(bookings, properties, months),
    [bookings, properties, months],
  )

  const barHeight = Math.max(220, propRevenue.length * 40 + 20)

  return (
    <div className="space-y-4">

      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-xl bg-muted p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Revenue line (full width) ─────────────────────────────────── */}
        <ChartCard
          title="Revenue Over Time"
          subtitle="Monthly net revenue from bookings"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="month"
                tick={AXIS_TICK}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={fmtRevAxis}
                tick={AXIS_TICK}
                axisLine={false} tickLine={false}
                width={52}
              />
              <Tooltip content={<LineTooltip formatter={fmtUSD} />} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Occupancy line ────────────────────────────────────────────── */}
        <ChartCard title="Occupancy Rate" subtitle="% of available nights booked per month">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="month"
                tick={AXIS_TICK}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={fmtPctAxis}
                tick={AXIS_TICK}
                axisLine={false} tickLine={false}
                width={40}
                domain={[0, 100]}
              />
              <Tooltip content={<LineTooltip formatter={fmtPct} />} />
              <Line
                type="monotone"
                dataKey="occupancy"
                stroke="#34d399"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#34d399", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── ADR line ──────────────────────────────────────────────────── */}
        <ChartCard title="Average Daily Rate" subtitle="Revenue per occupied night">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="month"
                tick={AXIS_TICK}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tickFormatter={fmtRevAxis}
                tick={AXIS_TICK}
                axisLine={false} tickLine={false}
                width={52}
              />
              <Tooltip content={<LineTooltip formatter={fmtUSD} />} />
              <Line
                type="monotone"
                dataKey="adr"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#60a5fa", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Channel pie ───────────────────────────────────────────────── */}
        <ChartCard title="Revenue by Channel" subtitle="Booking source breakdown for selected period">
          {channels.length === 0 ? <EmptyChart /> : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie
                    data={channels}
                    cx="50%" cy="50%"
                    innerRadius="55%"
                    outerRadius="82%"
                    dataKey="value"
                    strokeWidth={0}
                    paddingAngle={2}
                  >
                    {channels.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex-1 space-y-3">
                {channels.map(d => (
                  <div key={d.name}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ background: d.color }}
                        />
                        <span className="text-xs font-medium text-foreground truncate">
                          {d.name}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{d.pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-3.5">{fmtUSD(d.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* ── Property revenue bar ──────────────────────────────────────── */}
        <ChartCard title="Revenue by Property" subtitle="Top 10 properties for selected period">
          {propRevenue.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={barHeight}>
              <BarChart
                data={propRevenue}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={fmtRevAxis}
                  tick={AXIS_TICK}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={AXIS_TICK}
                  axisLine={false} tickLine={false}
                  width={155}
                />
                <Tooltip
                  content={<BarTooltip />}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar
                  dataKey="revenue"
                  fill="#8b5cf6"
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>
    </div>
  )
}
