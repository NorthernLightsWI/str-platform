import { redirect } from "next/navigation"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  ProposalsClient,
  type ProposalRow,
} from "@/components/proposals/proposals-client"
import type { ChangeTypeValue } from "@/lib/change-impact"

function parseSetting(raw: unknown): string {
  if (typeof raw === "string") return raw
  if (raw === null || raw === undefined) return ""
  try { return String(JSON.parse(String(raw))) } catch { return String(raw) }
}

export default async function ProposalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/overview")

  const admin = createAdminClient()

  const [{ data: proposalData }, { data: propData }, { data: settingsData }] = await Promise.all([
    (admin as any)
      .from("visible_proposed_changes")
      .select(`
        id, property_id, change_type, label,
        current_value, proposed_value, reason, risk_note,
        status, payload, result, recommendation_id,
        created_at, decided_at, applied_at,
        properties ( internal_name, external_name )
      `)
      .order("created_at", { ascending: false })
      .limit(100),

    (admin as any)
      .from("visible_properties")
      .select("id, external_name, internal_name, parent_property_id")
      .eq("is_active", true)
      .order("external_name"),

    admin.from("app_settings").select("key, value"),
  ])

  const rawSettings: Record<string, string> = {}
  for (const row of settingsData ?? []) {
    rawSettings[row.key] = parseSetting(row.value)
  }
  const writesEnabled = rawSettings.pricelabs_writes_enabled === "true"

  type RawProposal = {
    id               : string
    property_id      : string
    change_type      : string
    label            : string
    current_value    : string | null
    proposed_value   : string | null
    reason           : string | null
    risk_note        : string | null
    status           : string
    payload          : Record<string, unknown> | null
    result           : Record<string, unknown> | null
    recommendation_id: string | null
    created_at       : string
    decided_at       : string | null
    applied_at       : string | null
    properties       : { internal_name: string | null; external_name: string } | null
  }

  const proposals: ProposalRow[] = ((proposalData ?? []) as RawProposal[])
    .map(p => ({
      id               : p.id,
      property_id      : p.property_id,
      property_name    : p.properties
        ? (p.properties.internal_name || p.properties.external_name)
        : "Unknown property",
      change_type      : p.change_type as ChangeTypeValue,
      label            : p.label,
      current_value    : p.current_value,
      proposed_value   : p.proposed_value,
      reason           : p.reason,
      risk_note        : p.risk_note,
      status           : p.status as ProposalRow["status"],
      payload          : p.payload,
      result           : p.result,
      recommendation_id: p.recommendation_id,
      created_at       : p.created_at,
      decided_at       : p.decided_at,
      applied_at       : p.applied_at,
    }))

  const groupsByParent2 = new Map<string, string[]>()
  for (const p of propData ?? []) {
    if ((p as any).parent_property_id) {
      const arr = groupsByParent2.get((p as any).parent_property_id) ?? []
      arr.push(p.id)
      groupsByParent2.set((p as any).parent_property_id, arr)
    }
  }

  const properties = ((propData ?? []) as any[]).map(p => {
    let siblingIds: string[] = []
    if (p.parent_property_id) {
      siblingIds = [p.parent_property_id, ...(groupsByParent2.get(p.parent_property_id) ?? []).filter((id: string) => id !== p.id)]
    } else if (groupsByParent2.has(p.id)) {
      siblingIds = groupsByParent2.get(p.id) ?? []
    }
    return { id: p.id, name: p.internal_name || p.external_name, siblingIds }
  })

  const pendingCount = proposals.filter(p => p.status === "pending" || p.status === "approved").length

  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Proposals</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Proposed listing changes · review, approve, and apply to PriceLabs ·{" "}
          {pendingCount} pending
        </p>
      </div>

      <ProposalsClient
        proposals={proposals}
        properties={properties}
        writesEnabled={writesEnabled}
      />
    </div>
  )
}
