"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, TrendingUp, Star, Wrench, ClipboardList, CheckCircle2,
  Circle, Clock, Trash2, Plus, Loader2, ChevronRight, AlertTriangle,
  Flame, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { healthColor, type HealthScore } from "@/lib/health-score"
import { createTask, updateTaskStatus, deleteTask } from "@/app/actions/tasks"

// ── Types ──────────────────────────────────────────────────────────────────────

export type PropertyDetail = {
  id           : string
  name         : string
  externalName : string
  city         : string | null
  state        : string | null
  bedrooms     : number | null
  bathrooms    : number | null
  max_guests   : number | null
  is_active    : boolean
  thumbnail_url: string | null
  address      : string | null
}

export type RevenueData = {
  current12mRevenue : number
  currentRevPAR     : number
  occupancy12m      : number
  adr12m            : number
  potentialRevPAR   : number
  potentialAnnual   : number
  annualOpportunity : number
}

export type RecItem = {
  id              : string
  title           : string
  body            : string | null
  priority        : string
  category        : string | null
  impact_statement: string | null
}

export type BookingItem = {
  id          : string
  guest_name  : string | null
  arrival     : string
  departure   : string
  total_amount: number | null
  listing_site: string | null
  status      : string
}

export type TaskItem = {
  id                      : string
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
    month: "short", day: "numeric", year: "numeric",
  })
}

const PRIORITY_STYLES: Record<string, string> = {
  low      : "bg-muted text-muted-foreground border-border",
  medium   : "bg-yellow-500/15 text-yellow-500 border-yellow-500/20",
  high     : "bg-orange-500/15 text-orange-500 border-orange-500/20",
  critical : "bg-red-500/15 text-red-400 border-red-500/20",
  urgent   : "bg-red-500/15 text-red-400 border-red-500/20",
}

const TASK_STATUS_STYLES: Record<string, string> = {
  open        : "bg-amber-500/15 text-amber-400",
  in_progress : "bg-blue-500/15 text-blue-400",
  completed   : "bg-emerald-500/15 text-emerald-400",
}

