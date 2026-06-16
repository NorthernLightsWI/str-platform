"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") throw new Error("Admin only")
  return user
}

export type AlertType =
  | "occupancy_drop"
  | "revenue_drop"
  | "no_booking_7_days"
  | "no_booking_14_days"

export async function createAlert(data: {
  type      : AlertType
  threshold : number | null
  email     : string
}) {
  try {
    const user = await requireAdmin()
    if (!data.email.trim()) return { error: "Email is required" }

    const admin = createAdminClient()
    const { error } = await admin.from("alert_settings").insert({
      alert_type : data.type,
      threshold  : data.threshold,
      channels   : { email: data.email.trim().toLowerCase() },
      is_enabled : true,
      profile_id : user.id,
    })

    if (error) return { error: error.message }
    revalidatePath("/alerts")
    return { ok: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

export async function updateAlertEnabled(id: string, enabled: boolean) {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { error } = await admin
      .from("alert_settings")
      .update({ is_enabled: enabled })
      .eq("id", id)

    if (error) return { error: error.message }
    revalidatePath("/alerts")
    return { ok: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

export async function deleteAlert(id: string) {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { error } = await admin
      .from("alert_settings")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }
    revalidatePath("/alerts")
    return { ok: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}
