import { notFound } from "next/navigation"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeHealthScore, type HealthInput } from "@/lib/health-score"
import { getMarketDefaults, aggregateBookings, computeBenchmark, type PropertyMeta } from "@/lib/benchmarks"
import {
  PropertyDetailClient,
  type PropertyDetail,
  type RevenueData,
  type RecItem,
  type BookingItem,
  type TaskItem,
  type SiblingItem,
  type RecentChangeItem,
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

  const comp90Start = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)

  const [
    { data: property },
    { data: bkData },
    { data: reviewData },
    { data: cleaningData },
    { data: maintData },
    { data: recData },
    { data: recentBkData },
    { data: taskData },
    { data: changeData },
    { data: allPropsData },
    { data: comp90Data },
    { data: propGroupsData },
  ] = await Promise.all([
    (admin as any)
      .from("visible_properties")
      .select("id, external_name, internal_name, city, state, bedrooms, bathrooms, max_guests, is_active, thumbnail_url, address, parent_property_id, listing_type, benchmark_adr_override, benchmark_occupancy_override")
      .eq("id", id)
      .single(),

    (supabase as any)
      .from("visible_bookings")
      .select("property_id, arrival, departure, total_amount, status")
      .eq("property_id", id)
      .neq("is_block", true)
      .neq("status", "cancelled")
      .gte("arrival", toYMD(year1Start)),

    (admin as any)
      .from("visible_reviews")
      .select("overall_rating")
      .eq("property_id", id),

    (admin as any)
      .from("visible_cleaning_records")
      .select("property_id")
      .eq("property_id", id)
      .eq("status", "completed")
      .gte("scheduled_date", toYMD(day60Start))
      .limit(1),

    (admin as any)
      .from("visible_maintenance_issues")
      .select("id, priority, status")
      .eq("property_id", id)
      .in("status", ["open", "in_progress"])
      .in("priority", ["high", "urgent"]),

    adminAny
      .from("visible_recommendations")
      .select("id, title, body, priority, category, impact_statement")
      .eq("property_id", id)
      .eq("is_dismissed", false)
      .eq("is_completed", false)
      .order("created_at", { ascending: false })
      .limit(5),

    (supabase as any)
      .from("visible_bookings")
      .select("id, guest_name, arrival, departure, total_amount, listing_site, status")
      .eq("property_id", id)
      .neq("is_block", true)
      .order("arrival", { ascending: false })
      .limit(10),

    adminAny
      .from("visible_tasks")
      .select("id, title, description, priority, status, estimated_revenue_impact, due_date, recommendation_id, created_at")
      .eq("property_id", id)
      .order("created_at", { ascending: false }),

    adminAny
      .from("visible_listing_changes")
      .select("id, change_type, label, before_value, after_value, applied_at, status")
      .eq("property_id", id)
      .order("applied_at", { ascending: false })
      .limit(10),

    (admin as any)
      .from("visible_properties")
      .select("id, external_name, internal_name, bedrooms, listing_type, benchmark_adr_override, benchmark_occupancy_override")
      .eq("is_active", true),

    (admin as any)
      .from("visible_bookings")
      .select("property_id, arrival, departure, net_revenue, total_amount")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("arrival", comp90Start)
      .lt("arrival", toYMD(today)),

    (admin as any)
      .from("visible_properties")
      .select("id, parent_property_id")
      .eq("is_active", true),
  ])

  if (!property) notFound()

  // ── Siblings (other listings in the same group) ───────────────────────────

  let siblings: SiblingItem[] = []
  const rootId = property.parent_property_id ?? property.id

  // Fetch all properties that share this root (parent or children of the same parent)
  const { data: relatedData } = await (admin as any)
    .from("visible_properties")
    .select("id, external_name, internal_name")
    .or(`id.eq.${rootId},parent_property_id.eq.${rootId}`)

  if (relatedData && relatedData.length > 1) {
    siblings = relatedData
      .filter((r: any) => r.id !== id)
      .map((r: any) => ({ id: r.id, name: r.internal_name || r.external_name }))
  }

  // ── Benchmark computation ─────────────────────────────────────────────────

  const { marketAdr, marketOcc } = await getMarketDefaults(admin)

  const propertyMeta: PropertyMeta = {
    id                           : property.id,
    external_name                : property.external_name,
    internal_name                : property.internal_name ?? null,
    bedrooms                     : property.bedrooms,
    listing_type                 : (property as any).listing_type ?? null,
    benchmark_adr_override       : (property as any).benchmark_adr_override ?? null,
    benchmark_occupancy_override : (property as any).benchmark_occupancy_override ?? null,
  }

  const allPropsMeta = (allPropsData ?? []) as PropertyMeta[]
  const aggBookings90 = aggregateBookings(comp90Data ?? [])

  // Build hiddenIds from prop groups fetch (we re-use the sibling exclusion approach)
  const propGroupsSiblings = new Set<string>()
  const groupsByParent90 = new Map<string, string[]>()
  for (const p of propGroupsData ?? []) {
    if (p.parent_property_id) {
      const arr = groupsByParent90.get(p.parent_property_id) ?? []
      arr.push(p.id)
      groupsByParent90.set(p.parent_property_id, arr)
    }
  }
  for (const [parentId, children] of groupsByParent90) {
    const allGroupMembers = [parentId, ...children]
    if (allGroupMembers.includes(id)) {
      allGroupMembers.filter(c => c !== id).forEach(c => propGroupsSiblings.add(c))
    }
  }

  const hiddenIdSet = new Set<string>()

  const bench = computeBenchmark({
    property     : propertyMeta,
    allProperties: allPropsMeta,
    aggBookings  : aggBookings90,
    hiddenIds    : hiddenIdSet,
    siblingIds   : propGroupsSiblings,
    marketAdr,
    marketOcc,
  })

  // ── Health score ──────────────────────────────────────────────────────────

  const nights12m = (bkData ?? []).reduce((s: number, b: any) => {
    const a = new Date(b.arrival   + "T00:00:00Z")
    const d = new Date(b.departure + "T00:00:00Z")
    return s + Math.max(0, (d.getTime() - a.getTime()) / 86_400_000)
  }, 0)
  const rev12m  = (bkData ?? []).reduce((s: number, b: any) => s + Number(b.total_amount ?? 0), 0)
  const occ12m  = nights12m > 0 ? Math.min(100, (nights12m / 365) * 100) : 0
  const adr12m  = nights12m > 0 ? rev12m / nights12m : 0
  const revpar  = rev12m / 365

  const allReviews  = reviewData ?? []
  const ratings     = allReviews
    .map((r: any) => r.overall_rating != null ? Number(r.overall_rating) : null)
    .filter((n: number | null): n is number => n !== null && isFinite(n) && n > 0)
  const avgRating   = ratings.length > 0 ? ratings.reduce((s: number, n: number) => s + n, 0) / ratings.length : 0
  const reviewCount = allReviews.length   // count all reviews, not just those with a rating

  const input: HealthInput = {
    occupancy12m          : occ12m,
    adr12m                : adr12m,
    reviewCount,
    avgRating,
    hasRecentCleaning     : (cleaningData ?? []).length > 0,
    openHighPriorityIssues: (maintData ?? []).length,
    marketOcc             : bench.occupancy,
    marketAdr             : bench.adr,
  }
  const hs = computeHealthScore(input)

  // ── Revenue opportunity ───────────────────────────────────────────────────

  const potentialRevPAR    = (bench.occupancy / 100) * bench.adr
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
    benchmarkLabel    : bench.sourceLabel,
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

  const recentBookings: BookingItem[] = (recentBkData ?? []).map((b: any) => ({
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

  const recentChanges: RecentChangeItem[] = ((changeData ?? []) as any[]).map((c: any) => ({
    id          : c.id,
    change_type : c.change_type,
    label       : c.label,
    before_value: c.before_value,
    after_value : c.after_value,
    applied_at  : c.applied_at,
    status      : c.status,
  }))

  return (
    <PropertyDetailClient
      property={propertyDetail}
      healthScore={hs}
      revenueData={revenueData}
      recommendations={recs}
      recentBookings={recentBookings}
      tasks={tasks}
      siblings={siblings}
      recentChanges={recentChanges}
    />
  )
}
