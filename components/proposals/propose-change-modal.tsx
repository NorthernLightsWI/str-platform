"use client"

import { useState, useEffect, useTransition } from "react"
import { X, Send, Loader2 } from "lucide-react"
import { createProposal } from "@/app/actions/proposed-changes"
import { getPropertyPlPrice } from "@/app/actions/settings"
import type { ChangeTypeValue } from "@/lib/change-impact"
import { CHANGE_TYPE_LABELS } from "@/lib/change-impact"

const CHANGE_TYPES = Object.entries(CHANGE_TYPE_LABELS) as [ChangeTypeValue, string][]

interface Props {
  properties      : { id: string; name: string; siblingIds?: string[] }[]
  prefillPropertyId?: string
  prefillType     ?: ChangeTypeValue
  prefillLabel    ?: string
  prefillReason   ?: string
  prefillRecId    ?: string
  onClose         : () => void
  onCreated       : (id: string) => void
}

export function ProposeChangeModal({
  properties,
  prefillPropertyId,
  prefillType,
  prefillLabel,
  prefillReason,
  prefillRecId,
  onClose,
  onCreated,
}: Props) {
  const [propertyId,    setPropertyId]    = useState(prefillPropertyId ?? properties[0]?.id ?? "")
  const [changeType,    setChangeType]    = useState<ChangeTypeValue>(prefillType ?? "price_base")
  const [label,         setLabel]         = useState(prefillLabel ?? "")
  const [currentValue,  setCurrentValue]  = useState("")
  const [proposedValue, setProposedValue] = useState("")
  const [reason,        setReason]        = useState(prefillReason ?? "")
  const [riskNote,      setRiskNote]      = useState("")
  const [error,         setError]         = useState<string | null>(null)
  const [pending,       startTransition]  = useTransition()
  const [plHint,        setPlHint]        = useState<{
    base: number | null; min: number | null; push_enabled: boolean
    listing_name: string; listing_id: string
  } | null>(null)
  const [hintLoading,   setHintLoading]   = useState(false)
  const [groupSiblings, setGroupSiblings] = useState<Array<{
    id: string; name: string
    price: { base: number | null; min: number | null } | null
  }> | null>(null)
  const [sibAck, setSibAck] = useState(false)

  const showHint = changeType === "price_base" || changeType === "price_min"

  useEffect(() => {
    if (!showHint || !propertyId) { setPlHint(null); return }
    let cancelled = false
    setHintLoading(true)
    getPropertyPlPrice(propertyId).then(h => {
      if (!cancelled) { setPlHint(h); setHintLoading(false) }
    })
    return () => { cancelled = true }
  }, [propertyId, changeType, showHint])

  useEffect(() => {
    const prop   = properties.find(p => p.id === propertyId)
    const sibIds = prop?.siblingIds ?? []
    if (sibIds.length === 0) { setGroupSiblings(null); setSibAck(false); return }
    setGroupSiblings(null)
    setSibAck(false)
    Promise.all(
      sibIds.map(async sid => {
        const sp    = properties.find(p => p.id === sid)
        const price = await getPropertyPlPrice(sid)
        return {
          id   : sid,
          name : sp?.name ?? sid,
          price: price ? { base: price.base, min: price.min } : null,
        }
      }),
    ).then(setGroupSiblings)
  }, [propertyId])

  const lockProperty = !!prefillPropertyId && properties.length === 1

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!propertyId)    { setError("Select a property"); return }
    if (!label.trim())  { setError("Label is required"); return }
    if (!proposedValue.trim()) { setError("Proposed value is required"); return }
    if (groupSiblings && groupSiblings.length > 0 && !sibAck) {
      setError("Confirm this proposal is for this listing only")
      return
    }

    startTransition(async () => {
      const res = await createProposal({
        property_id      : propertyId,
        change_type      : changeType,
        label            : label.trim(),
        current_value    : currentValue.trim(),
        proposed_value   : proposedValue.trim(),
        reason           : reason.trim(),
        recommendation_id: prefillRecId ?? null,
        risk_note        : riskNote.trim(),
      })
      if (res.error) { setError(res.error); return }
      onCreated(res.id!)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="font-semibold text-foreground">Propose a change</p>
            <p className="text-xs text-muted-foreground mt-0.5">Queued for approval before applying to PriceLabs</p>
          </div>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Property */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Property
            </label>
            <select
              value={propertyId}
              onChange={e => setPropertyId(e.target.value)}
              disabled={lockProperty}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring disabled:opacity-60"
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Change type + label */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Type
              </label>
              <select
                value={changeType}
                onChange={e => setChangeType(e.target.value as ChangeTypeValue)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
              >
                {CHANGE_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Raise base price by 10%"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          {/* Current + proposed value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Current value
              </label>
              <input
                type="text"
                value={currentValue}
                onChange={e => setCurrentValue(e.target.value)}
                placeholder="e.g. 150"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Proposed value <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={proposedValue}
                onChange={e => setProposedValue(e.target.value)}
                placeholder="e.g. 165"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring"
              />
            </div>
          </div>

          {/* PriceLabs price hint */}
          {showHint && (
            hintLoading ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading PriceLabs price…
              </p>
            ) : plHint ? (
              <div className="rounded-lg bg-[#6FA1AF]/10 border border-[#6FA1AF]/20 px-3 py-2 space-y-0.5">
                <p className="text-xs text-[#6FA1AF]">
                  PriceLabs: base {plHint.base != null ? `$${plHint.base}` : "—"}
                  {plHint.min != null ? ` · min $${plHint.min}` : ""}
                  {" · "}{plHint.listing_name}
                </p>
                {plHint.push_enabled && (
                  <p className="text-xs text-muted-foreground">Dynamic pricing is active — PriceLabs adjusts this price daily</p>
                )}
              </div>
            ) : null
          )}

          {/* Group warning */}
          {groupSiblings && groupSiblings.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 space-y-2">
              <p className="text-xs text-amber-400 font-medium">
                ⚠ This listing is part of a group. Other members:
              </p>
              <ul className="space-y-0.5">
                {groupSiblings.map(s => (
                  <li key={s.id} className="text-xs text-muted-foreground">
                    • {s.name}
                    {s.price?.base != null && ` — PL base $${s.price.base}`}
                    {s.price?.min  != null && ` · min $${s.price.min}`}
                    {!s.price && " — price not mapped"}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sibAck}
                  onChange={e => setSibAck(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-xs text-muted-foreground">
                  Yes, this proposal is for this listing only
                </span>
              </label>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Reason
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Why make this change?"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring resize-none"
            />
          </div>

          {/* Risk note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Risk note (optional)
            </label>
            <input
              type="text"
              value={riskNote}
              onChange={e => setRiskNote(e.target.value)}
              placeholder="Any known risks or caveats?"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#E88159] px-4 py-2 text-sm font-medium text-white hover:bg-[#E88159]/90 transition-colors disabled:opacity-50"
            >
              <Send className="size-3.5" />
              {pending ? "Proposing…" : "Propose change"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
