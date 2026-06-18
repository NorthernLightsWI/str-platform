"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function toggleAmenity(
  propertyId : string,
  amenityKey : string,
  isPresent  : boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "admin") return { error: "Admin only" }

  const admin = createAdminClient() as any
  const { error } = await admin
    .from("property_amenities")
    .upsert(
      { property_id: propertyId, amenity_key: amenityKey, is_present: isPresent, updated_by: user.id },
      { onConflict: "property_id,amenity_key" },
    )

  if (error) return { error: error.message }
  revalidatePath("/amenity-gap")
  return { ok: true }
}
