"use client"

import { useState, useTransition, useEffect } from "react"
import { Thermometer, Plug, Check, X, Loader2, Trash2, RefreshCw, Eye, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  saveSeamSettings,
  listSeamDevices,
  assignThermostat,
  unassignThermostat,
  saveThermostatPropertySettings,
  previewThermostatReconcile,
  getThermostatEvents,
} from "@/app/actions/thermostats"
import type { SeamDevice } from "@/lib/thermostat/provider"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThermostatPropertyRow = {
  id  : string
  name: string
}

export type ThermostatDeviceRow = {
  id            : string
  property_id   : string
  seam_device_id: string
  label         : string
  capabilities  : Record<string, unknown> | null
  last_seen     : string | null
}

export type ThermostatSettingsRow = {
  property_id            : string
  enabled                : boolean
  dry_run                : boolean
  occupied_heat          : number
  occupied_cool          : number
  vacant_heat            : number
  vacant_cool            : number
  freeze_floor           : number
  warmup_minutes         : number
  checkout_buffer_minutes: number
}

export type ThermostatEventRow = {
  id           : string
  property_id  : string | null
  thermostat_id: string | null
  occurred_at  : string
  action       : string
  request      : unknown
  response     : unknown
  source       : string
}

export type ThermostatTabProps = {
  workspaceMode         : string
  masterEnabled         : boolean
  initialProperties     : ThermostatPropertyRow[]
  initialDevices        : ThermostatDeviceRow[]
  initialSettings       : ThermostatSettingsRow[]
  initialEvents         : ThermostatEventRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function Toggle({
  value, onChange, label, offLabel,
}: { value: boolean; onChange: (v: boolean) => void; label: string; offLabel?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          value ? "bg-[#E88159]" : "bg-muted",
        )}
      >
        <span className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transform transition-transform",
          value ? "translate-x-4" : "translate-x-0",
        )} />
      </button>
      <span className="text-sm text-muted-foreground">{value ? label : (offLabel ?? label)}</span>
    </div>
  )
}

function SecretInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-white px-3 py-2 pr-9 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
        {show ? <X className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function ActionMsg({ result }: { result: { ok?: boolean; error?: string; message?: string } | null }) {
  if (!result) return null
  if (result.ok) return (
    <span className="flex items-center gap-1 text-xs text-emerald-400">
      <Check className="size-3" />{result.message ?? "Done"}
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs text-red-400">
      <X className="size-3" />{result.error}
    </span>
  )
}

function NumInput({ value, onChange, min, max, label }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="number" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-24 rounded-lg border border-input bg-white px-3 py-1.5 text-sm text-gray-900 outline-none focus-visible:border-ring"
      />
    </div>
  )
}

// ── Sandbox / Dry-run banner ──────────────────────────────────────────────────

function StatusBanners({ workspaceMode, masterEnabled }: { workspaceMode: string; masterEnabled: boolean }) {
  return (
    <div className="space-y-2">
      {workspaceMode !== "production" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
          <AlertTriangle className="size-4 shrink-0" />
          <span><strong>Sandbox mode</strong> — no real thermostats will be changed. Set workspace mode to <code>production</code> and add a production API key when ready to go live.</span>
        </div>
      )}
      {!masterEnabled && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-600">
          <AlertTriangle className="size-4 shrink-0" />
          <span><strong>Master switch is off</strong> — the reconcile job will not execute any actions until you enable it below.</span>
        </div>
      )}
    </div>
  )
}

// ── Global settings card ──────────────────────────────────────────────────────

function GlobalSettingsCard({
  initialApiKey,
  initialWorkspaceMode,
  initialMasterEnabled,
}: {
  initialApiKey       : string
  initialWorkspaceMode: string
  initialMasterEnabled: boolean
}) {
  const [apiKey,         setApiKey]        = useState(initialApiKey)
  const [workspaceMode,  setWorkspaceMode] = useState(initialWorkspaceMode)
  const [masterEnabled,  setMasterEnabled] = useState(initialMasterEnabled)
  const [saving,         startSave]        = useTransition()
  const [result,         setResult]        = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  return (
    <Card title="Seam Connection">
      <Field label="API Key">
        <SecretInput value={apiKey} onChange={setApiKey} placeholder="seam_sk_••••••••" />
      </Field>
      <Field label="Workspace Mode">
        <select
          value={workspaceMode}
          onChange={e => setWorkspaceMode(e.target.value)}
          className="w-40 rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:border-ring"
        >
          <option value="sandbox">Sandbox</option>
          <option value="production">Production</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Use <strong>Sandbox</strong> during development. No real device is changed in sandbox mode.
        </p>
      </Field>
      <Field label="Master switch">
        <Toggle
          value={masterEnabled}
          onChange={setMasterEnabled}
          label="Automation enabled — reconcile job will execute actions"
          offLabel="Automation disabled — reconcile job is a no-op"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={() => startSave(async () => {
            setResult(null)
            const r = await saveSeamSettings({
              seam_api_key                : apiKey,
              seam_workspace_mode         : workspaceMode,
              thermostat_automation_enabled: String(masterEnabled),
            })
            setResult(r.error ? r : { ok: true, message: "Saved" })
          })}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save
        </button>
        <ActionMsg result={result} />
      </div>
    </Card>
  )
}

