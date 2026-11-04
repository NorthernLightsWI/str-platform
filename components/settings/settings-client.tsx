"use client"

import { useState, useTransition } from "react"
import {
  Eye, EyeOff, Check, X, Loader2, RefreshCw, Plus, Trash2,
  Plug, Users, Database, Building2, Mail, Send, Wand2, BarChart2, Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  saveSettings,
  syncOwnerRez,
  syncReviews,
  syncAmenities,
  sendTestReport,
  testOwnerRezConnection,
  testPriceLabsConnection,
  inviteCleaner,
  deleteUser,
  setHiddenProperties,
  setPropertyParent,
  savePriceLabsPropertySettings,
  saveBenchmarkPropertySettings,
  fetchPriceLabsListings,
  testPriceLabsTagWrite,
  getPropertyBenchmarkTiers,
  verifyPriceLabsPrices,
  getPriceLabsPushStatus,
  type TierResult,
  type VerifyPricesDay,
} from "@/app/actions/settings"

// ── Types ─────────────────────────────────────────────────────────────────────

export type SettingsData = {
  ownerrez_email          : string
  ownerrez_api_token      : string
  pricelabs_api_key       : string
  pricelabs_writes_enabled: string
  pricelabs_max_change_pct: string
  report_email            : string
  market_adr              : string
  market_occupancy        : string
}

export type BenchmarkPropertyRow = {
  id                          : string
  name                        : string
  bedrooms                    : number | null
  listing_type                : string | null
  benchmark_adr_override      : number | null
  benchmark_occupancy_override: number | null
  pricelabs_listing_id        : string | null
  benchmarkLabel              : string
  benchmarkSource             : "override" | "pl_neighborhood" | "comparable" | "comparable_scaled" | "market"
}

export type PriceLabsPropertyRow = {
  id                   : string
  name                 : string
  pricelabs_listing_id : string | null
  pricelabs_price_floor: number | null
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

export type PropertyGroupRow = {
  id                 : string
  name               : string
  is_active          : boolean
  parent_property_id : string | null
}

type Tab = "integrations" | "users" | "sync" | "visibility" | "groups" | "reports" | "pricelabs" | "benchmarks"

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

      {/* PriceLabs Automation */}
      <PriceLabsAutomationCard initial={initial} />
    </div>
  )
}

// ── PriceLabs automation card ─────────────────────────────────────────────────

