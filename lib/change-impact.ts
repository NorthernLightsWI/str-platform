// Pure functions for computing before/after impact of listing changes.
// No framework imports — safe to call from server actions and API routes.

import { buildPropertyGroups } from "@/lib/property-groups"
import { nightsInWindow } from "@/lib/metrics"

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeTypeValue =
  | "price_base" | "price_min" | "price_override" | "min_stay"
  | "title" | "description" | "photos" | "amenity" | "other"

export const CHANGE_TYPE_LABELS: Record<ChangeTypeValue, string> = {
  price_base     : "Base Price",
  price_min      : "Min Price",
  price_override : "Price Override",
  min_stay       : "Min Stay",
  title          : "Title",
  description    : "Description",
  photos         : "Photos",
  amenity        : "Amenity",
  other          : "Other",
}

export const CHANGE_TYPES: ChangeTypeValue[] = [
  "price_base","price_min","price_override","min_stay",
  "title","description","photos","amenity","other",
]

// Change types that cannot be applied via the PriceLabs API — must be logged manually
export const MANUAL_ONLY_CHANGE_TYPES: ReadonlySet<ChangeTypeValue> = new Set([
  "min_stay",
  "price_override",
])

export type ListingChange = {
  id               : string
  property_id      : string
  change_type      : ChangeTypeValue
  label            : string
  before_value     : string | null
  after_value      : string | null
  reason           : string | null
  recommendation_id: string | null
  source           : string
  applied_at       : string   // YYYY-MM-DD
  applied_by       : string | null
  status           : string
  reverted_at      : string | null
  notes            : string | null
  created_at       : string
}

export type ImpactBooking = {
  property_id  : string
  arrival      : string        // YYYY-MM-DD
  departure    : string        // YYYY-MM-DD
  total_amount : number | null
  net_revenue  : number | null
  booked_at    : string | null // ISO timestamp or null
}

export type WindowMetrics = {
  occupancyPct  : number
  adr           : number
  revpar        : number
  bookingsMade  : number    // bookings with booked_at in window
  bookingCount  : number    // bookings with any nights in window
  nightsBooked  : number
  revenue       : number
  windowDays    : number
}

export type WeeklyPoint = {
  weekLabel     : string    // "W-4", "W-3", ..., "W0", "W+1", ...
  weekStart     : string    // YYYY-MM-DD
  propOcc       : number    // 0–100
  propAdr       : number
  ctrlOcc       : number
  ctrlAdr       : number
  isChangeWeek  : boolean
}

