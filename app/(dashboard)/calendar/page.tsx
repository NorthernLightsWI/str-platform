import { createAdminClient } from "@/lib/supabase/admin"
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

  const [{ data: bkData }, { data: propData }] = await Promise.all([
    (admin as any)
      .from("visible_bookings")
      .select("id, property_id, guest_name, arrival, departure, total_amount, listing_site")
      .neq("is_block", true)
      .neq("status", "cancelled")
      .lte("arrival",   weStr)
      .gte("departure", wsStr),

    (admin as any)
      .from("visible_properties")
      .select("id, internal_name, external_name")
      .order("external_name"),
  ])

  const properties: CalProperty[] = (propData ?? [])
    .map((p: any) => ({ id: p.id, name: p.internal_name || p.external_name }))

  const propIdSet = new Set(properties.map(p => p.id))

  const bookings: CalBooking[] = (bkData ?? [])
    .filter((b: any) => propIdSet.has(b.property_id))
    .map((b: any) => ({
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
          Monthly booking calendar across all properties.
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
