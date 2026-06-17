"use client"

import { useState, useTransition } from "react"
import {
  Eye, EyeOff, Check, X, Loader2, RefreshCw, Plus, Trash2,
  Plug, Users, Database, Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  saveSettings,
  syncOwnerRez,
  syncReviews,
  testOwnerRezConnection,
  testPriceLabsConnection,
  inviteCleaner,
  deleteUser,
  setHiddenProperties,
} from "@/app/actions/settings"

// ── Types ─────────────────────────────────────────────────────────────────────

export type SettingsData = {
  ownerrez_email     : string
  ownerrez_api_token : string
  pricelabs_api_key  : string
}

export type UserRow = {
  id         : string
  email      : string
  full_name  : string | null
  role       : string
  created_at : string
}

export type SyncLogRow = {
  id             : string
  sync_type      : string
  status         : string
  records_synced : number | null
  records_failed : number | null
  error_message  : string | null
  started_at     : string | null
  completed_at   : string | null
  created_at     : string
}

export type PropertyVisibilityRow = {
  id        : string
  name      : string
  is_active : boolean
}

type Tab = "integrations" | "users" | "sync" | "visibility"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
}

function durationSec(started: string | null, completed: string | null) {
  if (!started || !completed) return null
  const ms = new Date(completed).getTime() - new Date(started).getTime()
  return (ms / 1000).toFixed(1) + "s"
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SecretInput({
  value, onChange, placeholder,
}: {
  value       : string
  onChange    : (v: string) => void
  placeholder?: string
}) {
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
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success : "bg-emerald-500/15 text-emerald-400",
    error   : "bg-red-500/15    text-red-400",
    running : "bg-blue-500/15   text-blue-400",
    pending : "bg-muted          text-muted-foreground",
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
      styles[status] ?? styles.pending,
    )}>
      {status === "success" && <Check className="size-3" />}
      {status === "error"   && <X     className="size-3" />}
      {status === "running" && <Loader2 className="size-3 animate-spin" />}
      {status}
    </span>
  )
}

function ActionMsg({ result }: { result: { ok?: boolean; error?: string; message?: string } | null }) {
  if (!result) return null
  if (result.ok) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <Check className="size-3" />
        {result.message ?? "Done"}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-400">
      <X className="size-3" />
      {result.error}
    </span>
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children}
    </div>
  )
}

// ── Integrations tab ──────────────────────────────────────────────────────────

