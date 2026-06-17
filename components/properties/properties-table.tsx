"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { healthColor } from "@/lib/health-score"

export type PropertyRow = {
  id           : string
  external_name: string
  internal_name: string | null
  city         : string | null
  state        : string | null
  bedrooms     : number | null
  bathrooms    : number | null
  max_guests   : number | null
  is_active    : boolean
  mtdRevenue   : number
  mtdOccupancy : number   // 0–100
  mtdAdr       : number
  healthScore  : number   // 0–100
}

type SortKey = "name" | "city" | "bedrooms" | "occupancy" | "adr" | "revenue" | "health"
type SortDir = "asc" | "desc"

function SortIcon({ col, active, dir }: { col: SortKey; active: SortKey; dir: SortDir }) {
  if (col !== active) return <ChevronsUpDown className="size-3 opacity-30" />
  return dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
}

function HealthBadge({ score }: { score: number }) {
  const color = healthColor(score)
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
      color === "green"  && "bg-emerald-400/15 text-emerald-500",
      color === "yellow" && "bg-amber-400/15 text-amber-500",
      color === "red"    && "bg-red-400/15 text-red-500",
    )}>
      {score}
    </span>
  )
}

export function PropertiesTable({ rows }: { rows: PropertyRow[] }) {
  const router = useRouter()

  const [query,      setQuery]      = useState("")
  const [activeOnly, setActiveOnly] = useState(false)
  const [sortKey,    setSortKey]    = useState<SortKey>("name")
  const [sortDir,    setSortDir]    = useState<SortDir>("asc")

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir(key === "name" || key === "city" ? "asc" : "desc")
    }
  }

  const filtered = rows
    .filter(r => {
      if (activeOnly && !r.is_active) return false
      if (!query) return true
      const q = query.toLowerCase()
      return (
        (r.external_name ?? "").toLowerCase().includes(q) ||
        (r.internal_name ?? "").toLowerCase().includes(q) ||
        (r.city          ?? "").toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "name":      cmp = (a.external_name ?? "").localeCompare(b.external_name ?? ""); break
        case "city":      cmp = (a.city ?? "").localeCompare(b.city ?? ""); break
        case "bedrooms":  cmp = (a.bedrooms ?? 0) - (b.bedrooms ?? 0); break
        case "occupancy": cmp = a.mtdOccupancy - b.mtdOccupancy; break
        case "adr":       cmp = a.mtdAdr - b.mtdAdr; break
        case "revenue":   cmp = a.mtdRevenue - b.mtdRevenue; break
        case "health":    cmp = a.healthScore - b.healthScore; break
      }
      return sortDir === "asc" ? cmp : -cmp
    })

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })

  const ThBtn = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <button
      onClick={() => toggleSort(col)}
      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
      <SortIcon col={col} active={sortKey} dir={sortDir} />
    </button>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search properties…"
            className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 select-none">
          <div
            role="switch"
            aria-checked={activeOnly}
            onClick={() => setActiveOnly(v => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
              activeOnly ? "bg-primary" : "bg-muted",
            )}
          >
            <span className={cn(
              "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
              activeOnly ? "translate-x-4" : "translate-x-0.5",
            )} />
          </div>
          <span className="text-sm text-muted-foreground">Active only</span>
        </label>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {rows.length} properties
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left"><ThBtn col="name">Property</ThBtn></th>
                <th className="px-4 py-3 text-center"><ThBtn col="health">Score</ThBtn></th>
                <th className="px-5 py-3 text-left"><ThBtn col="city">Location</ThBtn></th>
                <th className="px-5 py-3 text-left"><ThBtn col="bedrooms">Beds / Baths</ThBtn></th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">Guests</th>
                <th className="px-5 py-3 text-right"><ThBtn col="occupancy">Occ % (MTD)</ThBtn></th>
                <th className="px-5 py-3 text-right"><ThBtn col="adr">ADR (MTD)</ThBtn></th>
                <th className="px-5 py-3 text-right"><ThBtn col="revenue">Revenue (MTD)</ThBtn></th>
                <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No properties match your search
                  </td>
                </tr>
              ) : filtered.map(row => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/properties/${row.id}`)}
                  className="hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-foreground leading-tight">
                      {row.internal_name || row.external_name}
                    </p>
                    {row.internal_name && row.external_name !== row.internal_name && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[220px]">
                        {row.external_name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <HealthBadge score={row.healthScore} />
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                    {[row.city, row.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                    {row.bedrooms != null ? row.bedrooms + " bd" : "—"}
                    {row.bathrooms != null ? " / " + row.bathrooms + " ba" : ""}
                  </td>
                  <td className="px-4 py-3.5 text-center text-muted-foreground">
                    {row.max_guests ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
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
                  <td className="px-5 py-3.5 text-right font-medium text-foreground tabular-nums">
                    {row.mtdAdr > 0 ? fmt(row.mtdAdr) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right font-medium text-foreground tabular-nums">
                    {row.mtdRevenue > 0 ? fmt(row.mtdRevenue) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      row.is_active
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}>
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
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
