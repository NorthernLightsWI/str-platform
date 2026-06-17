import { notFound } from "next/navigation"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeHealthScore, MARKET_OCC, MARKET_ADR, MARKET_REVPAR, type HealthInput } from "@/lib/health-score"
import {
  PropertyDetailClient,
  type PropertyDetail,
  type RevenueData,
  type RecItem,
  type BookingItem,
  type TaskItem,
} from "@/components/properties/property-detail-client"

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000)
}
function toYMD(d: Date) { return d.toISOString().slice(0, 10) }

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const admin    = createAdminClient()
  const adminAny = admin as any

  const today      = new Date()
  const year1Start = addDays(today, -365)
  const day60Start = addDays(today, -60)

  const [
    { data: property },
    { data: bkData },
    { data: reviewData },
    { data: cleaningData },
    { data: maintData },
    { data: recData },
    { data: recentBkData },
    { data: taskData },
  ] = await Promise.all([
    admin
      .from("properties")
      .select("id, external_name, internal_name, city, state, bedrooms, bathrooms, max_guests, is_active, thumbnail_url, address")
      .eq("id", id)
      .single(),

    supabase
      .from("bookings")
      .select("property_id, arrival, departure, total_amount, status")
      .eq("property_id", id)
      .neq("is_block", true)
      .neq("status", "cancelled")
      .gte("arrival", toYMD(year1Start)),

    admin
      .from("reviews")
      .select("overall_rating")
      .eq("property_id", id),

    admin
      .from("cleaning_records")
      .select("property_id")
      .eq("property_id", id)
      .eq("status", "completed")
      .gte("scheduled_date", toYMD(day60Start))
      .limit(1),

    admin
      .from("maintenance_issues")
      .select("id, priority, status")
      .eq("property_id", id)
      .in("status", ["open", "in_progress"])
      .in("priority", ["high", "urgent"]),

    adminAny
      .from("recommendations")
      .select("id, title, body, priority, category, impact_statement")
      .eq("property_id", id)
      .eq("is_dismissed", false)
      .eq("is_completed", false)
      .order("created_at", { ascending: false })
      .limit(5),

    supabase
      .from("bookings")
      .select("id, guest_name, arrival, departure, total_amount, listing_site, status")
      .eq("property_id", id)
      .neq("is_block", true)
      .order("arrival", { ascending: false })
      .limit(10),

    adminAny
      .from("tasks")
      .select("id, title, description, priority, status, estimated_revenue_impact, due_date, recommendation_id, created_at")
      .eq("property_id", id)
      .order("created_at", { ascending: false }),
  ])

  if (!property) notFound()

  // ── Health score ──────────────────────────────────────────────────────────

  const nights12m = (bkData ?? []).reduce((s, b) => {
    const a = new Date(b.arrival   + "T00:00:00Z")
    const d = new Date(b.departure + "T00:00:00Z")
    return s + Math.max(0, (d.getTime() - a.getTime()) / 86_400_000)
  }, 0)
  const rev12m  = (bkData ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0)
  const occ12m  = nights12m > 0 ? Math.min(100, (nights12m / 365) * 100) : 0
  const adr12m  = nights12m > 0 ? rev12m / nights12m : 0
  const revpar  = rev12m / 365

  const ratings     = (reviewData ?? []).map(r => Number(r.overall_rating)).filter(n => isFinite(n) && n > 0)
  const avgRating   = ratings.length > 0 ? ratings.reduce((s, n) => s + n, 0) / ratings.length : 0
  const reviewCount = ratings.length

  const input: HealthInput = {
    occupancy12m          : occ12m,
    adr12m                : adr12m,
    reviewCount,
    avgRating,
    hasRecentCleaning     : (cleaningData ?? []).length > 0,
    openHighPriorityIssues: (maintData ?? []).length,
  }
  const hs = computeHealthScore(input)

  // ── Revenue opportunity ───────────────────────────────────────────────────

  const potentialRevPAR    = (MARKET_OCC / 100) * MARKET_ADR   // ~$118/night
  const potentialAnnual    = potentialRevPAR * 365
  const currentAnnual      = rev12m
  const annualOpportunity  = Math.max(0, potentialAnnual - currentAnnual)

  const revenueData: RevenueData = {
    current12mRevenue : Math.round(currentAnnual),
    currentRevPAR     : +revpar.toFixed(2),
    occupancy12m      : +occ12m.toFixed(1),
    adr12m            : +adr12m.toFixed(2),
    potentialRevPAR   : +potentialRevPAR.toFixed(2),
    potentialAnnual   : Math.round(potentialAnnual),
    annualOpportunity : Math.round(annualOpportunity),
  }

  // ── Shape data for client ─────────────────────────────────────────────────

  const propertyDetail: PropertyDetail = {
    id           : property.id,
    name         : property.internal_name || property.external_name,
    externalName : property.external_name,
    city         : property.city ?? null,
    state        : property.state ?? null,
    bedrooms     : property.bedrooms ?? null,
    bathrooms    : property.bathrooms != null ? Number(property.bathrooms) : null,
    max_guests   : property.max_guests ?? null,
    is_active    : property.is_active,
    thumbnail_url: property.thumbnail_url ?? null,
    address      : property.address ?? null,
  }

  const recs: RecItem[] = ((recData ?? []) as any[]).map((r: any) => ({
    id              : r.id,
    title           : r.title,
    body            : r.body,
    priority        : r.priority,
    category        : r.category,
    impact_statement: r.impact_statement,
  }))

  const recentBookings: BookingItem[] = (recentBkData ?? []).map(b => ({
    id          : b.id,
    guest_name  : b.guest_name,
    arrival     : b.arrival,
    departure   : b.departure,
    total_amount: b.total_amount != null ? Number(b.total_amount) : null,
    listing_site: b.listing_site,
    status      : b.status,
  }))

  const tasks: TaskItem[] = ((taskData ?? []) as any[]).map((t: any) => ({
    id                      : t.id,
    title                   : t.title,
    description             : t.description,
    priority                : t.priority,
    status                  : t.status,
    estimated_revenue_impact: t.estimated_revenue_impact != null ? Number(t.estimated_revenue_impact) : null,
    due_date                : t.due_date,
    recommendation_id       : t.recommendation_id,
    created_at              : t.created_at,
  }))

  return (
    <PropertyDetailClient
      property={propertyDetail}
      healthScore={hs}
      revenueData={revenueData}
      recommendations={recs}
      recentBookings={recentBookings}
      tasks={tasks}
    />
  )
}
