// Shared occupancy and ADR functions — window-overlap clipping throughout.
// Every surface should use these instead of arrival-based attribution.

export type MetricBooking = {
  property_id  : string
  arrival      : string        // YYYY-MM-DD
  departure    : string        // YYYY-MM-DD
  total_amount?: number | null
  net_revenue ?: number | null
}

const DAY_MS = 86_400_000

function dateToMs(ymd: string): number {
  return new Date(ymd + "T00:00:00Z").getTime()
}

function revenueOf(b: Pick<MetricBooking, "total_amount" | "net_revenue">): number {
  return Number(b.net_revenue ?? b.total_amount ?? 0)
}

// Nights of a booking that fall within [windowStart, windowEnd] and not past today.
// Departure is treated as exclusive (checkout = last night already spent).
export function nightsInWindow(
  booking    : Pick<MetricBooking, "arrival" | "departure">,
  windowStart: string,  // YYYY-MM-DD inclusive
  windowEnd  : string,  // YYYY-MM-DD inclusive
  today     ?: string,  // cap; defaults to current date
): number {
  const todayStr = today ?? new Date().toISOString().slice(0, 10)
  const aMs  = dateToMs(booking.arrival)
  const dMs  = dateToMs(booking.departure)   // exclusive (checkout day)
  const wsMs = dateToMs(windowStart)
  const weMs = dateToMs(windowEnd) + DAY_MS  // make exclusive
  const capMs = dateToMs(todayStr) + DAY_MS  // cap at end of today (don't count future nights)

  const start = Math.max(aMs, wsMs)
  const end   = Math.min(dMs, weMs, capMs)
  return Math.max(0, (end - start) / DAY_MS)
}

// Occupancy for a set of properties (or a single property) over a window.
// Uses a Set of day timestamps to union booked nights across group members,
// so overlapping sibling bookings are only counted once.
// physicalUnits = number of independent bookable units (1 for per-property, N for portfolio).
export function occupancyInWindow(
  bookings      : MetricBooking[],
  memberIds     : string[],
  windowStart   : string,
  windowEnd     : string,
  physicalUnits : number,
  today        ?: string,
): number {
  const todayStr = today ?? new Date().toISOString().slice(0, 10)
  const wsMs   = dateToMs(windowStart)
  const weMs   = dateToMs(windowEnd) + DAY_MS
  const capMs  = dateToMs(todayStr) + DAY_MS
  const memberSet = new Set(memberIds)

  const bookedDays = new Set<number>()
  for (const b of bookings) {
    if (!memberSet.has(b.property_id)) continue
    const aMs = dateToMs(b.arrival)
    const dMs = dateToMs(b.departure)
    const start = Math.max(aMs, wsMs)
    const end   = Math.min(dMs, weMs, capMs)
    for (let d = start; d < end; d += DAY_MS) bookedDays.add(d)
  }

  const windowDays = (Math.min(weMs, capMs) - wsMs) / DAY_MS
  if (windowDays <= 0 || physicalUnits <= 0) return 0
  return Math.min(100, (bookedDays.size / (windowDays * physicalUnits)) * 100)
}

// ADR for a set of properties over a window.
// Revenue is prorated to the window (nights_in_window / total_nights × full_revenue).
export function adrInWindow(
  bookings   : MetricBooking[],
  memberIds  : string[],
  windowStart: string,
  windowEnd  : string,
  today     ?: string,
): number {
  const memberSet = new Set(memberIds)
  let totalRevenue = 0
  let totalNights  = 0

  for (const b of bookings) {
    if (!memberSet.has(b.property_id)) continue
    const nights = nightsInWindow(b, windowStart, windowEnd, today)
    if (nights <= 0) continue
    const fullNights = Math.max(1, (dateToMs(b.departure) - dateToMs(b.arrival)) / DAY_MS)
    totalRevenue += (nights / fullNights) * revenueOf(b)
    totalNights  += nights
  }

  return totalNights > 0 ? totalRevenue / totalNights : 0
}

// Revenue allocated to a window (same proration as ADR numerator).
export function revenueInWindow(
  bookings   : MetricBooking[],
  memberIds  : string[],
  windowStart: string,
  windowEnd  : string,
  today     ?: string,
): number {
  const memberSet = new Set(memberIds)
  let total = 0

  for (const b of bookings) {
    if (!memberSet.has(b.property_id)) continue
    const nights = nightsInWindow(b, windowStart, windowEnd, today)
    if (nights <= 0) continue
    const fullNights = Math.max(1, (dateToMs(b.departure) - dateToMs(b.arrival)) / DAY_MS)
    total += (nights / fullNights) * revenueOf(b)
  }

  return total
}
