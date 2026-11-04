"use client"

import { useState, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  Plus, X, Undo2, AlertTriangle, CheckCircle2,
  Minus, TrendingUp, TrendingDown, Loader2, Info,
  ChevronDown, ChevronUp, ArrowUpDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CHANGE_TYPE_LABELS, type ChangeTypeValue, type ImpactResult,
} from "@/lib/change-impact"
import { revertListingChange } from "@/app/actions/listing-changes"
import { LogChangeModal } from "@/components/changes/log-change-modal"

// Lazy-load the chart to avoid SSR issues
const ImpactChart = dynamic(
  () => import("@/components/changes/impact-chart").then(m => ({ default: m.ImpactChart })),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded-lg bg-muted/30" /> },
)

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeRow = {
  id               : string
  property_id      : string
  property_name    : string
  change_type      : ChangeTypeValue
  label            : string
  before_value     : string | null
  after_value      : string | null
  reason           : string | null
  recommendation_id: string | null
  source           : string
  applied_at       : string
  status           : string
  reverted_at      : string | null
  notes            : string | null
  created_at       : string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ymd: string) {
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function daysAgo(ymd: string) {
  const d = Math.floor((Date.now() - new Date(ymd + "T00:00:00Z").getTime()) / 86_400_000)
  if (d === 0) return "Today"
  if (d === 1) return "1 day ago"
  return `${d} days ago`
}

function liftStr(n: number) {
  if (n > 0) return `+${n.toFixed(1)}pp`
  if (n < 0) return `${n.toFixed(1)}pp`
  return "0.0pp"
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

function VerdictBadge({
  verdict, daysProgress, lowConfidence,
}: {
  verdict       : ImpactResult["verdict"] | null
  daysProgress ?: string
  lowConfidence?: boolean
}) {
  if (!verdict) {
    return <span className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">—</span>
  }
  const styles = {
    too_early : "bg-muted/60 text-muted-foreground",
    improving : "bg-emerald-500/15 text-emerald-400",
    flat      : "bg-[#6FA1AF]/15 text-[#6FA1AF]",
    worse     : "bg-red-500/15 text-red-400",
  }
  const labels = {
    too_early : daysProgress ?? "Too early",
    improving : "Improving",
    flat      : "Flat",
    worse     : "Worse",
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", styles[verdict])}>
      {verdict === "improving" && <TrendingUp className="size-3" />}
      {verdict === "worse"     && <TrendingDown className="size-3" />}
      {labels[verdict]}
      {lowConfidence && <AlertTriangle className="size-3 text-amber-400 ml-0.5" />}
    </span>
  )
}

// ── Metric cell ───────────────────────────────────────────────────────────────

function MetricRow({
  label, before, after, control, fmt,
}: {
  label   : string
  before  : number
  after   : number
  control : number
  fmt    ?: (n: number) => string
}) {
  const f = fmt ?? (n => n.toFixed(1))
  const delta = after - before
  const isUp = delta > 0.05
  const isDn = delta < -0.05
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3 text-xs text-muted-foreground font-medium">{label}</td>
      <td className="py-2 px-3 text-sm text-foreground text-right tabular-nums">{f(before)}</td>
      <td className={cn("py-2 px-3 text-sm text-right tabular-nums font-medium",
        isUp ? "text-emerald-400" : isDn ? "text-red-400" : "text-foreground",
      )}>
        {f(after)}
        {isUp && <TrendingUp className="inline ml-1 size-3" />}
        {isDn && <TrendingDown className="inline ml-1 size-3" />}
      </td>
      <td className="py-2 pl-3 text-xs text-muted-foreground text-right tabular-nums">{f(control)}</td>
    </tr>
  )
}

// ── Impact detail panel ───────────────────────────────────────────────────────

function ImpactPanel({
  change, onClose, onReverted,
}: {
  change    : ChangeRow
  onClose   : () => void
  onReverted: () => void
}) {
  const [windowDays, setWindowDays] = useState<30 | 60>(30)
  const [impact,     setImpact]     = useState<ImpactResult | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [fetchErr,   setFetchErr]   = useState<string | null>(null)
  const [reverting,  startRevert]   = useTransition()
  const [revertErr,  setRevertErr]  = useState<string | null>(null)

  const fetchImpact = useCallback(async (w: 30 | 60) => {
    setLoading(true)
    setFetchErr(null)
    try {
      const res  = await fetch(`/api/changes/${change.id}/impact?w=${w}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load impact")
      setImpact(json as ImpactResult)
    } catch (err) {
      setFetchErr(err instanceof Error ? err.message : "Error loading impact")
    } finally {
      setLoading(false)
    }
  }, [change.id])

  // Fetch on first render and when windowDays changes
  useState(() => { fetchImpact(windowDays) })

  function handleWindowChange(w: 30 | 60) {
    setWindowDays(w)
    fetchImpact(w)
  }

  function handleRevert() {
    setRevertErr(null)
    startRevert(async () => {
      const res = await revertListingChange(change.id)
      if (res?.error) { setRevertErr(res.error); return }
      onReverted()
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* Scrim */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-[#181b20] border-l border-border flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{change.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {change.property_name} · {CHANGE_TYPE_LABELS[change.change_type]} · {fmtDate(change.applied_at)}
            </p>
          </div>
          <button onClick={onClose} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-3">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* Change info */}
          <div className="space-y-3">
            {(change.before_value || change.after_value) && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3 text-sm">
                <span className="text-muted-foreground">{change.before_value ?? "—"}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium text-foreground">{change.after_value ?? "—"}</span>
              </div>
            )}
            {change.reason && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reason</p>
                <p className="text-sm text-foreground">{change.reason}</p>
              </div>
            )}
            {change.notes && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-muted-foreground">{change.notes}</p>
              </div>
            )}
            {change.status === "reverted" && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
                <Undo2 className="size-3.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Reverted {change.reverted_at ? fmtDate(change.reverted_at.slice(0, 10)) : ""}
                </p>
              </div>
            )}
          </div>

          {/* Window selector */}
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground font-medium mr-1">Window:</p>
            {([30, 60] as const).map(w => (
              <button
                key={w}
                onClick={() => handleWindowChange(w)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                  windowDays === w
                    ? "bg-[#E88159]/15 text-[#E88159] border border-[#E88159]/30"
                    : "text-muted-foreground border border-transparent hover:border-border",
                )}
              >
                {w}d
              </button>
            ))}
          </div>

          {/* Impact content */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {fetchErr && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {fetchErr}
            </div>
          )}

          {impact && !loading && (
            <>
              {/* Verdict */}
              <div className="flex items-center gap-3 flex-wrap">
                <VerdictBadge
                  verdict={impact.verdict}
                  daysProgress={impact.daysProgress}
                  lowConfidence={impact.lowConfidence}
                />
                <span className="text-xs text-muted-foreground">{impact.daysProgress}</span>
                {impact.controlPropertyCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    vs {impact.controlPropertyCount} control {impact.controlPropertyCount === 1 ? "property" : "properties"}
                  </span>
                )}
                {impact.lowConfidence && impact.lowConfidenceReason && (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <AlertTriangle className="size-3" />
                    {impact.lowConfidenceReason}
                  </span>
                )}
              </div>

              {/* Relative lift summary */}
              {impact.verdict !== "too_early" && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "RevPAR lift",    value: impact.revparLift    },
                    { label: "Occupancy lift",  value: impact.occupancyLift },
                    { label: "ADR lift",        value: impact.adrLift       },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-border bg-card px-3 py-2.5 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className={cn(
                        "text-base font-bold tabular-nums",
                        value > 5  ? "text-emerald-400" :
                        value < -5 ? "text-red-400"     : "text-foreground",
                      )}>
                        {liftStr(value)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Metrics table */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Before vs After vs Control</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th className="py-2 pr-3 pl-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Metric</th>
                        <th className="py-2 px-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Before</th>
                        <th className="py-2 px-3 text-right text-xs font-medium text-[#E88159] uppercase tracking-wider">After</th>
                        <th className="py-2 pl-3 pr-3 text-right text-xs font-medium text-[#6FA1AF] uppercase tracking-wider">Control</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border px-3">
                      <MetricRow
                        label="Occupancy %"
                        before={impact.before.occupancyPct}
                        after={impact.after.occupancyPct}
                        control={impact.controlAfter.occupancyPct}
                        fmt={n => n.toFixed(1) + "%"}
                      />
                      <MetricRow
                        label="ADR"
                        before={impact.before.adr}
                        after={impact.after.adr}
                        control={impact.controlAfter.adr}
                        fmt={n => fmt$(n)}
                      />
                      <MetricRow
                        label="RevPAR"
                        before={impact.before.revpar}
                        after={impact.after.revpar}
                        control={impact.controlAfter.revpar}
                        fmt={n => fmt$(n)}
                      />
                      <MetricRow
                        label="Bookings made"
                        before={impact.before.bookingsMade}
                        after={impact.after.bookingsMade}
                        control={impact.controlAfter.bookingsMade}
                        fmt={n => n.toFixed(0)}
                      />
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Chart */}
              {impact.weeklyData.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Weekly Occupancy &amp; ADR</p>
                  <ImpactChart data={impact.weeklyData} />
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                Verdicts require ≥14 days of post-change data and are noisy with small samples.
                Results show relative lift vs. a control group of unmodified properties.
              </p>
            </>
          )}

          {/* Revert */}
          {change.status === "active" && (
            <div className="pt-2 border-t border-border">
              {revertErr && (
                <p className="mb-2 text-xs text-destructive">{revertErr}</p>
              )}
              <button
                onClick={handleRevert}
                disabled={reverting}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                {reverting ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
                Mark as reverted
              </button>
              <p className="mt-1.5 text-xs text-muted-foreground/60">
                Records that this change was undone — does not modify OwnerRez or PriceLabs.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main changes client ───────────────────────────────────────────────────────

type SortKey = "applied_at" | "property_name" | "change_type" | "status"

export function ChangesClient({
  initialChanges,
  properties,
}: {
  initialChanges: ChangeRow[]
  properties    : { id: string; name: string }[]
}) {
  const router = useRouter()

  const [changes,    setChanges]    = useState(initialChanges)
  const [selected,   setSelected]   = useState<ChangeRow | null>(null)
  const [logOpen,    setLogOpen]    = useState(false)

  // Filters
  const [filterProp, setFilterProp] = useState("all")
  const [filterType, setFilterType] = useState("all")
  const [filterStatus, setFilterStatus] = useState("active")

  // Sort
  const [sortKey, setSortKey]     = useState<SortKey>("applied_at")
  const [sortAsc, setSortAsc]     = useState(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const filtered = changes
    .filter(c => {
      if (filterProp   !== "all" && c.property_id  !== filterProp)   return false
      if (filterType   !== "all" && c.change_type  !== filterType)   return false
      if (filterStatus !== "all" && c.status       !== filterStatus) return false
      return true
    })
    .sort((a, b) => {
      let r = 0
      if (sortKey === "applied_at")    r = a.applied_at.localeCompare(b.applied_at)
      if (sortKey === "property_name") r = a.property_name.localeCompare(b.property_name)
      if (sortKey === "change_type")   r = a.change_type.localeCompare(b.change_type)
      if (sortKey === "status")        r = a.status.localeCompare(b.status)
      return sortAsc ? r : -r
    })

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortAsc
        ? <ChevronUp   className="inline size-3 ml-0.5" />
        : <ChevronDown className="inline size-3 ml-0.5" />
      : <ArrowUpDown className="inline size-3 ml-0.5 opacity-30" />

  const SELECT_CLS =
    "rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground " +
    "outline-none focus-visible:border-ring min-w-0"

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setLogOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#E88159]/15 border border-[#E88159]/30 px-4 py-2 text-sm font-medium text-[#E88159] hover:bg-[#E88159]/25 transition-colors"
        >
          <Plus className="size-4" />
          Log a change
        </button>

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} change{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={SELECT_CLS}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="reverted">Reverted</option>
        </select>

        <select value={filterProp} onChange={e => setFilterProp(e.target.value)} className={SELECT_CLS}>
          <option value="all">All properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={SELECT_CLS}>
          <option value="all">All types</option>
          {(Object.entries(CHANGE_TYPE_LABELS) as [ChangeTypeValue, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <Info className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {changes.length === 0 ? "No changes logged yet" : "No changes match your filters"}
          </p>
          {changes.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Click <strong>Log a change</strong> to record your first listing change.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort("applied_at")} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    Date <SortIcon k="applied_at" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort("property_name")} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    Property <SortIcon k="property_name" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button onClick={() => toggleSort("change_type")} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    Type <SortIcon k="change_type" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Label</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Elapsed</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <button onClick={() => toggleSort("status")} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                    Status <SortIcon k="status" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => {
                const days = Math.floor((Date.now() - new Date(c.applied_at + "T00:00:00Z").getTime()) / 86_400_000)
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/20",
                      selected?.id === c.id && "bg-muted/30",
                      c.status === "reverted" && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                      {fmtDate(c.applied_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[140px]">
                      <span className="truncate block">{c.property_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {CHANGE_TYPE_LABELS[c.change_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground max-w-[200px]">
                      <span className="truncate block">{c.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {days}d
                    </td>
                    <td className="px-4 py-3">
                      {c.status === "reverted" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                          <Undo2 className="size-3" /> Reverted
                        </span>
                      ) : days < 14 ? (
                        <span className="inline-flex items-center rounded-full bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
                          Day {days} of 30
                        </span>
                      ) : (
                        <VerdictBadge verdict={null} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <ImpactPanel
          change={selected}
          onClose={() => setSelected(null)}
          onReverted={() => {
            setChanges(cs => cs.map(c => c.id === selected.id ? { ...c, status: "reverted", reverted_at: new Date().toISOString() } : c))
            setSelected(null)
            router.refresh()
          }}
        />
      )}

      {/* Log change modal */}
      {logOpen && (
        <LogChangeModal
          properties={properties}
          onClose={() => setLogOpen(false)}
          onCreated={() => { setLogOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}
