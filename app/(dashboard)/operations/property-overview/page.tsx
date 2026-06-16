import { AlertTriangle, Users, CheckCircle2, Building2, CalendarDays, Clock } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { MarkCleanButton } from "@/components/operations/mark-clean-button"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type PropertyStatus = "needs_cleaning" | "occupied" | "clean" | "vacant"

type CardData = {
  id             : string
  name           : string
  externalName   : string
  city           : string | null
  state          : string | null
  status         : PropertyStatus
  // Occupied
  currentGuest   : string | null
  currentArrival : string | null
  currentDepart  : string | null
  nightsLeft     : number | null
  // Needs Cleaning
  checkoutHrsAgo : number | null
  lastBookingId  : string | null
  // Next arrival
  nextGuest      : string | null
  nextArrival    : string | null
  daysUntil      : number | null
  nextNights     : number | null
}

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

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<PropertyStatus, number> = {
  needs_cleaning: 0,
  occupied      : 1,
  clean         : 2,
  vacant        : 3,
}

const STATUS_LABEL: Record<PropertyStatus, string> = {
  needs_cleaning: "Needs Cleaning",
  occupied      : "Occupied",
  clean         : "Clean",
  vacant        : "Vacant",
}

const STATUS_COLORS: Record<PropertyStatus, string> = {
  needs_cleaning: "bg-red-500/15    text-red-400    border-red-500/20",
  occupied      : "bg-blue-500/15   text-blue-400   border-blue-500/20",
  clean         : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  vacant        : "bg-muted          text-muted-foreground border-border",
}

const STATUS_CARD_BORDER: Record<PropertyStatus, string> = {
  needs_cleaning: "border-red-500/30",
  occupied      : "border-blue-500/20",
  clean         : "border-emerald-500/20",
  vacant        : "border-border",
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDate(ymd: string) {
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  })
}

function fmtHoursAgo(hrs: number) {
  if (hrs < 1)   return "Less than 1 hour ago"
  if (hrs < 24)  return `${Math.floor(hrs)} hr${Math.floor(hrs) !== 1 ? "s" : ""} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? "s" : ""} ago`
}

// ── Counter card ──────────────────────────────────────────────────────────────

