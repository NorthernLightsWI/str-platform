import { redirect } from "next/navigation"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import {
  ChangesClient,
  type ChangeRow,
} from "@/components/changes/changes-client"
import type { ChangeTypeValue } from "@/lib/change-impact"

export default async function ChangesPage() {
  // Auth: admin only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") redirect("/overview")

  const admin    = createAdminClient()
  const hiddenIds = await getHiddenPropertyIds()

  const [{ data: changeData }, { data: propData }] = await Promise.all([
    (admin as any)
      .from("listing_changes")
      .select(`
        id, property_id, change_type, label, before_value, after_value,
        reason, recommendation_id, source, applied_at, status, reverted_at,
        notes, created_at,
        properties(internal_name, external_name)
      `)
      .order("applied_at", { ascending: false }),

    admin
      .from("properties")
      .select("id, external_name, internal_name")
      .order("external_name"),
  ])

  type RawChange = {
    id               : string
    property_id      : string
    change_type      : string
    label            : string
    before_value     : string | null
    after_value      : string | null
    reason           : string | null
    recommendation_id: string | null
    source           : string
    applied_at       : string
    status           : string
    reverted_at      : string | null
    notes            : string | null
    created_at       : string
    properties       : { internal_name: string | null; external_name: string } | null
  }

  const changes: ChangeRow[] = ((changeData ?? []) as unknown as RawChange[])
    .filter(c => !hiddenIds.has(c.property_id))
    .map(c => ({
      id               : c.id,
      property_id      : c.property_id,
      property_name    : c.properties
        ? (c.properties.internal_name || c.properties.external_name)
        : "Unknown",
      change_type      : c.change_type as ChangeTypeValue,
      label            : c.label,
      before_value     : c.before_value,
      after_value      : c.after_value,
      reason           : c.reason,
      recommendation_id: c.recommendation_id,
      source           : c.source,
      applied_at       : c.applied_at,
      status           : c.status,
      reverted_at      : c.reverted_at,
      notes            : c.notes,
      created_at       : c.created_at,
    }))

  const properties = (propData ?? [])
    .filter(p => !hiddenIds.has(p.id))
    .map(p => ({ id: p.id, name: p.internal_name || p.external_name }))

  const activeCount = changes.filter(c => c.status === "active").length

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Change Tracker</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Log listing changes and measure whether they helped ·{" "}
          {activeCount} active change{activeCount !== 1 ? "s" : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Verdicts require at least 14 days of post-change data and are noisy with small booking samples.
          Relative lift compares your property to a control group of unmodified properties.
        </p>
      </div>

      <ChangesClient initialChanges={changes} properties={properties} />
    </div>
  )
}
