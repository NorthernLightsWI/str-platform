"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, MessageSquare, Loader2, CheckCircle, Calendar, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { updateIssueStatus, updateIssueNotes } from "@/app/actions/maintenance"

export type IssueData = {
  id            : string
  title         : string
  description   : string | null
  category      : string | null
  priority      : string
  status        : string
  notes         : string | null
  created_at    : string
  resolved_at   : string | null
  property_name : string
  reporter_name : string | null
}

const PRIORITY_STYLES: Record<string, string> = {
  low    : "bg-muted           text-muted-foreground  border-border",
  medium : "bg-yellow-500/15   text-yellow-500         border-yellow-500/20",
  high   : "bg-orange-500/15   text-orange-500         border-orange-500/20",
  urgent : "bg-red-500/15      text-red-400            border-red-500/20",
}

const PRIORITY_CARD_BORDER: Record<string, string> = {
  low    : "border-border",
  medium : "border-yellow-500/25",
  high   : "border-orange-500/30",
  urgent : "border-red-500/40",
}

const STATUS_STYLES: Record<string, string> = {
  open        : "bg-amber-500/15   text-amber-400",
  in_progress : "bg-blue-500/15    text-blue-400",
  resolved    : "bg-emerald-500/15 text-emerald-400",
  closed      : "bg-muted           text-muted-foreground",
  wont_fix    : "bg-muted           text-muted-foreground",
}

const STATUS_OPTIONS = [
  { value: "open",        label: "Open"       },
  { value: "in_progress", label: "In Progress"},
  { value: "resolved",    label: "Resolved"   },
  { value: "closed",      label: "Closed"     },
  { value: "wont_fix",    label: "Won't Fix"  },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  })
}

export function IssueCard({ issue }: { issue: IssueData }) {
  const [status,      setStatus]      = useState(issue.status)
  const [notes,       setNotes]       = useState(issue.notes ?? "")
  const [notesOpen,   setNotesOpen]   = useState(false)
  const [savedFlash,  setSavedFlash]  = useState(false)
  const [statusPend,  startStatus]    = useTransition()
  const [notesPend,   startNotes]     = useTransition()

  function handleStatusChange(val: string) {
    setStatus(val)
    startStatus(() => updateIssueStatus(issue.id, val))
  }

  function handleSaveNotes() {
    startNotes(async () => {
      await updateIssueNotes(issue.id, notes)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    })
  }

  return (
    <div className={cn(
      "flex flex-col rounded-xl border bg-card overflow-hidden",
      PRIORITY_CARD_BORDER[issue.priority] ?? "border-border",
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="flex flex-1 min-w-0 flex-wrap gap-1.5">
            <span className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize",
              PRIORITY_STYLES[issue.priority] ?? PRIORITY_STYLES.medium,
            )}>
              {issue.priority}
            </span>
            {issue.category && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                {issue.category}
              </span>
            )}
          </div>

          {/* Status select */}
          <div className="relative shrink-0">
            <select
              value={status}
              onChange={e => handleStatusChange(e.target.value)}
              disabled={statusPend}
              className={cn(
                "appearance-none rounded-full border px-2.5 py-0.5 text-xs font-medium pr-5 outline-none cursor-pointer transition-colors",
                STATUS_STYLES[status] ?? STATUS_STYLES.open,
                "border-transparent",
              )}
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value} className="bg-card text-foreground">
                  {o.label}
                </option>
              ))}
            </select>
            {statusPend
              ? <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 size-2.5 animate-spin" />
              : <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-2.5 pointer-events-none" />}
          </div>
        </div>

        <p className="font-semibold text-foreground leading-snug">{issue.title}</p>
        <p className="text-xs text-muted-foreground font-medium">{issue.property_name}</p>
      </div>

      <div className="h-px bg-border mx-4" />

      {/* Body */}
      <div className="px-4 py-3 space-y-2 flex-1">
        {issue.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {issue.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {fmtDate(issue.created_at)}
          </span>
          {issue.reporter_name && (
            <span className="flex items-center gap-1 truncate">
              <User className="size-3 shrink-0" />
              {issue.reporter_name}
            </span>
          )}
        </div>

        {/* Notes */}
        <div className="pt-1">
          <button
            onClick={() => setNotesOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="size-3.5" />
            Notes
            {notes && <span className="size-1.5 rounded-full bg-blue-400 inline-block" />}
            {notesOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {notesOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes, vendor info, next steps…"
                rows={3}
                className="w-full resize-none rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
              <button
                onClick={handleSaveNotes}
                disabled={notesPend}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
              >
                {notesPend
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : savedFlash
                    ? <CheckCircle className="size-3.5 text-emerald-400" />
                    : <MessageSquare className="size-3.5" />}
                {notesPend ? "Saving…" : savedFlash ? "Saved!" : "Save notes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
