"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  ChevronDown, ChevronRight, CheckCircle2, AlertCircle,
  AlertTriangle, ExternalLink, BarChart3,
  FileText, Camera, Star, Type,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { type PropertyAudit, type AuditColor, auditColor } from "@/lib/listing-audit"

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColorCls(color: AuditColor, variant: "text" | "bg" | "border" = "text") {
  const map = {
    green:  { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20" },
    yellow: { text: "text-amber-400",   bg: "bg-amber-500/15",   border: "border-amber-500/20"   },
    red:    { text: "text-red-400",     bg: "bg-red-500/15",     border: "border-red-500/20"      },
  }
  return map[color][variant]
}

const CATEGORY_ICONS = {
  title      : Type,
  description: FileText,
  photos     : Camera,
  reviews    : Star,
} as const

type CategoryKey = keyof typeof CATEGORY_ICONS

// ── Mini score bar ─────────────────────────────────────────────────────────────

function ScoreBar({ score, max, color }: { score: number; max: number; color: AuditColor }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0
  const barCls = color === "green" ? "bg-emerald-400" : color === "yellow" ? "bg-amber-400" : "bg-red-400"
  return (
    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all duration-500", barCls)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Expandable category section ────────────────────────────────────────────────

function CategorySection({
  catKey,
  cat,
}: {
  catKey: CategoryKey
  cat  : PropertyAudit["title"]
}) {
  const [open, setOpen] = useState(false)
  const Icon  = CATEGORY_ICONS[catKey]
  const color = auditColor(Math.round((cat.score / cat.cap) * 100))
  const pct   = Math.round((cat.score / cat.cap) * 100)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <Icon className={cn("size-4 shrink-0", scoreColorCls(color, "text"))} />
        <span className="flex-1 text-sm font-medium text-foreground">{cat.label}</span>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-20 hidden sm:block">
            <ScoreBar score={cat.score} max={cat.cap} color={color} />
          </div>
          <span className={cn("text-sm font-semibold tabular-nums w-12 text-right", scoreColorCls(color, "text"))}>
            {cat.score}/{cat.cap}
          </span>
          {open
            ? <ChevronDown className="size-4 text-muted-foreground" />
            : <ChevronRight className="size-4 text-muted-foreground" />
          }
        </div>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 border-t border-border">
          {/* Issues */}
          {cat.issues.length > 0 && (
            <div className="space-y-1.5">
              {cat.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
                  {issue}
                </div>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {cat.suggestions.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
                Action items
              </p>
              {cat.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-400" />
                  {s}
                </div>
              ))}
            </div>
          )}

          {cat.issues.length === 0 && cat.suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">Looks great — no issues found.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Property audit card ────────────────────────────────────────────────────────

function AuditCard({ audit }: { audit: PropertyAudit }) {
  const [expanded, setExpanded] = useState(false)
  const color  = auditColor(audit.total)
  const numCls = scoreColorCls(color, "text")
  const bgCls  = scoreColorCls(color, "bg")
  const bdCls  = scoreColorCls(color, "border")

  const totalIssues = [
    audit.title.issues.length,
    audit.description.issues.length,
    audit.photos.issues.length,
    audit.reviews.issues.length,
  ].reduce((a, b) => a + b, 0)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
      >
        {/* Score badge */}
        <div className={cn("flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border font-bold tabular-nums", bgCls, bdCls)}>
          <span className={cn("text-2xl leading-none", numCls)}>{audit.total}</span>
          <span className="text-[10px] text-muted-foreground mt-0.5">/100</span>
        </div>

        {/* Name + sub-scores */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground truncate">{audit.name}</p>
            {totalIssues > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                <AlertTriangle className="size-3" />
                {totalIssues} issue{totalIssues !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Mini sub-score bars */}
          <div className="grid grid-cols-4 gap-2">
            {(["title", "description", "photos", "reviews"] as CategoryKey[]).map(key => {
              const cat   = audit[key]
              const c     = auditColor(Math.round((cat.score / cat.cap) * 100))
              const Icon  = CATEGORY_ICONS[key]
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Icon className={cn("size-3", scoreColorCls(c, "text"))} />
                    <span className="text-[10px] text-muted-foreground capitalize hidden sm:inline">{key}</span>
                    <span className={cn("text-[10px] font-semibold ml-auto tabular-nums", scoreColorCls(c, "text"))}>
                      {cat.score}
                    </span>
                  </div>
                  <ScoreBar score={cat.score} max={cat.cap} color={c} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/properties/${audit.id}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ExternalLink className="size-3" />
            View
          </Link>
          {expanded
            ? <ChevronDown className="size-4 text-muted-foreground" />
            : <ChevronRight className="size-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Expandable categories */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-2">
          {(["title", "description", "photos", "reviews"] as CategoryKey[]).map(key => (
            <CategorySection key={key} catKey={key} cat={audit[key]} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Portfolio summary ──────────────────────────────────────────────────────────

function PortfolioSummary({ audits }: { audits: PropertyAudit[] }) {
  if (audits.length === 0) return null

  const avgScore    = Math.round(audits.reduce((s, a) => s + a.total, 0) / audits.length)
  const avgColor    = auditColor(avgScore)

  const noDesc      = audits.filter(a => a.description.score === 0).length
  const noPhotos    = audits.filter(a => a.photos.score === 0).length
  const noReviews   = audits.filter(a => a.reviews.score === 0).length
  const weakTitles  = audits.filter(a => a.title.score < 15).length

  const opportunities = [
    noDesc    > 0 && { label: "Missing description",    count: noDesc,    hint: "Add listing descriptions in OwnerRez" },
    noPhotos  > 0 && { label: "No photos detected",     count: noPhotos,  hint: "Upload photos to OwnerRez immediately" },
    noReviews > 0 && { label: "Zero reviews",           count: noReviews, hint: "Prioritize getting first reviews" },
    weakTitles> 0 && { label: "Weak listing titles",    count: weakTitles,hint: "Add city name and amenity keywords" },
  ].filter(Boolean) as { label: string; count: number; hint: string }[]

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-5">
        {/* Avg score */}
        <div className="flex items-center gap-3">
          <BarChart3 className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Portfolio Average</p>
            <p className={cn("text-3xl font-bold tabular-nums leading-none mt-0.5", scoreColorCls(avgColor, "text"))}>
              {avgScore}<span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
          </div>
        </div>

        <div className="h-10 w-px bg-border hidden sm:block" />

        {/* Score distribution */}
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Strong (70+)",  count: audits.filter(a => a.total >= 70).length, cls: "text-emerald-400" },
            { label: "Fair (45–69)",  count: audits.filter(a => a.total >= 45 && a.total < 70).length, cls: "text-amber-400" },
            { label: "Weak (<45)",    count: audits.filter(a => a.total < 45).length,  cls: "text-red-400"     },
          ].map(b => (
            <div key={b.label} className="text-center">
              <p className={cn("text-xl font-bold tabular-nums", b.cls)}>{b.count}</p>
              <p className="text-xs text-muted-foreground">{b.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-2">
            Biggest opportunities
          </p>
          <div className="flex flex-wrap gap-2">
            {opportunities.map(opp => (
              <div
                key={opp.label}
                className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 flex items-start gap-2"
              >
                <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-400">
                    {opp.count} propert{opp.count === 1 ? "y" : "ies"} — {opp.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opp.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main client ────────────────────────────────────────────────────────────────

type SortKey = "score" | "name" | "issues"
type FilterKey = "all" | "weak" | "fair" | "strong"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",    label: "All" },
  { key: "weak",   label: "Needs Work (<45)" },
  { key: "fair",   label: "Fair (45–69)" },
  { key: "strong", label: "Strong (70+)" },
]

export function ListingAuditClient({ audits }: { audits: PropertyAudit[] }) {
  const [filter, setFilter] = useState<FilterKey>("all")
  const [sort,   setSort]   = useState<SortKey>("score")

  const visible = useMemo(() => {
    let list = audits.filter(a => {
      if (filter === "weak")   return a.total < 45
      if (filter === "fair")   return a.total >= 45 && a.total < 70
      if (filter === "strong") return a.total >= 70
      return true
    })
    return list.sort((a, b) => {
      if (sort === "score")  return a.total - b.total  // ascending: worst first
      if (sort === "name")   return a.name.localeCompare(b.name)
      if (sort === "issues") {
        const ai = a.title.issues.length + a.description.issues.length + a.photos.issues.length + a.reviews.issues.length
        const bi = b.title.issues.length + b.description.issues.length + b.photos.issues.length + b.reviews.issues.length
        return bi - ai
      }
      return 0
    })
  }, [audits, filter, sort])

  return (
    <div className="space-y-5">
      <PortfolioSummary audits={audits} />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort:</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring"
          >
            <option value="score">Score (worst first)</option>
            <option value="issues">Most issues</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>

        <span className="text-sm text-muted-foreground">
          {visible.length} of {audits.length} propert{audits.length !== 1 ? "ies" : "y"}
        </span>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No properties match this filter</p>
          <p className="mt-1 text-xs text-muted-foreground">Try switching to "All"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(a => <AuditCard key={a.id} audit={a} />)}
        </div>
      )}
    </div>
  )
}
