"use client"

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts"
import { TrendingUp, Percent, DollarSign, Award, Sun, Users, Building2, Calendar, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Market constants ──────────────────────────────────────────────────────────

const MARKET_OCC    = 57
const MARKET_ADR    = 206.60
const MARKET_REVPAR = +(MARKET_ADR * MARKET_OCC / 100).toFixed(2)  // 117.76
const MARKET_SCORE  = 72

// ── Seasonal index data ───────────────────────────────────────────────────────
// Index values relative to annual average (100 = avg). Jul = peak.

const SEASONAL = [
  { month: "Jan", index: 65 },
  { month: "Feb", index: 70 },
  { month: "Mar", index: 80 },
  { month: "Apr", index: 85 },
  { month: "May", index: 90 },
  { month: "Jun", index: 110 },
  { month: "Jul", index: 120 },
  { month: "Aug", index: 115 },
  { month: "Sep", index: 95 },
  { month: "Oct", index: 90 },
  { month: "Nov", index: 75 },
  { month: "Dec", index: 85 },
].map(s => ({
  ...s,
  occ: +(MARKET_OCC * s.index / 100).toFixed(1),
}))

// Bar color based on index vs average
function barColor(index: number): string {
  if (index >= 100) return "#f59e0b"   // amber — peak
  if (index >= 85)  return "#6366f1"   // indigo — shoulder
  return "#3f3f46"                      // zinc — off-peak
}

// ── Market insights ───────────────────────────────────────────────────────────

const INSIGHTS = [
  {
    Icon   : Sun,
    title  : "Peak Season: Summer",
    accent : { badge: "bg-amber-500/15 text-amber-400 border-amber-500/25", icon: "text-amber-400" },
    points : [
      "June–August drives 30%+ of annual revenue",
      "July occupancy peaks near 68% — 11 pts above annual avg",
      "Booking windows compress to 10–21 days during peak",
      "Fox River events & outdoor rec anchor summer demand",
    ],
  },
  {
    Icon   : Users,
    title  : "Local Demand Drivers",
    accent : { badge: "bg-blue-500/15 text-blue-400 border-blue-500/25", icon: "text-blue-400" },
    points : [
      "Lawrence University & Fox Valley Tech events year-round",
      "Fox Cities Performing Arts Center — 200+ shows annually",
      "Neuroscience Group Field (Timber Rattlers) drives summer crowds",
      "Corporate stays from Bemis, U.S. Venture, ThedaCare HQ",
    ],
  },
  {
    Icon   : Building2,
    title  : "Competition Landscape",
    accent : { badge: "bg-violet-500/15 text-violet-400 border-violet-500/25", icon: "text-violet-400" },
    points : [
      "~280 active STR listings across the Fox Cities metro",
      "Whole-home rentals represent ~65% of total supply",
      "Supply grew ~12% YoY — moderate, but monitor saturation",
      "Hotels remain primary competitor for corporate travelers",
    ],
  },
  {
    Icon   : Calendar,
    title  : "Soft Season Strategy",
    accent : { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: "text-emerald-400" },
    points : [
      "Jan–Feb historically softest (est. 37–40% occupancy)",
      "Price compression of 20–30% needed to defend occupancy",
      "Medium-term stays (7–14 nights) offset rate weakness",
      "Local contractors & healthcare workers fill off-peak gaps",
    ],
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────

export type PortfolioSummary = {
  occupancy : number
  adr       : number
  revpar    : number
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  label, value, subtitle, icon: Icon, accentClass,
}: {
  label       : string
  value       : string
  subtitle    : string
  icon        : React.ElementType
  accentClass : string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className={cn("flex size-8 items-center justify-center rounded-lg", accentClass)}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function DiffBadge({ diff, unit }: { diff: number; unit: "pp" | "usd" }) {
  const pos = diff >  0.05
  const neg = diff < -0.05

  const label = unit === "pp"
    ? `${pos ? "+" : ""}${diff.toFixed(1)} pp`
    : `${pos ? "+" : neg ? "−" : ""}$${Math.abs(diff).toFixed(0)}`

  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium",
      pos ? "text-emerald-400" : neg ? "text-red-400" : "text-muted-foreground",
    )}>
      {pos && <ArrowUpRight   className="size-3.5 shrink-0" />}
      {neg && <ArrowDownRight className="size-3.5 shrink-0" />}
      {!pos && !neg && <Minus className="size-3 shrink-0 opacity-40" />}
      {label}
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 70 ? "bg-emerald-500/20 text-emerald-400" :
    score >= 50 ? "bg-blue-500/20 text-blue-400"       :
    score >= 30 ? "bg-amber-500/20 text-amber-400"     :
                  "bg-red-500/20 text-red-400"

  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded-full w-10 h-7 text-xs font-bold tabular-nums",
      cls,
    )}>
      {score}
    </span>
  )
}

// ── Seasonal chart tooltip ────────────────────────────────────────────────────

