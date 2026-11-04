"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2, XCircle, Zap, ChevronDown, ChevronUp,
  Clock, CheckCheck, Ban, AlertTriangle, Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CHANGE_TYPE_LABELS } from "@/lib/change-impact"
import type { ChangeTypeValue } from "@/lib/change-impact"
import {
  approveProposal, rejectProposal, applyProposal, markProposalAppliedManually,
} from "@/app/actions/proposed-changes"
import { ProposeChangeModal } from "./propose-change-modal"

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProposalRow = {
  id               : string
  property_id      : string
  property_name    : string
  change_type      : ChangeTypeValue
  label            : string
  current_value    : string | null
  proposed_value   : string | null
  reason           : string | null
  risk_note        : string | null
  status           : "pending" | "approved" | "rejected" | "applied" | "failed" | "expired"
  payload          : Record<string, unknown> | null
  result           : Record<string, unknown> | null
  recommendation_id: string | null
  created_at       : string
  decided_at       : string | null
  applied_at       : string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: ProposalRow["status"]) {
  switch (status) {
    case "pending" : return { icon: Clock,         label: "Pending",  cls: "bg-amber-500/15  text-amber-400"  }
    case "approved": return { icon: CheckCircle2,  label: "Approved", cls: "bg-emerald-500/15 text-emerald-400" }
    case "rejected": return { icon: Ban,           label: "Rejected", cls: "bg-muted/60       text-muted-foreground" }
    case "applied" : return { icon: CheckCheck,    label: "Applied",  cls: "bg-[#6FA1AF]/15  text-[#6FA1AF]"  }
    case "failed"  : return { icon: AlertTriangle, label: "Failed",   cls: "bg-red-500/15    text-red-400"    }
    case "expired" : return { icon: XCircle,       label: "Expired",  cls: "bg-muted/60       text-muted-foreground" }
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtMoney(val: string | null) {
  if (!val) return "—"
  const n = Number(val)
  if (!isNaN(n)) return `$${n.toLocaleString()}`
  return val
}

// ── Proposal card ──────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  writesEnabled,
  onRefresh,
}: {
  proposal     : ProposalRow
  writesEnabled: boolean
  onRefresh    : () => void
}) {
  const [expanded,      setExpanded]      = useState(false)
  const [actionMsg,     setActionMsg]     = useState<string | null>(null)
  const [manualOpen,    setManualOpen]    = useState(false)
  const [manualDate,    setManualDate]    = useState(new Date().toISOString().slice(0, 10))
  const [pending,       startTransition]  = useTransition()
  const [manualPending, startManualTrans] = useTransition()

  function act(fn: () => Promise<{ ok?: boolean; dryRun?: boolean; error?: string }>, successMsg: string) {
    setActionMsg(null)
    startTransition(async () => {
      const res = await fn()
      if (res.error) { setActionMsg(`Error: ${res.error}`); return }
      const msg = res.dryRun ? `${successMsg} (dry-run — writes are off)` : successMsg
      setActionMsg(msg)
      onRefresh()
    })
  }

  function handleManualApply() {
    setActionMsg(null)
    startManualTrans(async () => {
      const res = await markProposalAppliedManually(proposal.id, manualDate)
      if (res.error) { setActionMsg(`Error: ${res.error}`); return }
      setManualOpen(false)
      setActionMsg("Logged to Change Tracker")
      onRefresh()
    })
  }

  const { icon: Icon, label: statusLabel, cls: statusCls } = statusBadge(proposal.status)

  const changeLabel = CHANGE_TYPE_LABELS[proposal.change_type] ?? proposal.change_type

  return (
    <div className={cn(
      "rounded-xl border bg-card space-y-0 overflow-hidden transition-opacity",
      pending && "opacity-50 pointer-events-none",
    )}>
      {/* Main row */}
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                statusCls,
              )}>
                <Icon className="size-3" />
                {statusLabel}
              </span>
              <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">
                {changeLabel}
              </span>
            </div>
            <p className="font-medium text-sm text-foreground leading-snug">{proposal.label}</p>
            <p className="text-xs text-muted-foreground">{proposal.property_name}</p>
          </div>

          {/* Value delta */}
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Current → Proposed</p>
            <p className="text-sm font-semibold text-foreground">
              {fmtMoney(proposal.current_value)} → {fmtMoney(proposal.proposed_value)}
            </p>
          </div>
        </div>

        {proposal.reason && (
          <p className="text-xs text-muted-foreground leading-relaxed">{proposal.reason}</p>
        )}

        {proposal.risk_note && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5">
            <p className="text-xs text-amber-400"><strong>Risk:</strong> {proposal.risk_note}</p>
          </div>
        )}

        {/* Actions */}
        {proposal.status === "pending" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => act(() => approveProposal(proposal.id), "Approved")}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              <CheckCircle2 className="size-3.5" />
              Approve
            </button>
            <button
              onClick={() => act(() => rejectProposal(proposal.id), "Rejected")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <XCircle className="size-3.5" />
              Reject
            </button>
          </div>
        )}

        {proposal.status === "approved" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {writesEnabled && (
                <button
                  onClick={() => act(() => applyProposal(proposal.id), "Applied to PriceLabs")}
                  className="flex items-center gap-1.5 rounded-lg bg-[#E88159]/10 border border-[#E88159]/20 px-3 py-1.5 text-xs font-medium text-[#E88159] hover:bg-[#E88159]/20 transition-colors"
                >
                  <Zap className="size-3.5" />
                  Apply to PriceLabs
                </button>
              )}
              <button
                onClick={() => { setManualOpen(o => !o); setActionMsg(null) }}
                className="flex items-center gap-1.5 rounded-lg bg-[#6FA1AF]/10 border border-[#6FA1AF]/20 px-3 py-1.5 text-xs font-medium text-[#6FA1AF] hover:bg-[#6FA1AF]/20 transition-colors"
              >
                <CheckCircle2 className="size-3.5" />
                I applied this manually
              </button>
              <button
                onClick={() => act(() => rejectProposal(proposal.id), "Rejected")}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <XCircle className="size-3.5" />
                Reject
              </button>
            </div>
            {manualOpen && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/40 border border-border px-3 py-2">
                <span className="text-xs text-muted-foreground shrink-0">Date applied:</span>
                <input
                  type="date"
                  value={manualDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setManualDate(e.target.value)}
                  className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:border-ring"
                />
                <button
                  onClick={handleManualApply}
                  disabled={manualPending}
                  className="flex items-center gap-1 rounded bg-[#6FA1AF] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#6FA1AF]/90 transition-colors disabled:opacity-50"
                >
                  {manualPending ? "Saving…" : "Log it"}
                </button>
                <button
                  onClick={() => setManualOpen(false)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {actionMsg && (
          <p className={cn(
            "text-xs rounded-lg px-3 py-1.5",
            actionMsg.startsWith("Error")
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400",
          )}>
            {actionMsg}
          </p>
        )}
      </div>

      {/* Payload expandable */}
      {proposal.payload && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border hover:bg-muted/30 transition-colors"
          >
            <span>View API payload</span>
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
          {expanded && (
            <pre className="px-4 py-3 text-xs text-muted-foreground bg-muted/30 font-mono overflow-x-auto border-t border-border">
              {JSON.stringify(proposal.payload, null, 2)}
            </pre>
          )}
        </>
      )}

      {/* Result for applied/failed */}
      {(proposal.status === "applied" || proposal.status === "failed") && proposal.result && (
        <div className={cn(
          "px-4 py-2 text-xs border-t border-border",
          proposal.status === "failed" ? "text-red-400 bg-red-500/5" : "text-muted-foreground",
        )}>
          {proposal.status === "failed"
            ? (proposal.result as any).error ?? "Failed"
            : (proposal.result as any).dry_run
              ? "Dry-run — no live write sent to PriceLabs"
              : "Applied to PriceLabs"}
        </div>
      )}
    </div>
  )
}

