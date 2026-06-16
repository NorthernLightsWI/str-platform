"use client"

import { useState, useMemo } from "react"
import { Search, Star } from "lucide-react"
import { cn } from "@/lib/utils"

export type ReviewData = {
  id                   : string
  property_name        : string
  reviewer_name        : string | null
  listing_site         : string | null
  overall_rating       : number | null
  cleanliness_rating   : number | null
  communication_rating : number | null
  location_rating      : number | null
  accuracy_rating      : number | null
  value_rating         : number | null
  review_text          : string | null
  response_text        : string | null
  reviewed_at          : string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function normalizeChannel(site: string | null) {
  if (!site) return null
  const s = site.toLowerCase()
  if (s.includes("airbnb"))  return "Airbnb"
  if (s.includes("vrbo") || s.includes("homeaway")) return "Vrbo"
  if (s.includes("direct"))  return "Direct"
  return site
}

// ── Star display ──────────────────────────────────────────────────────────────

function Stars({ rating, size = "sm" }: { rating: number | null; size?: "sm" | "lg" }) {
  if (rating === null) return <span className="text-xs text-muted-foreground">—</span>
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  const cls  = size === "lg" ? "size-4" : "size-3"
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            cls,
            i < full ? "fill-yellow-400 text-yellow-400"
            : i === full && half ? "fill-yellow-400/50 text-yellow-400"
            : "text-muted-foreground/30",
          )}
        />
      ))}
      <span className={cn(
        "ml-1 font-semibold tabular-nums",
        size === "lg" ? "text-sm text-foreground" : "text-xs text-muted-foreground",
      )}>
        {rating.toFixed(1)}
      </span>
    </span>
  )
}

function RatingRow({ label, value }: { label: string; value: number | null }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Stars rating={value} />
    </div>
  )
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: ReviewData }) {
  const [expanded, setExpanded] = useState(false)
  const channel = normalizeChannel(review.listing_site)

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">
            {review.reviewer_name ?? "Anonymous Guest"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{review.property_name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <Stars rating={review.overall_rating} size="lg" />
            {channel && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {channel}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">{fmtDate(review.reviewed_at)}</p>
      </div>

      {/* Review text */}
      {review.review_text && (
        <div>
          <p className={cn(
            "text-sm text-muted-foreground leading-relaxed",
            !expanded && "line-clamp-3",
          )}>
            {review.review_text}
          </p>
          {review.review_text.length > 200 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {/* Sub-ratings */}
      {(review.cleanliness_rating || review.communication_rating || review.location_rating ||
        review.accuracy_rating || review.value_rating) && (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5 space-y-1.5">
          <RatingRow label="Cleanliness"   value={review.cleanliness_rating} />
          <RatingRow label="Communication" value={review.communication_rating} />
          <RatingRow label="Location"      value={review.location_rating} />
          <RatingRow label="Accuracy"      value={review.accuracy_rating} />
          <RatingRow label="Value"         value={review.value_rating} />
        </div>
      )}

      {/* Host response */}
      {review.response_text && (
        <div className="border-l-2 border-border pl-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Host response</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{review.response_text}</p>
        </div>
      )}
    </div>
  )
}

// ── Main client ───────────────────────────────────────────────────────────────

const MIN_RATINGS = [
  { label: "All ratings", value: 0 },
  { label: "4+ stars",    value: 4 },
  { label: "3+ stars",    value: 3 },
  { label: "Below 3",     value: -1 },
]

export function ReviewsClient({ reviews }: { reviews: ReviewData[] }) {
  const [search,    setSearch]    = useState("")
  const [minRating, setMinRating] = useState(0)
  const [property,  setProperty]  = useState("all")

  const properties = useMemo(() => {
    const names = [...new Set(reviews.map(r => r.property_name))].sort()
    return names
  }, [reviews])

  const avgRating = useMemo(() => {
    const rated = reviews.filter(r => r.overall_rating !== null)
    if (!rated.length) return null
    return (rated.reduce((a, r) => a + r.overall_rating!, 0) / rated.length).toFixed(2)
  }, [reviews])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return reviews.filter(r => {
      if (property !== "all" && r.property_name !== property) return false
      if (minRating === -1 && (r.overall_rating === null || r.overall_rating >= 3)) return false
      if (minRating > 0  && (r.overall_rating === null || r.overall_rating < minRating)) return false
      if (q && !r.property_name.toLowerCase().includes(q) &&
               !(r.reviewer_name ?? "").toLowerCase().includes(q) &&
               !(r.review_text   ?? "").toLowerCase().includes(q)) return false
      return true
    })
  }, [reviews, search, minRating, property])

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-4">
        {avgRating && (
          <div className="flex items-center gap-2">
            <Stars rating={parseFloat(avgRating)} size="lg" />
            <span className="text-xs text-muted-foreground">portfolio average</span>
          </div>
        )}
        <span className="text-sm text-muted-foreground">{reviews.length} total reviews</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reviews…"
            className="w-52 rounded-lg border border-input bg-card pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </div>

        {/* Property filter */}
        <select
          value={property}
          onChange={e => setProperty(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
        >
          <option value="all">All properties</option>
          {properties.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Rating filter */}
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {MIN_RATINGS.map(r => (
            <button
              key={r.value}
              onClick={() => setMinRating(r.value)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
                minRating === r.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} review{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No reviews found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reviews.length === 0
              ? "Run a sync to import reviews from OwnerRez."
              : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}
    </div>
  )
}
