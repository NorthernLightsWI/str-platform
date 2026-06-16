"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { TaskCard, type TaskCardProps } from "./task-card"

type Tab = "today" | "this_week" | "this_month"

export type CleaningTask = TaskCardProps & {
  departurePeriod: "today" | "this_week" | "this_month"
}

const TAB_LABELS: Record<Tab, string> = {
  today:      "Today",
  this_week:  "This Week",
  this_month: "This Month",
}

function tabIncludes(period: CleaningTask["departurePeriod"], tab: Tab) {
  if (tab === "today")      return period === "today"
  if (tab === "this_week")  return period === "today" || period === "this_week"
  return true
}

export function DashboardClient({ tasks }: { tasks: CleaningTask[] }) {
  const [tab, setTab] = useState<Tab>("today")

  const filtered = tasks.filter(t => tabIncludes(t.departurePeriod, tab))

  const counts: Record<Tab, number> = {
    today:      tasks.filter(t => tabIncludes(t.departurePeriod, "today")).length,
    this_week:  tasks.filter(t => tabIncludes(t.departurePeriod, "this_week")).length,
    this_month: tasks.length,
  }

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-1 rounded-xl bg-muted p-1 w-fit">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[t]}
            <span className={cn(
              "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold",
              tab === t
                ? "bg-primary/10 text-foreground"
                : "bg-muted-foreground/15 text-muted-foreground",
            )}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">All caught up!</p>
          <p className="mt-1 text-xs text-muted-foreground">No cleaning tasks for this period.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(task => (
            <TaskCard key={task.propertyId} {...task} />
          ))}
        </div>
      )}
    </div>
  )
}
