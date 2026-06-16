import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { AlertsClient, type AlertRow } from "@/components/alerts/alerts-client"
import type { AlertType } from "@/app/actions/alerts"
import type { Json } from "@/types/database"

function emailFromChannels(channels: Json): string {
  if (channels && typeof channels === "object" && !Array.isArray(channels)) {
    const email = (channels as Record<string, Json>).email
    if (typeof email === "string") return email
  }
  return ""
}

export default async function AlertsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/overview")

  const admin = createAdminClient()
  const { data } = await admin
    .from("alert_settings")
    .select("id, alert_type, threshold, channels, is_enabled, created_at")
    .order("created_at", { ascending: false })

  const alerts: AlertRow[] = (data ?? []).map(r => ({
    id        : r.id,
    type      : r.alert_type as AlertType,
    threshold : r.threshold ?? null,
    email     : emailFromChannels(r.channels),
    enabled   : r.is_enabled,
    created_at: r.created_at,
  }))

  return (
    <div className="p-6 space-y-5 max-w-[900px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Alerts</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure email notification rules for key portfolio metrics.
        </p>
      </div>

      <AlertsClient initialAlerts={alerts} />
    </div>
  )
}
