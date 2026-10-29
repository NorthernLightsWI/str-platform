"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Filter, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type CalBooking = {
  id           : string
  property_id  : string
  guest_name   : string | null
  arrival      : string
  departure    : string
  total_amount : number | null
  listing_site : string | null
}

export type CalProperty = {
  id  : string
  name: string
}

const PALETTE = [
  "#E88159", "#6FA1AF", "#A78BFA", "#34D399",
  "#F472B6", "#FBBF24", "#38BDF8", "#F87171",
  "#818CF8", "#86EFAC",
]

type Segment = {
  key         : string
  bookingId   : string
  weekIdx     : number
  startCol    : number
  endCol      : number
  isStart     : boolean
  isEnd       : boolean
  label       : string
  color       : string
  level       : number
  booking     : CalBooking
  propertyName: string
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]
const DAY_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

const PILL_H   = 22
const PILL_GAP = 2

function toDate(s: string): Date {
  return new Date(s + "T00:00:00Z")
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function toYM(d: Date): string {
  return d.toISOString().slice(0, 7)
}

// Sunday-based calendar grid start
function gridStart(year: number, month: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const dow = first.getUTCDay()
  return addDays(first, -dow)
}

function computeSegments(
  bookings    : CalBooking[],
  properties  : CalProperty[],
  filterPropId: string | null,
  gs          : Date,
): Segment[] {
  const propMeta = new Map(
    properties.map((p, i) => [p.id, { name: p.name, color: PALETTE[i % PALETTE.length] }])
  )
  const gridEnd = addDays(gs, 41)
  const segs: Segment[] = []

  for (const b of bookings) {
    if (filterPropId && b.property_id !== filterPropId) continue

    const meta = propMeta.get(b.property_id)
    if (!meta) continue

    const arrDate = toDate(b.arrival)
    const depDate = toDate(b.departure)

    const clipStart = arrDate < gs      ? gs      : arrDate
    const clipEnd   = depDate > gridEnd ? gridEnd : depDate
    if (clipStart > clipEnd) continue

    const firstName = b.guest_name ? b.guest_name.split(/\s+/)[0] : "Guest"
    const shortProp = meta.name.length > 13 ? meta.name.slice(0, 13) + "…" : meta.name
    const label     = `${firstName} · ${shortProp}`

    for (let week = 0; week < 6; week++) {
      const wStart = addDays(gs, week * 7)
      const wEnd   = addDays(gs, week * 7 + 6)

      const segStart = clipStart > wStart ? clipStart : wStart
      const segEnd   = clipEnd   < wEnd   ? clipEnd   : wEnd
      if (segStart > segEnd) continue

      const startCol = (segStart.getTime() - wStart.getTime()) / 86_400_000
      const endCol   = (segEnd.getTime()   - wStart.getTime()) / 86_400_000

      segs.push({
        key         : `${b.id}-w${week}`,
        bookingId   : b.id,
        weekIdx     : week,
        startCol,
        endCol,
        isStart     : toYMD(segStart) === b.arrival,
        isEnd       : toYMD(segEnd)   === b.departure,
        label,
        color       : meta.color,
        level       : 0,
        booking     : b,
        propertyName: meta.name,
      })
    }
  }

  return segs
}

function assignLevels(segs: Segment[]): void {
  const byWeek = new Map<number, Segment[]>()
  for (const s of segs) {
    if (!byWeek.has(s.weekIdx)) byWeek.set(s.weekIdx, [])
    byWeek.get(s.weekIdx)!.push(s)
  }
  for (const ws of byWeek.values()) {
    ws.sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol)
    const tracks: number[] = []
    for (const seg of ws) {
      let lv = 0
      while (tracks[lv] !== undefined && tracks[lv] >= seg.startCol) lv++
      seg.level = lv
      tracks[lv] = seg.endCol
    }
  }
}

function fmtDate(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  })
}

function nightCount(arrival: string, departure: string): number {
  return (
    new Date(departure  + "T00:00:00Z").getTime() -
    new Date(arrival    + "T00:00:00Z").getTime()
  ) / 86_400_000
}

function fmtMoney(n: number | null): string | null {
  if (!n) return null
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(n)
}

interface PopoverState {
  seg : Segment
  top : number
  left: number
}

interface Props {
  year      : number
  month     : number
  bookings  : CalBooking[]
  properties: CalProperty[]
}

