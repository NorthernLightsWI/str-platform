"use client"

import { useState } from "react"
import { ArrowUpRight, ArrowDownRight, Minus, ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Market baselines ──────────────────────────────────────────────────────────

export const MARKET_OCC    = 57          // percent
export const MARKET_ADR    = 206.60      // dollars
export const MARKET_REVPAR = +(MARKET_ADR * MARKET_OCC / 100).toFixed(2)  // 117.76

// ── Types ─────────────────────────────────────────────────────────────────────

export type PropertyRow = {
  id        : string
  name      : string
  occupancy : number   // 0–100
  adr       : number   // dollars
  revpar    : number   // dollars
  score     : number   // 0–100
}

export type PortfolioSummary = {
  occupancy : number
  adr       : number
  revpar    : number
  score     : number
}

type SortKey = "name" | "occupancy" | "adr" | "revpar" | "score"

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtPct = (v: number) => `${v.toFixed(1)}%`
const fmtUSD = (v: number) => `$${v.toFixed(0)}`

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500/20 text-emerald-400"
  if (score >= 50) return "bg-blue-500/20    text-blue-400"
  if (score >= 30) return "bg-amber-500/20   text-amber-400"
  return                   "bg-red-500/20    text-red-400"
}

function rowHighlight(score: number): string {
  if (score < 30) return "bg-red-500/5 hover:bg-red-500/10"
  if (score < 50) return "bg-amber-500/5 hover:bg-amber-500/8"
  return "hover:bg-muted/30"
}

// ── Diff cell ─────────────────────────────────────────────────────────────────

function DiffCell({
  value, unit,
}: {
  value : number
  unit  : "pp" | "usd"
}) {
  const pos = value >  0.05
  const neg = value < -0.05

  let label: string
  if (unit === "pp") {
    label = `${pos ? "+" : ""}${value.toFixed(1)} pp`
  } else {
    const abs = Math.abs(value)
    label = `${pos ? "+" : neg ? "−" : ""}$${abs.toFixed(0)}`
  }

  return (
    <td className="px-3 py-3 text-right tabular-nums">
      <span className={cn(
        "inline-flex items-center justify-end gap-0.5 text-sm font-medium",
        pos ? "text-emerald-400" : neg ? "text-red-400" : "text-muted-foreground",
      )}>
        {pos && <ArrowUpRight   className="size-3.5 shrink-0" />}
        {neg && <ArrowDownRight className="size-3.5 shrink-0" />}
        {!pos && !neg && <Minus className="size-3 shrink-0 opacity-40" />}
        {label}
      </span>
    </td>
  )
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded-full w-9 h-7 text-xs font-bold tabular-nums",
      scoreColor(score),
    )}>
      {score}
    </span>
  )
}

// ── Sort button ───────────────────────────────────────────────────────────────

