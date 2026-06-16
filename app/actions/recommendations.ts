"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

export async function dismissRecommendation(id: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from("recommendations")
    .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/recommendations")
}

export async function completeRecommendation(id: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from("recommendations")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/recommendations")
}