export type ImpactResult = {
  windowDays           : number
  elapsedDays          : number
  daysProgress         : string
  before               : WindowMetrics
  after                : WindowMetrics
  controlBefore        : WindowMetrics
  controlAfter         : WindowMetrics
  revparLift           : number    // relative lift in percentage points
  occupancyLift        : number
  adrLift              : number
  verdict              : "too_early" | "improving" | "flat" | "worse"
  lowConfidence        : boolean
  lowConfidenceReason  : string | null
  weeklyData           : WeeklyPoint[]
  controlPropertyCount : number
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateToMs(ymd: string): number {
  return new Date(ymd + "T00:00:00Z").getTime()
}

function msToYMD(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function revenueOf(b: ImpactBooking): number {
  return Number(b.net_revenue ?? b.total_amount ?? 0)
}

// ── Metrics for a single property in a window ─────────────────────────────────

function computePropertyMetrics(
  bookings    : ImpactBooking[],
  propertyId  : string,
  windowStart : string,  // YYYY-MM-DD inclusive
  windowEnd   : string,  // YYYY-MM-DD inclusive
  windowDays  : number,
): WindowMetrics {
  const wsMs = dateToMs(windowStart)
  const weMs = dateToMs(windowEnd) + DAY_MS  // exclusive upper bound

  let nightsBooked = 0
  let revenue      = 0
  let bookingsMade = 0
  let bookingCount = 0

  for (const b of bookings) {
    if (b.property_id !== propertyId) continue

    // Use nightsInWindow for window-overlap clipping (today-cap never fires for past windows)
    const nights = nightsInWindow(b, windowStart, windowEnd)

    if (nights > 0) {
      const aMs         = dateToMs(b.arrival)
      const dMs         = dateToMs(b.departure)
      const totalNights = Math.max(1, (dMs - aMs) / DAY_MS)
      nightsBooked += nights
      revenue      += (nights / totalNights) * revenueOf(b)
      bookingCount++
    }

    // Bookings made (booked_at) during this window
    if (b.booked_at) {
      const bookedMs = new Date(b.booked_at).getTime()
      if (bookedMs >= wsMs && bookedMs < weMs) bookingsMade++
    }
  }

  return {
    occupancyPct : windowDays > 0 ? (nightsBooked / windowDays) * 100 : 0,
    adr          : nightsBooked > 0 ? revenue / nightsBooked : 0,
    revpar       : windowDays > 0 ? revenue / windowDays : 0,
    bookingsMade,
    bookingCount,
    nightsBooked : Math.round(nightsBooked * 10) / 10,
    revenue      : Math.round(revenue * 100) / 100,
    windowDays,
  }
}

// ── Pooled metrics for a set of control properties ────────────────────────────

function computeControlMetrics(
  bookings     : ImpactBooking[],
  controlIds   : string[],
  windowStart  : string,
  windowEnd    : string,
  windowDays   : number,
): WindowMetrics {
  if (controlIds.length === 0) {
    return { occupancyPct: 0, adr: 0, revpar: 0, bookingsMade: 0, bookingCount: 0, nightsBooked: 0, revenue: 0, windowDays }
  }

  let totalNightsBooked = 0
  let totalRevenue      = 0
  let totalBookingsMade = 0
  let totalBookingCount = 0

  for (const pid of controlIds) {
    const m = computePropertyMetrics(bookings, pid, windowStart, windowEnd, windowDays)
    totalNightsBooked += m.nightsBooked
    totalRevenue      += m.revenue
    totalBookingsMade += m.bookingsMade
    totalBookingCount += m.bookingCount
  }

  const totalWindowDays = windowDays * controlIds.length

  return {
    occupancyPct : totalWindowDays > 0 ? (totalNightsBooked / totalWindowDays) * 100 : 0,
    adr          : totalNightsBooked > 0 ? totalRevenue / totalNightsBooked : 0,
    revpar       : totalWindowDays > 0 ? totalRevenue / totalWindowDays : 0,
    bookingsMade : totalBookingsMade,
    bookingCount : totalBookingCount,
    nightsBooked : Math.round(totalNightsBooked * 10) / 10,
    revenue      : Math.round(totalRevenue * 100) / 100,
    windowDays,
  }
}

// ── Weekly chart data ─────────────────────────────────────────────────────────

function computeWeeklyData(
  bookings    : ImpactBooking[],
  propertyId  : string,
  controlIds  : string[],
  appliedAt   : string,   // YYYY-MM-DD
  windowDays  : number,
  today       : string,
): WeeklyPoint[] {
  const appliedMs = dateToMs(appliedAt)
  const todayMs   = dateToMs(today) + DAY_MS  // exclusive
  const weeksBack = Math.ceil(windowDays / 7)
  const weeksFwd  = Math.min(Math.ceil(windowDays / 7), Math.ceil((todayMs - appliedMs) / (7 * DAY_MS)))

  const points: WeeklyPoint[] = []

  for (let w = -weeksBack; w <= weeksFwd; w++) {
    const ws = msToYMD(appliedMs + w * 7 * DAY_MS)
    const we = msToYMD(appliedMs + (w + 1) * 7 * DAY_MS - DAY_MS)

    // Don't render future weeks
    if (dateToMs(ws) >= todayMs) break

    const actualWeEnd = dateToMs(we) + DAY_MS > todayMs ? msToYMD(todayMs - DAY_MS) : we
    const days = Math.max(1, (Math.min(dateToMs(actualWeEnd) + DAY_MS, todayMs) - dateToMs(ws)) / DAY_MS)

    const prop = computePropertyMetrics(bookings, propertyId, ws, actualWeEnd, days)
    const ctrl = computeControlMetrics(bookings, controlIds, ws, actualWeEnd, days)

    points.push({
      weekLabel    : w === 0 ? "W0" : w > 0 ? `W+${w}` : `W${w}`,
      weekStart    : ws,
      propOcc      : Math.round(prop.occupancyPct * 10) / 10,
      propAdr      : Math.round(prop.adr * 100) / 100,
      ctrlOcc      : Math.round(ctrl.occupancyPct * 10) / 10,
      ctrlAdr      : Math.round(ctrl.adr * 100) / 100,
      isChangeWeek : w === 0,
    })
  }

  return points
}

// ── Main compute function ─────────────────────────────────────────────────────

export function computeImpact(params: {
  change       : ListingChange
  allBookings  : ImpactBooking[]
  allProperties: Array<{ id: string; parent_property_id?: string | null }>
  allChanges   : ListingChange[]
  hiddenIds    : Set<string>
  windowDays  ?: number    // 30 or 60, default 30
  today       ?: string    // YYYY-MM-DD, default current date
}): ImpactResult {
  const {
    change,
    allBookings,
    allProperties,
    allChanges,
    hiddenIds,
    windowDays = 30,
    today      = new Date().toISOString().slice(0, 10),
  } = params

  const appliedMs = dateToMs(change.applied_at)
  const todayMs   = dateToMs(today)

  // ── Windows ────────────────────────────────────────────────────────────────

  const beforeStart = msToYMD(appliedMs - windowDays * DAY_MS)
  const beforeEnd   = msToYMD(appliedMs - DAY_MS)

  const elapsedDays = Math.max(0, Math.min(windowDays, Math.floor((todayMs - appliedMs) / DAY_MS)))
  const afterStart  = change.applied_at
  const afterEnd    = elapsedDays > 0
    ? msToYMD(appliedMs + elapsedDays * DAY_MS - DAY_MS)
    : change.applied_at
  const afterDays   = Math.max(1, elapsedDays)

  // ── Property metrics ───────────────────────────────────────────────────────

  const before = computePropertyMetrics(allBookings, change.property_id, beforeStart, beforeEnd, windowDays)
  const after  = computePropertyMetrics(allBookings, change.property_id, afterStart, afterEnd, afterDays)

  // ── Control group ──────────────────────────────────────────────────────────

  // Siblings: other IDs in the same property group
  const groups    = buildPropertyGroups(allProperties)
  const siblingIds = new Set<string>()
  for (const g of groups) {
    if (g.allIds.includes(change.property_id)) {
      g.allIds.forEach(id => { if (id !== change.property_id) siblingIds.add(id) })
    }
  }

  // Properties with any active change in [beforeStart, today]
  const contaminatedIds = new Set(
    allChanges
      .filter(c =>
        c.id !== change.id &&
        c.status === "active" &&
        c.applied_at >= beforeStart &&
        c.applied_at <= today,
      )
      .map(c => c.property_id),
  )

  const controlIds = allProperties
    .filter(p =>
      p.id !== change.property_id &&
      !siblingIds.has(p.id) &&
      !hiddenIds.has(p.id) &&
      !contaminatedIds.has(p.id),
    )
    .map(p => p.id)

  const controlBefore = computeControlMetrics(allBookings, controlIds, beforeStart, beforeEnd, windowDays)
  const controlAfter  = computeControlMetrics(allBookings, controlIds, afterStart, afterEnd, afterDays)

  // ── Relative lift ──────────────────────────────────────────────────────────

  function pctChange(b: number, a: number): number {
    if (b === 0) return 0
    return (a - b) / b * 100
  }

  const revparLift    = pctChange(before.revpar,       after.revpar)
                      - pctChange(controlBefore.revpar, controlAfter.revpar)
  const occupancyLift = pctChange(before.occupancyPct,       after.occupancyPct)
                      - pctChange(controlBefore.occupancyPct, controlAfter.occupancyPct)
  const adrLift       = pctChange(before.adr,       after.adr)
                      - pctChange(controlBefore.adr, controlAfter.adr)

  // ── Verdict ────────────────────────────────────────────────────────────────

  let verdict: ImpactResult["verdict"]
  if (elapsedDays < 14) {
    verdict = "too_early"
  } else if (revparLift > 10) {
    verdict = "improving"
  } else if (revparLift < -10) {
    verdict = "worse"
  } else {
    verdict = "flat"
  }

  // ── Low confidence ─────────────────────────────────────────────────────────

  let lowConfidence      = false
  let lowConfidenceReason: string | null = null

  if (before.bookingCount < 3 || (elapsedDays >= 14 && after.bookingCount < 3)) {
    lowConfidence      = true
    lowConfidenceReason = "Fewer than 3 bookings in one window — results may not be reliable"
  }

  const confounded = allChanges.some(c =>
    c.id !== change.id &&
    c.property_id === change.property_id &&
    c.status === "active" &&
    c.applied_at >= beforeStart &&
    c.applied_at <= today,
  )
  if (confounded) {
    lowConfidence      = true
    lowConfidenceReason = "Another change on this property overlaps the measurement window"
  }

  // ── Weekly data ────────────────────────────────────────────────────────────

  const weeklyData = computeWeeklyData(
    allBookings, change.property_id, controlIds, change.applied_at, windowDays, today,
  )

  return {
    windowDays,
    elapsedDays,
    daysProgress         : `Day ${elapsedDays} of ${windowDays}`,
    before,
    after,
    controlBefore,
    controlAfter,
    revparLift           : Math.round(revparLift * 10) / 10,
    occupancyLift        : Math.round(occupancyLift * 10) / 10,
    adrLift              : Math.round(adrLift * 10) / 10,
    verdict,
    lowConfidence,
    lowConfidenceReason,
    weeklyData,
    controlPropertyCount : controlIds.length,
  }
}

// ── Guess change type from recommendation category ────────────────────────────

export function guessChangeTypeFromCategory(category: string): ChangeTypeValue {
  switch (category) {
    case "pricing"        : return "price_base"
    case "occupancy"      : return "min_stay"
    case "listing_quality": return "description"
    default               : return "other"
  }
}
