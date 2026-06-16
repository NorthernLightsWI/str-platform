"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

function revalidate() {
  revalidatePath("/operations/maintenance")
}

export async function createIssue(data: {
  propertyId   : string
  title        : string
  description  : string
  priority     : string
  category     : string
  reporterName : string
  notes        : string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const admin = createAdminClient()
  const { error } = await admin.from("maintenance_issues").insert({
    property_id   : data.propertyId,
    reported_by   : user.id,
    reporter_name : data.reporterName.trim() || null,
    title         : data.title.trim(),
    description   : data.description.trim()  || null,
    priority      : data.priority            || "medium",
    category      : data.category.trim()     || null,
    notes         : data.notes.trim()        || null,
    status        : "open",
  })

  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function updateIssueStatus(id: string, status: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const patch: Record<string, unknown> = { status }
  if (status === "resolved" || status === "closed") {
    patch.resolved_at = new Date().toISOString()
  } else {
    patch.resolved_at = null
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("maintenance_issues")
    .update(patch)
    .eq("id", id)

  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}

export async function updateIssueNotes(id: string, notes: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("maintenance_issues")
    .update({ notes: notes.trim() || null })
    .eq("id", id)

  if (error) return { error: error.message }
  revalidate()
  return { ok: true }
}
