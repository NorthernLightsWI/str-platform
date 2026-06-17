"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  return { id: user.id, role: profile?.role ?? "admin" }
}

export async function createTask(data: {
  property_id              : string
  recommendation_id?       : string
  title                    : string
  description?             : string
  priority                 : string
  estimated_revenue_impact?: number | null
  due_date?                : string | null
}): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { error } = await admin.from("tasks").insert({
    property_id              : data.property_id,
    recommendation_id        : data.recommendation_id ?? null,
    title                    : data.title,
    description              : data.description ?? null,
    priority                 : data.priority,
    estimated_revenue_impact : data.estimated_revenue_impact ?? null,
    due_date                 : data.due_date ?? null,
    created_by               : user.id,
  })

  if (error) return { error: error.message }
  revalidatePath(`/properties/${data.property_id}`)
  return { ok: true }
}

export async function updateTaskStatus(
  id        : string,
  propertyId: string,
  status    : string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const patch: Record<string, unknown> = { status }
  if (status === "completed") patch.completed_at = new Date().toISOString()

  const { error } = await admin.from("tasks").update(patch).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}

export async function deleteTask(
  id        : string,
  propertyId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (user.role !== "admin") return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { error } = await admin.from("tasks").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}
