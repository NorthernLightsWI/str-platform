"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Search, SlidersHorizontal, CheckSquare, Square, Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { AMENITIES, CATEGORIES, MAX_SCORE, calcScore, type AmenityDef } from "@/lib/amenities"
import { toggleAmenity } from "@/app/actions/amenities"

// ── Types ──────────────────────────────────────────────────────────────────────

export type PropertyRow = {
  id  : string
  name: string
}

export type AmenityRecord = {
  property_id: string
  amenity_key: string
  is_present : boolean
}

type AmenityMap = Record<string, Record<string, boolean>>

// ── Helpers ────────────────────────────────────────────────────────────────────

const IMPACT_LABEL: Record<number, string> = { 3: "High", 2: "Medium", 1: "Low" }
const IMPACT_CLS:   Record<number, string> = {
  3: "text-[#E88159] border-[#E88159]/30 bg-[#E88159]/10",
  2: "text-[#6FA1AF] border-[#6FA1AF]/30 bg-[#6FA1AF]/10",
  1: "text-muted-foreground border-border bg-muted/40",
}

function buildInitialMap(properties: PropertyRow[], records: AmenityRecord[]): AmenityMap {
  const map: AmenityMap = {}
  for (const p of properties) {
    map[p.id] = {}
    for (const a of AMENITIES) map[p.id][a.key] = false
  }
  for (const r of records) {
    if (map[r.property_id]) map[r.property_id][r.amenity_key] = r.is_present
  }
  return map
}

// ── Score bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ pct, className }: { pct: number; className?: string }) {
  const color = pct >= 75 ? "#6FA1AF" : pct >= 50 ? "#E88159" : "#ef4444"
  return (
    <div className={cn("h-1.5 rounded-full bg-white/10 overflow-hidden", className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

// ── Property list item ─────────────────────────────────────────────────────────

function PropertyItem({
  property, pct, selected, gapCount, onClick,
}: {
  property : PropertyRow
  pct      : number
  gapCount : number
  selected : boolean
  onClick  : () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-white/5 transition-colors",
        selected ? "bg-[#E88159]/15 border-l-2 border-l-[#E88159]" : "hover:bg-white/5",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className={cn(
          "text-sm font-medium truncate leading-tight",
          selected ? "text-[#E88159]" : "text-white/90",
        )}>
          {property.name}
        </p>
        <span className={cn(
          "shrink-0 text-xs font-mono font-semibold tabular-nums",
          pct >= 75 ? "text-[#6FA1AF]" : pct >= 50 ? "text-[#E88159]" : "text-red-400",
        )}>
          {pct}%
        </span>
      </div>
      <ScoreBar pct={pct} />
      {gapCount > 0 && (
        <p className="mt-1 text-[10px] text-white/40">
          {gapCount} gap{gapCount !== 1 ? "s" : ""} missing
        </p>
      )}
    </button>
  )
}

// ── Amenity row ────────────────────────────────────────────────────────────────

function AmenityRow({
  amenity, present, isAdmin, pending, onToggle,
}: {
  amenity  : AmenityDef
  present  : boolean
  isAdmin  : boolean
  pending  : boolean
  onToggle : () => void
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        present ? "bg-white/5" : "bg-white/[0.02]",
        isAdmin && "cursor-pointer hover:bg-white/10",
      )}
      onClick={isAdmin ? onToggle : undefined}
    >
      {/* Checkbox */}
      <div className="shrink-0">
        {pending ? (
          <Loader2 className="size-4 text-[#E88159] animate-spin" />
        ) : present ? (
          <CheckSquare className="size-4 text-[#6FA1AF]" />
        ) : (
          <Square className="size-4 text-white/25" />
        )}
      </div>

      {/* Label */}
      <span className={cn(
        "flex-1 text-sm",
        present ? "text-white/90" : "text-white/45",
      )}>
        {amenity.label}
      </span>

      {/* Impact badge */}
      <span className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        IMPACT_CLS[amenity.impact],
      )}>
        {IMPACT_LABEL[amenity.impact]}
      </span>
    </div>
  )
}

// ── Category section ───────────────────────────────────────────────────────────

