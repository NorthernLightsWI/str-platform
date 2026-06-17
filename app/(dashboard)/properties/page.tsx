import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PropertiesTable, type PropertyRow } from "@/components/properties/properties-table"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import { computeHealthScore, type HealthInput } from "@/lib/health-score"

// ── Date helpers ──────────────────────────────────────────────────────────────

function utcToday() {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}
function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000)
}
function toYMD(d: Date) { return d.toISOString().slice(0, 10) }

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PropertiesPage() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const today      = utcToday()
  const cmStart    = monthStart(today)
  const cmEnd      = addDays(today, 1)
  const cmDays     = (cmEnd.getTime() - cmStart.getTime()) / 86_400_000
  const year1Start = addDays(today, -365)
  const day60Start = addDays(today, -60)

  const [
    { data: propData },
    { data: bkData },
    { data: reviewData },
    { data: cleaningData },
    { data: maintData },
    hiddenIds,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, external_name, internal_name, city, state, bedrooms, bathrooms, max_guests, is_active")
      .order("external_name"),

    // Trailing 12 months — used for both MTD metrics and health score
    supabase
      .from("bookings")
      .select("property_id, arrival, departure, total_amount, status")
      .neq("is_block", true)
      .neq("status", "cancelled")
      .gte("arrival", toYMD(year1Start)),

    admin
      .from("reviews")
      .select("property_id, overall_rating"),

    admin
      .from("cleaning_records")
      .select("property_id, status, scheduled_date")
      .gte("scheduled_date", toYMD(day60Start))
      .eq("status", "completed"),

    admin
      .from("maintenance_issues")
      .select("property_id, priority, status")
      .in("status", ["open", "in_progress"])
      .in("priority", ["high", "urgent"]),

    getHiddenPropertyIds(),
  ])

  const properties = (propData ?? []).filter(p => !hiddenIds.has(p.id))
  const bookings   = bkData ?? []

  // ── Pre-aggregate health score inputs ─────────────────────────────────────

  // Reviews: avg rating + count per property
  const reviewMap = new Map<string, { total: number; count: number }>()
  for (const r of (reviewData ?? [])) {
    if (!r.property_id || r.overall_rating == null) continue
    const cur = reviewMap.get(r.property_id) ?? { total: 0, count: 0 }
    reviewMap.set(r.property_id, { total: cur.total + Number(r.overall_rating), count: cur.count + 1 })
  }

  // Cleaning: set of property IDs that have a recent completed clean
  const recentCleanSet = new Set((cleaningData ?? []).map(c => c.property_id))

  // Maintenance: high/urgent open count per property
  const maintCountMap = new Map<string, number>()
  for (const m of (maintData ?? [])) {
    if (!m.property_id) continue
    maintCountMap.set(m.property_id, (maintCountMap.get(m.property_id) ?? 0) + 1)
  }

  // ── Build rows ────────────────────────────────────────────────────────────

  const rows: PropertyRow[] = properties.map(p => {
    const pb = bookings.filter(b => b.property_id === p.id)

    // MTD subset
    const pbMTD = pb.filter(b => {
      const a = new Date(b.arrival + "T00:00:00Z")
      return a >= cmStart && a < cmEnd
    })

    // MTD metrics
    const mtdRevenue   = pbMTD.reduce((s, b) => s + Number(b.total_amount ?? 0), 0)
    const mtdNights    = pbMTD.reduce((s, b) => {
      const a = new Date(b.arrival   + "T00:00:00Z")
      const d = new Date(b.departure + "T00:00:00Z")
      return s + Math.max(0, (d.getTime() - a.getTime()) / 86_400_000)
    }, 0)
    const mtdOccupancy = cmDays > 0 ? Math.min(100, (mtdNights / cmDays) * 100) : 0
    const mtdAdr       = mtdNights > 0 ? mtdRevenue / mtdNights : 0

    // Trailing 12m metrics for health score
    const rev12m    = pb.reduce((s, b) => s + Number(b.total_amount ?? 0), 0)
    const nights12m = pb.reduce((s, b) => {
      const a = new Date(b.arrival   + "T00:00:00Z")
      const d = new Date(b.departure + "T00:00:00Z")
      return s + Math.max(0, (d.getTime() - a.getTime()) / 86_400_000)
    }, 0)
    const occ12m = nights12m > 0 ? Math.min(100, (nights12m / 365) * 100) : 0
    const adr12m = nights12m > 0 ? rev12m / nights12m : 0

    // Health score
    const rws = reviewMap.get(p.id)
    const input: HealthInput = {
      occupancy12m          : occ12m,
      adr12m                : adr12m,
      reviewCount           : rws?.count ?? 0,
      avgRating             : rws ? rws.total / rws.count : 0,
      hasRecentCleaning     : recentCleanSet.has(p.id),
      openHighPriorityIssues: maintCountMap.get(p.id) ?? 0,
    }
    const hs = computeHealthScore(input)

    return {
      id           : p.id,
      external_name: p.external_name,
      internal_name: p.internal_name,
      city         : p.city,
      state        : p.state,
      bedrooms     : p.bedrooms,
      bathrooms    : p.bathrooms,
      max_guests   : p.max_guests,
      is_active    : p.is_active,
      mtdRevenue   : Math.round(mtdRevenue),
      mtdOccupancy : +mtdOccupancy.toFixed(2),
      mtdAdr       : Math.round(mtdAdr),
      healthScore  : hs.total,
    }
  })

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Properties</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {properties.length} {properties.length === 1 ? "property" : "properties"} visible
          {hiddenIds.size > 0 && ` · ${hiddenIds.size} hidden`}
          {" · MTD metrics through today"}
        </p>
      </div>

      <PropertiesTable rows={rows} />
    </div>
  )
}
