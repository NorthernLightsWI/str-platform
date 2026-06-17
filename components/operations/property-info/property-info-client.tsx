"use client"

import { useState, useTransition } from "react"
import {
  Key, Wifi, Clock, CheckCircle2, AlertCircle, AlertTriangle,
  Phone, Mail, Pencil, Trash2, Plus, X, Check, Loader2,
  Droplets, Zap, Wind, Leaf, Wrench, StickyNote, History,
  Car, BookOpen, Filter, CalendarCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  upsertPropertyInfo,
  addVendorContact,
  updateVendorContact,
  deleteVendorContact,
  addRecurringItem,
  markRecurringComplete,
  deleteRecurringItem,
} from "@/app/actions/property-info"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PropertyInfo = {
  property_id            : string
  door_code              : string | null
  wifi_name              : string | null
  wifi_password          : string | null
  parking_instructions   : string | null
  check_in_time          : string | null
  check_out_time         : string | null
  check_in_instructions  : string | null
  check_out_instructions : string | null
  trash_day              : string | null
  trash_notes            : string | null
  recycle_day            : string | null
  cleaner_notes          : string | null
  emergency_contact      : string | null
  property_manager       : string | null
  house_manual_url       : string | null
  notes                  : string | null
}

export type VendorContact = {
  id         : string
  property_id: string
  category   : string
  name       : string
  phone      : string | null
  email      : string | null
  notes      : string | null
  created_at : string
}

export type RecurringItem = {
  id                 : string
  property_id        : string
  item_name          : string
  interval_days      : number
  last_completed_date: string | null
  last_completed_by  : string | null
  next_due_date      : string | null
  notes              : string | null
  filter_size        : string | null
  created_at         : string
  updated_at         : string
}

export type ChangelogEntry = {
  id              : string
  property_id     : string
  changed_by_id   : string | null
  changed_by_name : string | null
  field_changed   : string
  old_value       : string | null
  new_value       : string | null
  created_at      : string
}