function CategorySection({
  category, amenities, present, isAdmin, pendingKey, onToggle,
}: {
  category  : string
  amenities : AmenityDef[]
  present   : Record<string, boolean>
  isAdmin   : boolean
  pendingKey: string | null
  onToggle  : (key: string, val: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  const has    = amenities.filter(a => present[a.key]).length
  const total  = amenities.length
  const allGap = has === 0

  return (
    <div className="rounded-xl overflow-hidden border border-white/8" style={{ background: "#181b20" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        {open
          ? <ChevronDown  className="size-4 text-white/30 shrink-0" />
          : <ChevronRight className="size-4 text-white/30 shrink-0" />
        }
        <span className="flex-1 text-sm font-semibold text-white/80 font-mono">{category}</span>
        <span className={cn(
          "text-xs font-mono tabular-nums",
          allGap ? "text-red-400" : has === total ? "text-[#6FA1AF]" : "text-[#E88159]",
        )}>
          {has}/{total}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {amenities.map(a => (
            <AmenityRow
              key={a.key}
              amenity={a}
              present={!!present[a.key]}
              isAdmin={isAdmin}
              pending={pendingKey === a.key}
              onToggle={() => onToggle(a.key, !present[a.key])}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Portfolio gap table ────────────────────────────────────────────────────────

function PortfolioGapTable({
  properties, amenityMap,
}: {
  properties : PropertyRow[]
  amenityMap : AmenityMap
}) {
  const highImpact = AMENITIES.filter(a => a.impact === 3)

  const rows = highImpact
    .map(a => {
      const missing = properties.filter(p => !amenityMap[p.id]?.[a.key])
      return { amenity: a, missingCount: missing.length, missingNames: missing.map(p => p.name) }
    })
    .filter(r => r.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount)

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-white/40 text-sm">
        All high-impact amenities are covered across the portfolio.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35 font-mono">Amenity</th>
            <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35 font-mono">Category</th>
            <th className="text-center py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35 font-mono">Missing</th>
            <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/35 font-mono">Properties Affected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.amenity.key} className="border-b border-white/5 hover:bg-white/3 transition-colors">
              <td className="py-2.5 px-3 text-white/80 font-medium">{row.amenity.label}</td>
              <td className="py-2.5 px-3 text-white/45 text-xs">{row.amenity.category}</td>
              <td className="py-2.5 px-3 text-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E88159]/15 border border-[#E88159]/30 px-2 py-0.5 text-xs font-semibold text-[#E88159]">
                  <AlertTriangle className="size-3" />
                  {row.missingCount}/{properties.length}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <p className="text-xs text-white/40 truncate max-w-xs">{row.missingNames.join(", ")}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main client ────────────────────────────────────────────────────────────────

export function AmenityGapClient({
  properties,
  initialRecords,
  isAdmin,
}: {
  properties    : PropertyRow[]
  initialRecords: AmenityRecord[]
  isAdmin       : boolean
}) {
  const [amenityMap, setAmenityMap] = useState<AmenityMap>(() =>
    buildInitialMap(properties, initialRecords),
  )
  const [selectedId,    setSelectedId]    = useState<string>(properties[0]?.id ?? "")
  const [search,        setSearch]        = useState("")
  const [gapsOnly,      setGapsOnly]      = useState(false)
  const [categoryFilter,setCategoryFilter] = useState("All")
  const [pendingKey,    setPendingKey]    = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const selectedProperty = properties.find(p => p.id === selectedId)
  const selectedAmenities = amenityMap[selectedId] ?? {}

  // ── Scores ──────────────────────────────────────────────────────────────
  const scores = useMemo(() =>
    Object.fromEntries(
      properties.map(p => [p.id, calcScore(amenityMap[p.id] ?? {})])
    ),
  [amenityMap, properties])

  // ── Filtered property list ───────────────────────────────────────────────
  const filteredProperties = useMemo(() => {
    const q = search.toLowerCase()
    return properties.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [properties, search])

  // ── Filtered amenities for right panel ──────────────────────────────────
  const filteredAmenities = useMemo(() => {
    return AMENITIES.filter(a => {
      if (categoryFilter !== "All" && a.category !== categoryFilter) return false
      if (gapsOnly && selectedAmenities[a.key]) return false
      return true
    })
  }, [categoryFilter, gapsOnly, selectedAmenities])

  const groupedAmenities = useMemo(() => {
    const cats = categoryFilter === "All" ? CATEGORIES : [categoryFilter as typeof CATEGORIES[number]]
    return cats
      .map(cat => ({ cat, items: filteredAmenities.filter(a => a.category === cat) }))
      .filter(g => g.items.length > 0)
  }, [filteredAmenities, categoryFilter])

  // ── Toggle handler ───────────────────────────────────────────────────────
  const handleToggle = useCallback((amenityKey: string, newValue: boolean) => {
    if (!isAdmin || !selectedId) return

    // Optimistic update
    setAmenityMap(prev => ({
      ...prev,
      [selectedId]: { ...prev[selectedId], [amenityKey]: newValue },
    }))
    setPendingKey(amenityKey)

    startTransition(async () => {
      const result = await toggleAmenity(selectedId, amenityKey, newValue)
      if (result.error) {
        // Revert on failure
        setAmenityMap(prev => ({
          ...prev,
          [selectedId]: { ...prev[selectedId], [amenityKey]: !newValue },
        }))
      }
      setPendingKey(null)
    })
  }, [isAdmin, selectedId, startTransition])

  // ── Portfolio summary stats ──────────────────────────────────────────────
  const avgPct = properties.length
    ? Math.round(Object.values(scores).reduce((s, v) => s + v.pct, 0) / properties.length)
    : 0
  const totalGaps = properties.reduce((s, p) =>
    s + AMENITIES.filter(a => !amenityMap[p.id]?.[a.key]).length, 0)

  if (properties.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40 text-sm">
        No active properties found.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/8 px-4 py-3" style={{ background: "#181b20" }}>
          <p className="text-xs text-white/40 font-mono">Portfolio Score</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "#6FA1AF" }}>
            {avgPct}%
          </p>
        </div>
        <div className="rounded-xl border border-white/8 px-4 py-3" style={{ background: "#181b20" }}>
          <p className="text-xs text-white/40 font-mono">Properties</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-white/80">{properties.length}</p>
        </div>
        <div className="rounded-xl border border-white/8 px-4 py-3" style={{ background: "#181b20" }}>
          <p className="text-xs text-white/40 font-mono">Total Gaps</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums" style={{ color: "#E88159" }}>{totalGaps}</p>
        </div>
        <div className="rounded-xl border border-white/8 px-4 py-3 hidden sm:block" style={{ background: "#181b20" }}>
          <p className="text-xs text-white/40 font-mono">Amenities Tracked</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-white/80">{AMENITIES.length}</p>
        </div>
      </div>

      {/* Main split panel */}
      <div className="flex gap-4 min-h-[600px]">
        {/* ── Left: property list ── */}
        <div
          className="w-64 shrink-0 rounded-xl border border-white/8 flex flex-col overflow-hidden"
          style={{ background: "#181b20" }}
        >
          <div className="px-3 pt-3 pb-2 border-b border-white/8">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/30 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search properties…"
                className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-1.5 text-xs text-white/80 placeholder:text-white/25 outline-none focus:border-[#E88159]/50"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredProperties.map(p => {
              const sc = scores[p.id] ?? { pct: 0 }
              const gapCount = AMENITIES.filter(a => !amenityMap[p.id]?.[a.key]).length
              return (
                <PropertyItem
                  key={p.id}
                  property={p}
                  pct={sc.pct}
                  gapCount={gapCount}
                  selected={selectedId === p.id}
                  onClick={() => setSelectedId(p.id)}
                />
              )
            })}
          </div>
        </div>

        {/* ── Right: checklist ── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Controls */}
          <div
            className="rounded-xl border border-white/8 px-4 py-3 flex flex-wrap items-center gap-3"
            style={{ background: "#181b20" }}
          >
            <div>
              <p className="text-xs text-white/40 font-mono mb-0.5">Selected property</p>
              <p className="text-sm font-semibold text-white/90" style={{ fontFamily: "'Roboto Mono', monospace" }}>
                {selectedProperty?.name ?? "—"}
              </p>
            </div>
            {selectedProperty && (
              <div className="flex items-center gap-1.5 ml-2">
                <span
                  className="text-xl font-bold font-mono tabular-nums"
                  style={{ color: scores[selectedId]?.pct >= 75 ? "#6FA1AF" : "#E88159" }}
                >
                  {scores[selectedId]?.pct ?? 0}%
                </span>
                <span className="text-xs text-white/30">coverage</span>
              </div>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Gaps only toggle */}
              <button
                onClick={() => setGapsOnly(g => !g)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  gapsOnly
                    ? "border-[#E88159]/40 bg-[#E88159]/15 text-[#E88159]"
                    : "border-white/10 bg-white/5 text-white/50 hover:text-white/80",
                )}
              >
                <SlidersHorizontal className="size-3" />
                Gaps Only
              </button>

              {/* Category filter */}
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 outline-none focus:border-[#6FA1AF]/50"
              >
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {!isAdmin && (
              <span className="text-xs text-white/30 italic">Read-only view</span>
            )}
          </div>

          {/* Checklist */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {groupedAmenities.length === 0 ? (
              <div
                className="rounded-xl border border-white/8 px-6 py-12 text-center"
                style={{ background: "#181b20" }}
              >
                <p className="text-sm text-white/40">
                  {gapsOnly ? "No gaps found — this property covers all amenities in this view." : "No amenities match the current filter."}
                </p>
              </div>
            ) : (
              groupedAmenities.map(({ cat, items }) => (
                <CategorySection
                  key={cat}
                  category={cat}
                  amenities={items}
                  present={selectedAmenities}
                  isAdmin={isAdmin}
                  pendingKey={pendingKey}
                  onToggle={handleToggle}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Portfolio gap table */}
      <div
        className="rounded-xl border border-white/8 overflow-hidden"
        style={{ background: "#181b20" }}
      >
        <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
          <AlertTriangle className="size-4 text-[#E88159]" />
          <h2 className="text-sm font-semibold font-mono text-white/80">
            Portfolio Gaps — High-Impact Missing Amenities
          </h2>
          <span className="ml-auto text-xs text-white/30">Impact = High only</span>
        </div>
        <div className="px-5 py-4">
          <PortfolioGapTable properties={properties} amenityMap={amenityMap} />
        </div>
      </div>
    </div>
  )
}
