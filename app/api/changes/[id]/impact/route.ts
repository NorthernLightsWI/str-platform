import { NextRequest, NextResponse } from "next/server"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { computeImpact, type ImpactBooking, type ListingChange } from "@/lib/change-impact"

export async function GET(
  req     : NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth: admin only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  // Parse windowDays query param
  const url        = new URL(req.url)
  const windowDays = parseInt(url.searchParams.get("w") ?? "30", 10) === 60 ? 60 : 30

  const admin = createAdminClient()

  // Fetch the change
  const { data: change, error: changeErr } = await (admin as any)
    .from("visible_listing_changes")
    .select("*")
    .eq("id", id)
    .single()

  if (changeErr || !change) return NextResponse.json({ error: "Change not found" }, { status: 404 })

  const lc = change as ListingChange
  const today = new Date().toISOString().slice(0, 10)

  // Date range: appliedAt - windowDays to today
  const rangeStart = new Date(new Date(lc.applied_at + "T00:00:00Z").getTime() - windowDays * 86_400_000)
    .toISOString().slice(0, 10)

  // Fetch all required data in parallel
  const [
    { data: bookingData },
    { data: allChangesData },
    { data: propertiesData },
  ] = await Promise.all([
    (admin as any)
      .from("visible_bookings")
      .select("property_id, arrival, departure, total_amount, net_revenue, booked_at")
      .neq("is_block", true)
      .neq("status", "cancelled")
      .gte("arrival", rangeStart),

    (admin as any)
      .from("visible_listing_changes")
      .select("id, property_id, applied_at, status")
      .eq("status", "active"),

    (admin as any)
      .from("visible_properties")
      .select("id, parent_property_id")
      .eq("is_active", true),
  ])

  const allBookings: ImpactBooking[] = (bookingData ?? []).map((b: any) => ({
    property_id  : b.property_id,
    arrival      : b.arrival,
    departure    : b.departure,
    total_amount : b.total_amount != null ? Number(b.total_amount) : null,
    net_revenue  : b.net_revenue  != null ? Number(b.net_revenue)  : null,
    booked_at    : b.booked_at,
  }))

  const allChanges: ListingChange[] = (allChangesData ?? []) as ListingChange[]

  const result = computeImpact({
    change       : lc,
    allBookings,
    allProperties: propertiesData ?? [],
    allChanges,
    hiddenIds    : new Set<string>(),
    windowDays,
    today,
  })

  return NextResponse.json(result)
}
