import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  computeBenchmark,
  aggregateBookings,
  getPlNeighborhoodCache,
  setPlNeighborhoodCache,
  extractPlBenchmark,
  type PropertyMeta,
  type PlNeighborhoodData,
} from "@/lib/benchmarks"
import { fetchNeighborhoodData } from "@/lib/pricelabs"
import {
  SettingsClient,
  type SettingsData,
  type UserRow,
  type SyncLogRow,
  type PriceLabsPropertyRow,
  type BenchmarkPropertyRow,
} from "@/components/settings/settings-client"
import { type PropertyVisibilityRow } from "@/components/settings/visibility-tab"
import { type PropertyGroupRow } from "@/components/settings/groups-tab"

function parseSettingValue(raw: unknown): string {
  if (typeof raw === "string") return raw
  if (raw === null || raw === undefined) return ""
  try { return String(JSON.parse(String(raw))) } catch { return String(raw) }
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/overview")

  const admin = createAdminClient()

  const comp90Start = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const todayStr    = new Date().toISOString().slice(0, 10)

  const [{ data: settingsData }, { data: usersData }, { data: logData }, { data: propData }, { data: plPropData }, { data: benchPropData }, { data: comp90Data }] = await Promise.all([
    admin.from("app_settings").select("key, value"),
    admin.from("profiles").select("id, email, full_name, role, created_at").order("created_at"),
    (admin as any).from("visible_sync_log").select("*").order("created_at", { ascending: false }).limit(10),
    admin.from("properties").select("id, external_name, internal_name, is_active, is_hidden, parent_property_id").order("external_name"),
    (admin as any).from("properties").select("id, external_name, internal_name, is_hidden, pricelabs_listing_id, pricelabs_price_floor").eq("is_active", true).order("external_name"),
    (admin as any).from("properties").select("id, external_name, internal_name, is_hidden, bedrooms, listing_type, benchmark_adr_override, benchmark_occupancy_override, pricelabs_listing_id").eq("is_active", true).order("external_name"),
    (admin as any).from("visible_bookings").select("property_id, arrival, departure, net_revenue, total_amount").neq("status", "cancelled").eq("is_block", false).gte("arrival", comp90Start).lt("arrival", todayStr),
  ])

  const rawSettings: Record<string, string> = {}
  for (const row of settingsData ?? []) {
    rawSettings[row.key] = parseSettingValue(row.value)
  }

  const settings: SettingsData = {
    ownerrez_email          : rawSettings.ownerrez_email           ?? "",
    ownerrez_api_token      : rawSettings.ownerrez_api_token       ?? "",
    pricelabs_api_key       : rawSettings.pricelabs_api_key        ?? "",
    pricelabs_writes_enabled: rawSettings.pricelabs_writes_enabled ?? "false",
    pricelabs_max_change_pct: rawSettings.pricelabs_max_change_pct ?? "10",
    report_email            : rawSettings.report_email             ?? "",
    market_adr              : rawSettings.market_adr               ?? "207",
    market_occupancy        : rawSettings.market_occupancy         ?? "57",
  }

  const users: UserRow[] = (usersData ?? []).map(u => ({
    id        : u.id,
    email     : u.email,
    full_name : u.full_name,
    role      : u.role,
    created_at: u.created_at,
  }))

  const syncLog: SyncLogRow[] = ((logData ?? []) as any[]).map((e: any) => ({
    id             : e.id,
    sync_type      : e.sync_type,
    status         : e.status,
    records_synced : e.records_synced,
    records_failed : e.records_failed,
    error_message  : e.error_message,
    started_at     : e.started_at,
    completed_at   : e.completed_at,
    created_at     : e.created_at,
  }))

  const properties: PropertyVisibilityRow[] = (propData ?? []).map(p => ({
    id        : p.id,
    name      : p.internal_name || p.external_name,
    is_active : p.is_active ?? false,
  }))

  const groupProperties: PropertyGroupRow[] = (propData ?? []).map(p => ({
    id                 : p.id,
    name               : p.internal_name || p.external_name,
    is_active          : p.is_active ?? false,
    parent_property_id : p.parent_property_id ?? null,
  }))

  type RawPlProp = {
    id                   : string
    external_name        : string
    internal_name        : string | null
    is_hidden            : boolean
    pricelabs_listing_id : string | null
    pricelabs_price_floor: number | null
  }

  const plProperties: PriceLabsPropertyRow[] = ((plPropData ?? []) as RawPlProp[]).map(p => ({
    id                   : p.id,
    name                 : p.internal_name || p.external_name,
    is_hidden            : p.is_hidden ?? false,
    pricelabs_listing_id : p.pricelabs_listing_id ?? null,
    pricelabs_price_floor: p.pricelabs_price_floor != null ? Number(p.pricelabs_price_floor) : null,
  }))

  const hiddenIds: string[] = (propData ?? [])
    .filter((p: any) => p.is_hidden)
    .map((p: any) => p.id)

  type RawBenchProp = {
    id                           : string
    external_name                : string
    internal_name                : string | null
    is_hidden                    : boolean
    bedrooms                     : number | null
    listing_type                 : string | null
    benchmark_adr_override       : number | null
    benchmark_occupancy_override : number | null
    pricelabs_listing_id         : string | null
  }

  const marketAdrNum = parseFloat(rawSettings.market_adr ?? "207") || 207
  const marketOccNum = parseFloat(rawSettings.market_occupancy ?? "57") || 57

  // Sibling map for benchmark comparables
  const benchSiblingMap     = new Map<string, Set<string>>()
  const benchGroupsByParent = new Map<string, string[]>()
  for (const p of propData ?? []) {
    if (p.parent_property_id) {
      const arr = benchGroupsByParent.get(p.parent_property_id) ?? []
      arr.push(p.id)
      benchGroupsByParent.set(p.parent_property_id, arr)
    }
  }
  for (const [parentId, children] of benchGroupsByParent) {
    const all = [parentId, ...children]
    for (const memberId of all) {
      benchSiblingMap.set(memberId, new Set(all.filter(id => id !== memberId)))
    }
  }

  const hiddenSet        = new Set(hiddenIds)
  const benchAggBookings = aggregateBookings(comp90Data ?? [])
  const benchActiveProps : PropertyMeta[] = ((benchPropData ?? []) as RawBenchProp[]).map(p => ({
    id                           : p.id,
    external_name                : p.external_name,
    internal_name                : p.internal_name ?? null,
    bedrooms                     : p.bedrooms ?? null,
    listing_type                 : p.listing_type ?? null,
    benchmark_adr_override       : p.benchmark_adr_override != null ? Number(p.benchmark_adr_override) : null,
    benchmark_occupancy_override : p.benchmark_occupancy_override != null ? Number(p.benchmark_occupancy_override) : null,
  }))

  const benchPlApiKey = rawSettings.pricelabs_api_key || null
  const benchPlMap    = new Map<string, PlNeighborhoodData>()
  for (const p of (benchPropData ?? []) as RawBenchProp[]) {
    if (!p.pricelabs_listing_id) continue
    let cached = await getPlNeighborhoodCache(admin, p.pricelabs_listing_id)
    if (!cached && benchPlApiKey) {
      const r = await fetchNeighborhoodData(benchPlApiKey, p.pricelabs_listing_id, "ownerrez")
      if (r.ok) {
        const extracted = extractPlBenchmark(r.payload, p.bedrooms ?? null)
        if (extracted) {
          await setPlNeighborhoodCache(admin, p.pricelabs_listing_id, extracted)
          cached = extracted
        }
      }
    }
    if (cached) benchPlMap.set(p.id, cached)
  }

  const benchmarkProperties: BenchmarkPropertyRow[] = ((benchPropData ?? []) as RawBenchProp[]).map(p => {
    const oAdr = p.benchmark_adr_override != null ? Number(p.benchmark_adr_override) : null
    const oOcc = p.benchmark_occupancy_override != null ? Number(p.benchmark_occupancy_override) : null
    const hasOverride = oAdr != null && oOcc != null && oAdr > 0 && oOcc > 0
    const benchmarkLabel = hasOverride
      ? `your target ($${Math.round(oAdr!)} ADR, ${oOcc!}% occ)`
      : `auto — similar listings or Appleton market`
    const propMeta: PropertyMeta = {
      id                           : p.id,
      external_name                : p.external_name,
      internal_name                : p.internal_name ?? null,
      bedrooms                     : p.bedrooms ?? null,
      listing_type                 : p.listing_type ?? null,
      benchmark_adr_override       : oAdr,
      benchmark_occupancy_override : oOcc,
    }
    const bench = computeBenchmark({
      property     : propMeta,
      allProperties: benchActiveProps,
      aggBookings  : benchAggBookings,
      hiddenIds    : hiddenSet,
      siblingIds   : benchSiblingMap.get(p.id) ?? new Set(),
      marketAdr    : marketAdrNum,
      marketOcc    : marketOccNum,
      plData       : benchPlMap.get(p.id) ?? null,
    })
    return {
      id                          : p.id,
      name                        : p.internal_name || p.external_name,
      is_hidden                   : p.is_hidden ?? false,
      bedrooms                    : p.bedrooms ?? null,
      listing_type                : p.listing_type ?? null,
      benchmark_adr_override      : oAdr,
      benchmark_occupancy_override: oOcc,
      pricelabs_listing_id        : p.pricelabs_listing_id ?? null,
      benchmarkLabel,
      benchmarkSource             : bench.source,
    }
  })

  return (
    <div className="p-6 space-y-5 max-w-[900px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage integrations, users, and data sync.
        </p>
      </div>

      <SettingsClient
        settings={settings}
        users={users}
        syncLog={syncLog}
        properties={properties}
        hiddenIds={hiddenIds}
        groupProperties={groupProperties}
        plProperties={plProperties}
        benchmarkProperties={benchmarkProperties}
      />
    </div>
  )
}
