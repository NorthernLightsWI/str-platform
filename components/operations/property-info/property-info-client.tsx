"use client"

import { useState, useTransition } from "react"
import { Pencil, X, Check, Loader2, Wifi, Key, Car, Trash2, Phone, Clock, BookOpen, StickyNote } from "lucide-react"
import { cn } from "@/lib/utils"
import { upsertPropertyInfo } from "@/app/actions/property-info"

export type PropertyInfo = {
  property_id             : string
  door_code               : string | null
  wifi_name               : string | null
  wifi_password           : string | null
  parking_instructions    : string | null
  check_in_time           : string | null
  check_out_time          : string | null
  check_in_instructions   : string | null
  check_out_instructions  : string | null
  trash_day               : string | null
  recycle_day             : string | null
  emergency_contact       : string | null
  property_manager        : string | null
  house_manual_url        : string | null
  notes                   : string | null
}

export type PropertyItem = {
  id           : string
  name         : string
  externalName : string
  city         : string | null
  state        : string | null
  info         : PropertyInfo | null
}

const EMPTY_INFO = (propertyId: string): PropertyInfo => ({
  property_id            : propertyId,
  door_code              : null,
  wifi_name              : null,
  wifi_password          : null,
  parking_instructions   : null,
  check_in_time          : "16:00",
  check_out_time         : "11:00",
  check_in_instructions  : null,
  check_out_instructions : null,
  trash_day              : null,
  recycle_day            : null,
  emergency_contact      : null,
  property_manager       : null,
  house_manual_url       : null,
  notes                  : null,
})

// ── Field renderers ───────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-sm", value ? "text-foreground" : "text-muted-foreground/50 italic")}>
        {value ?? "Not set"}
      </p>
    </div>
  )
}

function EditField({
  label, value, onChange, type = "text", placeholder,
}: {
  label       : string
  value       : string
  onChange    : (v: string) => void
  type?       : "text" | "time" | "url" | "tel"
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-input bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      />
    </div>
  )
}

