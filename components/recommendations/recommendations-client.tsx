"use client"

import { useState, useTransition, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, ChevronRight, CheckCircle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { dismissRecommendation, completeRecommendation } from "@/app/actions/recommendations"

// ── Types ──────────────────────────────────────────────────────────────────

export type RecommendationData = {
  id               : string
  property_id      : string | null
  property_name    : string
  title            : string
  body             : string | null
  priority         : string
  category         : string
  impact_statement : string | null
  action_steps     : string[] | null
  is_dismissed     : boolean
  is_completed     : boolean
  created_at       : string
}

// ── Badge helpers ──────────────────────────────────────────────────────────

function priorityStyle(p: string) {
  switch (p) {
    case "critical": return "bg-red-500/20    text-red-400    border-red-500/30"
    case "high"    : return "bg-orange-500/20 text-orange-400 border-orange-500/30"
    case "medium"  : return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    default        : return "bg-muted/60      text-muted-foreground border-border"
  }
}

function categoryLabel(c: string) {
  const MAP: Record<string, string> = {
    pricing        : "Pricing",
    occupancy      : "Occupancy",
    listing_quality: "Listing",
    reviews        : "Reviews",
    ranking        : "Ranking",
  }
  return MAP[c] ?? c
}

function categoryStyle(c: string) {
  const MAP: Record<string, string> = {
    pricing        : "bg-violet-500/15 text-violet-400",
    occupancy      : "bg-emerald-500/15 text-emerald-400",
    listing_quality: "bg-blue-500/15   text-blue-400",
    reviews        : "bg-amber-500/15  text-amber-400",
    ranking        : "bg-pink-500/15   text-pink-400",
  }
  return MAP[c] ?? "bg-muted/60 text-muted-foreground"
}

// ── Recommendation card ────────────────────────────────────────────────────

function RecCard({ rec, onAction }: { rec: RecommendationData; onAction: () => void }) {
  const [pending, startTransition] = useTransition()

  function dismiss() {
    startTransition(async () => {
      await dismissRecommendation(rec.id)
      onAction()
    })
  }

  function complete() {
    startTransition(async () => {
      await completeRecommendation(rec.id)
      onAction()
    })
  }

  const steps = rec.action_steps ?? []

  return (
    <div className={cn(
      "rounded-xl border bg-card p-5 space-y-4 transition-opacity",
      pending && "opacity-50 pointer-events-none",
      rec.is_completed && "opacity-60",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
              priorityStyle(rec.priority),
            )}>
              {rec.priority}
            </span>
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              categoryStyle(rec.category),
            )}>
              {categoryLabel(rec.category)}
            </span>
          </div>
          <p className="font-semibold text-foreground leading-snug">{rec.title}</p>
          <p className="text-xs text-muted-foreground">{rec.property_name}</p>
        </div>
        {rec.is_completed && (
          <CheckCircle className="size-5 text-emerald-400 shrink-0 mt-0.5" />
        )}
      </div>

      {/* Description */}
      {rec.body && (
        <p className="text-sm text-muted-foreground leading-relaxed">{rec.body}</p>
      )}

      {/* Impact */}
      {rec.impact_statement && (
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Expected Impact</p>
          <p className="text-sm text-foreground">{rec.impact_statement}</p>
        </div>
      )}

      {/* Action steps */}
      {steps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action Steps</p>
          <ol className="space-y-1">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="shrink-0 flex items-center justify-center size-4 rounded-full bg-muted text-[10px] font-bold text-foreground mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Footer actions */}
      {!rec.is_dismissed && (
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          {!rec.is_completed && (
            <button
              onClick={complete}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <CheckCircle className="size-3.5" />
              Mark complete
            </button>
          )}
          <button
            onClick={dismiss}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ml-auto"
          >
            <XCircle className="size-3.5" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main client ────────────────────────────────────────────────────────────

type StatusTab = "active" | "completed" | "dismissed" | "all"

const PRIORITIES = ["critical", "high", "medium", "low"]
const CATEGORIES = ["pricing", "occupancy", "listing_quality", "reviews", "ranking"]

export function RecommendationsClient({ recs }: { recs: RecommendationData[] }) {
  const router                        = useRouter()
  const [status, setStatus]           = useState<StatusTab>("active")
  const [priority, setPriority]       = useState("all")
  const [category, setCategory]       = useState("all")
  const [property, setProperty]       = useState("all")
  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState<string | null>(null)
  const [genSuccess, setGenSuccess]   = useState<string | null>(null)

  const properties = useMemo(() => {
    const names = [...new Set(recs.map(r => r.property_name))].sort()
    return names
  }, [recs])

  const filtered = useMemo(() => {
    return recs.filter(r => {
      if (status === "active"    && (r.is_dismissed || r.is_completed))  return false
      if (status === "completed" && !r.is_completed)                     return false
      if (status === "dismissed" && !r.is_dismissed)                     return false
      if (priority !== "all" && r.priority !== priority)                 return false
      if (category !== "all" && r.category !== category)                 return false
      if (property !== "all" && r.property_name !== property)            return false
      return true
    })
  }, [recs, status, priority, category, property])

  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)
    setGenSuccess(null)
    try {
      const res  = await fetch("/api/recommendations/generate", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Generation failed")
      setGenSuccess(`Generated ${json.generated} recommendation${json.generated !== 1 ? "s" : ""}`)
      router.refresh()
    } catch (err) {
      setGenError(String(err instanceof Error ? err.message : err))
    } finally {
      setGenerating(false)
    }
  }

  const STATUS_TABS: { key: StatusTab; label: string }[] = [
    { key: "active",    label: "Active"    },
    { key: "completed", label: "Completed" },
    { key: "dismissed", label: "Dismissed" },
    { key: "all",       label: "All"       },
  ]

  return (
    <div className="space-y-4">
      {/* Generate button */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-500/15 border border-violet-500/30 px-4 py-2 text-sm font-medium text-violet-400 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
        >
          <Sparkles className={cn("size-4", generating && "animate-pulse")} />
          {generating ? "Generating…" : "Generate recommendations"}
        </button>

        {genSuccess && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <CheckCircle className="size-4" />{genSuccess}
          </span>
        )}
        {genError && (
          <span className="text-sm text-red-400 flex items-center gap-1">
            <XCircle className="size-4" />{genError}
          </span>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-muted p-1 w-fit">
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              status === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Priority pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPriority("all")}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
              priority === "all"
                ? "bg-card text-foreground border-border shadow-sm"
                : "text-muted-foreground border-transparent hover:border-border",
            )}
          >
            All priorities
          </button>
          {PRIORITIES.map(p => (
            <button
              key={p}
              onClick={() => setPriority(p === priority ? "all" : p)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors",
                priority === p ? priorityStyle(p) : "text-muted-foreground border-transparent hover:border-border",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Category + property selects */}
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </select>

        <select
          value={property}
          onChange={e => setProperty(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          <option value="all">All properties</option>
          {properties.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} recommendation{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <Sparkles className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {recs.length === 0 ? "No recommendations yet" : "No recommendations match your filters"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {recs.length === 0
              ? <>Click <strong>Generate recommendations</strong> to analyse your portfolio.</>
              : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map(r => (
            <RecCard
              key={r.id}
              rec={r}
              onAction={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  )
}
