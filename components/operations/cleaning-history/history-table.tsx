"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

export type HistoryRow = {
  id                : string
  scheduled_date    : string
  completed_at      : string | null
  status            : string
  duration_minutes  : number | null
  notes             : string | null
  property_name     : string
  cleaner_name      : string | null
}

const STATUS_STYLES: Record<string, string> = {
  completed   : "bg-emerald-500/15 text-emerald-400",
  in_progress : "bg-blue-500/15 text-blue-400",
  scheduled   : "bg-muted text-muted-foreground",
  skipped     : "bg-yellow-500/15 text-yellow-400",
  cancelled   : "bg-red-500/15 text-red-400",
}

const STATUS_OPTIONS = ["all", "completed", "in_progress", "scheduled", "skipped", "cancelled"]

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  const d = iso.length === 10
    ? new Date(iso + "T00:00:00Z")
    : new Date(iso)
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    ...( iso.length > 10 ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "UTC",
  })
}

export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [query,  setQuery]  = useState("")
  const [status, setStatus] = useState("all")

  const filtered = rows.filter(r => {
    if (status !== "all" && r.status !== status) return false
    if (!query) return true
    const q = query.toLowerCase()
    return (
      r.property_name.toLowerCase().includes(q) ||
      (r.cleaner_name ?? "").toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search property or cleaner…"
            className="w-full rounded-lg border border-input bg-white pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                status === s
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Date", "Property", "Cleaner", "Status", "Completed At", "Duration", "Notes"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
                      i === 3 && "text-center",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No cleaning records found
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtDate(r.scheduled_date)}
                  </td>
                  <td className="px-5 py-3 font-medium text-foreground max-w-[220px] truncate">
                    {r.property_name}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                    {r.cleaner_name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      STATUS_STYLES[r.status] ?? "bg-muted text-muted-foreground",
                    )}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtDate(r.completed_at)}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {r.duration_minutes != null ? `${r.duration_minutes} min` : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground max-w-[240px] truncate">
                    {r.notes ?? "—"}
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
