"use client"

import { useState, useTransition, useOptimistic } from "react"
import {
  Bell, Plus, Trash2, Loader2, Check, X, Mail,
  TrendingDown, CalendarX, DollarSign,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createAlert,
  updateAlertEnabled,
  deleteAlert,
  type AlertType,
} from "@/app/actions/alerts"

// ── Alert type config ─────────────────────────────────────────────────────────

type AlertMeta = {
  label       : string
  description : string
  hasThreshold: boolean
  thresholdLabel?: string
  thresholdUnit? : string
  thresholdHint? : string
  icon        : React.ElementType
  color       : string
}

const ALERT_TYPES: Record<AlertType, AlertMeta> = {
  occupancy_drop: {
    label         : "Occupancy Drop",
    description   : "Alert when portfolio occupancy falls below a threshold",
    hasThreshold  : true,
    thresholdLabel: "Occupancy threshold",
    thresholdUnit : "%",
    thresholdHint : "e.g. 40 = alert when occupancy < 40%",
    icon          : TrendingDown,
    color         : "bg-amber-500/15 text-amber-400 border-amber-500/25",
  },
  revenue_drop: {
    label         : "Revenue Drop",
    description   : "Alert when monthly revenue falls below a threshold",
    hasThreshold  : true,
    thresholdLabel: "Revenue threshold",
    thresholdUnit : "$",
    thresholdHint : "e.g. 5000 = alert when monthly revenue < $5,000",
    icon          : DollarSign,
    color         : "bg-red-500/15 text-red-400 border-red-500/25",
  },
  no_booking_7_days: {
    label         : "No Bookings (7 days)",
    description   : "Alert when a property has had no new bookings in 7 days",
    hasThreshold  : false,
    icon          : CalendarX,
    color         : "bg-blue-500/15 text-blue-400 border-blue-500/25",
  },
  no_booking_14_days: {
    label         : "No Bookings (14 days)",
    description   : "Alert when a property has had no new bookings in 14 days",
    hasThreshold  : false,
    icon          : CalendarX,
    color         : "bg-violet-500/15 text-violet-400 border-violet-500/25",
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertRow = {
  id         : string
  type       : AlertType
  threshold  : number | null
  email      : string
  enabled    : boolean
  created_at : string
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({
  checked, onChange, disabled,
}: {
  checked  : boolean
  onChange : (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm",
          "transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  )
}

// ── Add alert form ────────────────────────────────────────────────────────────

function AddAlertForm({ onAdd }: { onAdd: (row: AlertRow) => void }) {
  const [open,    setOpen]    = useState(false)
  const [pending, start]      = useTransition()
  const [error,   setError]   = useState<string | null>(null)

  const [form, setForm] = useState<{
    type      : AlertType
    threshold : string
    email     : string
  }>({
    type     : "occupancy_drop",
    threshold: "",
    email    : "",
  })

  function setF<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const meta = ALERT_TYPES[form.type]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const threshold = meta.hasThreshold
      ? form.threshold.trim() !== "" ? Number(form.threshold) : null
      : null

    if (meta.hasThreshold && (threshold === null || isNaN(threshold))) {
      setError("Please enter a valid threshold value")
      return
    }

    start(async () => {
      const res = await createAlert({ type: form.type, threshold, email: form.email })
      if (res.error) { setError(res.error); return }

      onAdd({
        id        : crypto.randomUUID(),
        type      : form.type,
        threshold,
        email     : form.email.trim().toLowerCase(),
        enabled   : true,
        created_at: new Date().toISOString(),
      })
      setForm({ type: "occupancy_drop", threshold: "", email: "" })
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
      >
        <Plus className="size-3.5" />
        Add Alert
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New Alert Rule</p>
        <button
          onClick={() => { setOpen(false); setError(null) }}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Alert type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Alert Type
          </label>
          <select
            value={form.type}
            onChange={e => setF("type", e.target.value as AlertType)}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          >
            {(Object.keys(ALERT_TYPES) as AlertType[]).map(t => (
              <option key={t} value={t}>{ALERT_TYPES[t].label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>

        {/* Threshold — only shown for types that need it */}
        {meta.hasThreshold && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {meta.thresholdLabel}
            </label>
            <div className="relative">
              {meta.thresholdUnit === "$" && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              )}
              <input
                type="number"
                min={0}
                value={form.threshold}
                onChange={e => setF("threshold", e.target.value)}
                placeholder="0"
                required
                className={cn(
                  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground",
                  "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
                  meta.thresholdUnit === "$" && "pl-7",
                  meta.thresholdUnit === "%" && "pr-7",
                )}
              />
              {meta.thresholdUnit === "%" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              )}
            </div>
            {meta.thresholdHint && (
              <p className="text-xs text-muted-foreground">{meta.thresholdHint}</p>
            )}
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Notify Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={e => setF("email", e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </div>

        {error && (
          <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <X className="size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null) }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {pending ? "Saving…" : "Save Alert"}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertItem({
  alert,
  onToggle,
  onDelete,
}: {
  alert    : AlertRow
  onToggle : (id: string, enabled: boolean) => void
  onDelete : (id: string) => void
}) {
  const meta    = ALERT_TYPES[alert.type] ?? ALERT_TYPES.occupancy_drop
  const Icon    = meta.icon
  const [toggling, startToggle] = useTransition()
  const [deleting, startDelete] = useTransition()

  function handleToggle(v: boolean) {
    startToggle(async () => {
      onToggle(alert.id, v)
      await updateAlertEnabled(alert.id, v)
    })
  }

  function handleDelete() {
    if (!confirm("Delete this alert rule?")) return
    startDelete(async () => {
      onDelete(alert.id)
      await deleteAlert(alert.id)
    })
  }

  function fmtThreshold() {
    if (alert.threshold === null) return null
    if (meta.thresholdUnit === "%") return `< ${alert.threshold}%`
    if (meta.thresholdUnit === "$") return `< $${alert.threshold.toLocaleString()}`
    return String(alert.threshold)
  }

  return (
    <div className={cn(
      "flex items-center gap-4 rounded-xl border p-4 transition-opacity",
      !alert.enabled && "opacity-60",
      meta.color,
    )}>
      {/* Icon */}
      <div className="shrink-0">
        <Icon className="size-4" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{meta.label}</p>
          {fmtThreshold() && (
            <span className="rounded-full bg-background/40 px-2 py-0.5 text-xs font-medium text-foreground/80 tabular-nums">
              {fmtThreshold()}
            </span>
          )}
          {!alert.enabled && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Mail className="size-3 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground truncate">{alert.email}</p>
        </div>
      </div>

      {/* Toggle */}
      <Toggle
        checked={alert.enabled}
        onChange={handleToggle}
        disabled={toggling || deleting}
      />

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background/40 transition-colors disabled:opacity-50"
        title="Delete alert"
      >
        {deleting
          ? <Loader2 className="size-3.5 animate-spin" />
          : <Trash2 className="size-3.5" />}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AlertsClient({ initialAlerts }: { initialAlerts: AlertRow[] }) {
  const [alerts, setAlerts] = useState(initialAlerts)

  function handleAdd(row: AlertRow) {
    setAlerts(prev => [row, ...prev])
  }

  function handleToggle(id: string, enabled: boolean) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, enabled } : a))
  }

  function handleDelete(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const activeCount  = alerts.filter(a => a.enabled).length
  const pausedCount  = alerts.filter(a => !a.enabled).length

  return (
    <div className="space-y-5">

      {/* Summary + add button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {alerts.length > 0 ? (
            <>
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                <Check className="size-3" />
                {activeCount} active
              </div>
              {pausedCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  {pausedCount} paused
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No alert rules configured yet.</p>
          )}
        </div>
        <AddAlertForm onAdd={handleAdd} />
      </div>

      {/* Alert list */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Bell className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No alerts configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add alert rules to get notified when key metrics fall outside expected ranges.
            </p>
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2.5">
        <Bell className="size-3.5 shrink-0 mt-0.5" />
        <p>
          Alert rules are stored and ready. Email delivery is not yet wired — notifications will be
          sent once the alert engine is connected to your email provider.
        </p>
      </div>
    </div>
  )
}
