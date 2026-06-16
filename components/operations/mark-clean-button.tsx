"use client"

import { useTransition } from "react"
import { CheckCircle, Loader2 } from "lucide-react"
import { markAsClean } from "@/app/actions/cleaning"

interface Props {
  propertyId : string
  bookingId  : string | null
}

export function MarkCleanButton({ propertyId, bookingId }: Props) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => { await markAsClean(propertyId, bookingId) })}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending
        ? <Loader2 className="size-4 animate-spin" />
        : <CheckCircle className="size-4" />}
      {pending ? "Marking clean…" : "Mark as Clean"}
    </button>
  )
}