function SortTh({
  label, col, sort, onSort, align = "right", colSpan,
}: {
  label   : string
  col     : SortKey
  sort    : { key: SortKey; dir: "asc" | "desc" }
  onSort  : (col: SortKey) => void
  align?  : "left" | "right"
  colSpan?: number
}) {
  const active = sort.key === col
  return (
    <th
      colSpan={colSpan}
      className={cn(
        "px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none whitespace-nowrap",
        "hover:text-foreground transition-colors",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {align === "left" && (active ? (
          sort.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
        ) : <ChevronUp className="size-3 opacity-20" />)}
        {label}
        {align === "right" && (active ? (
          sort.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
        ) : <ChevronUp className="size-3 opacity-20" />)}
      </span>
    </th>
  )
}

// ── Market baseline cell ──────────────────────────────────────────────────────

function MktTd({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-3 text-right text-sm text-muted-foreground/60 tabular-nums">
      {children}
    </td>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function BenchmarksClient({
  rows,
  summary,
}: {
  rows    : PropertyRow[]
  summary : PortfolioSummary
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "score",
    dir: "asc",   // worst first by default — easiest to spot underperformers
  })

  function handleSort(col: SortKey) {
    setSort(prev =>
      prev.key === col
        ? { key: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col, dir: col === "name" ? "asc" : "desc" },
    )
  }

  const sorted = [...rows].sort((a, b) => {
    const aVal = a[sort.key]
    const bVal = b[sort.key]
    const cmp  = typeof aVal === "string"
      ? aVal.localeCompare(bVal as string)
      : (aVal as number) - (bVal as number)
    return sort.dir === "asc" ? cmp : -cmp
  })

  return (
    <div className="space-y-4">

      {/* Market baseline callout */}
      <div className="flex flex-wrap gap-4">
        {[
          { label: "Market Occupancy", value: `${MARKET_OCC}%` },
          { label: "Market ADR",       value: `$${MARKET_ADR.toFixed(2)}` },
          { label: "Market RevPAR",    value: `$${MARKET_REVPAR.toFixed(2)}` },
          { label: "Market",           value: "Appleton, WI" },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Score legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Score:</span>
        {[
          { label: "≥70 Outperforming",  color: "bg-emerald-500/20 text-emerald-400" },
          { label: "50–69 At market",     color: "bg-blue-500/20    text-blue-400"    },
          { label: "30–49 Below market",  color: "bg-amber-500/20   text-amber-400"   },
          { label: "<30 Underperforming", color: "bg-red-500/20     text-red-400"     },
        ].map(s => (
          <span key={s.label} className={cn("rounded-full px-2 py-0.5 font-medium", s.color)}>
            {s.label}
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            {/* Group headers */}
            <tr className="border-b border-border/50">
              <th className="px-3 py-2" />
              <th
                colSpan={3}
                className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider border-l border-border/50"
              >
                Occupancy
              </th>
              <th
                colSpan={3}
                className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider border-l border-border/50"
              >
                ADR
              </th>
              <th
                colSpan={3}
                className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider border-l border-border/50"
              >
                RevPAR
              </th>
              <th className="px-3 py-2 border-l border-border/50" />
            </tr>
            {/* Column headers */}
            <tr className="border-b border-border">
              <SortTh label="Property" col="name"     sort={sort} onSort={handleSort} align="left" />

              <SortTh label="Rate"  col="occupancy" sort={sort} onSort={handleSort} />
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">±</th>

              <SortTh label="Rate"  col="adr"       sort={sort} onSort={handleSort} />
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">±</th>

              <SortTh label="Rate"  col="revpar"    sort={sort} onSort={handleSort} />
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">±</th>

              <SortTh label="Score" col="score"     sort={sort} onSort={handleSort} />
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {sorted.map(row => (
              <tr key={row.id} className={cn("transition-colors", rowHighlight(row.score))}>
                {/* Property name */}
                <td className="px-3 py-3 font-medium text-foreground max-w-[180px]">
                  <span className="block truncate" title={row.name}>{row.name}</span>
                </td>

                {/* Occupancy */}
                <td className="px-3 py-3 text-right tabular-nums text-foreground font-medium">
                  {fmtPct(row.occupancy)}
                </td>
                <MktTd>{fmtPct(MARKET_OCC)}</MktTd>
                <DiffCell value={row.occupancy - MARKET_OCC}     unit="pp"  />

                {/* ADR */}
                <td className="px-3 py-3 text-right tabular-nums text-foreground font-medium">
                  {fmtUSD(row.adr)}
                </td>
                <MktTd>{fmtUSD(MARKET_ADR)}</MktTd>
                <DiffCell value={row.adr - MARKET_ADR}           unit="usd" />

                {/* RevPAR */}
                <td className="px-3 py-3 text-right tabular-nums text-foreground font-medium">
                  {fmtUSD(row.revpar)}
                </td>
                <MktTd>{fmtUSD(MARKET_REVPAR)}</MktTd>
                <DiffCell value={row.revpar - MARKET_REVPAR}     unit="usd" />

                {/* Score */}
                <td className="px-3 py-3 text-right">
                  <ScoreBadge score={row.score} />
                </td>
              </tr>
            ))}
          </tbody>

          {/* Portfolio summary row */}
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30">
              <td className="px-3 py-3 font-semibold text-foreground text-sm">
                Portfolio Avg
              </td>

              {/* Occupancy */}
              <td className="px-3 py-3 text-right tabular-nums font-semibold text-foreground">
                {fmtPct(summary.occupancy)}
              </td>
              <MktTd>{fmtPct(MARKET_OCC)}</MktTd>
              <DiffCell value={summary.occupancy - MARKET_OCC}   unit="pp"  />

              {/* ADR */}
              <td className="px-3 py-3 text-right tabular-nums font-semibold text-foreground">
                {fmtUSD(summary.adr)}
              </td>
              <MktTd>{fmtUSD(MARKET_ADR)}</MktTd>
              <DiffCell value={summary.adr - MARKET_ADR}         unit="usd" />

              {/* RevPAR */}
              <td className="px-3 py-3 text-right tabular-nums font-semibold text-foreground">
                {fmtUSD(summary.revpar)}
              </td>
              <MktTd>{fmtUSD(MARKET_REVPAR)}</MktTd>
              <DiffCell value={summary.revpar - MARKET_REVPAR}   unit="usd" />

              {/* Score */}
              <td className="px-3 py-3 text-right">
                <ScoreBadge score={summary.score} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
