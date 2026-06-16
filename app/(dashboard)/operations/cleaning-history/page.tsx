import { createClient } from "@/lib/supabase/server"
import { HistoryTable, type HistoryRow } from "@/components/operations/cleaning-history/history-table"

export default async function CleaningHistoryPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from("cleaning_records")
    .select(`
      id,
      scheduled_date,
      completed_at,
      status,
      duration_minutes,
      notes,
      properties ( external_name, internal_name ),
      profiles   ( full_name )
    `)
    .order("scheduled_date", { ascending: false })
    .limit(500)

  type RawRow = NonNullable<typeof data>[number] & {
    properties : { external_name: string; internal_name: string | null } | null
    profiles   : { full_name: string | null } | null
  }

  const rows: HistoryRow[] = ((data ?? []) as RawRow[]).map(r => ({
    id              : r.id,
    scheduled_date  : r.scheduled_date,
    completed_at    : r.completed_at,
    status          : r.status,
    duration_minutes: r.duration_minutes,
    notes           : r.notes,
    property_name   : r.properties
      ? (r.properties.internal_name || r.properties.external_name)
      : "Unknown property",
    cleaner_name    : r.profiles?.full_name ?? null,
  }))

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cleaning History</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {rows.length} record{rows.length !== 1 ? "s" : ""} · most recent first
        </p>
      </div>

      <HistoryTable rows={rows} />
    </div>
  )
}