function SeasonalTooltip({ active, payload, label }: {
  active?  : boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload? : any[]
  label?   : string | number
}) {
  if (!active || !payload?.length) return null
  const { index, occ } = payload[0].payload as { occ: number; index: number }
  return (
    <div style={{
      backgroundColor: "#0e1014",
      border: "1px solid rgba(111,161,175,0.2)",
      borderRadius: "8px",
      padding: "10px 14px",
      fontSize: "12px",
      color: "#f5f5f5",
    }}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: "#a1a1aa" }}>Seasonal index: <span style={{ color: "#f5f5f5" }}>{index}</span></p>
      <p style={{ color: "#a1a1aa" }}>Expected occ: <span style={{ color: "#f5f5f5" }}>{occ}%</span></p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarketIntelClient({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="space-y-6">

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Market Occupancy"
          value={`${MARKET_OCC}%`}
          subtitle="Annual avg · Appleton, WI"
          icon={Percent}
          accentClass="bg-blue-500/15 text-blue-400"
        />
        <KPICard
          label="Market ADR"
          value={`$${MARKET_ADR.toFixed(2)}`}
          subtitle="Average daily rate · all listings"
          icon={DollarSign}
          accentClass="bg-violet-500/15 text-violet-400"
        />
        <KPICard
          label="Market RevPAR"
          value={`$${MARKET_REVPAR.toFixed(2)}`}
          subtitle="Revenue per available room night"
          icon={TrendingUp}
          accentClass="bg-amber-500/15 text-amber-400"
        />
        <KPICard
          label="Market Score"
          value={`${MARKET_SCORE}`}
          subtitle="Health vs national STR benchmarks"
          icon={Award}
          accentClass="bg-emerald-500/15 text-emerald-400"
        />
      </div>

      {/* Portfolio vs Market comparison */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Portfolio vs Market</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your trailing 12-month averages against Appleton market benchmarks
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-40">
                  Metric
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Our Portfolio
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Market Avg
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  vs Market
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4 text-sm font-medium text-foreground">Occupancy</td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-foreground">
                  {summary.occupancy > 0 ? `${summary.occupancy.toFixed(1)}%` : "—"}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">
                  {MARKET_OCC}%
                </td>
                <td className="px-5 py-4 text-right">
                  {summary.occupancy > 0
                    ? <DiffBadge diff={summary.occupancy - MARKET_OCC} unit="pp" />
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4 text-sm font-medium text-foreground">ADR</td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-foreground">
                  {summary.adr > 0 ? `$${summary.adr.toFixed(2)}` : "—"}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">
                  ${MARKET_ADR.toFixed(2)}
                </td>
                <td className="px-5 py-4 text-right">
                  {summary.adr > 0
                    ? <DiffBadge diff={summary.adr - MARKET_ADR} unit="usd" />
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4 text-sm font-medium text-foreground">RevPAR</td>
                <td className="px-5 py-4 text-right tabular-nums font-semibold text-foreground">
                  {summary.revpar > 0 ? `$${summary.revpar.toFixed(2)}` : "—"}
                </td>
                <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">
                  ${MARKET_REVPAR.toFixed(2)}
                </td>
                <td className="px-5 py-4 text-right">
                  {summary.revpar > 0
                    ? <DiffBadge diff={summary.revpar - MARKET_REVPAR} unit="usd" />
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-border/50 bg-muted/20 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-emerald-500" />
            Above market
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-red-500" />
            Below market
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />
            At market
          </div>
        </div>
      </div>

      {/* Seasonal trends */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-sm font-semibold text-foreground">Seasonal Trends</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Expected monthly occupancy — based on Appleton seasonal demand index
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-sm bg-amber-500/80" />
              Peak (index ≥ 100)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-sm bg-indigo-500/80" />
              Shoulder (85–99)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-sm bg-zinc-600" />
              Off-peak (﹤ 85)
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={SEASONAL} barCategoryGap="28%">
            <XAxis
              dataKey="month"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => `${v}%`}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 130]}
              ticks={[0, 25, 50, 75, 100, 125]}
              width={42}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={(props) => (
                <SeasonalTooltip
                  active={props.active}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  payload={props.payload as unknown as any[]}
                  label={props.label}
                />
              )}
            />
            <ReferenceLine
              y={100}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 3"
              label={{ value: "avg", position: "right", fill: "#6b7280", fontSize: 10 }}
            />
            <Bar dataKey="index" radius={[4, 4, 0, 0]}>
              {SEASONAL.map((s, i) => (
                <Cell key={i} fill={barColor(s.index)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Monthly summary strip */}
        <div className="mt-4 grid grid-cols-6 sm:grid-cols-12 gap-px rounded-lg overflow-hidden border border-border/40">
          {SEASONAL.map(s => (
            <div key={s.month} className="bg-muted/30 px-1.5 py-2 text-center">
              <p className="text-[10px] text-muted-foreground/60 font-medium">{s.month}</p>
              <p className="text-xs font-semibold text-foreground tabular-nums mt-0.5">{s.occ}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Market insights */}
      <div>
        <p className="text-sm font-semibold text-foreground mb-3">Market Insights</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {INSIGHTS.map(({ Icon, title, accent, points }) => (
            <div
              key={title}
              className={cn(
                "rounded-xl border p-5 space-y-3",
                accent.badge,
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={cn("size-4 shrink-0", accent.icon)} />
                <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
              </div>
              <ul className="space-y-2">
                {points.map(pt => (
                  <li key={pt} className="flex items-start gap-2 text-xs text-muted-foreground leading-snug">
                    <span className={cn("mt-1.5 inline-block size-1 rounded-full shrink-0", accent.icon.replace("text-", "bg-"))} />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