export function CalendarClient({ year, month, bookings, properties }: Props) {
  const router                    = useRouter()
  const [filterPropId, setFilter] = useState<string | null>(null)
  const [popover, setPopover]     = useState<PopoverState | null>(null)

  const gs  = gridStart(year, month)
  const now = new Date()
  const todayStr = toYMD(new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  )))

  const segs = computeSegments(bookings, properties, filterPropId, gs)
  assignLevels(segs)

  const segsByWeek: Segment[][] = Array.from({ length: 6 }, () => [])
  for (const s of segs) segsByWeek[s.weekIdx].push(s)

  const isCurrentMonth =
    year  === now.getUTCFullYear() &&
    month === now.getUTCMonth() + 1

  const propColorMap = new Map(
    properties.map((p, i) => [p.id, PALETTE[i % PALETTE.length]])
  )

  function navigate(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1))
    router.push(`/calendar?m=${toYM(d)}`)
    setPopover(null)
  }

  function handlePillClick(e: React.MouseEvent, seg: Segment) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const vpW  = window.innerWidth
    const vpH  = window.innerHeight
    const PW   = 256
    const PH   = 200

    let left = rect.left
    let top  = rect.bottom + 8
    if (left + PW > vpW - 8) left = vpW - PW - 8
    if (left < 8)             left = 8
    if (top  + PH > vpH - 8) top  = rect.top - PH - 8
    if (top  < 8)             top  = 8

    setPopover({ seg, top, left })
  }

  return (
    <div className="relative select-none" onClick={() => setPopover(null)}>
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[150px] text-center text-base font-semibold text-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={() => navigate(1)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {!isCurrentMonth && (
          <button
            onClick={() => { router.push("/calendar"); setPopover(null) }}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Today
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Filter className="size-3.5 text-muted-foreground shrink-0" />
          <select
            value={filterPropId ?? ""}
            onChange={e => setFilter(e.target.value || null)}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            <option value="">All properties</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-muted/30 border-b border-border">
          {DAY_ABBR.map((d, i) => (
            <div
              key={d}
              className={cn(
                "py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider",
                i < 6 && "border-r border-border",
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 6 week rows */}
        {Array.from({ length: 6 }, (_, weekIdx) => {
          const weekSegs  = segsByWeek[weekIdx]
          const maxLevels = weekSegs.length === 0
            ? 0
            : Math.max(...weekSegs.map(s => s.level)) + 1

          return (
            <div key={weekIdx} className={cn(weekIdx < 5 && "border-b border-border")}>
              {/* Day number row */}
              <div className="grid grid-cols-7">
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const d       = addDays(gs, weekIdx * 7 + dayIdx)
                  const dStr    = toYMD(d)
                  const isToday = dStr === todayStr
                  const inMonth = d.getUTCMonth() + 1 === month

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "pt-1.5 px-2 pb-0.5 h-8",
                        dayIdx < 6 && "border-r border-border",
                        !inMonth   && "bg-muted/10",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-5 items-center justify-center text-xs rounded-full",
                          isToday  && "bg-[#E88159] text-white font-semibold",
                          !isToday && inMonth  && "font-medium text-foreground/80",
                          !isToday && !inMonth && "text-muted-foreground/35",
                        )}
                      >
                        {d.getUTCDate()}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Pill grid */}
              <div
                style={{
                  display             : "grid",
                  gridTemplateColumns : "repeat(7, 1fr)",
                  gridAutoRows        : `${PILL_H}px`,
                  rowGap              : `${PILL_GAP}px`,
                  minHeight           : maxLevels > 0
                    ? `${maxLevels * (PILL_H + PILL_GAP) - PILL_GAP + 8}px`
                    : "28px",
                  paddingTop   : "4px",
                  paddingBottom: "4px",
                }}
              >
                {weekSegs.map(seg => (
                  <div
                    key={seg.key}
                    onClick={e => handlePillClick(e, seg)}
                    title={`${seg.booking.guest_name ?? "Guest"} · ${seg.propertyName}`}
                    style={{
                      gridColumn     : `${seg.startCol + 1} / ${seg.endCol + 2}`,
                      gridRow        : `${seg.level + 1}`,
                      backgroundColor: seg.color,
                      marginLeft     : "2px",
                      marginRight    : "2px",
                    }}
                    className={cn(
                      "flex items-center overflow-hidden cursor-pointer transition-all hover:brightness-110 active:brightness-90",
                      seg.isStart && "rounded-l-sm",
                      seg.isEnd   && "rounded-r-sm",
                    )}
                  >
                    {seg.isStart && (
                      <span className="truncate text-[10px] font-medium text-white/95 leading-none whitespace-nowrap px-1.5">
                        {seg.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Color legend */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {properties.map((p, i) => {
          const color      = PALETTE[i % PALETTE.length]
          const isFiltered = filterPropId === p.id
          return (
            <button
              key={p.id}
              onClick={e => { e.stopPropagation(); setFilter(isFiltered ? null : p.id) }}
              className={cn(
                "flex items-center gap-1.5 rounded transition-opacity",
                filterPropId && !isFiltered && "opacity-35",
              )}
            >
              <span
                className="inline-block size-2.5 rounded-[3px] shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]">
                {p.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* Popover */}
      {popover && (
        <div
          className="fixed z-50 w-60 rounded-xl border border-border bg-popover shadow-2xl p-3.5 space-y-2.5"
          style={{ top: popover.top, left: popover.left }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-popover-foreground leading-tight truncate">
                {popover.seg.booking.guest_name ?? "Guest"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {popover.seg.propertyName}
              </p>
            </div>
            <button
              onClick={() => setPopover(null)}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Check-in</span>
              <span className="font-medium text-popover-foreground">
                {fmtDate(popover.seg.booking.arrival)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Check-out</span>
              <span className="font-medium text-popover-foreground">
                {fmtDate(popover.seg.booking.departure)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Nights</span>
              <span className="font-medium text-popover-foreground">
                {nightCount(popover.seg.booking.arrival, popover.seg.booking.departure)}
              </span>
            </div>
            {fmtMoney(popover.seg.booking.total_amount) && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Revenue</span>
                <span className="font-medium text-popover-foreground">
                  {fmtMoney(popover.seg.booking.total_amount)}
                </span>
              </div>
            )}
            {popover.seg.booking.listing_site && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Platform</span>
                <span className="font-medium text-popover-foreground">
                  {popover.seg.booking.listing_site}
                </span>
              </div>
            )}
          </div>

          <div
            className="h-0.5 w-full rounded-full"
            style={{ backgroundColor: propColorMap.get(popover.seg.booking.property_id) }}
          />
        </div>
      )}
    </div>
  )
}
