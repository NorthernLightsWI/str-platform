"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { setPropertyParent } from "@/app/actions/settings"

export type PropertyGroupRow = {
  id                 : string
  name               : string
  is_active          : boolean
  parent_property_id : string | null
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children}
    </div>
  )
}

export function GroupsTab({ initialProperties }: { initialProperties: PropertyGroupRow[] }) {
  const [props, setProps] = useState(initialProperties)
  const [saving, setSaving] = useState<string | null>(null)

  const childIds = new Set(props.filter(p => p.parent_property_id).map(p => p.id))
  const availableParents = props.filter(p => !childIds.has(p.id))

  async function handleParentChange(propertyId: string, parentId: string) {
    const nextParent = parentId === "" ? null : parentId
    setSaving(propertyId)
    const res = await setPropertyParent(propertyId, nextParent)
    setSaving(null)
    if (res.ok) {
      setProps(prev => prev.map(p =>
        p.id === propertyId ? { ...p, parent_property_id: nextParent } : p
      ))
    }
  }

  const sorted = [...props].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-4">
      <Card title="Property Groups">
        <p className="text-xs text-muted-foreground">
          Group multi-listing units (e.g. weekly and monthly versions of the same unit) under
          a parent property. Grouped properties are combined in analytics, reports, and the
          operations overview. Only two levels deep — a child cannot itself be a parent.
        </p>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {sorted.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No properties found. Sync from OwnerRez first.
            </div>
          )}
          {sorted.map(p => {
            const isChild   = !!p.parent_property_id
            const isParent  = props.some(c => c.parent_property_id === p.id)
            const isSaving  = saving === p.id
            const parentOptions = availableParents.filter(pp => pp.id !== p.id)

            return (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "size-2 shrink-0 rounded-full",
                    p.is_active ? "bg-emerald-400" : "bg-muted-foreground/30",
                  )} />
                  <div className="min-w-0">
                    <span className="text-sm text-foreground truncate block">{p.name}</span>
                    {isParent && (
                      <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">
                        Parent
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isSaving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  {isParent ? (
                    <span className="text-xs text-muted-foreground italic">
                      {props.filter(c => c.parent_property_id === p.id).length} child
                      {props.filter(c => c.parent_property_id === p.id).length !== 1 ? "ren" : ""}
                    </span>
                  ) : (
                    <select
                      value={p.parent_property_id ?? ""}
                      onChange={e => handleParentChange(p.id, e.target.value)}
                      disabled={!!saving}
                      className="rounded-lg border border-input bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50 max-w-[200px]"
                    >
                      <option value="">No parent (standalone)</option>
                      {parentOptions.map(pp => (
                        <option key={pp.id} value={pp.id}>{pp.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
