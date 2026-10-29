import { createClient }      from "@/lib/supabase/server"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import { buildPropertyGroups, childIdSet } from "@/lib/property-groups"
import {
  PropertyOverviewClient,
  type CardData,
  type PropertyStatus,
  STATUS_ORDER,
} from "@/components/operations/property-overview/property-overview-client"

// ── Date helpers ──────────────────────────────────────────────────────────────

function utcToday() {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000)
}

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86_400_000,
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PropertyOverviewPage() {
  const supabase = await createClient()

  const today    = utcToday()
  const todayStr = toYMD(today)

  const [{ data: propData }, { data: bkData }, { data: cleanData }, hiddenIds] = await Promise.all([
    supabase
      .from("properties")
      .select("id, external_name, internal_name, city, state, parent_property_id")
      .eq("is_active", true)
      .order("external_name"),

    supabase
      .from("bookings")
      .select("id, property_id, arrival, departure, guest_name, status")
      .neq("is_block", true)
      .neq("status", "cancelled")
      // Covers: active bookings, recent checkouts (48h), next 60 days of arrivals
      .gte("departure", toYMD(addDays(today, -3)))
      .lte("arrival",   toYMD(addDays(today, 60))),

    supabase
      .from("cleaning_records")
      .select("id, property_id, booking_id, scheduled_date, completed_at, status")
      .eq("status", "completed")
      .gte("scheduled_date", toYMD(addDays(today, -90)))
      .order("completed_at", { ascending: false }),

    getHiddenPropertyIds(),
  ])

  const properties = (propData ?? []).filter(p => !hiddenIds.has(p.id))
  const bookings   = bkData    ?? []
  const cleanings  = cleanData ?? []

  // Index cleanings by property_id — last write wins (most recent)
  const cleanByProp = new Map<string, (typeof cleanings)[number]>()
  for (const c of [...cleanings].reverse()) {
    cleanByProp.set(c.property_id, c)
  }

  // Build groups so children can be merged into parent cards
  const groups   = buildPropertyGroups(properties)
  const childIds = childIdSet(groups)

  // Compute status for a single property ID
  function computeStatus(
    propId: string,
  ): {
    status        : PropertyStatus
    current       : (typeof bookings)[number] | null
    lastBooking   : (typeof bookings)[number] | null
    nextBooking   : (typeof bookings)[number] | null
    checkoutHrs   : number | null
  } {
    const pb = bookings.filter(b => b.property_id === propId)

    const current = pb.find(b => b.arrival <= todayStr && b.departure > todayStr) ?? null

    const past = pb
      .filter(b => b.departure <= todayStr)
      .sort((a, b) => b.departure.localeCompare(a.departure))
    const lastBooking = past[0] ?? null

    const future = pb
      .filter(b => b.arrival > todayStr)
      .sort((a, b) => a.arrival.localeCompare(b.arrival))
    const nextBooking = future[0] ?? null

    const lastClean = cleanByProp.get(propId) ?? null

    let status: PropertyStatus
    if (current) {
      status = "occupied"
    } else if (lastBooking) {
      const checkoutAt = new Date(lastBooking.departure + "T11:00:00Z")
      const hoursAgo   = (today.getTime() - checkoutAt.getTime()) / 3_600_000

      if (hoursAgo <= 48) {
        const wasCleanedAfter = lastClean &&
          (lastClean.completed_at ?? lastClean.scheduled_date + "T23:59:59Z") > checkoutAt.toISOString()
        status = wasCleanedAfter ? "clean" : "needs_cleaning"
      } else {
        const wasCleanedAfter = lastClean && lastClean.scheduled_date >= lastBooking.departure
        status = wasCleanedAfter ? "clean" : "vacant"
      }
    } else {
      status = lastClean ? "clean" : "vacant"
    }

    const checkoutAt  = lastBooking ? new Date(lastBooking.departure + "T11:00:00Z") : null
    const checkoutHrs = checkoutAt ? (today.getTime() - checkoutAt.getTime()) / 3_600_000 : null

    return { status, current, lastBooking, nextBooking, checkoutHrs }
  }

  // Compute cards — skip children (they're merged into parent cards)
  const cards: CardData[] = properties
    .filter(p => !childIds.has(p.id))
    .map(p => {
      const group      = groups.find(g => g.parent.id === p.id)
      const memberIds  = group ? group.allIds : [p.id]
      const listingCnt = memberIds.length

      // Compute status for each member; take the worst across all
      const memberStates = memberIds.map(id => computeStatus(id))

      // Worst-status wins: needs_cleaning > occupied > clean > vacant
      const worstState = memberStates.reduce((best, cur) =>
        STATUS_ORDER[cur.status] < STATUS_ORDER[best.status] ? cur : best
      )

      const { status, current, lastBooking, nextBooking, checkoutHrs } = worstState

      return {
        id             : p.id,
        name           : p.internal_name || p.external_name,
        externalName   : p.external_name,
        city           : p.city,
        state          : p.state,
        status,
        listingCount   : listingCnt > 1 ? listingCnt : null,
        currentGuest   : current?.guest_name   ?? null,
        currentArrival : current?.arrival      ?? null,
        currentDepart  : current?.departure    ?? null,
        nightsLeft     : current ? daysBetween(todayStr, current.departure) : null,
        checkoutHrsAgo : status === "needs_cleaning" ? checkoutHrs : null,
        lastBookingId  : lastBooking?.id ?? null,
        nextGuest      : nextBooking?.guest_name ?? null,
        nextArrival    : nextBooking?.arrival    ?? null,
        daysUntil      : nextBooking ? daysBetween(todayStr, nextBooking.arrival) : null,
        nextNights     : nextBooking ? daysBetween(nextBooking.arrival, nextBooking.departure) : null,
      }
    })

  cards.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const counts = cards.reduce(
    (acc, c) => { acc[c.status]++; return acc },
    { needs_cleaning: 0, occupied: 0, clean: 0, vacant: 0 } as Record<PropertyStatus, number>,
  )

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Property Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Real-time cleaning status · {properties.length} active{" "}
          {properties.length === 1 ? "property" : "properties"}
        </p>
      </div>

      <PropertyOverviewClient cards={cards} counts={counts} />
    </div>
  )
}
