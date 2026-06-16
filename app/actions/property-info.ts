"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function upsertPropertyInfo(
  propertyId : string,
  data       : Record<string, string | null>,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") return { error: "Forbidden: admins only" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("property_operational_info")
    .upsert({ ...data, property_id: propertyId }, { onConflict: "property_id" })

  if (error) return { error: error.message }
  revalidatePath("/operations/property-info")
  return { ok: true }
}