function EditArea({
  label, value, onChange, placeholder, rows = 3,
}: {
  label       : string
  value       : string
  onChange    : (v: string) => void
  placeholder?: string
  rows?       : number
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full resize-none rounded-lg border border-input bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      />
    </div>
  )
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, children,
}: {
  icon     : React.ElementType
  title    : string
  children : React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// ── Info panel ────────────────────────────────────────────────────────────────

function InfoPanel({
  property, isAdmin,
}: {
  property : PropertyItem
  isAdmin  : boolean
}) {
  const base = property.info ?? EMPTY_INFO(property.id)

  const [editing, setEditing]   = useState(false)
  const [form,    setForm]       = useState<PropertyInfo>(base)
  const [pending, startSave]     = useTransition()
  const [error,   setError]      = useState<string | null>(null)
  const [saved,   setSaved]      = useState(false)

  function f(key: keyof PropertyInfo) {
    return form[key] ?? ""
  }
  function set(key: keyof PropertyInfo, value: string) {
    setForm(prev => ({ ...prev, [key]: value || null }))
  }

  function handleEdit() {
    setForm(base)
    setEditing(true)
    setError(null)
  }

  function handleCancel() {
    setEditing(false)
    setError(null)
  }

  function handleSave() {
    startSave(async () => {
      const payload: Record<string, string | null> = {}
      for (const [k, v] of Object.entries(form)) {
        if (k !== "property_id") payload[k] = v as string | null
      }
      const res = await upsertPropertyInfo(property.id, payload)
      if (res?.error) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setEditing(false)
    })
  }

  const info = editing ? form : base

  return (
    <div className="space-y-4">
      {/* Panel header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{property.name}</h2>
          {property.name !== property.externalName && (
            <p className="text-xs text-muted-foreground">{property.externalName}</p>
          )}
          {(property.city || property.state) && (
            <p className="text-xs text-muted-foreground">
              {[property.city, property.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {isAdmin && (
          editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {pending
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Check className="size-3.5" />}
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleEdit}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Pencil className="size-3.5" />
              {saved ? "Saved!" : "Edit"}
            </button>
          )
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Sections */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Access */}
        <Section icon={Key} title="Access">
          {editing ? (
            <>
              <EditField label="Door / Access Code" value={f("door_code")}    onChange={v => set("door_code", v)} placeholder="e.g. #1234*" />
              <EditField label="Wi-Fi Name"          value={f("wifi_name")}    onChange={v => set("wifi_name", v)} />
              <EditField label="Wi-Fi Password"      value={f("wifi_password")} onChange={v => set("wifi_password", v)} />
            </>
          ) : (
            <>
              <ReadField label="Door / Access Code" value={info.door_code} />
              <ReadField label="Wi-Fi Name"         value={info.wifi_name} />
              <ReadField label="Wi-Fi Password"     value={info.wifi_password} />
            </>
          )}
        </Section>

        {/* Timings */}
        <Section icon={Clock} title="Check-in / Check-out">
          {editing ? (
            <>
              <EditField label="Check-in Time"  value={f("check_in_time")}  onChange={v => set("check_in_time", v)}  type="time" />
              <EditField label="Check-out Time" value={f("check_out_time")} onChange={v => set("check_out_time", v)} type="time" />
            </>
          ) : (
            <>
              <ReadField label="Check-in Time"  value={info.check_in_time} />
              <ReadField label="Check-out Time" value={info.check_out_time} />
            </>
          )}
        </Section>

        {/* Instructions */}
        <Section icon={BookOpen} title="Instructions">
          {editing ? (
            <>
              <EditArea label="Check-in Instructions"  value={f("check_in_instructions")}  onChange={v => set("check_in_instructions", v)}  placeholder="Guest arrival steps…" rows={3} />
              <EditArea label="Check-out Instructions" value={f("check_out_instructions")} onChange={v => set("check_out_instructions", v)} placeholder="Guest departure steps…" rows={3} />
            </>
          ) : (
            <>
              <ReadField label="Check-in Instructions"  value={info.check_in_instructions} />
              <ReadField label="Check-out Instructions" value={info.check_out_instructions} />
            </>
          )}
        </Section>

        {/* Parking */}
        <Section icon={Car} title="Parking">
          {editing ? (
            <EditArea label="Parking Instructions" value={f("parking_instructions")} onChange={v => set("parking_instructions", v)} placeholder="Parking location, permit info…" rows={3} />
          ) : (
            <ReadField label="Parking Instructions" value={info.parking_instructions} />
          )}
        </Section>

        {/* Housekeeping */}
        <Section icon={Trash2} title="Housekeeping">
          {editing ? (
            <>
              <EditField label="Trash Day"   value={f("trash_day")}   onChange={v => set("trash_day", v)}   placeholder="e.g. Tuesday" />
              <EditField label="Recycle Day" value={f("recycle_day")} onChange={v => set("recycle_day", v)} placeholder="e.g. Thursday" />
            </>
          ) : (
            <>
              <ReadField label="Trash Day"   value={info.trash_day} />
              <ReadField label="Recycle Day" value={info.recycle_day} />
            </>
          )}
        </Section>

        {/* Contacts */}
        <Section icon={Phone} title="Contacts">
          {editing ? (
            <>
              <EditField label="Emergency Contact"  value={f("emergency_contact")}  onChange={v => set("emergency_contact", v)}  type="tel" placeholder="Name + phone" />
              <EditField label="Property Manager"   value={f("property_manager")}   onChange={v => set("property_manager", v)}   placeholder="Name + phone / email" />
              <EditField label="House Manual URL"   value={f("house_manual_url")}   onChange={v => set("house_manual_url", v)}   type="url" placeholder="https://…" />
            </>
          ) : (
            <>
              <ReadField label="Emergency Contact" value={info.emergency_contact} />
              <ReadField label="Property Manager"  value={info.property_manager} />
              <ReadField label="House Manual URL"  value={info.house_manual_url} />
            </>
          )}
        </Section>

        {/* Notes — full width */}
        <div className="lg:col-span-2">
          <Section icon={StickyNote} title="Notes">
            {editing ? (
              <EditArea label="Internal Notes" value={f("notes")} onChange={v => set("notes", v)} placeholder="Cleaning supplies location, quirks, special instructions…" rows={4} />
            ) : (
              <ReadField label="Internal Notes" value={info.notes} />
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function PropertyInfoClient({
  properties,
  isAdmin,
}: {
  properties : PropertyItem[]
  isAdmin    : boolean
}) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id ?? null)
  const selected = properties.find(p => p.id === selectedId) ?? properties[0] ?? null

  return (
    <div className="flex gap-5 min-h-0">
      {/* Property list */}
      <div className="w-56 shrink-0 space-y-1">
        {properties.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={cn(
              "w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
              p.id === selectedId
                ? "bg-sidebar-primary/15 text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <p className="truncate">{p.name}</p>
            {(p.city || p.state) && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {[p.city, p.state].filter(Boolean).join(", ")}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Detail panel */}
      <div className="flex-1 min-w-0">
        {selected
          ? <InfoPanel property={selected} isAdmin={isAdmin} />
          : <p className="text-sm text-muted-foreground">Select a property</p>}
      </div>
    </div>
  )
}
