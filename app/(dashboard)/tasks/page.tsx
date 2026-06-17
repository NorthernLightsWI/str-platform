import { createAdminClient } from "@/lib/supabase/admin"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import { TasksClient, type TaskRow } from "@/components/tasks/tasks-client"

export default async function TasksPage() {
  const admin = createAdminClient() as any

  const [{ data }, hiddenIds] = await Promise.all([
    admin
      .from("tasks")
      .select(`
        id, property_id, title, description,
        priority, status,
        estimated_revenue_impact, due_date,
        recommendation_id, created_at,
        properties(internal_name, external_name)
      `)
      .order("created_at", { ascending: false }),

    getHiddenPropertyIds(),
  ])

  type RawTask = {
    id                      : string
    property_id             : string
    title                   : string
    description             : string | null
    priority                : string
    status                  : string
    estimated_revenue_impact: number | null
    due_date                : string | null
    recommendation_id       : string | null
    created_at              : string
    properties              : { internal_name: string | null; external_name: string } | null
  }

  const tasks: TaskRow[] = ((data ?? []) as RawTask[])
    .filter(t => !hiddenIds.has(t.property_id))
    .map(t => ({
      id                      : t.id,
      property_id             : t.property_id,
      property_name           : t.properties
        ? (t.properties.internal_name || t.properties.external_name)
        : "Unknown property",
      title                   : t.title,
      description             : t.description,
      priority                : t.priority,
      status                  : t.status,
      estimated_revenue_impact: t.estimated_revenue_impact,
      due_date                : t.due_date,
      recommendation_id       : t.recommendation_id,
      created_at              : t.created_at,
    }))

  const openCount = tasks.filter(t => t.status !== "completed").length

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tasks</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Action items across your portfolio ·{" "}
          {openCount} open task{openCount !== 1 ? "s" : ""}
        </p>
      </div>

      <TasksClient tasks={tasks} />
    </div>
  )
}
