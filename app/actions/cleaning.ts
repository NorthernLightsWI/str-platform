"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

function revalidateCleaningPaths() {
  revalidatePath("/operations/property-overview")
  revalidatePath("/operations/cleaner-dashboard")
}

// ── Property Overview: admin "Mark as Clean" ──────────────────────────────────

export async function markAsClean(propertyId: string, bookingId: string | null = null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const now   = new Date()
  const admin = createAdminClient()

  const { error } = await admin.from("cleaning_records").insert({
    property_id    : propertyId,
    booking_id     : bookingId,
    assigned_to    : user.id,
    scheduled_date : now.toISOString().slice(0, 10),
    status         : "completed",
    completed_at   : now.toISOString(),
  })

  if (error) return { error: error.message }
  revalidateCleaningPaths()
  return { ok: true }
}

// ── Cleaner Dashboard: save notes to an in-progress record ────────────────────

export async function saveCleaningNotes(
  propertyId : string,
  bookingId  : string | null,
  recordId   : string | null,
  notes      : string,
): Promise<{ ok?: true; recordId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const admin = createAdminClient()
  const now   = new Date()

  if (recordId) {
    const { error } = await admin
      .from("cleaning_records")
      .update({ notes })
      .eq("id", recordId)

    if (error) return { error: error.message }
    return { ok: true, recordId }
  }

  const { data, error } = await admin
    .from("cleaning_records")
    .insert({
      property_id    : propertyId,
      booking_id     : bookingId,
      assigned_to    : user.id,
      scheduled_date : now.toISOString().slice(0, 10),
      status         : "in_progress",
      notes,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  return { ok: true, recordId: data.id }
}

// ── Cleaner Dashboard: mark clean (optionally finishes an in-progress record) ─

export async function markAsCleanWithNotes(
  propertyId : string,
  bookingId  : string | null,
  recordId   : string | null,
  notes      : string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const admin = createAdminClient()
  const now   = new Date()

  if (recordId) {
    const { error } = await admin
      .from("cleaning_records")
      .update({
        status      : "completed",
        completed_at: now.toISOString(),
        notes       : notes || null,
      })
      .eq("id", recordId)

    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from("cleaning_records")
      .insert({
        property_id    : propertyId,
        booking_id     : bookingId,
        assigned_to    : user.id,
        scheduled_date : now.toISOString().slice(0, 10),
        status         : "completed",
        completed_at   : now.toISOString(),
        notes          : notes || null,
      })

    if (error) return { error: error.message }
  }

  revalidateCleaningPaths()
  return { ok: true }
}