// ── Device list / assignment card ─────────────────────────────────────────────

function DevicesCard({
  initialDevices,
  properties,
}: {
  initialDevices: ThermostatDeviceRow[]
  properties    : ThermostatPropertyRow[]
}) {
  const [devices,      setDevices]     = useState(initialDevices)
  const [seamDevices,  setSeamDevices] = useState<SeamDevice[]>([])
  const [loading,      setLoading]     = useState(false)
  const [loadErr,      setLoadErr]     = useState<string | null>(null)
  const [pending,      startPending]   = useTransition()
  const [actionResult, setActionResult] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  // Track assignment state: seam_device_id → { property_id, label }
  const [assign, setAssign] = useState<Record<string, { property_id: string; label: string }>>({})

  async function handleListDevices() {
    setLoading(true)
    setLoadErr(null)
    setSeamDevices([])
    const r = await listSeamDevices()
    if (r.ok) {
      setSeamDevices(r.devices)
      // Pre-fill assignment from already-assigned devices
      const pre: Record<string, { property_id: string; label: string }> = {}
      for (const d of devices) pre[d.seam_device_id] = { property_id: d.property_id, label: d.label }
      setAssign(pre)
    } else {
      setLoadErr(r.error)
    }
    setLoading(false)
  }

  async function handleAssign(seam_device_id: string, capabilities: Record<string, unknown>) {
    const a = assign[seam_device_id]
    if (!a?.property_id) return
    setActionResult(null)
    startPending(async () => {
      const r = await assignThermostat({
        property_id   : a.property_id,
        seam_device_id,
        label         : a.label || "Main floor",
        capabilities,
      })
      setActionResult(r.error ? r : { ok: true, message: "Assigned" })
    })
  }

  async function handleUnassign(id: string) {
    setActionResult(null)
    startPending(async () => {
      const r = await unassignThermostat(id)
      if (r.ok) setDevices(prev => prev.filter(d => d.id !== id))
      setActionResult(r.error ? r : { ok: true, message: "Removed" })
    })
  }

  return (
    <Card title="Devices">
      {/* Assigned devices */}
      {devices.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned</p>
          {devices.map(d => {
            const prop = properties.find(p => p.id === d.property_id)
            return (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{prop?.name ?? d.property_id} · <code className="text-[10px]">{d.seam_device_id}</code></p>
                </div>
                <button onClick={() => handleUnassign(d.id)} disabled={pending}
                  className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* List from Seam */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleListDevices}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          List devices from Seam
        </button>
        {loadErr && <span className="text-xs text-red-400">{loadErr}</span>}
      </div>

      {seamDevices.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Found {seamDevices.length} device(s) in workspace</p>
          {seamDevices.map(sd => (
            <div key={sd.seam_device_id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Thermometer className="size-4 text-[#6FA1AF]" />
                <span className="text-sm font-medium text-foreground">{sd.display_name}</span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded-full", sd.online ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground")}>
                  {sd.online ? "online" : "offline"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">{sd.seam_device_id}</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Assign to property</label>
                  <select
                    value={assign[sd.seam_device_id]?.property_id ?? ""}
                    onChange={e => setAssign(prev => ({ ...prev, [sd.seam_device_id]: { ...prev[sd.seam_device_id], property_id: e.target.value, label: prev[sd.seam_device_id]?.label ?? "Main floor" } }))}
                    className="rounded-lg border border-input bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus-visible:border-ring"
                  >
                    <option value="">— select —</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Label</label>
                  <input
                    type="text"
                    placeholder="Main floor"
                    value={assign[sd.seam_device_id]?.label ?? ""}
                    onChange={e => setAssign(prev => ({ ...prev, [sd.seam_device_id]: { ...prev[sd.seam_device_id], label: e.target.value } }))}
                    className="w-32 rounded-lg border border-input bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus-visible:border-ring"
                  />
                </div>
                <button
                  onClick={() => handleAssign(sd.seam_device_id, sd.capabilities)}
                  disabled={pending || !assign[sd.seam_device_id]?.property_id}
                  className="flex items-center gap-1.5 rounded-lg bg-[#6FA1AF] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                  Assign
                </button>
              </div>
            </div>
          ))}
          <ActionMsg result={actionResult} />
        </div>
      )}
    </Card>
  )
}

// ── Per-property settings card ────────────────────────────────────────────────

function PropertySettingsCard({
  properties,
  initialSettings,
}: {
  properties     : ThermostatPropertyRow[]
  initialSettings: ThermostatSettingsRow[]
}) {
  const defaults: Omit<ThermostatSettingsRow, "property_id"> = {
    enabled: false, dry_run: true,
    occupied_heat: 68, occupied_cool: 74,
    vacant_heat: 58,   vacant_cool: 82,
    freeze_floor: 55,  warmup_minutes: 180,
    checkout_buffer_minutes: 0,
  }

  const initMap = new Map(initialSettings.map(s => [s.property_id, s]))

  const [rows, setRows] = useState<Record<string, ThermostatSettingsRow>>(
    Object.fromEntries(properties.map(p => [p.id, initMap.get(p.id) ?? { ...defaults, property_id: p.id }]))
  )
  const [saving,  startSave] = useTransition()
  const [results, setResults] = useState<Record<string, { ok?: boolean; error?: string; message?: string }>>({})

  function update(propertyId: string, field: keyof ThermostatSettingsRow, value: unknown) {
    setRows(prev => ({ ...prev, [propertyId]: { ...prev[propertyId], [field]: value } }))
  }

  return (
    <Card title="Per-property Settings">
      <div className="space-y-6">
        {properties.map(prop => {
          const row = rows[prop.id]
          if (!row) return null
          return (
            <div key={prop.id} className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{prop.name}</p>
                <div className="flex items-center gap-4">
                  <Toggle
                    value={row.dry_run}
                    onChange={v => update(prop.id, "dry_run", v)}
                    label="Dry-run on"
                    offLabel="Dry-run off"
                  />
                  <Toggle
                    value={row.enabled}
                    onChange={v => update(prop.id, "enabled", v)}
                    label="Enabled"
                    offLabel="Disabled"
                  />
                </div>
              </div>

              {row.dry_run && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 rounded-md px-2.5 py-1.5">
                  <AlertTriangle className="size-3.5" />
                  Dry-run: actions will be logged but no Seam calls made
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <NumInput label="Occupied heat (°F)" value={row.occupied_heat} min={row.freeze_floor} max={90} onChange={v => update(prop.id, "occupied_heat", v)} />
                <NumInput label="Occupied cool (°F)" value={row.occupied_cool} min={60} max={90} onChange={v => update(prop.id, "occupied_cool", v)} />
                <NumInput label="Vacant heat (°F)"   value={row.vacant_heat}   min={row.freeze_floor} max={80} onChange={v => update(prop.id, "vacant_heat", v)} />
                <NumInput label="Vacant cool (°F)"   value={row.vacant_cool}   min={60} max={99} onChange={v => update(prop.id, "vacant_cool", v)} />
                <NumInput label="Freeze floor (°F)"  value={row.freeze_floor}  min={55} max={65} onChange={v => update(prop.id, "freeze_floor", v)} />
                <NumInput label="Warm-up (min)"       value={row.warmup_minutes} min={0} max={720} onChange={v => update(prop.id, "warmup_minutes", v)} />
                <NumInput label="Checkout buffer (min)" value={row.checkout_buffer_minutes} min={0} max={480} onChange={v => update(prop.id, "checkout_buffer_minutes", v)} />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={() => startSave(async () => {
                    setResults(prev => { const n = { ...prev }; delete n[prop.id]; return n })
                    const r = await saveThermostatPropertySettings(row)
                    setResults(prev => ({ ...prev, [prop.id]: r.error ? r : { ok: true, message: "Saved" } }))
                  })}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Save
                </button>
                <ActionMsg result={results[prop.id] ?? null} />
              </div>
            </div>
          )
        })}
        {properties.length === 0 && (
          <p className="text-sm text-muted-foreground">No visible active properties found.</p>
        )}
      </div>
    </Card>
  )
}

// ── Preview table ─────────────────────────────────────────────────────────────

function PreviewCard() {
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<Awaited<ReturnType<typeof previewThermostatReconcile>> | null>(null)

  async function handlePreview() {
    setLoading(true)
    const r = await previewThermostatReconcile()
    setResult(r)
    setLoading(false)
  }

  return (
    <Card title="Actions the Next Run Would Take">
      <p className="text-xs text-muted-foreground">
        Runs the reconcile logic in forced dry-run mode. No Seam calls are made.
      </p>
      <button
        onClick={handlePreview}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
        Preview next run
      </button>

      {result && !result.ok && (
        <p className="text-xs text-red-400">{result.error}</p>
      )}

      {result?.ok && result.results.length === 0 && (
        <p className="text-sm text-muted-foreground">No enabled properties with thermostats — nothing to do.</p>
      )}

      {result?.ok && result.results.length > 0 && (
        <div className="space-y-4">
          {result.results.map(r => (
            <div key={r.property_id}>
              <p className="text-xs font-semibold text-foreground mb-2">{r.property_name}</p>
              {r.actions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No changes needed.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-1 pr-4">Type</th>
                      <th className="pb-1 pr-4">Starts at</th>
                      <th className="pb-1 pr-4">Ends at</th>
                      <th className="pb-1">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.actions.map((a, i) => (
                      <tr key={i} className="text-foreground">
                        <td className={cn("py-1 pr-4 font-medium", a.type === "delete" ? "text-red-500" : a.type === "create" ? "text-emerald-600" : "text-amber-600")}>
                          {a.type}
                        </td>
                        <td className="py-1 pr-4 text-muted-foreground">{fmtDateTime(a.starts_at)}</td>
                        <td className="py-1 pr-4 text-muted-foreground">{fmtDateTime(a.ends_at)}</td>
                        <td className="py-1 text-muted-foreground">{a.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {r.errors.length > 0 && r.errors.map((e, i) => (
                <p key={i} className="mt-1 text-xs text-red-400">{e}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Events log ────────────────────────────────────────────────────────────────

function EventsCard({ initialEvents }: { initialEvents: ThermostatEventRow[] }) {
  const [events,  setEvents]  = useState(initialEvents)
  const [loading, setLoading] = useState(false)

  async function handleRefresh() {
    setLoading(true)
    const r = await getThermostatEvents()
    if (r.ok) setEvents(r.events)
    setLoading(false)
  }

  return (
    <Card title="Recent Events (last 50)">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{events.length} event(s)</span>
        <button onClick={handleRefresh} disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          Refresh
        </button>
      </div>

      {events.length === 0 && (
        <p className="text-sm text-muted-foreground">No events yet. Run a reconcile preview above to generate the first entries.</p>
      )}

      {events.length > 0 && (
        <div className="overflow-auto max-h-96">
          <table className="w-full text-xs border-collapse min-w-[600px]">
            <thead>
              <tr className="text-left text-muted-foreground sticky top-0 bg-card">
                <th className="pb-1 pr-4">Time</th>
                <th className="pb-1 pr-4">Source</th>
                <th className="pb-1 pr-4">Action</th>
                <th className="pb-1">Response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map(e => (
                <tr key={e.id} className="text-foreground">
                  <td className="py-1 pr-4 text-muted-foreground whitespace-nowrap">{fmtDateTime(e.occurred_at)}</td>
                  <td className="py-1 pr-4">{e.source}</td>
                  <td className="py-1 pr-4 font-medium">{e.action}</td>
                  <td className="py-1 text-muted-foreground font-mono text-[10px] max-w-[200px] truncate">
                    {JSON.stringify(e.response)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function ThermostatsTab({
  workspaceMode,
  masterEnabled,
  initialApiKey,
  initialProperties,
  initialDevices,
  initialSettings,
  initialEvents,
}: ThermostatTabProps & { initialApiKey: string }) {
  return (
    <div className="space-y-4">
      <StatusBanners workspaceMode={workspaceMode} masterEnabled={masterEnabled} />

      <GlobalSettingsCard
        initialApiKey={initialApiKey}
        initialWorkspaceMode={workspaceMode}
        initialMasterEnabled={masterEnabled}
      />

      <DevicesCard
        initialDevices={initialDevices}
        properties={initialProperties}
      />

      <PropertySettingsCard
        properties={initialProperties}
        initialSettings={initialSettings}
      />

      <PreviewCard />

      <EventsCard initialEvents={initialEvents} />
    </div>
  )
}
