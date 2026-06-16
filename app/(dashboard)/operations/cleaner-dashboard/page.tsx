import { createClient } from "@/lib/supabase/server"
import {
  DashboardClient,
  type CleaningTask,
} from "@/components/operations/cleaner-dashboard/dashboard-client"

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

// Monday of the current week
function weekStart(d: Date) {
  const day = d.getUTCDay()           // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CleanerDashboardPage() {
  const supabase = await createClient()

  const today      = utcToday()
  const todayStr   = toYMD(today)
  const wkStart    = weekStart(today)
  const moStart    = monthStart(today)

  const [{ data: propData }, { data: bkData }, { data: cleanData }, { data: inProgressData }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, external_name, internal_name, city, state")
        .eq("is_active", true)
        .order("external_name"),

      // Covers: checkouts since start of month + next 60 days of arrivals
      supabase
        .from("bookings")
        .select("id, property_id, arrival, departure, guest_name, status")
        .neq("is_block", true)
        .neq("status", "cancelled")
        .gte("departure", toYMD(moStart))
        .lte("arrival",   toYMD(addDays(today, 60))),

      // Completed cleanings since start of month (to check "already cleaned")
      supabase
        .from("cleaning_records")
        .select("id, property_id, scheduled_date, completed_at, status")
        .eq("status", "completed")
        .gte("scheduled_date", toYMD(moStart))
        .order("completed_at", { ascending: false }),

      // In-progress records (carry notes forward into the card)
      supabase
        .from("cleaning_records")
        .select("id, property_id, notes")
        .eq("status", "in_progress")
        .gte("scheduled_date", toYMD(addDays(today, -7))),
    ])

  const properties = propData      ?? []
  const bookings   = bkData        ?? []
  const cleanings  = cleanData     ?? []
  const inProgress = inProgressData ?? []

  // Index cleanings (most-recent first — query was ordered desc)
  const cleanedProp = new Map<string, (typeof cleanings)[number]>()
  for (const c of [...cleanings].reverse()) cleanedProp.set(c.property_id, c)

  // Index in-progress records by property
  const inProgProp = new Map<string, (typeof inProgress)[number]>()
  for (const r of inProgress) inProgProp.set(r.property_id, r)

  const tasks: CleaningTask[] = []

  for (const p of properties) {
    const pb = bookings.filter(b => b.property_id === p.id)

    // Past bookings sorted by departure desc
    const past = pb
      .filter(b => b.departure <= todayStr)
      .sort((a, b) => b.departure.localeCompare(a.departure))
    const lastBooking = past[0] ?? null

    if (!lastBooking) continue  // no past booking → skip

    // Check if already cleaned after last checkout
    const lastClean = cleanedProp.get(p.id)
    if (lastClean) {
      const cleanedAt = lastClean.completed_at ?? (lastClean.scheduled_date + "T23:59:59Z")
      const checkoutAt = lastBooking.departure + "T11:00:00Z"
      if (cleanedAt > checkoutAt) continue  // already cleaned → skip
    }

    // Determine period bucket
    const dep = lastBooking.departure
    let departurePeriod: CleaningTask["departurePeriod"]
    if (dep === todayStr)                       departurePeriod = "today"
    else if (dep >= toYMD(wkStart))             departurePeriod = "this_week"
    else                                         departurePeriod = "this_month"

    // Next upcoming arrival
    const future = pb
      .filter(b => b.arrival > todayStr)
      .sort((a, b) => a.arrival.localeCompare(b.arrival))
    const nextBooking = future[0] ?? null

    // Check-in target: arrival date at 16:00 UTC (standard 4pm check-in)
    const nextCheckinISO = nextBooking
      ? nextBooking.arrival + "T16:00:00Z"
      : null

    const inProg = inProgProp.get(p.id) ?? null

    tasks.push({
      propertyId      : p.id,
      propertyName    : p.internal_name || p.external_name,
      city            : p.city,
      state           : p.state,
      lastGuestName   : lastBooking.guest_name ?? null,
      departureDate   : lastBooking.departure,
      nextGuestName   : nextBooking?.guest_name ?? null,
      nextArrivalDate : nextBooking?.arrival    ?? null,
      nextCheckinISO,
      lastBookingId   : lastBooking.id,
      existingRecordId: inProg?.id    ?? null,
      existingNotes   : inProg?.notes ?? null,
      departurePeriod,
    })
  }

  // Sort: tasks with soonest next arrival first (no arrival → end)
  tasks.sort((a, b) => {
    if (a.nextCheckinISO && b.nextCheckinISO) return a.nextCheckinISO.localeCompare(b.nextCheckinISO)
    if (a.nextCheckinISO) return -1
    if (b.nextCheckinISO) return  1
    return a.propertyName.localeCompare(b.propertyName)
  })

  const totalNeeding = tasks.length

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Cleaner Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {totalNeeding} {totalNeeding === 1 ? "property needs" : "properties need"} cleaning this month
        </p>
      </div>

      <DashboardClient tasks={tasks} />
    </div>
  )
}
