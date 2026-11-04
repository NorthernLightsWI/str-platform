import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveListingType } from "@/lib/benchmarks"
import {
  SettingsClient,
  type SettingsData,
  type UserRow,
  type SyncLogRow,
  type PropertyVisibilityRow,
  type PropertyGroupRow,
  type PriceLabsPropertyRow,
  type BenchmarkPropertyRow,
} from "@/components/settings/settings-client"

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

  const [{ data: settingsData }, { data: usersData }, { data: logData }, { data: propData }, { data: plPropData }, { data: benchPropData }] = await Promise.all([
    admin.from("app_settings").select("key, value"),
    admin.from("profiles").select("id, email, full_name, role, created_at").order("created_at"),
    admin.from("sync_log").select("*").order("created_at", { ascending: false }).limit(10),
    admin.from("properties").select("id, external_name, internal_name, is_active, parent_property_id").order("external_name"),
    (admin as any).from("properties").select("id, external_name, internal_name, pricelabs_listing_id, pricelabs_price_floor").eq("is_active", true).order("external_name"),
    admin.from("properties").select("id, external_name, internal_name, bedrooms, listing_type, benchmark_adr_override, benchmark_occupancy_override").eq("is_active", true).order("external_name"),
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

  const syncLog: SyncLogRow[] = (logData ?? []).map(e => ({
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
    pricelabs_listing_id : string | null
    pricelabs_price_floor: number | null
  }

  const plProperties: PriceLabsPropertyRow[] = ((plPropData ?? []) as RawPlProp[]).map(p => ({
    id                   : p.id,
    name                 : p.internal_name || p.external_name,
    pricelabs_listing_id : p.pricelabs_listing_id ?? null,
    pricelabs_price_floor: p.pricelabs_price_floor != null ? Number(p.pricelabs_price_floor) : null,
  }))

  let hiddenIds: string[] = []
  try {
    const raw = rawSettings.hidden_properties
    if (raw) hiddenIds = JSON.parse(raw)
  } catch { /* malformed JSON — treat as empty */ }

  type RawBenchProp = {
    id                           : string
    external_name                : string
    internal_name                : string | null
    bedrooms                     : number | null
    listing_type                 : string | null
    benchmark_adr_override       : number | null
    benchmark_occupancy_override : number | null
  }

  const marketAdrNum = parseFloat(rawSettings.market_adr ?? "207") || 207
  const marketOccNum = parseFloat(rawSettings.market_occupancy ?? "57") || 57

  const benchmarkProperties: BenchmarkPropertyRow[] = ((benchPropData ?? []) as RawBenchProp[]).map(p => {
    const oAdr = p.benchmark_adr_override != null ? Number(p.benchmark_adr_override) : null
    const oOcc = p.benchmark_occupancy_override != null ? Number(p.benchmark_occupancy_override) : null
    const hasOverride = oAdr != null && oOcc != null && oAdr > 0 && oOcc > 0
    const lt = resolveListingType(p.listing_type, p.external_name)
    const benchmarkLabel = hasOverride
      ? `your target ($${Math.round(oAdr!)} ADR, ${oOcc!}% occ)`
      : `Appleton market ($${Math.round(marketAdrNum)} ADR, ${marketOccNum}% occ)`
    return {
      id                          : p.id,
      name                        : p.internal_name || p.external_name,
      bedrooms                    : p.bedrooms ?? null,
      listing_type                : p.listing_type ?? null,
      benchmark_adr_override      : oAdr,
      benchmark_occupancy_override: oOcc,
      benchmarkLabel,
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
