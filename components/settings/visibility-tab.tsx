"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { setHiddenProperties } from "@/app/actions/settings"

export type PropertyVisibilityRow = {
  id        : string
  name      : string
  is_active : boolean
}

export function PropertyVisibilityTab({
  initialProperties,
  initialHiddenIds,
}: {
  initialProperties : PropertyVisibilityRow[]
  initialHiddenIds  : string[]
}) {
  const [hidden,  setHidden]  = useState(() => new Set(initialHiddenIds))
  const [saving,  setSaving]  = useState(false)

  async function handleToggle(id: string) {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHidden(next)
    setSaving(true)
    await setHiddenProperties(Array.from(next))
    setSaving(false)
  }

  const total   = initialProperties.length
  const visible = total - hidden.size

  const sorted = [...initialProperties].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {visible} of {total} {total === 1 ? "property" : "properties"} visible
          {saving && <span className="ml-2 text-xs text-muted-foreground/50">Saving…</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          Hidden properties still sync from OwnerRez
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No properties found. Sync from OwnerRez first.
          </div>
        )}
        {sorted.map(p => {
          const isHidden = hidden.has(p.id)
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                  "size-2 shrink-0 rounded-full",
                  p.is_active ? "bg-emerald-400" : "bg-muted-foreground/30",
                )} />
                <span className={cn(
                  "text-sm truncate transition-colors",
                  isHidden ? "text-muted-foreground/40 line-through" : "text-foreground",
                )}>
                  {p.name}
                </span>
                {!p.is_active && (
                  <span className="shrink-0 text-xs text-muted-foreground/50">inactive in OwnerRez</span>
                )}
              </div>
              <button
                role="switch"
                aria-checked={!isHidden}
                onClick={() => handleToggle(p.id)}
                className={cn(
                  "relative shrink-0 h-5 w-9 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isHidden ? "bg-muted" : "bg-primary",
                )}
              >
                <span className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all duration-200",
                  isHidden ? "left-0.5" : "left-[1.125rem]",
                )} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
