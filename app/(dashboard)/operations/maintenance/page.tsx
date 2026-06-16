import { createAdminClient } from "@/lib/supabase/admin"
import { MaintenanceClient } from "@/components/operations/maintenance/maintenance-client"
import type { IssueData } from "@/components/operations/maintenance/issue-card"

export default async function MaintenancePage() {
  const admin = createAdminClient()

  const [{ data: issueData }, { data: propData }] = await Promise.all([
    admin
      .from("maintenance_issues")
      .select(`
        id, title, description, category, priority, status,
        notes, reporter_name, created_at, resolved_at,
        properties(external_name, internal_name)
      `)
      .order("created_at", { ascending: false }),

    admin
      .from("properties")
      .select("id, external_name, internal_name")
      .eq("is_active", true)
      .order("external_name"),
  ])

  type RawIssue = {
    id            : string
    title         : string
    description   : string | null
    category      : string | null
    priority      : string | null
    status        : string
    notes         : string | null
    reporter_name : string | null
    created_at    : string
    resolved_at   : string | null
    properties    : { external_name: string; internal_name: string | null } | null
  }

  const issues: IssueData[] = ((issueData ?? []) as unknown as RawIssue[]).map(r => ({
    id            : r.id,
    title         : r.title,
    description   : r.description,
    category      : r.category,
    priority      : r.priority ?? "low",
    status        : r.status,
    notes         : r.notes,
    created_at    : r.created_at,
    resolved_at   : r.resolved_at,
    property_name : r.properties
      ? (r.properties.internal_name || r.properties.external_name)
      : "Unknown property",
    reporter_name : r.reporter_name ?? null,
  }))

  const properties = (propData ?? []).map(p => ({
    id  : p.id,
    name: p.internal_name || p.external_name,
  }))

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Maintenance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {issues.filter(i => i.status === "open" || i.status === "in_progress").length} active issue
          {issues.filter(i => i.status === "open" || i.status === "in_progress").length !== 1 ? "s" : ""}
          {" "}· {issues.length} total logged
        </p>
      </div>

      <MaintenanceClient issues={issues} properties={properties} />
    </div>
  )
}