function PriceLabsAutomationCard({ initial }: { initial: SettingsData }) {
  const [writesEnabled, setWritesEnabled] = useState(initial.pricelabs_writes_enabled === "true")
  const [maxPct,        setMaxPct]        = useState(initial.pricelabs_max_change_pct || "10")
  const [saving,        startSave]        = useTransition()
  const [result,        setResult]        = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  return (
    <Card title="PriceLabs Automation">
      <Field label="Enable live API writes">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setWritesEnabled(v => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              writesEnabled ? "bg-[#E88159]" : "bg-muted",
            )}
          >
            <span className={cn(
              "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transform transition-transform",
              writesEnabled ? "translate-x-4" : "translate-x-0",
            )} />
          </button>
          <span className="text-sm text-muted-foreground">
            {writesEnabled
              ? "On — proposals will send live requests to PriceLabs"
              : "Off — proposals apply in dry-run mode (no API call)"}
          </span>
        </div>
      </Field>
      <Field label="Max price change %">
        <input
          type="number"
          min={1}
          max={100}
          value={maxPct}
          onChange={e => setMaxPct(e.target.value)}
          className="w-32 rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:border-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Proposals with a larger price change are blocked when applying.
        </p>
      </Field>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          onClick={() => startSave(async () => {
            setResult(null)
            const r = await saveSettings({
              pricelabs_writes_enabled: String(writesEnabled),
              pricelabs_max_change_pct: maxPct,
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

// ── PriceLabs mapping tab ─────────────────────────────────────────────────────

type PlListing = { id: string; name: string; base: number | null; min: number | null; pms: string }
type Suggestion = { propertyId: string; propertyName: string; plId: string; plName: string; score: number }

function jaccardSim(a: string, b: string): number {
  const tok = (s: string) => new Set(
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean)
  )
  const A = tok(a); const B = tok(b)
  const inter = [...A].filter(x => B.has(x)).length
  const union  = new Set([...A, ...B]).size
  return union === 0 ? 0 : inter / union
}

function PriceLabsMappingTab({ initialProperties }: { initialProperties: PriceLabsPropertyRow[] }) {
  const [rows,       setRows]       = useState(initialProperties)
  const [saving,     startSave]     = useTransition()
  const [result,     setResult]     = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  // Suggest matches state
  const [plListings,  setPlListings]  = useState<PlListing[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set())
  const [suggesting,  startSuggest]   = useTransition()
  const [suggestErr,  setSuggestErr]  = useState<string | null>(null)

  // Suggest floors state
  const [suggestingFloors, startSuggestFloors] = useTransition()
  const [floorSuggestMsg,  setFloorSuggestMsg]  = useState<string | null>(null)
  const [floorSuggestErr,  setFloorSuggestErr]  = useState<string | null>(null)

  // Tag test state
  const [tagListingId, setTagListingId] = useState("")
  const [tagTesting,   setTagTesting]   = useState(false)
  const [tagResult,    setTagResult]    = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  // Verify prices state (task 2)
  const [verifyTarget, setVerifyTarget] = useState<{ id: string; name: string; pms: string } | null>(null)
  const [verifying,    startVerify]     = useTransition()
  const [verifyResult, setVerifyResult] = useState<Awaited<ReturnType<typeof verifyPriceLabsPrices>> | null>(null)

  // Push status state (task 3)
  const [pushListingId, setPushListingId] = useState("")
  const [pushChecking,  startPushCheck]   = useTransition()
  const [pushResult,    setPushResult]    = useState<Awaited<ReturnType<typeof getPriceLabsPushStatus>> | null>(null)

  function setRow(id: string, field: "pricelabs_listing_id" | "pricelabs_price_floor", value: string) {
    setRows(prev => prev.map(r =>
      r.id !== id ? r : {
        ...r,
        [field]: field === "pricelabs_price_floor"
          ? (value === "" ? null : Number(value))
          : (value || null),
      },
    ))
  }

  function handleSuggest() {
    setSuggestErr(null)
    startSuggest(async () => {
      const res = await fetchPriceLabsListings()
      if (!res.ok) { setSuggestErr(res.error); return }

      setPlListings(res.listings)
      setDismissed(new Set())

      const unmapped = rows.filter(r => !r.pricelabs_listing_id)
      const suggs: Suggestion[] = []
      for (const prop of unmapped) {
        let best: { plId: string; plName: string; score: number } | null = null
        for (const pl of res.listings) {
          const score = jaccardSim(prop.name, pl.name)
          if (score > 0.1 && (!best || score > best.score)) {
            best = { plId: pl.id, plName: pl.name, score }
          }
        }
        if (best) suggs.push({ propertyId: prop.id, propertyName: prop.name, ...best })
      }

      setSuggestions(suggs)
      if (suggs.length === 0 && unmapped.length > 0) {
        setSuggestErr("No confident matches found — try mapping manually")
      }
    })
  }

  function acceptSuggestion(s: Suggestion) {
    setRows(prev => prev.map(r => r.id !== s.propertyId ? r : { ...r, pricelabs_listing_id: s.plId }))
    setDismissed(d => new Set([...d, s.propertyId]))
  }

  function handleSuggestFloors() {
    setFloorSuggestErr(null)
    setFloorSuggestMsg(null)
    startSuggestFloors(async () => {
      // Reuse already-loaded listings or fetch now (read-only)
      let listings = plListings
      if (listings.length === 0) {
        const res = await fetchPriceLabsListings()
        if (!res.ok) { setFloorSuggestErr(res.error); return }
        listings = res.listings
        setPlListings(listings)
      }

      let filled = 0, noMin = 0, notFound = 0
      setRows(prev => prev.map(r => {
        if (!r.pricelabs_listing_id) return r
        const pl = listings.find(l => l.id === r.pricelabs_listing_id)
        if (!pl)       { notFound++; return r }
        if (pl.min == null) { noMin++;   return r }
        filled++
        return { ...r, pricelabs_price_floor: pl.min }
      }))

      const parts: string[] = []
      if (filled    > 0) parts.push(`${filled} floor${filled !== 1 ? "s" : ""} filled from PriceLabs min`)
      if (noMin     > 0) parts.push(`${noMin} skipped — no min set in PriceLabs`)
      if (notFound  > 0) parts.push(`${notFound} listing ID not found in account`)
      setFloorSuggestMsg(parts.join(" · ") || "No mapped listings found")
    })
  }

  const activeSuggestions = suggestions.filter(s => !dismissed.has(s.propertyId))
  const mappedPlIds       = new Set(rows.map(r => r.pricelabs_listing_id).filter(Boolean))
  const unmatchedPl       = plListings.filter(pl => !mappedPlIds.has(pl.id))

  async function handleTagTest(action: "add" | "remove") {
    if (!tagListingId) return
    setTagTesting(true)
    setTagResult(null)
    const res = await testPriceLabsTagWrite(tagListingId, action)
    setTagResult(res)
    setTagTesting(false)
  }

  function handleVerifyPrices(r: PriceLabsPropertyRow) {
    if (!r.pricelabs_listing_id) return
    // Toggle off if already open for this listing
    if (verifyTarget?.id === r.pricelabs_listing_id) {
      setVerifyTarget(null); setVerifyResult(null); return
    }
    const pms = plListings.find(pl => pl.id === r.pricelabs_listing_id)?.pms ?? "ownerrez"
    setVerifyTarget({ id: r.pricelabs_listing_id, name: r.name, pms })
    setVerifyResult(null)
    startVerify(async () => {
      const res = await verifyPriceLabsPrices(r.pricelabs_listing_id!, pms)
      setVerifyResult(res)
    })
  }

  function handlePushCheck() {
    if (!pushListingId) return
    const pms = plListings.find(pl => pl.id === pushListingId)?.pms ?? "ownerrez"
    setPushResult(null)
    startPushCheck(async () => {
      const res = await getPriceLabsPushStatus(pushListingId, pms)
      setPushResult(res)
    })
  }

  return (
    <div className="space-y-4">
      <Card title="PriceLabs Listing Mapping">
        <p className="text-xs text-muted-foreground">
          Map each property to its PriceLabs listing ID. Set an optional price floor to block
          proposals that would go below that value.
        </p>

        {/* Suggest matches + Suggest floors */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {suggesting ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            Suggest matches
          </button>
          <button
            onClick={handleSuggestFloors}
            disabled={suggestingFloors}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {suggestingFloors ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Suggest floors
          </button>
          {suggestErr      && <span className="text-xs text-red-400">{suggestErr}</span>}
          {floorSuggestErr && <span className="text-xs text-red-400">{floorSuggestErr}</span>}
          {floorSuggestMsg && <span className="text-xs text-[#6FA1AF]">{floorSuggestMsg}</span>}
        </div>

        {/* Suggestions panel */}
        {activeSuggestions.length > 0 && (
          <div className="rounded-lg border border-[#E88159]/30 bg-[#E88159]/5 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {activeSuggestions.length} suggested match{activeSuggestions.length !== 1 ? "es" : ""}
            </p>
            {activeSuggestions.map(s => (
              <div key={s.propertyId} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="text-foreground">{s.propertyName}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="text-[#6FA1AF]">{s.plName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">({Math.round(s.score * 100)}% match)</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => acceptSuggestion(s)}
                    className="flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                  >
                    <Check className="size-3" /> Accept
                  </button>
                  <button
                    onClick={() => setDismissed(d => new Set([...d, s.propertyId]))}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="size-3" /> Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unmatched PL listings */}
        {plListings.length > 0 && unmatchedPl.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-amber-400">
              {unmatchedPl.length} PriceLabs listing{unmatchedPl.length !== 1 ? "s" : ""} not matched to any property
            </p>
            <p className="text-xs text-muted-foreground">{unmatchedPl.map(pl => pl.name).join(", ")}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_90px_68px_68px_32px] gap-3 px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Property</span>
            <span>PriceLabs Listing ID</span>
            <span>Floor ($)</span>
            <span>PL Min</span>
            <span>PL Base</span>
            <span />
          </div>
          {rows.map(r => {
            const pl = plListings.find(l => l.id === r.pricelabs_listing_id)
            return (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_90px_68px_68px_32px] gap-3 items-center">
                <span className="text-sm text-foreground truncate">{r.name}</span>
                <input
                  type="text"
                  value={r.pricelabs_listing_id ?? ""}
                  onChange={e => setRow(r.id, "pricelabs_listing_id", e.target.value)}
                  placeholder="e.g. 12345"
                  className="w-full rounded-lg border border-input bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring"
                />
                <input
                  type="number"
                  min={0}
                  value={r.pricelabs_price_floor ?? ""}
                  onChange={e => setRow(r.id, "pricelabs_price_floor", e.target.value)}
                  placeholder="None"
                  className="w-full rounded-lg border border-input bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring"
                />
                {/* PL Min — shown once listings are loaded; amber if null */}
                <span className={cn(
                  "text-xs font-mono",
                  !pl ? "text-muted-foreground" :
                  pl.min == null ? "text-amber-400" : "text-foreground"
                )}>
                  {!pl ? "—" : pl.min != null ? `$${pl.min}` : "none"}
                </span>
                {/* PL Base — labeled source-unknown per API (no base_type field) */}
                <span className="text-xs font-mono text-muted-foreground" title="Source unknown — PriceLabs API does not indicate whether this is user-set or calculated">
                  {!pl ? "—" : pl.base != null ? `$${pl.base}` : "—"}
                </span>
                <button
                  title="Verify prices (read-only, next 30 days)"
                  disabled={!r.pricelabs_listing_id || (verifying && verifyTarget?.id === r.pricelabs_listing_id)}
                  onClick={() => handleVerifyPrices(r)}
                  className={cn(
                    "flex items-center justify-center rounded-md p-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                    verifyTarget?.id === r.pricelabs_listing_id
                      ? "bg-[#6FA1AF]/20 text-[#6FA1AF]"
                      : "text-muted-foreground hover:text-[#6FA1AF] hover:bg-[#6FA1AF]/10"
                  )}
                >
                  {verifying && verifyTarget?.id === r.pricelabs_listing_id
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <BarChart2 className="size-3.5" />
                  }
                </button>
              </div>
            )
          })}
        </div>

        {/* Verify prices inline panel (task 2 + task 5 base price label) */}
        {verifyTarget && (
          <div className="rounded-lg border border-[#6FA1AF]/30 bg-[#6FA1AF]/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[#6FA1AF]">
                Price check · {verifyTarget.name}
                {verifyResult?.ok && (
                  <span className={cn("ml-2", verifyResult.flagCount === 0 ? "text-emerald-400" : "text-amber-400")}>
                    {verifyResult.flagCount === 0 ? "0 flags" : `${verifyResult.flagCount} flag${verifyResult.flagCount !== 1 ? "s" : ""}`}
                  </span>
                )}
              </p>
              <button onClick={() => { setVerifyTarget(null); setVerifyResult(null) }}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="size-3.5" />
              </button>
            </div>
            {verifying && !verifyResult && <p className="text-xs text-muted-foreground">Loading…</p>}
            {verifyResult && (
              verifyResult.ok ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {/* Task 5: base price labeled "source unknown" because API field has no base_type */}
                    Base:{" "}
                    <span className="text-foreground font-medium">
                      {verifyResult.base != null ? `$${verifyResult.base}` : "not set"}
                    </span>{" "}
                    <span className="text-amber-400">(source unknown — PriceLabs API does not indicate whether this is user-set or system-calculated)</span>
                    {" · "}Currency: {verifyResult.currency ?? "unknown"}
                    {" · "}Refreshed: {fmtDateTime(verifyResult.last_refreshed_at)}
                    {" · "}Sync:{" "}
                    <span className={verifyResult.push_enabled ? "text-emerald-400" : "text-red-400"}>
                      {verifyResult.push_enabled ? "ON" : "OFF"}
                    </span>
                    {verifyResult.last_date_pushed && <> · Last push: {fmtDateTime(verifyResult.last_date_pushed)}</>}
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded border border-border/40">
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-muted-foreground text-left border-b border-border/40">
                          <th className="py-1 px-2 font-medium">Date</th>
                          <th className="py-1 px-2 font-medium text-right">PL Price</th>
                          <th className="py-1 px-2 font-medium text-right">Last PMS</th>
                          <th className="py-1 px-2 font-medium text-right">Booked</th>
                          <th className="py-1 px-2 font-medium">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verifyResult.days.map((d: VerifyPricesDay) => (
                          <tr key={d.date} className={cn(
                            "border-t border-border/30",
                            d.flag === "null_price" || d.flag === "zero_price" ? "bg-red-500/5" :
                            d.flag === "big_jump" ? "bg-amber-500/5" : ""
                          )}>
                            <td className="py-0.5 px-2 text-foreground">{d.date}</td>
                            <td className="py-0.5 px-2 text-right">{d.price != null ? `$${d.price}` : "—"}</td>
                            <td className="py-0.5 px-2 text-right text-muted-foreground">{d.user_price != null ? `$${d.user_price}` : "—"}</td>
                            <td className="py-0.5 px-2 text-right text-muted-foreground">{d.booking_status ?? "—"}</td>
                            <td className="py-0.5 px-2">
                              {d.flag === "null_price" && <span className="text-red-400">null price</span>}
                              {d.flag === "zero_price" && <span className="text-red-400">$0</span>}
                              {d.flag === "big_jump"   && <span className="text-amber-400">≥50% jump</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-red-400">{verifyResult.error}</p>
              )
            )}
          </div>
        )}
        <div className="flex items-center gap-3 pt-1 border-t border-border">
          <button
            onClick={() => startSave(async () => {
              setResult(null)
              const r = await savePriceLabsPropertySettings(rows.map(row => ({
                id                   : row.id,
                pricelabs_listing_id : row.pricelabs_listing_id,
                pricelabs_price_floor: row.pricelabs_price_floor,
              })))
              setResult(r.error ? r : { ok: true, message: "Saved" })
            })}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save all
          </button>
          <ActionMsg result={result} />
        </div>
      </Card>

      {/* Tag write test */}
      <Card title="Test Write Connection">
        <p className="text-xs text-muted-foreground">
          Verify that the PriceLabs API key has write access by adding and removing a test tag
          on a listing. The tag "claude-test" does not affect pricing.
        </p>
        <Field label="PriceLabs Listing">
          {plListings.length > 0 ? (
            <select
              value={tagListingId}
              onChange={e => setTagListingId(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:border-ring"
            >
              <option value="">Select a listing…</option>
              {plListings.map(pl => (
                <option key={pl.id} value={pl.id}>{pl.name} ({pl.id})</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click "Suggest matches" above to load PriceLabs listings first.
            </p>
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground italic">Disabled until tag handling is verified</p>
        </div>
      </Card>

      {/* Push status (task 3) */}
      <Card title="Price Push Status">
        <p className="text-xs text-muted-foreground">
          Read-only. Sources: GET /v1/listings → push_enabled, last_date_pushed; POST /v1/logs → recent
          activity. The /v1/push_price_status endpoint from the 2020 changelog has no live API reference
          page; these two documented fields are the equivalent.
        </p>
        <Field label="PriceLabs Listing">
          {plListings.length > 0 ? (
            <select
              value={pushListingId}
              onChange={e => setPushListingId(e.target.value)}
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:border-ring"
            >
              <option value="">Select a listing…</option>
              {plListings.map(pl => (
                <option key={pl.id} value={pl.id}>{pl.name} ({pl.id})</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click "Suggest matches" above to load PriceLabs listings first.
            </p>
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handlePushCheck}
            disabled={pushChecking || !pushListingId}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {pushChecking ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
            Check push status
          </button>
        </div>
        {pushResult && (
          pushResult.ok ? (
            <div className="rounded-lg border border-border bg-card/60 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 font-medium border",
                  pushResult.push_enabled
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                )}>
                  Sync {pushResult.push_enabled ? "ON" : "OFF"}
                </span>
                <span className="text-muted-foreground">
                  Last push: {fmtDateTime(pushResult.last_date_pushed)}
                </span>
                <span className="text-muted-foreground">
                  Refreshed: {fmtDateTime(pushResult.last_refreshed_at)}
                </span>
              </div>
              {pushResult.recentLogs.length > 0 ? (
                <div className="space-y-0.5 pt-1 border-t border-border/40">
                  <p className="text-xs font-medium text-muted-foreground">Activity (last 30 days):</p>
                  {pushResult.recentLogs.map((l, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {l.action_label} · {fmtDateTime(l.created_at)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                  No activity in the last 30 days
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-red-400">{pushResult.error}</p>
          )
        )}
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
  const [syncingReviews,   setSyncingReviews]   = useState(false)
  const [reviewsResult,    setReviewsResult]    = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)
  const [syncingAmenities, setSyncingAmenities] = useState(false)
  const [amenitiesResult,  setAmenitiesResult]  = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

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

  async function handleSyncAmenities() {
    setSyncingAmenities(true)
    setAmenitiesResult(null)
    const data = await syncAmenities()
    if (!data.ok) {
      setAmenitiesResult({ error: data.error })
    } else {
      setAmenitiesResult({
        ok: true,
        message: `Synced ${data.amenitiesSynced} amenities across ${data.propertiesSynced} properties`,
      })
      const newEntry: SyncLogRow = {
        id             : crypto.randomUUID(),
        sync_type      : "amenities",
        status         : "success",
        records_synced : data.amenitiesSynced,
        records_failed : 0,
        error_message  : null,
        started_at     : new Date().toISOString(),
        completed_at   : new Date().toISOString(),
        created_at     : new Date().toISOString(),
      }
      setLog(prev => [newEntry, ...prev].slice(0, 10))
    }
    setSyncingAmenities(false)
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
        <div className="border-t border-border pt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSyncAmenities}
            disabled={syncingAmenities}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {syncingAmenities
              ? <Loader2 className="size-4 animate-spin" />
              : <RefreshCw className="size-4" />}
            {syncingAmenities ? "Syncing Amenities…" : "Sync Amenities"}
          </button>
          <ActionMsg result={amenitiesResult} />
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

// ── Groups tab ────────────────────────────────────────────────────────────────

function GroupsTab({ initialProperties }: { initialProperties: PropertyGroupRow[] }) {
  const [props, setProps] = useState(initialProperties)
  const [saving, setSaving] = useState<string | null>(null)  // propertyId being saved

  // IDs that are already children — they cannot become parents
  const childIds = new Set(props.filter(p => p.parent_property_id).map(p => p.id))

  // Available parents: properties that aren't themselves children
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

// ── Reports tab ───────────────────────────────────────────────────────────────

function ReportsTab({ initialEmail }: { initialEmail: string }) {
  const [email,       setEmail]       = useState(initialEmail)
  const [saving,      startSave]      = useTransition()
  const [saveResult,  setSaveResult]  = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)
  const [sending,     setSending]     = useState(false)
  const [sendResult,  setSendResult]  = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  async function handleSend() {
    setSending(true)
    setSendResult(null)
    const res = await sendTestReport()
    if (!res.ok) {
      setSendResult({ error: res.error })
    } else {
      setSendResult({ ok: true, message: `Report sent to ${res.recipient}` })
    }
    setSending(false)
  }

  return (
    <div className="space-y-4">
      <Card title="Email Reports">
        <p className="text-xs text-muted-foreground">
          A portfolio optimization report is automatically sent on the 1st of each month at 8 AM UTC.
          Configure the recipient address and send a test report below.
        </p>

        <Field label="Report Recipient Email">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
            <button
              onClick={() => startSave(async () => {
                setSaveResult(null)
                const r = await saveSettings({ report_email: email })
                setSaveResult(r.error ? r : { ok: true, message: "Saved" })
              })}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Save
            </button>
          </div>
          <ActionMsg result={saveResult} />
        </Field>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Report Contents</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {[
              "Portfolio summary: total revenue, occupancy, properties needing attention",
              "Per-property table: revenue vs last month, ADR, occupancy, top recommendation, health score",
              "Amenity gap callout: top 3 amenities missing across the most properties",
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <Check className="size-3 mt-0.5 shrink-0 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-border pt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || !email.trim()}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            {sending
              ? <Loader2 className="size-4 animate-spin" />
              : <Send className="size-4" />}
            {sending ? "Sending…" : "Send Test Report"}
          </button>
          <ActionMsg result={sendResult} />
        </div>
      </Card>

      <Card title="Schedule">
        <div className="space-y-2">
          {[
            { label: "Frequency",  value: "Monthly — 1st of each month" },
            { label: "Send time",  value: "8:00 AM UTC" },
            { label: "Data range", value: "Last 30 days vs prior 30 days" },
            { label: "Provider",   value: "Resend (configure RESEND_API_KEY in Vercel env vars)" },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-foreground font-medium text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Benchmarks tab ────────────────────────────────────────────────────────────

function BenchmarksTab({
  initial,
  benchmarkProperties,
}: {
  initial             : SettingsData
  benchmarkProperties : BenchmarkPropertyRow[]
}) {
  const [marketAdr,  setMarketAdr]  = useState(initial.market_adr || "207")
  const [marketOcc,  setMarketOcc]  = useState(initial.market_occupancy || "57")
  const [mktSaving,  startMktSave]  = useTransition()
  const [mktResult,  setMktResult]  = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  const [rows, setRows] = useState(benchmarkProperties.map(p => ({
    id                          : p.id,
    name                        : p.name,
    bedrooms                    : p.bedrooms,
    listing_type                : p.listing_type,
    benchmark_adr_override      : p.benchmark_adr_override,
    benchmark_occupancy_override: p.benchmark_occupancy_override,
    pricelabs_listing_id        : p.pricelabs_listing_id,
    benchmarkLabel              : p.benchmarkLabel,
    benchmarkSource             : p.benchmarkSource,
  })))

  const [propSaving, startPropSave] = useTransition()
  const [propResult, setPropResult] = useState<{ ok?: boolean; error?: string; message?: string } | null>(null)

  // Compare sources modal
  const [compareId,      setCompareId]      = useState<string | null>(null)
  const [compareTiers,   setCompareTiers]   = useState<TierResult[] | null>(null)
  const [compareLoading, startCompare]      = useTransition()
  const [compareError,   setCompareError]   = useState<string | null>(null)

  function openCompare(id: string) {
    setCompareId(id)
    setCompareTiers(null)
    setCompareError(null)
    startCompare(async () => {
      const r = await getPropertyBenchmarkTiers(id)
      if (r.error) { setCompareError(r.error) } else { setCompareTiers(r.tiers ?? null) }
    })
  }

  function setRow(id: string, field: "listing_type" | "benchmark_adr_override" | "benchmark_occupancy_override", value: string) {
    setRows(prev => prev.map(r =>
      r.id !== id ? r : {
        ...r,
        [field]: field === "listing_type"
          ? (value || null)
          : (value === "" ? null : Number(value)),
      },
    ))
  }

  const compareName = compareId ? rows.find(r => r.id === compareId)?.name ?? "" : ""

  return (
    <div className="space-y-4">
      {/* Compare sources modal */}
      {compareId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <p className="font-semibold text-foreground">Compare benchmark sources</p>
                <p className="text-xs text-muted-foreground mt-0.5">{compareName}</p>
              </div>
              <button
                onClick={() => setCompareId(null)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5">
              {compareLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Computing all tiers…
                </div>
              ) : compareError ? (
                <p className="text-sm text-red-400">{compareError}</p>
              ) : compareTiers ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                      <th className="text-left py-2 pr-3 font-medium">Tier</th>
                      <th className="text-right py-2 px-3 font-medium">ADR</th>
                      <th className="text-right py-2 px-3 font-medium">Occ</th>
                      <th className="text-right py-2 px-3 font-medium">RevPAR</th>
                      <th className="text-right py-2 pl-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {compareTiers.map(t => (
                      <tr key={t.tier} className={cn(t.active ? "bg-[#E88159]/8" : "")}>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground text-xs">{t.tier}</span>
                            <span className={cn("font-medium", t.active ? "text-[#E88159]" : "text-foreground")}>
                              {t.label}
                            </span>
                            {t.active && (
                              <span className="rounded-full bg-[#E88159]/15 text-[#E88159] border border-[#E88159]/30 text-[10px] px-1.5 py-0.5 font-medium">
                                active
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-foreground">
                          {t.adr != null ? `$${Math.round(t.adr)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-foreground">
                          {t.occ != null ? `${t.occ}%` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-foreground">
                          {t.revpar != null ? `$${Math.round(t.revpar)}` : "—"}
                        </td>
                        <td className="py-2.5 pl-3 text-right text-xs text-muted-foreground">
                          {t.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <Card title="Market Defaults">
        <p className="text-xs text-muted-foreground">
          These values are the market-level fallback when a property has no comparable listings or
          per-property override set. They are stored in app_settings and loaded at runtime.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Market ADR ($)">
            <input
              type="number"
              min={0}
              value={marketAdr}
              onChange={e => setMarketAdr(e.target.value)}
              placeholder="207"
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </Field>
          <Field label="Market Occupancy (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={marketOcc}
              onChange={e => setMarketOcc(e.target.value)}
              placeholder="57"
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => startMktSave(async () => {
              setMktResult(null)
              const r = await saveSettings({ market_adr: marketAdr, market_occupancy: marketOcc })
              setMktResult(r.error ? r : { ok: true, message: "Saved" })
            })}
            disabled={mktSaving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {mktSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </button>
          <ActionMsg result={mktResult} />
        </div>
      </Card>

      <Card title="Per-Property Benchmarks">
        <p className="text-xs text-muted-foreground">
          Set a listing type and optional override targets for each property. If both ADR and
          occupancy overrides are set, they take priority over comparable listings and the market
          fallback. Leave blank to use automatic benchmark resolution.
        </p>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_52px_120px_100px_100px_80px_auto] gap-2 px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Property</span>
            <span>Beds</span>
            <span>Listing Type</span>
            <span>ADR ($)</span>
            <span>Occ (%)</span>
            <span>Source</span>
            <span />
          </div>
          {rows.map(r => {
            const sourceBadge = {
              override         : <span className="rounded-full bg-[#E88159]/15 text-[#E88159] border border-[#E88159]/30 text-[10px] px-1.5 py-0.5 font-medium">override</span>,
              pl_neighborhood  : <span className="rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30 text-[10px] px-1.5 py-0.5 font-medium">PL data</span>,
              comparable       : <span className="rounded-full bg-[#6FA1AF]/15 text-[#6FA1AF] border border-[#6FA1AF]/30 text-[10px] px-1.5 py-0.5 font-medium">comps</span>,
              comparable_scaled: <span className="rounded-full bg-[#6FA1AF]/15 text-[#6FA1AF] border border-[#6FA1AF]/30 text-[10px] px-1.5 py-0.5 font-medium">scaled</span>,
              market           : <span className="rounded-full bg-muted/40 text-muted-foreground border border-border text-[10px] px-1.5 py-0.5 font-medium">market</span>,
            }[r.benchmarkSource]
            return (
              <div key={r.id} className="grid grid-cols-[1fr_52px_120px_100px_100px_80px_auto] gap-2 items-center">
                <div className="min-w-0">
                  <span className="text-sm text-foreground truncate block">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground/60">{r.benchmarkLabel}</span>
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">{r.bedrooms ?? "—"}</span>
                <select
                  value={r.listing_type ?? ""}
                  onChange={e => setRow(r.id, "listing_type", e.target.value)}
                  className="w-full rounded-lg border border-input bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none focus-visible:border-ring"
                >
                  <option value="">Auto-detect</option>
                  <option value="nightly">Nightly</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={r.benchmark_adr_override ?? ""}
                  onChange={e => setRow(r.id, "benchmark_adr_override", e.target.value)}
                  placeholder="None"
                  className="w-full rounded-lg border border-input bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={r.benchmark_occupancy_override ?? ""}
                  onChange={e => setRow(r.id, "benchmark_occupancy_override", e.target.value)}
                  placeholder="None"
                  className="w-full rounded-lg border border-input bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring"
                />
                <div className="flex justify-center">{sourceBadge}</div>
                <button
                  onClick={() => openCompare(r.id)}
                  disabled={compareLoading && compareId === r.id}
                  className="text-xs text-[#6FA1AF] hover:text-[#6FA1AF]/80 font-medium transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {compareLoading && compareId === r.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : "Compare →"}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-border">
          <button
            onClick={() => startPropSave(async () => {
              setPropResult(null)
              const r = await saveBenchmarkPropertySettings(rows.map(row => ({
                id                          : row.id,
                benchmark_adr_override      : row.benchmark_adr_override,
                benchmark_occupancy_override: row.benchmark_occupancy_override,
                listing_type                : row.listing_type,
              })))
              setPropResult(r.error ? r : { ok: true, message: "Saved" })
            })}
            disabled={propSaving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
          >
            {propSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save all
          </button>
          <ActionMsg result={propResult} />
        </div>
      </Card>
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
  groupProperties,
  plProperties = [],
  benchmarkProperties = [],
}: {
  settings             : SettingsData
  users                : UserRow[]
  syncLog              : SyncLogRow[]
  properties           : PropertyVisibilityRow[]
  hiddenIds            : string[]
  groupProperties      : PropertyGroupRow[]
  plProperties        ?: PriceLabsPropertyRow[]
  benchmarkProperties ?: BenchmarkPropertyRow[]
}) {
  const [tab, setTab] = useState<Tab>("integrations")

  const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
    { value: "integrations", label: "Integrations", icon: Plug      },
    { value: "pricelabs",    label: "PriceLabs",     icon: Database  },
    { value: "benchmarks",   label: "Benchmarks",    icon: BarChart2 },
    { value: "users",        label: "Users",         icon: Users     },
    { value: "sync",         label: "Data Sync",     icon: Database  },
    { value: "visibility",   label: "Visibility",    icon: Building2 },
    { value: "groups",       label: "Groups",        icon: Building2 },
    { value: "reports",      label: "Reports",       icon: Mail      },
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
      {tab === "pricelabs"    && <PriceLabsMappingTab initialProperties={plProperties} />}
      {tab === "benchmarks"   && <BenchmarksTab initial={settings} benchmarkProperties={benchmarkProperties} />}
      {tab === "users"        && <UsersTab initialUsers={users} />}
      {tab === "sync"         && <SyncTab initialLog={syncLog} />}
      {tab === "visibility"   && (
        <PropertyVisibilityTab
          initialProperties={properties}
          initialHiddenIds={hiddenIds}
        />
      )}
      {tab === "groups"       && <GroupsTab initialProperties={groupProperties} />}
      {tab === "reports"      && <ReportsTab initialEmail={settings.report_email} />}
    </div>
  )
}
