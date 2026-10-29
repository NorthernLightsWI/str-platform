import { createAdminClient } from "@/lib/supabase/admin"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import {
  CalendarClient,
  type CalBooking,
  type CalProperty,
} from "@/components/calendar/calendar-client"

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const { m } = await searchParams

  const now   = new Date()
  let year    = now.getUTCFullYear()
  let month   = now.getUTCMonth() + 1  // 1-based

  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number)
    if (y >= 2020 && y <= 2040 && mo >= 1 && mo <= 12) {
      year  = y
      month = mo
    }
  }

  // Fetch ±7 days around the month so partial weeks are included
  const wStart = new Date(Date.UTC(year, month - 1, 1))
  wStart.setUTCDate(wStart.getUTCDate() - 7)
  const wEnd = new Date(Date.UTC(year, month, 0))   // last day of month
  wEnd.setUTCDate(wEnd.getUTCDate() + 7)
  const wsStr = wStart.toISOString().slice(0, 10)
  const weStr = wEnd.toISOString().slice(0, 10)

  const admin = createAdminClient()

  const [{ data: bkData }, { data: propData }, hiddenIds] = await Promise.all([
    admin
      .from("bookings")
      .select("id, property_id, guest_name, arrival, departure, total_amount, listing_site")
      .neq("is_block", true)
      .neq("status", "cancelled")
      .lte("arrival",   weStr)
      .gte("departure", wsStr),

    admin
      .from("properties")
      .select("id, internal_name, external_name")
      .eq("is_active", true)
      .order("external_name"),

    getHiddenPropertyIds(),
  ])

  const properties: CalProperty[] = (propData ?? [])
    .filter(p => !hiddenIds.has(p.id))
    .map(p => ({ id: p.id, name: p.internal_name || p.external_name }))

  const propIdSet = new Set(properties.map(p => p.id))

  const bookings: CalBooking[] = (bkData ?? [])
    .filter(b => !hiddenIds.has(b.property_id) && propIdSet.has(b.property_id))
    .map(b => ({
      id           : b.id,
      property_id  : b.property_id,
      guest_name   : b.guest_name   ?? null,
      arrival      : b.arrival,
      departure    : b.departure,
      total_amount : b.total_amount ?? null,
      listing_site : b.listing_site ?? null,
    }))

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendar</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Monthly booking calendar across all active properties.
        </p>
      </div>

      <CalendarClient
        year={year}
        month={month}
        bookings={bookings}
        properties={properties}
      />
    </div>
  )
}
