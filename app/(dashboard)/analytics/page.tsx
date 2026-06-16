import { createAdminClient } from "@/lib/supabase/admin"
import {
  AnalyticsClient,
  type BookingRaw,
  type PropertyRaw,
} from "@/components/analytics/analytics-client"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"

export default async function AnalyticsPage() {
  const admin = createAdminClient()

  // Fetch 13 months so the client can satisfy any tab (3 / 6 / 12 months).
  // Use departure >= cutoff so bookings that started before the window but
  // had nights inside it are included for occupancy calculations.
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 13)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const [{ data: bookingData }, { data: propData }, hiddenIds] = await Promise.all([
    admin
      .from("bookings")
      .select("arrival, departure, total_amount, net_revenue, listing_site, property_id")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("departure", cutoffStr)
      .order("arrival"),

    admin
      .from("properties")
      .select("id, internal_name, external_name")
      .eq("is_active", true),

    getHiddenPropertyIds(),
  ])

  const bookings: BookingRaw[] = (bookingData ?? [])
    .filter(b => !hiddenIds.has(b.property_id))
    .map(b => ({
      arrival      : b.arrival,
      departure    : b.departure,
      total_amount : b.total_amount,
      net_revenue  : b.net_revenue,
      listing_site : b.listing_site,
      property_id  : b.property_id,
    }))

  const properties: PropertyRaw[] = (propData ?? [])
    .filter(p => !hiddenIds.has(p.id))
    .map(p => ({
      id  : p.id,
      name: p.internal_name || p.external_name,
    }))

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Portfolio-level performance metrics and trends.
        </p>
      </div>

      <AnalyticsClient bookings={bookings} properties={properties} />
    </div>
  )
}
