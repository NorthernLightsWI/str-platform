"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { IssueCard, type IssueData } from "./issue-card"
import { LogIssueModal } from "./log-issue-modal"

type Tab = "all" | "open" | "in_progress" | "resolved"

type Property = { id: string; name: string }

const TAB_LABELS: Record<Tab, string> = {
  all        : "All",
  open       : "Open",
  in_progress: "In Progress",
  resolved   : "Resolved",
}

function issueMatchesTab(issue: IssueData, tab: Tab) {
  if (tab === "all")         return true
  if (tab === "open")        return issue.status === "open"
  if (tab === "in_progress") return issue.status === "in_progress"
  if (tab === "resolved")    return issue.status === "resolved" || issue.status === "closed" || issue.status === "wont_fix"
  return true
}

export function MaintenanceClient({
  issues,
  properties,
}: {
  issues     : IssueData[]
  properties : Property[]
}) {
  const [tab,       setTab]       = useState<Tab>("all")
  const [modalOpen, setModalOpen] = useState(false)

  const filtered = issues.filter(i => issueMatchesTab(i, tab))

  const counts: Record<Tab, number> = {
    all        : issues.length,
    open       : issues.filter(i => issueMatchesTab(i, "open")).length,
    in_progress: issues.filter(i => issueMatchesTab(i, "in_progress")).length,
    resolved   : issues.filter(i => issueMatchesTab(i, "resolved")).length,
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
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

        {/* Log Issue */}
        <button
          onClick={() => setModalOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
        >
          <Plus className="size-4" />
          Log Issue
        </button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No issues</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tab === "all" ? "No maintenance issues logged yet." : `No ${TAB_LABELS[tab].toLowerCase()} issues.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(issue => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <LogIssueModal
          properties={properties}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
