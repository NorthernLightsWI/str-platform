"use client"

import { useState, useEffect, useTransition } from "react"
import {
  CheckCircle, Clock, User, Calendar,
  MessageSquare, ChevronDown, ChevronUp, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { saveCleaningNotes, markAsCleanWithNotes } from "@/app/actions/cleaning"

export type TaskCardProps = {
  propertyId       : string
  propertyName     : string
  city             : string | null
  state            : string | null
  lastGuestName    : string | null
  departureDate    : string          // YYYY-MM-DD
  nextGuestName    : string | null
  nextArrivalDate  : string | null   // YYYY-MM-DD
  nextCheckinISO   : string | null   // target datetime for countdown
  lastBookingId    : string | null
  existingRecordId : string | null
  existingNotes    : string | null
}

// ── Countdown hook (updates every minute) ─────────────────────────────────────

function useCountdown(targetISO: string | null) {
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    if (!targetISO) { setMs(null); return }
    const tick = () => setMs(new Date(targetISO).getTime() - Date.now())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [targetISO])

  return ms
}

// ── Urgency styling ───────────────────────────────────────────────────────────

function urgency(ms: number | null) {
  if (ms === null)              return { badge: "bg-muted text-muted-foreground",         border: "border-border"        }
  if (ms <= 0)                  return { badge: "bg-red-700/20 text-red-400",             border: "border-red-600/50"    }
  if (ms <= 30 * 60_000)        return { badge: "bg-red-700/20 text-red-400",             border: "border-red-600/50"    }
  if (ms <= 3_600_000)          return { badge: "bg-red-500/15 text-red-400",             border: "border-red-500/30"    }
  if (ms <= 4 * 3_600_000)      return { badge: "bg-yellow-500/15 text-yellow-400",       border: "border-yellow-500/25" }
  return                               { badge: "bg-emerald-500/15 text-emerald-400",     border: "border-emerald-500/20"}
}

function fmtCountdown(ms: number) {
  if (ms <= 0) return "Overdue!"
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtDate(ymd: string) {
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskCard(props: TaskCardProps) {
  const {
    propertyId, propertyName, city, state,
    lastGuestName, departureDate,
    nextGuestName, nextArrivalDate, nextCheckinISO,
    lastBookingId,
    existingRecordId, existingNotes,
  } = props

  const ms      = useCountdown(nextCheckinISO)
  const style   = urgency(ms)

  const [notesOpen,     setNotesOpen]     = useState(false)
  const [notes,         setNotes]         = useState(existingNotes ?? "")
  const [recordId,      setRecordId]      = useState<string | null>(existingRecordId)
  const [savedFlash,    setSavedFlash]    = useState(false)
  const [done,          setDone]          = useState(false)
  const [cleanPending,  startClean]       = useTransition()
  const [notesPending,  startNotes]       = useTransition()

  // Hide card optimistically after marking clean
  if (done) return null

  async function handleSaveNotes() {
    startNotes(async () => {
      const res = await saveCleaningNotes(propertyId, lastBookingId, recordId, notes)
      if (res.recordId) setRecordId(res.recordId)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    })
  }

  function handleMarkClean() {
    startClean(async () => {
      await markAsCleanWithNotes(propertyId, lastBookingId, recordId, notes)
      setDone(true)
    })
  }

  return (
    <div className={cn(
      "flex flex-col rounded-xl border bg-card overflow-hidden transition-colors",
      style.border,
    )}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground leading-tight truncate">{propertyName}</p>
          {(city || state) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[city, state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        {/* Countdown badge */}
        {ms !== null && (
          <div className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
            style.badge,
          )}>
            <Clock className="size-3 shrink-0" />
            {fmtCountdown(ms)}
          </div>
        )}
        {ms === null && nextArrivalDate === null && (
          <span className="shrink-0 text-xs text-muted-foreground">No upcoming arrival</span>
        )}
      </div>

      <div className="h-px bg-border mx-4" />

      {/* Info rows */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <User className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground min-w-0 truncate">
            {lastGuestName
              ? <><span className="text-foreground font-medium">{lastGuestName}</span>{" checked out "}{fmtDate(departureDate)}</>
              : <>Checked out {fmtDate(departureDate)}</>}
          </span>
        </div>

        {nextArrivalDate && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground min-w-0 truncate">
              {nextGuestName
                ? <><span className="text-foreground font-medium">{nextGuestName}</span>{" arrives "}{fmtDate(nextArrivalDate)}</>
                : <>Next arrival {fmtDate(nextArrivalDate)}</>}
            </span>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="px-4 pb-3">
        <button
          onClick={() => setNotesOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="size-3.5 shrink-0" />
          Notes
          {notes && <span className="size-1.5 rounded-full bg-blue-400 inline-block" />}
          {notesOpen
            ? <ChevronUp   className="size-3.5" />
            : <ChevronDown className="size-3.5" />}
        </button>

        {notesOpen && (
          <div className="mt-2 space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Cleaning notes, issues, supplies needed…"
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
            <button
              onClick={handleSaveNotes}
              disabled={notesPending}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              {notesPending
                ? <Loader2 className="size-3.5 animate-spin" />
                : savedFlash
                  ? <CheckCircle className="size-3.5 text-emerald-400" />
                  : <MessageSquare className="size-3.5" />}
              {notesPending ? "Saving…" : savedFlash ? "Saved!" : "Save notes"}
            </button>
          </div>
        )}
      </div>

      {/* Mark as Clean */}
      <div className="px-4 pb-4 mt-auto">
        <button
          disabled={cleanPending}
          onClick={handleMarkClean}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cleanPending
            ? <Loader2 className="size-4 animate-spin" />
            : <CheckCircle className="size-4" />}
          {cleanPending ? "Marking clean…" : "Mark as Clean"}
        </button>
      </div>
    </div>
  )
}
