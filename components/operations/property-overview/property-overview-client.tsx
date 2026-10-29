"use client"

import { useState } from "react"
import {
  AlertTriangle, Users, CheckCircle2, Building2,
  CalendarDays, Clock,
} from "lucide-react"
import { MarkCleanButton } from "@/components/operations/mark-clean-button"
import { cn } from "@/lib/utils"

// ── Types (exported so page.tsx can use them) ─────────────────────────────────

export type PropertyStatus = "needs_cleaning" | "occupied" | "clean" | "vacant"

export type CardData = {
  id             : string
  name           : string
  externalName   : string
  city           : string | null
  state          : string | null
  status         : PropertyStatus
  listingCount   : number | null  // >1 when this card represents a grouped unit
  currentGuest   : string | null
  currentArrival : string | null
  currentDepart  : string | null
  nightsLeft     : number | null
  checkoutHrsAgo : number | null
  lastBookingId  : string | null
  nextGuest      : string | null
  nextArrival    : string | null
  daysUntil      : number | null
  nextNights     : number | null
}

export const STATUS_ORDER: Record<PropertyStatus, number> = {
  needs_cleaning: 0,
  occupied      : 1,
  clean         : 2,
  vacant        : 3,
}

// ── Display constants ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PropertyStatus, string> = {
  needs_cleaning: "Needs Cleaning",
  occupied      : "Occupied",
  clean         : "Clean",
  vacant        : "Vacant",
}

const STATUS_COLORS: Record<PropertyStatus, string> = {
  needs_cleaning: "bg-red-500/15     text-red-400           border-red-500/20",
  occupied      : "bg-blue-500/15    text-blue-400          border-blue-500/20",
  clean         : "bg-emerald-500/15 text-emerald-400       border-emerald-500/20",
  vacant        : "bg-muted          text-muted-foreground  border-border",
}

const STATUS_CARD_BORDER: Record<PropertyStatus, string> = {
  needs_cleaning: "border-red-500/30",
  occupied      : "border-blue-500/20",
  clean         : "border-emerald-500/20",
  vacant        : "border-border",
}

const COUNTER_CONFIG: Record<PropertyStatus, { icon: React.ElementType; iconColor: string }> = {
  needs_cleaning: { icon: AlertTriangle, iconColor: "bg-red-500/15 text-red-400"           },
  occupied      : { icon: Users,         iconColor: "bg-blue-500/15 text-blue-400"          },
  clean         : { icon: CheckCircle2,  iconColor: "bg-emerald-500/15 text-emerald-400"    },
  vacant        : { icon: Building2,     iconColor: "bg-muted text-muted-foreground"        },
}

const FILTER_ORDER: PropertyStatus[] = ["needs_cleaning", "occupied", "clean", "vacant"]

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtDate(ymd: string) {
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  })
}

function fmtHoursAgo(hrs: number) {
  if (hrs < 1)  return "Less than 1 hour ago"
  if (hrs < 24) return `${Math.floor(hrs)} hr${Math.floor(hrs) !== 1 ? "s" : ""} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? "s" : ""} ago`
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
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-foreground leading-tight truncate">{card.name}</p>
            {card.listingCount && (
              <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {card.listingCount} listings
              </span>
            )}
          </div>
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

      <div className="h-px bg-border mx-4" />

      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {isNeedsCleaning && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <Clock className="size-3.5 shrink-0" />
              <span>Checked out {card.checkoutHrsAgo !== null ? fmtHoursAgo(card.checkoutHrsAgo) : ""}</span>
            </div>
            <MarkCleanButton propertyId={card.id} bookingId={card.lastBookingId} />
          </div>
        )}

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

        {!isNeedsCleaning && !isOccupied && <div className="flex-1" />}

        {card.nextArrival && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Next Arrival
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate">
                {card.nextGuest ?? "Guest"}
              </p>
              <span className={cn(
                "shrink-0 text-xs font-medium tabular-nums",
                card.daysUntil === 0 ? "text-red-400"    :
                card.daysUntil === 1 ? "text-yellow-400" :
                "text-muted-foreground",
              )}>
                {card.daysUntil === 0 ? "Today"       :
                 card.daysUntil === 1 ? "Tomorrow"    :
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

        {!card.nextArrival && (
          <p className="text-xs text-muted-foreground">No upcoming reservations</p>
        )}
      </div>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function PropertyOverviewClient({
  cards,
  counts,
}: {
  cards  : CardData[]
  counts : Record<PropertyStatus, number>
}) {
  const [activeFilter, setActiveFilter] = useState<PropertyStatus | null>(null)

  const filtered = activeFilter ? cards.filter(c => c.status === activeFilter) : cards

  return (
    <div className="space-y-6">

      {/* Clickable status filter cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FILTER_ORDER.map(status => {
          const { icon: Icon, iconColor } = COUNTER_CONFIG[status]
          const isActive = activeFilter === status
          return (
            <button
              key={status}
              onClick={() => setActiveFilter(isActive ? null : status)}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card px-5 py-4 text-left",
                "cursor-pointer transition-colors",
                "hover:border-[#E88159]/60",
                isActive
                  ? "border-[#E88159] bg-[#E88159]/10"
                  : "border-border",
              )}
            >
              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", iconColor)}>
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight text-foreground">{counts[status]}</p>
                <p className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Property grid */}
      {cards.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No active properties found</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">
          No properties with status "{STATUS_LABEL[activeFilter!]}"
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map(card => (
            <PropertyCard key={card.id} card={card} />
          ))}
        </div>
      )}

      {/* Filter count / clear */}
      {activeFilter && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {cards.length}{" "}
          {cards.length === 1 ? "property" : "properties"}
          {" · "}
          <button
            onClick={() => setActiveFilter(null)}
            className="text-[#E88159] hover:underline"
          >
            Clear filter
          </button>
        </p>
      )}

    </div>
  )
}