function IntegrationsTab({ initial }: { initial: SettingsData }) {
  const [orEmail,    setOrEmail]    = useState(initial.ownerrez_email)
  const [orToken,    setOrToken]    = useState(initial.ownerrez_api_token)
  const [plKey,      setPlKey]      = useState(initial.pricelabs_api_key)

  const [orSaving,   startOrSave]   = useTransition()
  const [orTesting,  startOrTest]   = useTransition()
  const [orResult,   setOrResult]   = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  const [plSaving,   startPlSave]   = useTransition()
  const [plTesting,  startPlTest]   = useTransition()
  const [plResult,   setPlResult]   = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  const [syncing,    setSyncing]    = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  async function handleSyncNow() {
    setSyncing(true)
    setSyncResult(null)
    const data = await syncOwnerRez()
    if (!data.ok) setSyncResult({ error: data.error })
    else setSyncResult({
      ok: true,
      message: `Synced ${data.propertiesSynced} properties · ${data.bookingsSynced} bookings`,
    })
    setSyncing(false)
  }

  return (
    <div className="space-y-4">
      {/* OwnerRez */}
      <Card title="OwnerRez">
        <Field label="Email">
          <input
            type="email"
            value={orEmail}
            onChange={e => setOrEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </Field>
        <Field label="API Token">
          <SecretInput
            value={orToken}
            onChange={setOrToken}
            placeholder="pt_••••••••••••••••••"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => startOrTest(async () => {
              setOrResult(null)
              const r = await testOwnerRezConnection(orEmail, orToken)
              setOrResult(r)
            })}
            disabled={orTesting || orSaving}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {orTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
            Test Connection
          </button>
          <button
            onClick={() => startOrSave(async () => {
              setOrResult(null)
              const r = await saveSettings({ ownerrez_email: orEmail, ownerrez_api_token: orToken })
              setOrResult(r.error ? r : { ok: true, message: "Saved" })
            })}
            disabled={orSaving || orTesting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {orSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </button>
          <ActionMsg result={orResult} />
        </div>

        <div className="border-t border-border pt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {syncing
              ? <Loader2 className="size-3.5 animate-spin" />
              : <RefreshCw className="size-3.5" />}
            Sync Now
          </button>
          <ActionMsg result={syncResult} />
        </div>
      </Card>

      {/* PriceLabs */}
      <Card title="PriceLabs">
        <Field label="API Key">
          <SecretInput
            value={plKey}
            onChange={setPlKey}
            placeholder="pl_••••••••••••••••••"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => startPlTest(async () => {
              setPlResult(null)
              const r = await testPriceLabsConnection(plKey)
              setPlResult(r)
            })}
            disabled={plTesting || plSaving}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {plTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
            Test Connection
          </button>
          <button
            onClick={() => startPlSave(async () => {
              setPlResult(null)
              const r = await saveSettings({ pricelabs_api_key: plKey })
              setPlResult(r.error ? r : { ok: true, message: "Saved" })
            })}
            disabled={plSaving || plTesting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {plSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </button>
          <ActionMsg result={plResult} />
        </div>
      </Card>
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users,       setUsers]       = useState(initialUsers)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [form,        setForm]        = useState({ name: "", email: "", password: "" })
  const [pending,     startTransition] = useTransition()
  const [error,       setError]       = useState<string | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)

  function setF(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await inviteCleaner(form)
      if (res?.error) { setError(res.error); return }
      setUsers(prev => [...prev, {
        id        : res.userId ?? crypto.randomUUID(),
        email     : form.email.trim(),
        full_name : form.name.trim() || null,
        role      : "cleaner",
        created_at: new Date().toISOString(),
      }])
      setModalOpen(false)
      setForm({ name: "", email: "", password: "" })
    })
  }

  async function handleDelete(userId: string) {
    if (!confirm("Remove this user? This cannot be undone.")) return
    setDeleting(userId)
    const res = await deleteUser(userId)
    if (res?.error) alert(res.error)
    else setUsers(prev => prev.filter(u => u.id !== userId))
    setDeleting(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
        >
          <Plus className="size-3.5" />
          Invite Cleaner
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">
                  {u.full_name ?? <span className="text-muted-foreground italic">No name</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                    u.role === "admin"
                      ? "bg-violet-500/15 text-violet-400"
                      : "bg-blue-500/15   text-blue-400",
                  )}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {u.role !== "admin" && (
                    <button
                      onClick={() => handleDelete(u.id)}
                      disabled={deleting === u.id}
                      className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      title="Remove user"
                    >
                      {deleting === u.id
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <Trash2 className="size-3.5" />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">Invite Cleaner</h2>
              <button onClick={() => setModalOpen(false)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Full Name</label>
                <input
                  value={form.name}
                  onChange={e => setF("name", e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setF("email", e.target.value)}
                  placeholder="cleaner@example.com"
                  required
                  className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Temporary Password *</label>
                <SecretInput
                  value={form.password}
                  onChange={v => setF("password", v)}
                  placeholder="Min 6 characters"
                />
              </div>
              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !form.email.trim() || !form.password.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {pending ? "Creating…" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Data Sync tab ─────────────────────────────────────────────────────────────

function SyncTab({ initialLog }: { initialLog: SyncLogRow[] }) {
  const [log,            setLog]            = useState(initialLog)
  const [syncing,        setSyncing]        = useState(false)
  const [result,         setResult]         = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)
  const [syncingReviews, setSyncingReviews] = useState(false)
  const [reviewsResult,  setReviewsResult]  = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    const data = await syncOwnerRez()
    if (!data.ok) {
      setResult({ error: data.error })
    } else {
      setResult({
        ok: true,
        message: `Synced ${data.propertiesSynced} properties · ${data.bookingsSynced} bookings`,
      })
      const newEntry: SyncLogRow = {
        id             : crypto.randomUUID(),
        sync_type      : "full",
        status         : "success",
        records_synced : data.propertiesSynced + data.bookingsSynced,
        records_failed : 0,
        error_message  : null,
        started_at     : new Date().toISOString(),
        completed_at   : new Date().toISOString(),
        created_at     : new Date().toISOString(),
      }
      setLog(prev => [newEntry, ...prev].slice(0, 10))
    }
    setSyncing(false)
  }

  async function handleSyncReviews() {
    setSyncingReviews(true)
    setReviewsResult(null)
    const data = await syncReviews()
    if (!data.ok) {
      setReviewsResult({ error: data.error })
    } else {
      setReviewsResult({
        ok: true,
        message: `Synced ${data.reviewsSynced} reviews across ${data.propertiesProcessed} properties`,
      })
      const newEntry: SyncLogRow = {
        id             : crypto.randomUUID(),
        sync_type      : "reviews",
        status         : "success",
        records_synced : data.reviewsSynced,
        records_failed : 0,
        error_message  : null,
        started_at     : new Date().toISOString(),
        completed_at   : new Date().toISOString(),
        created_at     : new Date().toISOString(),
      }
      setLog(prev => [newEntry, ...prev].slice(0, 10))
    }
    setSyncingReviews(false)
  }

  return (
    <div className="space-y-4">
      <Card title="OwnerRez">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {syncing
              ? <Loader2 className="size-4 animate-spin" />
              : <RefreshCw className="size-4" />}
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          <ActionMsg result={result} />
        </div>
        <div className="border-t border-border pt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncReviews}
            disabled={syncingReviews}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {syncingReviews
              ? <Loader2 className="size-4 animate-spin" />
              : <RefreshCw className="size-4" />}
            {syncingReviews ? "Syncing Reviews…" : "Sync Reviews"}
          </button>
          <ActionMsg result={reviewsResult} />
        </div>
      </Card>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Recent Sync History</p>
        </div>
        {log.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No syncs yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Records</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {log.map(entry => (
                <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground capitalize">{entry.sync_type}</td>
                  <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.records_synced ?? 0}
                    {(entry.records_failed ?? 0) > 0 && (
                      <span className="ml-1 text-red-400">({entry.records_failed} failed)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {durationSec(entry.started_at, entry.completed_at) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(entry.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {log.some(e => e.status === "error" && e.error_message) && (
          <div className="border-t border-border px-4 py-3 space-y-1">
            {log.filter(e => e.status === "error" && e.error_message).slice(0, 1).map(e => (
              <p key={e.id} className="text-xs text-red-400 font-mono break-all">{e.error_message}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Property Visibility tab ───────────────────────────────────────────────────

function PropertyVisibilityTab({
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

// ── Main export ───────────────────────────────────────────────────────────────

export function SettingsClient({
  settings,
  users,
  syncLog,
  properties,
  hiddenIds,
}: {
  settings   : SettingsData
  users      : UserRow[]
  syncLog    : SyncLogRow[]
  properties : PropertyVisibilityRow[]
  hiddenIds  : string[]
}) {
  const [tab, setTab] = useState<Tab>("integrations")

  const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
    { value: "integrations", label: "Integrations", icon: Plug      },
    { value: "users",        label: "Users",         icon: Users     },
    { value: "sync",         label: "Data Sync",     icon: Database  },
    { value: "visibility",   label: "Visibility",    icon: Building2 },
  ]

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                tab === t.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === "integrations" && <IntegrationsTab initial={settings} />}
      {tab === "users"        && <UsersTab initialUsers={users} />}
      {tab === "sync"         && <SyncTab initialLog={syncLog} />}
      {tab === "visibility"   && (
        <PropertyVisibilityTab
          initialProperties={properties}
          initialHiddenIds={hiddenIds}
        />
      )}
    </div>
  )
}