export type PropertyItemFull = {
  id          : string
  name        : string
  externalName: string
  city        : string | null
  state       : string | null
  info        : PropertyInfo | null
  vendors     : VendorContact[]
  recurring   : RecurringItem[]
  changelog   : ChangelogEntry[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const FILTER_SIZES = ["16x25x1", "20x25x1", "16x20x1", "20x20x1", "Custom"]

const VENDOR_CATEGORIES = [
  { value: "plumber",      label: "Plumber"       },
  { value: "electrician",  label: "Electrician"   },
  { value: "hvac",         label: "HVAC"          },
  { value: "lawn_care",    label: "Lawn Care"     },
  { value: "other",        label: "Other"         },
]

// ── Utilities ─────────────────────────────────────────────────────────────────

function nextDayOccurrence(dayName: string | null): string | null {
  if (!dayName) return null
  const ALL_DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]
  const target   = ALL_DAYS.indexOf(dayName.toLowerCase())
  if (target === -1) return null
  const today     = new Date()
  const todayDay  = today.getDay()
  let   daysUntil = (target - todayDay + 7) % 7
  if (daysUntil === 0) daysUntil = 7
  const next = new Date(today)
  next.setDate(next.getDate() + daysUntil)
  return next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function getStatus(nextDueDate: string | null): "overdue" | "due-soon" | "ok" | "never" {
  if (!nextDueDate) return "never"
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const due       = new Date(nextDueDate + "T00:00:00")
  const daysUntil = (due.getTime() - today.getTime()) / 86_400_000
  if (daysUntil < 0)  return "overdue"
  if (daysUntil <= 14) return "due-soon"
  return "ok"
}

function fmtDate(ymd: string | null): string {
  if (!ymd) return "Never"
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

function fmt12(time: string | null): string {
  if (!time) return "—"
  const [h, m] = time.split(":").map(Number)
  const suffix = h >= 12 ? "PM" : "AM"
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`
}

function vendorIcon(category: string) {
  switch (category) {
    case "plumber":     return Droplets
    case "electrician": return Zap
    case "hvac":        return Wind
    case "lawn_care":   return Leaf
    default:            return Wrench
  }
}

// ── Shared form primitives ────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = "text", placeholder,
}: {
  label       : string
  value       : string
  onChange    : (v: string) => void
  type?       : string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      />
    </div>
  )
}

function SelectField({
  label, value, onChange, options,
}: {
  label   : string
  value   : string
  onChange: (v: string) => void
  options : { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      >
        <option value="">— Select —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function TextArea({
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
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      />
    </div>
  )
}

function SaveRow({
  pending, onSave, onCancel,
}: {
  pending  : boolean
  onSave   : () => void
  onCancel : () => void
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        onClick={onCancel}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
      >
        <X className="size-3.5" /> Cancel
      </button>
      <button
        onClick={onSave}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: "overdue" | "due-soon" | "ok" | "never" }) {
  if (status === "overdue")  return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><AlertCircle className="size-3" /> Overdue</span>
  if (status === "due-soon") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><AlertTriangle className="size-3" /> Due Soon</span>
  if (status === "ok")       return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-3" /> OK</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Never done</span>
}

function SectionCard({
  icon: Icon, title, action, children,
}: {
  icon     : React.ElementType
  title    : string
  action?  : React.ReactNode
  children : React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-3.5 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Quick Reference section ───────────────────────────────────────────────────

const EMPTY_INFO = (pid: string): PropertyInfo => ({
  property_id: pid, door_code: null, wifi_name: null, wifi_password: null,
  parking_instructions: null, check_in_time: "16:00", check_out_time: "11:00",
  check_in_instructions: null, check_out_instructions: null,
  trash_day: null, trash_notes: null, recycle_day: null, cleaner_notes: null,
  emergency_contact: null, property_manager: null, house_manual_url: null, notes: null,
})

type InfoSection = "access" | "timing" | "instructions" | "parking" | "contacts" | null

function QuickRefBar({ info }: { info: PropertyInfo }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { icon: Key,   label: "Access Code",  value: info.door_code    },
        { icon: Wifi,  label: "Wi-Fi",        value: info.wifi_name ? `${info.wifi_name}${info.wifi_password ? ` · ${info.wifi_password}` : ""}` : null },
        { icon: Clock, label: "Check-in",     value: fmt12(info.check_in_time)  },
        { icon: Clock, label: "Check-out",    value: fmt12(info.check_out_time) },
      ].map(({ icon: Icon, label, value }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Icon className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          </div>
          <p className={cn(
            "text-xl font-bold tracking-tight break-all",
            value ? "text-foreground" : "text-muted-foreground/40",
          )}>
            {value ?? "—"}
          </p>
        </div>
      ))}
    </div>
  )
}

function InfoEditSection({
  property, canEdit,
}: {
  property : PropertyItemFull
  canEdit  : boolean
}) {
  const base = property.info ?? EMPTY_INFO(property.id)

  const [editing, setEditing]  = useState<InfoSection>(null)
  const [form, setForm]        = useState<PropertyInfo>(base)
  const [pending, startSave]   = useTransition()
  const [error, setError]      = useState<string | null>(null)

  function f(k: keyof PropertyInfo): string { return (form[k] as string | null) ?? "" }
  function s(k: keyof PropertyInfo, v: string) { setForm(prev => ({ ...prev, [k]: v || null })) }

  function openEdit(section: InfoSection) {
    setForm(base)
    setEditing(section)
    setError(null)
  }

  function handleSave(fields: (keyof PropertyInfo)[]) {
    startSave(async () => {
      const payload: Record<string, string | null> = {}
      const changedFields: Array<{ field: string; oldValue: string | null; newValue: string | null }> = []
      for (const k of fields) {
        if (k === "property_id") continue
        const newVal = form[k] as string | null
        const oldVal = base[k] as string | null
        payload[k] = newVal
        if (newVal !== oldVal) changedFields.push({ field: k, oldValue: oldVal, newValue: newVal })
      }
      const res = await upsertPropertyInfo(property.id, payload, changedFields)
      if (res?.error) { setError(res.error); return }
      setEditing(null)
    })
  }

  function EditBtn({ section }: { section: InfoSection }) {
    if (!canEdit) return null
    return (
      <button
        onClick={() => openEdit(section)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Pencil className="size-3" /> Edit
      </button>
    )
  }

  const info = form

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Access */}
      <SectionCard icon={Key} title="Access" action={<EditBtn section="access" />}>
        {editing === "access" ? (
          <div className="space-y-3">
            <Field label="Door / Access Code" value={f("door_code")}    onChange={v => s("door_code", v)}    placeholder="#1234*" />
            <Field label="Wi-Fi Name"         value={f("wifi_name")}    onChange={v => s("wifi_name", v)} />
            <Field label="Wi-Fi Password"     value={f("wifi_password")} onChange={v => s("wifi_password", v)} />
            <SaveRow pending={pending} onSave={() => handleSave(["door_code","wifi_name","wifi_password"])} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <div className="space-y-3">
            <ReadField label="Door Code"     value={base.door_code} />
            <ReadField label="Wi-Fi Name"    value={base.wifi_name} />
            <ReadField label="Wi-Fi Password" value={base.wifi_password} monospace />
          </div>
        )}
      </SectionCard>

      {/* Check-in/out times */}
      <SectionCard icon={Clock} title="Check-in / Check-out" action={<EditBtn section="timing" />}>
        {editing === "timing" ? (
          <div className="space-y-3">
            <Field label="Check-in Time"  value={f("check_in_time")}  onChange={v => s("check_in_time", v)}  type="time" />
            <Field label="Check-out Time" value={f("check_out_time")} onChange={v => s("check_out_time", v)} type="time" />
            <SaveRow pending={pending} onSave={() => handleSave(["check_in_time","check_out_time"])} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <ReadField label="Check-in"  value={fmt12(base.check_in_time)} />
            <ReadField label="Check-out" value={fmt12(base.check_out_time)} />
          </div>
        )}
      </SectionCard>

      {/* Instructions */}
      <SectionCard icon={BookOpen} title="Guest Instructions" action={<EditBtn section="instructions" />}>
        {editing === "instructions" ? (
          <div className="space-y-3">
            <TextArea label="Check-in Instructions"  value={f("check_in_instructions")}  onChange={v => s("check_in_instructions", v)}  placeholder="Guest arrival steps…" />
            <TextArea label="Check-out Instructions" value={f("check_out_instructions")} onChange={v => s("check_out_instructions", v)} placeholder="Guest departure steps…" />
            <SaveRow pending={pending} onSave={() => handleSave(["check_in_instructions","check_out_instructions"])} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <div className="space-y-3">
            <ReadField label="Check-in Instructions"  value={base.check_in_instructions} />
            <ReadField label="Check-out Instructions" value={base.check_out_instructions} />
          </div>
        )}
      </SectionCard>

      {/* Parking */}
      <SectionCard icon={Car} title="Parking" action={<EditBtn section="parking" />}>
        {editing === "parking" ? (
          <div className="space-y-3">
            <TextArea label="Parking Instructions" value={f("parking_instructions")} onChange={v => s("parking_instructions", v)} placeholder="Location, permit info…" />
            <SaveRow pending={pending} onSave={() => handleSave(["parking_instructions"])} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <ReadField label="Parking Instructions" value={base.parking_instructions} />
        )}
      </SectionCard>

      {/* Contacts */}
      <SectionCard icon={Phone} title="Emergency Contacts" action={<EditBtn section="contacts" />}>
        {editing === "contacts" ? (
          <div className="space-y-3">
            <Field label="Emergency Contact" value={f("emergency_contact")}  onChange={v => s("emergency_contact", v)}  type="tel" placeholder="Name + phone" />
            <Field label="Property Manager"  value={f("property_manager")}   onChange={v => s("property_manager", v)}   placeholder="Name + phone / email" />
            <Field label="House Manual URL"  value={f("house_manual_url")}   onChange={v => s("house_manual_url", v)}   type="url" placeholder="https://…" />
            <SaveRow pending={pending} onSave={() => handleSave(["emergency_contact","property_manager","house_manual_url"])} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <div className="space-y-3">
            <ReadField label="Emergency Contact" value={base.emergency_contact} />
            <ReadField label="Property Manager"  value={base.property_manager} />
            {base.house_manual_url && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">House Manual</p>
                <a href={base.house_manual_url} target="_blank" rel="noopener noreferrer"
                   className="text-sm text-primary hover:underline break-all">
                  {base.house_manual_url}
                </a>
              </div>
            )}
            {!base.house_manual_url && <ReadField label="House Manual" value={null} />}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function ReadField({
  label, value, monospace,
}: {
  label     : string
  value     : string | null
  monospace?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={cn(
        "text-sm",
        monospace && "font-mono",
        value ? "text-foreground" : "text-muted-foreground/40 italic",
      )}>
        {value ?? "Not set"}
      </p>
    </div>
  )
}

// ── Vendor Contacts section ───────────────────────────────────────────────────

const VENDOR_EMPTY = { category: "other", name: "", phone: "", email: "", notes: "" }

function VendorContactsSection({
  property, canEdit,
}: {
  property : PropertyItemFull
  canEdit  : boolean
}) {
  const [adding, setAdding]         = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState({ ...VENDOR_EMPTY })
  const [pending, startT]           = useTransition()
  const [error, setError]           = useState<string | null>(null)

  function f(k: keyof typeof VENDOR_EMPTY) { return form[k] }
  function s(k: keyof typeof VENDOR_EMPTY, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  function openAdd() {
    setForm({ ...VENDOR_EMPTY })
    setEditingId(null)
    setAdding(true)
    setError(null)
  }

  function openEdit(v: VendorContact) {
    setForm({ category: v.category, name: v.name, phone: v.phone ?? "", email: v.email ?? "", notes: v.notes ?? "" })
    setEditingId(v.id)
    setAdding(false)
    setError(null)
  }

  function handleAdd() {
    if (!form.name || !form.category) return
    startT(async () => {
      const res = await addVendorContact(property.id, form)
      if (res?.error) { setError(res.error); return }
      setAdding(false)
    })
  }

  function handleUpdate() {
    if (!editingId || !form.name) return
    startT(async () => {
      const res = await updateVendorContact(editingId, property.id, form)
      if (res?.error) { setError(res.error); return }
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    startT(async () => {
      await deleteVendorContact(id, property.id)
    })
  }

  const VendorForm = ({ onSave }: { onSave: () => void }) => (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SelectField label="Category" value={f("category")} onChange={v => s("category", v)} options={VENDOR_CATEGORIES} />
        <Field label="Name" value={f("name")} onChange={v => s("name", v)} placeholder="Company or person name" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Phone" value={f("phone")} onChange={v => s("phone", v)} type="tel" placeholder="(555) 555-5555" />
        <Field label="Email" value={f("email")} onChange={v => s("email", v)} type="email" placeholder="name@example.com" />
      </div>
      <TextArea label="Notes" value={f("notes")} onChange={v => s("notes", v)} placeholder="Additional info…" rows={2} />
      <SaveRow pending={pending} onSave={onSave} onCancel={() => { setAdding(false); setEditingId(null) }} />
    </div>
  )

  return (
    <SectionCard
      icon={Phone}
      title="Vendor Contacts"
      action={canEdit ? (
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus className="size-3" /> Add
        </button>
      ) : undefined}
    >
      {error && (
        <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-3">
        {property.vendors.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground/60 italic">No vendor contacts added yet.</p>
        )}

        {property.vendors.map(v => {
          const VIcon = vendorIcon(v.category)
          if (editingId === v.id) {
            return <VendorForm key={v.id} onSave={handleUpdate} />
          }
          return (
            <div key={v.id} className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                <VIcon className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{v.name}</p>
                  <span className="text-xs rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground capitalize">
                    {VENDOR_CATEGORIES.find(c => c.value === v.category)?.label ?? v.category}
                  </span>
                </div>
                {v.phone && (
                  <a href={`tel:${v.phone}`} className="mt-0.5 flex items-center gap-1 text-sm text-primary hover:underline">
                    <Phone className="size-3" /> {v.phone}
                  </a>
                )}
                {v.email && (
                  <a href={`mailto:${v.email}`} className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground hover:underline">
                    <Mail className="size-3" /> {v.email}
                  </a>
                )}
                {v.notes && <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(v)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => handleDelete(v.id)} disabled={pending} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {adding && <VendorForm onSave={handleAdd} />}
      </div>
    </SectionCard>
  )
}

// ── Trash Day section ─────────────────────────────────────────────────────────

function TrashSection({
  property, canEdit,
}: {
  property : PropertyItemFull
  canEdit  : boolean
}) {
  const base = property.info ?? EMPTY_INFO(property.id)
  const [editing, setEditing]  = useState(false)
  const [form, setForm]        = useState({
    trash_day  : base.trash_day   ?? "",
    trash_notes: base.trash_notes ?? "",
    recycle_day: base.recycle_day ?? "",
  })
  const [pending, startT] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    startT(async () => {
      const changedFields: Array<{ field: string; oldValue: string | null; newValue: string | null }> = []
      for (const k of ["trash_day","trash_notes","recycle_day"] as const) {
        const n = form[k] || null, o = base[k]
        if (n !== o) changedFields.push({ field: k, oldValue: o, newValue: n })
      }
      const res = await upsertPropertyInfo(property.id, {
        trash_day  : form.trash_day   || null,
        trash_notes: form.trash_notes || null,
        recycle_day: form.recycle_day || null,
      }, changedFields)
      if (res?.error) { setError(res.error); return }
      setEditing(false)
    })
  }

  const nextTrash   = nextDayOccurrence(base.trash_day)
  const nextRecycle = nextDayOccurrence(base.recycle_day)

  return (
    <SectionCard
      icon={Trash2}
      title="Trash & Recycling"
      action={canEdit ? (
        <button onClick={() => { setForm({ trash_day: base.trash_day ?? "", trash_notes: base.trash_notes ?? "", recycle_day: base.recycle_day ?? "" }); setEditing(true); setError(null) }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Pencil className="size-3" /> Edit
        </button>
      ) : undefined}
    >
      {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField
              label="Trash Day"
              value={form.trash_day}
              onChange={v => setForm(p => ({ ...p, trash_day: v }))}
              options={DAYS_OF_WEEK.map(d => ({ value: d, label: d }))}
            />
            <SelectField
              label="Recycle Day"
              value={form.recycle_day}
              onChange={v => setForm(p => ({ ...p, recycle_day: v }))}
              options={DAYS_OF_WEEK.map(d => ({ value: d, label: d }))}
            />
          </div>
          <TextArea
            label="Trash Notes"
            value={form.trash_notes}
            onChange={v => setForm(p => ({ ...p, trash_notes: v }))}
            placeholder="Bin location, special instructions…"
            rows={2}
          />
          <SaveRow pending={pending} onSave={handleSave} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Trash Day</p>
            <p className={cn("text-sm font-semibold", base.trash_day ? "text-foreground" : "text-muted-foreground/40 font-normal italic")}>
              {base.trash_day ?? "Not set"}
            </p>
            {nextTrash && (
              <p className="text-xs text-muted-foreground mt-0.5">Next: {nextTrash}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Recycle Day</p>
            <p className={cn("text-sm font-semibold", base.recycle_day ? "text-foreground" : "text-muted-foreground/40 font-normal italic")}>
              {base.recycle_day ?? "Not set"}
            </p>
            {nextRecycle && (
              <p className="text-xs text-muted-foreground mt-0.5">Next: {nextRecycle}</p>
            )}
          </div>
          {base.trash_notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-line">{base.trash_notes}</p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}

// ── Furnace Filter section ────────────────────────────────────────────────────

function FurnaceFilterSection({
  property, canEdit,
}: {
  property : PropertyItemFull
  canEdit  : boolean
}) {
  const filters = property.recurring.filter(r => r.filter_size !== null)
  const [markingId, setMarkingId]   = useState<string | null>(null)
  const [filterSize, setFilterSize] = useState("")
  const [customSize, setCustomSize] = useState("")
  const [adding, setAdding]         = useState(false)
  const [addSize, setAddSize]       = useState("")
  const [addCustom, setAddCustom]   = useState("")
  const [pending, startT]           = useTransition()
  const [error, setError]           = useState<string | null>(null)

  function handleMark(id: string) {
    const size = filterSize === "Custom" ? customSize : filterSize
    startT(async () => {
      const res = await markRecurringComplete(id, size || undefined)
      if (res?.error) { setError(res.error); return }
      setMarkingId(null)
      setFilterSize("")
      setCustomSize("")
    })
  }

  function handleAdd() {
    const size = addSize === "Custom" ? addCustom : addSize
    startT(async () => {
      const res = await addRecurringItem(property.id, {
        item_name    : "Furnace Filter",
        interval_days: 30,
        filter_size  : size || undefined,
      })
      if (res?.error) { setError(res.error); return }
      setAdding(false)
      setAddSize("")
      setAddCustom("")
    })
  }

  function handleDelete(id: string) {
    startT(async () => { await deleteRecurringItem(id, property.id) })
  }

  return (
    <SectionCard
      icon={Filter}
      title="Furnace Filter"
      action={canEdit ? (
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Plus className="size-3" /> Add
        </button>
      ) : undefined}
    >
      {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
        {filters.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground/60 italic">No furnace filter tracker added yet.</p>
        )}

        {filters.map(item => {
          const status = getStatus(item.next_due_date)
          return (
            <div key={item.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">Filter Size: {item.filter_size ?? "Unknown"}</p>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Last changed: {fmtDate(item.last_completed_date)}
                    {item.last_completed_by && ` · ${item.last_completed_by}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Next due: {fmtDate(item.next_due_date)}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setMarkingId(item.id); setFilterSize(item.filter_size ?? ""); setError(null) }}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
                    >
                      <CalendarCheck className="size-3" /> Mark Changed
                    </button>
                    <button onClick={() => handleDelete(item.id)} disabled={pending}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {markingId === item.id && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <SelectField
                    label="Filter Size"
                    value={filterSize}
                    onChange={v => setFilterSize(v)}
                    options={FILTER_SIZES.map(s => ({ value: s, label: s }))}
                  />
                  {filterSize === "Custom" && (
                    <Field label="Custom Size" value={customSize} onChange={setCustomSize} placeholder="e.g. 14x24x1" />
                  )}
                  <SaveRow pending={pending} onSave={() => handleMark(item.id)} onCancel={() => setMarkingId(null)} />
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <SelectField
              label="Filter Size"
              value={addSize}
              onChange={setAddSize}
              options={FILTER_SIZES.map(s => ({ value: s, label: s }))}
            />
            {addSize === "Custom" && (
              <Field label="Custom Size" value={addCustom} onChange={setAddCustom} placeholder="e.g. 14x24x1" />
            )}
            <SaveRow pending={pending} onSave={handleAdd} onCancel={() => { setAdding(false); setAddSize(""); setAddCustom("") }} />
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ── Recurring Maintenance section ─────────────────────────────────────────────

function RecurringMaintenanceSection({
  property, canEdit,
}: {
  property : PropertyItemFull
  canEdit  : boolean
}) {
  const items = property.recurring.filter(r => r.filter_size === null)
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState({ item_name: "", interval_days: "365", notes: "" })
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [pending, startT]     = useTransition()
  const [error, setError]     = useState<string | null>(null)

  function handleAdd() {
    if (!form.item_name) return
    startT(async () => {
      const res = await addRecurringItem(property.id, {
        item_name    : form.item_name,
        interval_days: parseInt(form.interval_days, 10) || 365,
        notes        : form.notes || undefined,
      })
      if (res?.error) { setError(res.error); return }
      setAdding(false)
      setForm({ item_name: "", interval_days: "365", notes: "" })
    })
  }

  function handleMark(id: string) {
    startT(async () => {
      const res = await markRecurringComplete(id)
      if (res?.error) { setError(res.error); return }
      setMarkingId(null)
    })
  }

  function handleDelete(id: string) {
    startT(async () => { await deleteRecurringItem(id, property.id) })
  }

  const INTERVAL_OPTIONS = [
    { value: "30",  label: "Monthly (30 days)"   },
    { value: "90",  label: "Quarterly (90 days)"  },
    { value: "180", label: "Bi-annual (180 days)" },
    { value: "365", label: "Annual (365 days)"    },
  ]

  return (
    <SectionCard
      icon={Wrench}
      title="Recurring Maintenance"
      action={canEdit ? (
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Plus className="size-3" /> Add
        </button>
      ) : undefined}
    >
      {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground/60 italic">No recurring maintenance items added yet.</p>
        )}

        {items.map(item => {
          const status = getStatus(item.next_due_date)
          return (
            <div key={item.id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{item.item_name}</p>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Every {item.interval_days} days · Last done: {fmtDate(item.last_completed_date)}
                    {item.last_completed_by && ` · ${item.last_completed_by}`}
                  </p>
                  {item.next_due_date && (
                    <p className="text-xs text-muted-foreground">Next due: {fmtDate(item.next_due_date)}</p>
                  )}
                  {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setMarkingId(item.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 transition-colors">
                      <CalendarCheck className="size-3" /> Done
                    </button>
                    <button onClick={() => handleDelete(item.id)} disabled={pending}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {markingId === item.id && (
                <div className="pt-2">
                  <SaveRow pending={pending} onSave={() => handleMark(item.id)} onCancel={() => setMarkingId(null)} />
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <Field label="Item Name" value={form.item_name} onChange={v => setForm(p => ({ ...p, item_name: v }))} placeholder="e.g. Smoke Detector Test" />
            <SelectField
              label="Interval"
              value={form.interval_days}
              onChange={v => setForm(p => ({ ...p, interval_days: v }))}
              options={INTERVAL_OPTIONS}
            />
            <TextArea label="Notes" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Additional details…" rows={2} />
            <SaveRow pending={pending} onSave={handleAdd} onCancel={() => { setAdding(false); setForm({ item_name: "", interval_days: "365", notes: "" }) }} />
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ── Cleaner Notes section ─────────────────────────────────────────────────────

function CleanerNotesSection({
  property, canEdit,
}: {
  property : PropertyItemFull
  canEdit  : boolean
}) {
  const base = property.info ?? EMPTY_INFO(property.id)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({ cleaner_notes: base.cleaner_notes ?? "" })
  const [pending, startT]     = useTransition()
  const [error, setError]     = useState<string | null>(null)

  function handleSave() {
    startT(async () => {
      const n = form.cleaner_notes || null
      const o = base.cleaner_notes
      const changedFields = n !== o ? [{ field: "cleaner_notes", oldValue: o, newValue: n }] : []
      const res = await upsertPropertyInfo(property.id, { cleaner_notes: n }, changedFields)
      if (res?.error) { setError(res.error); return }
      setEditing(false)
    })
  }

  return (
    <SectionCard
      icon={StickyNote}
      title="Cleaner Notes"
      action={canEdit ? (
        <button onClick={() => { setForm({ cleaner_notes: base.cleaner_notes ?? "" }); setEditing(true); setError(null) }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Pencil className="size-3" /> Edit
        </button>
      ) : undefined}
    >
      {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {editing ? (
        <div className="space-y-3">
          <TextArea
            label="Notes for Cleaners"
            value={form.cleaner_notes}
            onChange={v => setForm({ cleaner_notes: v })}
            placeholder="Cleaning supplies location, special instructions, quirks to watch for…"
            rows={5}
          />
          <SaveRow pending={pending} onSave={handleSave} onCancel={() => setEditing(false)} />
        </div>
      ) : (
        base.cleaner_notes
          ? <p className="text-sm text-foreground whitespace-pre-line">{base.cleaner_notes}</p>
          : <p className="text-sm text-muted-foreground/60 italic">No cleaner notes added yet.</p>
      )}
    </SectionCard>
  )
}

// ── Change Log section ────────────────────────────────────────────────────────

function ChangeLogSection({ entries }: { entries: ChangelogEntry[] }) {
  const shown = entries.slice(0, 20)

  function fmtField(field: string) {
    return field.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  }

  function fmtTs(ts: string) {
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour : "numeric", minute: "2-digit",
    })
  }

  return (
    <SectionCard icon={History} title="Change Log">
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground/60 italic">No changes recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {shown.map(e => (
            <div key={e.id} className="flex gap-3">
              <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
                <div className="size-1.5 rounded-full bg-muted-foreground/50" />
              </div>
              <div className="min-w-0 flex-1 pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{e.changed_by_name ?? "Unknown"}</span>
                  {" updated "}
                  <span className="font-medium">{fmtField(e.field_changed)}</span>
                  {e.new_value && (
                    <span className="text-muted-foreground"> → {e.new_value.length > 60 ? e.new_value.slice(0, 57) + "…" : e.new_value}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{fmtTs(e.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  property, role, canEdit,
}: {
  property : PropertyItemFull
  role     : string
  canEdit  : boolean
}) {
  const info = property.info ?? EMPTY_INFO(property.id)

  return (
    <div className="space-y-4">
      {/* Property header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">{property.name}</h2>
        {property.name !== property.externalName && (
          <p className="text-xs text-muted-foreground">{property.externalName}</p>
        )}
        {(property.city || property.state) && (
          <p className="text-xs text-muted-foreground">{[property.city, property.state].filter(Boolean).join(", ")}</p>
        )}
      </div>

      {/* Quick Reference bar */}
      <QuickRefBar info={info} />

      {/* Detail sections */}
      <InfoEditSection property={property} canEdit={canEdit} />
      <VendorContactsSection property={property} canEdit={canEdit} />
      <TrashSection property={property} canEdit={canEdit} />
      <FurnaceFilterSection property={property} canEdit={canEdit} />
      <RecurringMaintenanceSection property={property} canEdit={canEdit} />

      {/* Cleaner Notes — hidden from maintenance role */}
      {role !== "maintenance" && (
        <CleanerNotesSection property={property} canEdit={canEdit} />
      )}

      <ChangeLogSection entries={property.changelog} />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PropertyInfoClient({
  properties,
  role,
  canEdit,
}: {
  properties : PropertyItemFull[]
  role       : string
  canEdit    : boolean
}) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id ?? "")
  const selected = properties.find(p => p.id === selectedId) ?? properties[0] ?? null

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-5">
      {/* Mobile: dropdown selector */}
      <div className="md:hidden">
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
        >
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Desktop: sidebar list */}
      <div className="hidden md:block w-52 shrink-0 space-y-1">
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
          ? <DetailPanel property={selected} role={role} canEdit={canEdit} />
          : <p className="text-sm text-muted-foreground">Select a property</p>}
      </div>
    </div>
  )
}