const TASK_STATUS_LABELS: Record<string, string> = {
  open        : "Open",
  in_progress : "In Progress",
  completed   : "Completed",
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground">{children}</h2>
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  return (
    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Health Score Section ───────────────────────────────────────────────────────

function HealthSection({ hs }: { hs: HealthScore }) {
  const color = healthColor(hs.total)
  const numCls =
    color === "green"  ? "text-emerald-400" :
    color === "yellow" ? "text-amber-400"   :
    "text-red-400"

  const subRows = [
    { label: "Revenue",     value: hs.revenueScore,     max: 35, color: "bg-blue-400",    detail: `Occ ${hs.occupancyScore.toFixed(1)} / ADR ${hs.adrScore.toFixed(1)}` },
    { label: "Listing",     value: hs.listingScore,     max: 35, color: "bg-violet-400",  detail: `Rating ${hs.ratingScore.toFixed(1)} / Reviews ${hs.reviewCountScore.toFixed(1)}` },
    { label: "Operational", value: hs.operationalScore, max: 30, color: "bg-teal-400",    detail: `Cleaning ${hs.cleaningScore} / Maintenance ${hs.maintenanceScore}` },
  ]

  return (
    <Card>
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <SectionTitle>Health Score</SectionTitle>
      </div>
      <div className="px-5 py-4 flex items-center gap-6">
        <div className="flex flex-col items-center shrink-0">
          <span className={cn("text-5xl font-bold tabular-nums", numCls)}>{hs.total}</span>
          <span className="text-xs text-muted-foreground mt-0.5">out of 100</span>
        </div>
        <div className="flex-1 space-y-3">
          {subRows.map(row => (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="tabular-nums text-muted-foreground text-xs">
                  {row.value.toFixed(1)} / {row.max}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar value={row.value} max={row.max} color={row.color} />
              </div>
              <p className="text-xs text-muted-foreground">{row.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ── Revenue Opportunity Section ────────────────────────────────────────────────

function RevenueSection({ rev }: { rev: RevenueData }) {
  const hasOpp = rev.annualOpportunity > 0

  return (
    <Card>
      <div className="px-5 py-4 border-b border-border">
        <SectionTitle>Revenue Opportunity</SectionTitle>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "12-Month Revenue",  value: fmt$(rev.current12mRevenue) },
            { label: "Current RevPAR",    value: fmt$(rev.currentRevPAR) + "/night" },
            { label: "Potential RevPAR",  value: fmt$(rev.potentialRevPAR) + "/night" },
            { label: "Occupancy (12m)",   value: rev.occupancy12m.toFixed(1) + "%" },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg bg-muted/30 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-0.5 font-semibold text-foreground tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        {hasOpp && (
          <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
            <TrendingUp className="size-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {fmt$(rev.annualOpportunity)}/year in potential upside
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Based on Appleton market benchmarks (57% occ · {fmt$(207)} ADR).
                Potential annual revenue: {fmt$(rev.potentialAnnual)}.
              </p>
            </div>
          </div>
        )}

        {!hasOpp && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="size-4" />
            This property is at or above market potential.
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Task Creation Modal ────────────────────────────────────────────────────────

type ModalState = {
  open          : boolean
  rec?          : RecItem
  prefillTitle  : string
  prefillBody   : string
  prefillImpact : string
  prefillPriority: string
}

const CLOSED_MODAL: ModalState = {
  open: false, prefillTitle: "", prefillBody: "", prefillImpact: "", prefillPriority: "medium",
}

function TaskModal({
  modal,
  propertyId,
  onClose,
  onCreated,
}: {
  modal     : ModalState
  propertyId: string
  onClose   : () => void
  onCreated : (task: TaskItem) => void
}) {
  const [title,    setTitle]    = useState(modal.prefillTitle)
  const [desc,     setDesc]     = useState(modal.prefillBody)
  const [priority, setPriority] = useState(modal.prefillPriority)
  const [impact,   setImpact]   = useState(modal.prefillImpact)
  const [dueDate,  setDueDate]  = useState("")
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  start]       = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError("Title is required."); return }
    start(async () => {
      const res = await createTask({
        property_id              : propertyId,
        recommendation_id        : modal.rec?.id,
        title                    : title.trim(),
        description              : desc.trim() || undefined,
        priority,
        estimated_revenue_impact : impact ? Number(impact) : null,
        due_date                 : dueDate || null,
      })
      if (res.error) { setError(res.error); return }
      onCreated({
        id                      : crypto.randomUUID(),
        title                   : title.trim(),
        description             : desc.trim() || null,
        priority,
        status                  : "open",
        estimated_revenue_impact: impact ? Number(impact) : null,
        due_date                : dueDate || null,
        recommendation_id       : modal.rec?.id ?? null,
        created_at              : new Date().toISOString(),
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Create Task</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {modal.rec && (
            <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              From recommendation: <span className="font-medium text-foreground">{modal.rec.title}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Additional details…"
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Revenue Impact (optional $)</label>
            <input
              type="number"
              value={impact}
              onChange={e => setImpact(e.target.value)}
              placeholder="e.g. 500"
              min="0"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {pending ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Recommendations Section ────────────────────────────────────────────────────

function RecsSection({
  recs,
  onCreateTask,
}: {
  recs        : RecItem[]
  onCreateTask: (rec: RecItem) => void
}) {
  return (
    <Card>
      <div className="px-5 py-4 border-b border-border">
        <SectionTitle>Recommendations</SectionTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Top active recommendations</p>
      </div>
      {recs.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No active recommendations
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {recs.map(rec => (
            <li key={rec.id} className="px-5 py-4 space-y-2">
              <div className="flex items-start gap-2 justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize",
                      PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.medium,
                    )}>
                      {rec.priority}
                    </span>
                    {rec.category && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
                        {rec.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-snug">{rec.title}</p>
                  {rec.body && (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{rec.body}</p>
                  )}
                  {rec.impact_statement && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                      <TrendingUp className="size-3" />
                      {rec.impact_statement}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onCreateTask(rec)}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="size-3" />
                  Task
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── Recent Bookings Section ────────────────────────────────────────────────────

function BookingsSection({ bookings }: { bookings: BookingItem[] }) {
  const STATUS_CLS: Record<string, string> = {
    confirmed : "bg-emerald-400/15 text-emerald-400",
    pending   : "bg-amber-400/15 text-amber-400",
    cancelled : "bg-muted text-muted-foreground",
    checked_in: "bg-blue-400/15 text-blue-400",
  }

  return (
    <Card>
      <div className="px-5 py-4 border-b border-border">
        <SectionTitle>Recent Bookings</SectionTitle>
      </div>
      {bookings.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">No bookings found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Guest</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Dates</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Channel</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map(b => (
                <tr key={b.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{b.guest_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                    {fmtDate(b.arrival)} → {fmtDate(b.departure)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{b.listing_site ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                    {b.total_amount != null ? fmt$(b.total_amount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      STATUS_CLS[b.status] ?? "bg-muted text-muted-foreground",
                    )}>
                      {b.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── Tasks Section ──────────────────────────────────────────────────────────────

function TasksSection({
  tasks: initialTasks,
  propertyId,
  onNewTask,
}: {
  tasks      : TaskItem[]
  propertyId : string
  onNewTask  : () => void
}) {
  const [tasks,   setTasks]   = useState(initialTasks)
  const [pending, start]      = useTransition()
  const [delId,   setDelId]   = useState<string | null>(null)

  function handleStatus(task: TaskItem, status: string) {
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status } : t))
    start(async () => { await updateTaskStatus(task.id, propertyId, status) })
  }

  function handleDelete(id: string) {
    setDelId(id)
    start(async () => {
      await deleteTask(id, propertyId)
      setTasks(ts => ts.filter(t => t.id !== id))
      setDelId(null)
    })
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "completed")   return <CheckCircle2 className="size-4 text-emerald-400" />
    if (status === "in_progress") return <Clock className="size-4 text-blue-400" />
    return <Circle className="size-4 text-muted-foreground" />
  }

  return (
    <Card>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <SectionTitle>Tasks</SectionTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={onNewTask}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
        >
          <Plus className="size-3.5" />
          New Task
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No tasks yet — convert a recommendation or create one above.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map(task => (
            <li key={task.id} className="px-5 py-3.5 flex items-start gap-3">
              <button
                onClick={() => {
                  const next = task.status === "open" ? "in_progress"
                             : task.status === "in_progress" ? "completed" : "open"
                  handleStatus(task, next)
                }}
                disabled={pending}
                title="Cycle status"
              >
                <StatusIcon status={task.status} />
              </button>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "text-sm font-medium",
                    task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground",
                  )}>
                    {task.title}
                  </span>
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize",
                    PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium,
                  )}>
                    {task.priority}
                  </span>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    TASK_STATUS_STYLES[task.status] ?? TASK_STATUS_STYLES.open,
                  )}>
                    {TASK_STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </div>

                {task.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">{task.description}</p>
                )}

                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {task.due_date && (
                    <span>Due {fmtDate(task.due_date)}</span>
                  )}
                  {task.estimated_revenue_impact != null && task.estimated_revenue_impact > 0 && (
                    <span className="text-amber-400">{fmt$(task.estimated_revenue_impact)} impact</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <select
                  value={task.status}
                  onChange={e => handleStatus(task, e.target.value)}
                  disabled={pending}
                  className="rounded-lg border border-input bg-muted/30 px-2 py-1 text-xs text-foreground outline-none focus-visible:border-ring cursor-pointer"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                <button
                  onClick={() => handleDelete(task.id)}
                  disabled={pending && delId === task.id}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  title="Delete task"
                >
                  {pending && delId === task.id
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <Trash2 className="size-3.5" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PropertyDetailClient({
  property,
  healthScore,
  revenueData,
  recommendations,
  recentBookings,
  tasks: initialTasks,
}: {
  property       : PropertyDetail
  healthScore    : HealthScore
  revenueData    : RevenueData
  recommendations: RecItem[]
  recentBookings : BookingItem[]
  tasks          : TaskItem[]
}) {
  const router = useRouter()
  const [modal,         setModal]         = useState<ModalState>(CLOSED_MODAL)
  const [tasks,         setTasks]         = useState(initialTasks)

  function openModalForRec(rec: RecItem) {
    setModal({
      open            : true,
      rec,
      prefillTitle    : rec.title,
      prefillBody     : rec.body ?? "",
      prefillImpact   : "",
      prefillPriority : rec.priority === "critical" || rec.priority === "urgent" ? "high" : rec.priority,
    })
  }

  function openBlankModal() {
    setModal({ open: true, prefillTitle: "", prefillBody: "", prefillImpact: "", prefillPriority: "medium" })
  }

  function handleTaskCreated(task: TaskItem) {
    setTasks(ts => [task, ...ts])
  }

  const location = [property.city, property.state].filter(Boolean).join(", ")

  return (
    <div className="min-h-screen p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Back + Header */}
      <div className="space-y-3">
        <button
          onClick={() => router.push("/properties")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Properties
        </button>

        <div className="flex items-start gap-4">
          {property.thumbnail_url && (
            <img
              src={property.thumbnail_url}
              alt={property.name}
              className="size-16 rounded-xl object-cover shrink-0 border border-border"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground leading-tight">{property.name}</h1>
              <span className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                property.is_active
                  ? "bg-emerald-400/10 text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}>
                {property.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {[
                location,
                property.bedrooms != null ? property.bedrooms + " bd" : null,
                property.bathrooms != null ? property.bathrooms + " ba" : null,
                property.max_guests != null ? property.max_guests + " guests" : null,
              ].filter(Boolean).join(" · ")}
            </p>
            {property.externalName !== property.name && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{property.externalName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <HealthSection hs={healthScore} />
      <RevenueSection rev={revenueData} />
      <RecsSection recs={recommendations} onCreateTask={openModalForRec} />
      <BookingsSection bookings={recentBookings} />
      <TasksSection
        tasks={tasks}
        propertyId={property.id}
        onNewTask={openBlankModal}
      />

      {/* Modal */}
      {modal.open && (
        <TaskModal
          modal={modal}
          propertyId={property.id}
          onClose={() => setModal(CLOSED_MODAL)}
          onCreated={handleTaskCreated}
        />
      )}
    </div>
  )
}
