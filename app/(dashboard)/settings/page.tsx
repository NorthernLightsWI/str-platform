import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  SettingsClient,
  type SettingsData,
  type UserRow,
  type SyncLogRow,
  type PropertyVisibilityRow,
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

  const [{ data: settingsData }, { data: usersData }, { data: logData }, { data: propData }] = await Promise.all([
    admin.from("app_settings").select("key, value"),
    admin.from("profiles").select("id, email, full_name, role, created_at").order("created_at"),
    admin.from("sync_log").select("*").order("created_at", { ascending: false }).limit(10),
    admin.from("properties").select("id, external_name, internal_name, is_active").order("external_name"),
  ])

  const rawSettings: Record<string, string> = {}
  for (const row of settingsData ?? []) {
    rawSettings[row.key] = parseSettingValue(row.value)
  }

  const settings: SettingsData = {
    ownerrez_email     : rawSettings.ownerrez_email     ?? "",
    ownerrez_api_token : rawSettings.ownerrez_api_token ?? "",
    pricelabs_api_key  : rawSettings.pricelabs_api_key  ?? "",
    report_email       : rawSettings.report_email       ?? "",
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

  let hiddenIds: string[] = []
  try {
    const raw = rawSettings.hidden_properties
    if (raw) hiddenIds = JSON.parse(raw)
  } catch { /* malformed JSON — treat as empty */ }

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
      />
    </div>
  )
}