function Counter({
  label, count, icon: Icon, color,
}: {
  label : string
  count : number
  icon  : React.ElementType
  color : string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", color)}>
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{count}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ── Property card ─────────────────────────────────────────────────────────────

function PropertyCard({ card }: { card: CardData }) {
  const { status } = card
  const isNeedsCleaning = status === "needs_cleaning"
  const isOccupied      = status === "occupied"

  return (
    <div className={cn(
      "flex flex-col rounded-xl border bg-card overflow-hidden",
      STATUS_CARD_BORDER[status],
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground leading-tight truncate">{card.name}</p>
          {card.name !== card.externalName && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{card.externalName}</p>
          )}
          {(card.city || card.state) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[card.city, card.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <span className={cn(
          "shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
          STATUS_COLORS[status],
        )}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-border mx-4" />

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">

        {/* Needs Cleaning */}
        {isNeedsCleaning && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <Clock className="size-3.5 shrink-0" />
              <span>Checked out {card.checkoutHrsAgo !== null ? fmtHoursAgo(card.checkoutHrsAgo) : ""}</span>
            </div>
            <MarkCleanButton propertyId={card.id} bookingId={card.lastBookingId} />
          </div>
        )}

        {/* Occupied */}
        {isOccupied && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Users className="size-3.5 shrink-0 text-blue-400" />
              <span className="font-medium text-foreground truncate">
                {card.currentGuest ?? "Guest"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" />
              <span>
                {card.currentArrival && card.currentDepart
                  ? `${fmtDate(card.currentArrival)} – ${fmtDate(card.currentDepart)}`
                  : ""}
                {card.nightsLeft !== null && (
                  <span className="ml-1 text-blue-400">
                    · {card.nightsLeft} {card.nightsLeft === 1 ? "night" : "nights"} left
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Clean / Vacant — spacer so footer stays at bottom */}
        {!isNeedsCleaning && !isOccupied && (
          <div className="flex-1" />
        )}

        {/* Next arrival */}
        {card.nextArrival && (
          <div className={cn(
            "rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1",
          )}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Next Arrival
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate">
                {card.nextGuest ?? "Guest"}
              </p>
              <span className={cn(
                "shrink-0 text-xs font-medium tabular-nums",
                card.daysUntil === 0 ? "text-red-400" :
                card.daysUntil === 1 ? "text-yellow-400" :
                "text-muted-foreground",
              )}>
                {card.daysUntil === 0 ? "Today" :
                 card.daysUntil === 1 ? "Tomorrow" :
                 `In ${card.daysUntil} days`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {card.nextArrival && card.nextNights !== null
                ? `${fmtDate(card.nextArrival)} · ${card.nextNights} ${card.nextNights === 1 ? "night" : "nights"}`
                : ""}
            </p>
          </div>
        )}

        {/* No upcoming */}
        {!card.nextArrival && (
          <p className="text-xs text-muted-foreground">No upcoming reservations</p>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PropertyOverviewPage() {
  const supabase = await createClient()

  const today    = utcToday()
  const todayStr = toYMD(today)

  const [{ data: propData }, { data: bkData }, { data: cleanData }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, external_name, internal_name, city, state")
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
  ])

  const properties = propData   ?? []
  const bookings   = bkData     ?? []
  const cleanings  = cleanData  ?? []

  // Index cleanings by property_id — first entry is most recent (query ordered desc)
  const cleanByProp = new Map<string, (typeof cleanings)[number]>()
  for (const c of [...cleanings].reverse()) {   // reverse so last write wins (most recent)
    cleanByProp.set(c.property_id, c)
  }

  // Compute cards
  const cards: CardData[] = properties.map(p => {
    const pb = bookings.filter(b => b.property_id === p.id)

    // Active booking
    const current = pb.find(b => b.arrival <= todayStr && b.departure > todayStr) ?? null

    // Most recent past departure
    const past = pb
      .filter(b => b.departure <= todayStr)
      .sort((a, b) => b.departure.localeCompare(a.departure))
    const lastBooking = past[0] ?? null

    // Next upcoming arrival
    const future = pb
      .filter(b => b.arrival > todayStr)
      .sort((a, b) => a.arrival.localeCompare(b.arrival))
    const nextBooking = future[0] ?? null

    // Most recent completed cleaning
    const lastClean = cleanByProp.get(p.id) ?? null

    // Status
    let status: PropertyStatus
    if (current) {
      status = "occupied"
    } else if (lastBooking) {
      // 11:00 UTC as a proxy for checkout time (standard STR check-out hour)
      const checkoutAt   = new Date(lastBooking.departure + "T11:00:00Z")
      const hoursAgo     = (today.getTime() - checkoutAt.getTime()) / 3_600_000

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

    const nightsLeft  = current
      ? daysBetween(todayStr, current.departure)
      : null

    const nextNights  = nextBooking
      ? daysBetween(nextBooking.arrival, nextBooking.departure)
      : null

    const daysUntil   = nextBooking ? daysBetween(todayStr, nextBooking.arrival) : null

    const name = p.internal_name || p.external_name

    return {
      id             : p.id,
      name,
      externalName   : p.external_name,
      city           : p.city,
      state          : p.state,
      status,
      currentGuest   : current?.guest_name   ?? null,
      currentArrival : current?.arrival      ?? null,
      currentDepart  : current?.departure    ?? null,
      nightsLeft,
      checkoutHrsAgo : status === "needs_cleaning" ? checkoutHrs : null,
      lastBookingId  : lastBooking?.id ?? null,
      nextGuest      : nextBooking?.guest_name ?? null,
      nextArrival    : nextBooking?.arrival    ?? null,
      daysUntil,
      nextNights,
    }
  })

  // Sort by urgency
  cards.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  // Status counts
  const counts = cards.reduce(
    (acc, c) => { acc[c.status]++; return acc },
    { needs_cleaning: 0, occupied: 0, clean: 0, vacant: 0 } as Record<PropertyStatus, number>,
  )

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Property Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Real-time cleaning status · {properties.length} active {properties.length === 1 ? "property" : "properties"}
        </p>
      </div>

      {/* Status counters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter
          label="Needs Cleaning"
          count={counts.needs_cleaning}
          icon={AlertTriangle}
          color="bg-red-500/15 text-red-400"
        />
        <Counter
          label="Occupied"
          count={counts.occupied}
          icon={Users}
          color="bg-blue-500/15 text-blue-400"
        />
        <Counter
          label="Clean"
          count={counts.clean}
          icon={CheckCircle2}
          color="bg-emerald-500/15 text-emerald-400"
        />
        <Counter
          label="Vacant"
          count={counts.vacant}
          icon={Building2}
          color="bg-muted text-muted-foreground"
        />
      </div>

      {/* Property cards */}
      {cards.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No active properties found</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map(card => (
            <PropertyCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}
