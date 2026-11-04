"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ChangeTypeValue } from "@/lib/change-impact"

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") return null
  return { id: user.id }
}

export async function createListingChange(data: {
  property_id       : string
  change_type       : ChangeTypeValue
  label             : string
  before_value      : string
  after_value       : string
  reason            : string
  applied_at        : string   // YYYY-MM-DD
  notes             : string
  recommendation_id?: string | null
}): Promise<{ ok?: boolean; id?: string; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden — admin only" }

  const admin = createAdminClient()
  const { data: row, error } = await (admin as any)
    .from("listing_changes")
    .insert({
      property_id       : data.property_id,
      change_type       : data.change_type,
      label             : data.label.trim(),
      before_value      : data.before_value.trim() || null,
      after_value       : data.after_value.trim()  || null,
      reason            : data.reason.trim()        || null,
      applied_at        : data.applied_at,
      applied_by        : user.id,
      notes             : data.notes.trim()         || null,
      recommendation_id : data.recommendation_id    || null,
      source            : "manual",
      status            : "active",
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/changes")
  revalidatePath("/properties")
  return { ok: true, id: row.id }
}

export async function revertListingChange(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden — admin only" }

  const admin = createAdminClient()
  const { error } = await (admin as any)
    .from("listing_changes")
    .update({
      status      : "reverted",
      reverted_at : new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "active")

  if (error) return { error: error.message }

  revalidatePath("/changes")
  revalidatePath("/properties")
  return { ok: true }
}
