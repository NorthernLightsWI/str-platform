"use client"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import {
  Circle, Clock, CheckCircle2, Trash2, Loader2,
  TrendingUp, AlertTriangle, Flame, ArrowUpDown,
  CalendarDays, Building2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { updateTaskStatus, deleteTask } from "@/app/actions/tasks"

// ── Types ──────────────────────────────────────────────────────────────────────

export type TaskRow = {
  id                      : string
  property_id             : string
  property_name           : string
  title                   : string
  description             : string | null
  priority                : string
  status                  : string
  estimated_revenue_impact: number | null
  due_date                : string | null
  recommendation_id       : string | null
  created_at              : string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US")
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  })
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
}

const PRIORITY_STYLES: Record<string, string> = {
  low      : "bg-muted text-muted-foreground border-border",
  medium   : "bg-yellow-500/15 text-yellow-500 border-yellow-500/20",
  high     : "bg-orange-500/15 text-orange-500 border-orange-500/20",
  critical : "bg-red-500/15 text-red-400 border-red-500/20",
  urgent   : "bg-red-500/15 text-red-400 border-red-500/20",
}

const PRIORITY_ICONS: Record<string, React.ElementType> = {
  critical : Flame,
  urgent   : Flame,
  high     : AlertTriangle,
  medium   : TrendingUp,
  low      : Circle,
}

const STATUS_CYCLE: Record<string, string> = {
  open        : "in_progress",
  in_progress : "completed",
  completed   : "open",
}

const STATUS_LABELS: Record<string, string> = {
  open        : "Open",
  in_progress : "In Progress",
  completed   : "Completed",
}

const STATUS_STYLES: Record<string, string> = {
  open        : "bg-amber-500/15 text-amber-400 border-amber-500/20",
  in_progress : "bg-blue-500/15 text-blue-400 border-blue-500/20",
  completed   : "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  open        : Circle,
  in_progress : Clock,
  completed   : CheckCircle2,
}

type SortKey = "impact" | "priority" | "due_date"

const STATUS_TABS = [
  { key: "all",         label: "All" },
  { key: "open",        label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed",   label: "Completed" },
] as const

// ── Task card ──────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: TaskRow }) {
  const [pending, start] = useTransition()
  const [deleting, startDelete] = useTransition()

  const PriorityIcon = PRIORITY_ICONS[task.priority] ?? Circle
  const StatusIcon   = STATUS_ICONS[task.status] ?? Circle

  const isOverdue = task.due_date
    ? new Date(task.due_date + "T00:00:00Z") < new Date(new Date().toDateString())
    : false

  function handleStatusCycle() {
    const next = STATUS_CYCLE[task.status] ?? "open"
    start(async () => { await updateTaskStatus(task.id, task.property_id, next) })
  }

  function handleDelete() {
    if (!confirm("Delete this task?")) return
    startDelete(async () => { await deleteTask(task.id, task.property_id) })
  }

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-4 space-y-3 transition-opacity",
      (pending || deleting) && "opacity-60",
      task.status === "completed" && "opacity-70",
    )}>
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Property link */}
          <Link
            href={`/properties/${task.property_id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <Building2 className="size-3 shrink-0" />
            <span className="truncate">{task.property_name}</span>
          </Link>

          {/* Title */}
          <p className={cn(
            "text-sm font-semibold text-foreground leading-snug",
            task.status === "completed" && "line-through text-muted-foreground",
          )}>
            {task.title}
          </p>

          {/* Description */}
          {task.description && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {task.description}
            </p>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 flex size-7 items-center justify-center rounded-lg text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      </div>

      {/* Bottom row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Priority badge */}
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
          PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.low,
        )}>
          <PriorityIcon className="size-3" />
          {task.priority}
        </span>

        {/* Revenue impact */}
        {task.estimated_revenue_impact != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
            <TrendingUp className="size-3" />
            {fmt$(task.estimated_revenue_impact)}
          </span>
        )}

        {/* Due date */}
        {task.due_date && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
            isOverdue && task.status !== "completed"
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "text-muted-foreground",
          )}>
            <CalendarDays className="size-3" />
            {fmtDate(task.due_date)}
          </span>
        )}

        {/* Status cycle button */}
        <button
          onClick={handleStatusCycle}
          disabled={pending}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-80",
            STATUS_STYLES[task.status] ?? STATUS_STYLES.open,
          )}
        >
          {pending
            ? <Loader2 className="size-3 animate-spin" />
            : <StatusIcon className="size-3" />
          }
          {STATUS_LABELS[task.status] ?? task.status}
        </button>
      </div>
    </div>
  )
}

// ── Main client ────────────────────────────────────────────────────────────────

export function TasksClient({ tasks }: { tasks: TaskRow[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("open")
  const [sortKey, setSortKey]           = useState<SortKey>("impact")

  // ── Summary stats (always across all non-completed tasks) ─────────────────
  const openTasks = useMemo(() => tasks.filter(t => t.status !== "completed"), [tasks])
  const totalImpact = useMemo(
    () => openTasks.reduce((s, t) => s + (t.estimated_revenue_impact ?? 0), 0),
    [openTasks],
  )
  const countByCritical = openTasks.filter(t => t.priority === "critical" || t.priority === "urgent").length
  const countByHigh     = openTasks.filter(t => t.priority === "high").length
  const countByMedium   = openTasks.filter(t => t.priority === "medium").length

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const filtered = statusFilter === "all"
      ? tasks
      : tasks.filter(t => t.status === statusFilter)

    return [...filtered].sort((a, b) => {
      if (sortKey === "impact") {
        const ai = a.estimated_revenue_impact ?? -1
        const bi = b.estimated_revenue_impact ?? -1
        if (bi !== ai) return bi - ai
        return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0)
      }
      if (sortKey === "priority") {
        const diff = (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0)
        if (diff !== 0) return diff
        const ai = a.estimated_revenue_impact ?? -1
        const bi = b.estimated_revenue_impact ?? -1
        return bi - ai
      }
      if (sortKey === "due_date") {
        const ad = a.due_date ?? "9999-12-31"
        const bd = b.due_date ?? "9999-12-31"
        return ad.localeCompare(bd)
      }
      return 0
    })
  }, [tasks, statusFilter, sortKey])

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "impact",   label: "Revenue Impact" },
    { key: "priority", label: "Priority" },
    { key: "due_date", label: "Due Date" },
  ]

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Open Tasks</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{openTasks.length}</p>
        </div>

        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Revenue at Stake</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400 tabular-nums">
            {totalImpact > 0 ? fmt$(totalImpact) : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground mb-1.5">By Priority</p>
          <div className="flex flex-wrap gap-1.5">
            {countByCritical > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
                <Flame className="size-3" />{countByCritical} critical
              </span>
            )}
            {countByHigh > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 border border-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-500">
                <AlertTriangle className="size-3" />{countByHigh} high
              </span>
            )}
            {countByMedium > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 border border-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-500">
                {countByMedium} medium
              </span>
            )}
            {countByCritical === 0 && countByHigh === 0 && countByMedium === 0 && (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total Tasks</p>
          <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{tasks.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tasks.filter(t => t.status === "completed").length} completed
          </p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium transition-colors",
                statusFilter === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  sortKey === opt.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <span className="text-sm text-muted-foreground">
          {visible.length} task{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Task list */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <CheckCircle2 className="size-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {statusFilter === "all" ? "No tasks yet" : `No ${STATUS_LABELS[statusFilter]?.toLowerCase() ?? statusFilter} tasks`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusFilter === "all"
              ? "Tasks are created from recommendations on individual property pages."
              : "Try switching to a different status tab."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map(t => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}
