"use client"

import { useState, useTransition } from "react"
import { X, Loader2 } from "lucide-react"
import { CHANGE_TYPES, CHANGE_TYPE_LABELS, type ChangeTypeValue } from "@/lib/change-impact"
import { createListingChange } from "@/app/actions/listing-changes"

export type LogChangeModalProps = {
  properties         : { id: string; name: string }[]
  onClose            : () => void
  onCreated         ?: (id: string) => void
  // Pre-fill from a recommendation
  prefillPropertyId ?: string
  prefillType       ?: ChangeTypeValue
  prefillLabel      ?: string
  prefillReason     ?: string
  prefillRecId      ?: string
  // Optionally mark rec completed
  onMarkRecCompleted?: () => void
}

const TODAY = new Date().toISOString().slice(0, 10)

const INPUT_CLS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground/50 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"

export function LogChangeModal({
  properties,
  onClose,
  onCreated,
  prefillPropertyId,
  prefillType,
  prefillLabel,
  prefillReason,
  prefillRecId,
  onMarkRecCompleted,
}: LogChangeModalProps) {
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)
  const [markRec, setMarkRec]      = useState(!!prefillRecId)

  const [form, setForm] = useState({
    property_id  : prefillPropertyId ?? properties[0]?.id ?? "",
    change_type  : (prefillType ?? "other") as ChangeTypeValue,
    label        : prefillLabel ?? "",
    before_value : "",
    after_value  : "",
    reason       : prefillReason ?? "",
    applied_at   : TODAY,
    notes        : "",
  })

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.property_id || !form.label.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await createListingChange({
        ...form,
        recommendation_id: prefillRecId ?? null,
      })
      if (res?.error) { setError(res.error); return }
      if (markRec && onMarkRecCompleted) onMarkRecCompleted()
      onCreated?.(res.id!)
      onClose()
    })
  }

  const isLocked = !!prefillPropertyId

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Log a Change</h2>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Property */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Property *</label>
            <select
              value={form.property_id}
              onChange={e => set("property_id", e.target.value)}
              required
              disabled={isLocked}
              className={INPUT_CLS}
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Type + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Change Type *</label>
              <select
                value={form.change_type}
                onChange={e => set("change_type", e.target.value as ChangeTypeValue)}
                className={INPUT_CLS}
              >
                {CHANGE_TYPES.map(t => (
                  <option key={t} value={t}>{CHANGE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Date Applied *</label>
              <input
                type="date"
                value={form.applied_at}
                max={TODAY}
                onChange={e => set("applied_at", e.target.value)}
                required
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Short Label *</label>
            <input
              value={form.label}
              onChange={e => set("label", e.target.value)}
              placeholder="e.g. Raised base price $20, Added hot tub to listing"
              required
              className={INPUT_CLS}
            />
          </div>

          {/* Before / After row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Before Value</label>
              <input
                value={form.before_value}
                onChange={e => set("before_value", e.target.value)}
                placeholder="e.g. $150/night, 2 nights"
                className={INPUT_CLS}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">After Value</label>
              <input
                value={form.after_value}
                onChange={e => set("after_value", e.target.value)}
                placeholder="e.g. $170/night, 1 night"
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reason</label>
            <textarea
              value={form.reason}
              onChange={e => set("reason", e.target.value)}
              placeholder="Why did you make this change?"
              rows={2}
              className={INPUT_CLS + " resize-none"}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Additional context…"
              rows={2}
              className={INPUT_CLS + " resize-none"}
            />
          </div>

          {/* Mark rec completed */}
          {prefillRecId && onMarkRecCompleted && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={markRec}
                onChange={e => setMarkRec(e.target.checked)}
                className="size-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-foreground">Mark recommendation as completed</span>
            </label>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !form.label.trim()}
              className="flex items-center gap-2 rounded-lg bg-[#E88159] px-4 py-2 text-sm font-medium text-white hover:bg-[#E88159]/80 transition-colors disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? "Saving…" : "Log Change"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
