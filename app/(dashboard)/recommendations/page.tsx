import { createAdminClient } from "@/lib/supabase/admin"
import {
  RecommendationsClient,
  type RecommendationData,
} from "@/components/recommendations/recommendations-client"

export default async function RecommendationsPage() {
  const admin = createAdminClient()

  const { data } = await admin
    .from("recommendations")
    .select(`
      id, property_id, title, body, priority, category,
      impact_statement, action_steps,
      is_dismissed, is_completed, created_at,
      properties(internal_name, external_name)
    `)
    .order("created_at", { ascending: false })

  type RawRec = NonNullable<typeof data>[number] & {
    properties: { internal_name: string | null; external_name: string } | null
  }

  const recs: RecommendationData[] = ((data ?? []) as RawRec[]).map(r => ({
    id               : r.id,
    property_id      : r.property_id,
    property_name    : r.properties
      ? (r.properties.internal_name || r.properties.external_name)
      : "Unknown property",
    title            : r.title,
    body             : r.body,
    priority         : r.priority,
    category         : r.category,
    impact_statement : (r as any).impact_statement ?? null,
    action_steps     : (r as any).action_steps ?? null,
    is_dismissed     : r.is_dismissed,
    is_completed     : (r as any).is_completed ?? false,
    created_at       : r.created_at,
  }))

  const activeCount = recs.filter(r => !r.is_dismissed && !r.is_completed).length

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Recommendations</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          AI-generated insights for your portfolio ·{" "}
          {activeCount} active recommendation{activeCount !== 1 ? "s" : ""}
        </p>
      </div>

      <RecommendationsClient recs={recs} />
    </div>
  )
}