// ── Main client ────────────────────────────────────────────────────────────────

type TabKey = "pending" | "history"

export function ProposalsClient({
  proposals,
  properties,
  writesEnabled,
}: {
  proposals    : ProposalRow[]
  properties   : { id: string; name: string }[]
  writesEnabled: boolean
}) {
  const router                     = useRouter()
  const [tab, setTab]              = useState<TabKey>("pending")
  const [proposeOpen, setProposeOpen] = useState(false)

  const pending = proposals.filter(p => p.status === "pending" || p.status === "approved")
  const history = proposals.filter(p => !["pending", "approved"].includes(p.status))

  const shown = tab === "pending" ? pending : history

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: "pending", label: "Pending",  count: pending.length },
    { key: "history", label: "History",  count: history.length },
  ]

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-3 flex-wrap">
        {!writesEnabled && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs text-amber-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            Live writes are off — proposals will apply in dry-run mode
          </div>
        )}
        <div className="ml-auto">
          <button
            onClick={() => setProposeOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#E88159] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#E88159]/90 transition-colors"
          >
            <Plus className="size-3.5" />
            New proposal
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-muted p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-xs",
                tab === t.key ? "bg-muted text-foreground" : "bg-muted/80 text-muted-foreground",
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cards */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <Zap className="size-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {tab === "pending" ? "No pending proposals" : "No history yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {tab === "pending"
              ? "Create a proposal from a recommendation or use the button above."
              : "Applied and rejected proposals will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* History table header */}
          {tab === "history" && (
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Change</span>
              <span>Type</span>
              <span>Date</span>
              <span>Status</span>
            </div>
          )}
          {shown.map(p =>
            tab === "pending" ? (
              <ProposalCard
                key={p.id}
                proposal={p}
                writesEnabled={writesEnabled}
                onRefresh={() => router.refresh()}
              />
            ) : (
              <HistoryRow key={p.id} proposal={p} />
            ),
          )}
        </div>
      )}

      {proposeOpen && (
        <ProposeChangeModal
          properties={properties}
          onClose={() => setProposeOpen(false)}
          onCreated={() => { setProposeOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ── History row ────────────────────────────────────────────────────────────────

function HistoryRow({ proposal }: { proposal: ProposalRow }) {
  const { icon: Icon, label: statusLabel, cls: statusCls } = statusBadge(proposal.status)
  const changeLabel = CHANGE_TYPE_LABELS[proposal.change_type] ?? proposal.change_type
  const date        = proposal.applied_at ?? proposal.decided_at ?? proposal.created_at

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{proposal.label}</p>
          <p className="text-xs text-muted-foreground truncate">{proposal.property_name}</p>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{changeLabel}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(date)}</span>
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
          statusCls,
        )}>
          <Icon className="size-3" />
          {statusLabel}
        </span>
      </div>
      {proposal.status === "failed" && (proposal.result as any)?.error && (
        <p className="mt-1.5 text-xs text-red-400">{(proposal.result as any).error}</p>
      )}
      {proposal.status === "applied" && (proposal.result as any)?.dry_run && (
        <p className="mt-1.5 text-xs text-muted-foreground">Dry-run — no live write</p>
      )}
    </div>
  )
}
