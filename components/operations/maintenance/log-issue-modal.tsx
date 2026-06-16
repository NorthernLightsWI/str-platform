"use client"

import { useState, useTransition } from "react"
import { X, Loader2 } from "lucide-react"
import { createIssue } from "@/app/actions/maintenance"

type Property = { id: string; name: string }

interface Props {
  properties : Property[]
  onClose    : () => void
}

const PRIORITIES = ["low", "medium", "high", "urgent"] as const

export function LogIssueModal({ properties, onClose }: Props) {
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  const [form, setForm] = useState({
    propertyId   : properties[0]?.id ?? "",
    title        : "",
    description  : "",
    priority     : "medium" as string,
    category     : "",
    reporterName : "",
    notes        : "",
  })

  function set(key: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.propertyId) return

    setError(null)
    startTransition(async () => {
      const res = await createIssue(form)
      if (res?.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Log Maintenance Issue</h2>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Property */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Property *</label>
            <select
              value={form.propertyId}
              onChange={e => set("propertyId", e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            >
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Title *</label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="e.g. Broken dishwasher, Leaking faucet"
              required
              className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          {/* Priority + Category row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Priority</label>
              <select
                value={form.priority}
                onChange={e => set("priority", e.target.value)}
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 capitalize"
              >
                {PRIORITIES.map(p => (
                  <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Category</label>
              <input
                value={form.category}
                onChange={e => set("category", e.target.value)}
                placeholder="Plumbing, Electric…"
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Describe the issue in detail…"
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>

          {/* Reported by + Notes row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reported by</label>
              <input
                value={form.reporterName}
                onChange={e => set("reporterName", e.target.value)}
                placeholder="Name or guest…"
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <input
                value={form.notes}
                onChange={e => set("notes", e.target.value)}
                placeholder="Vendor info, parts needed…"
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Actions */}
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
              disabled={pending || !form.title.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? "Logging…" : "Log Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
