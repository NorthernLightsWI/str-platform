"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single()

  return {
    id  : user.id,
    role: profile?.role ?? "admin",
    name: (profile?.full_name as string | null) ?? user.email ?? "Unknown",
  }
}

// ── Changelog helper ──────────────────────────────────────────────────────────

async function logChange(
  propertyId  : string,
  userId      : string,
  userName    : string,
  field       : string,
  oldValue    : string | null,
  newValue    : string | null,
) {
  const admin = createAdminClient() as any
  await admin.from("property_info_changelog").insert({
    property_id    : propertyId,
    changed_by_id  : userId,
    changed_by_name: userName,
    field_changed  : field,
    old_value      : oldValue,
    new_value      : newValue,
  })
}

// ── Property operational info ─────────────────────────────────────────────────

export async function upsertPropertyInfo(
  propertyId    : string,
  data          : Record<string, string | null>,
  changedFields?: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("property_operational_info")
    .upsert({ ...data, property_id: propertyId } as any, { onConflict: "property_id" })

  if (error) return { error: error.message }

  if (changedFields?.length) {
    for (const cf of changedFields) {
      await logChange(propertyId, user.id, user.name, cf.field, cf.oldValue, cf.newValue)
    }
  }

  revalidatePath("/operations/property-info")
  return { ok: true }
}

// ── Vendor contacts ───────────────────────────────────────────────────────────

export async function addVendorContact(
  propertyId: string,
  data: { category: string; name: string; phone?: string; email?: string; notes?: string },
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { error } = await admin.from("vendor_contacts").insert({
    property_id: propertyId,
    category   : data.category,
    name       : data.name,
    phone      : data.phone || null,
    email      : data.email || null,
    notes      : data.notes || null,
  })

  if (error) return { error: error.message }
  await logChange(propertyId, user.id, user.name, "vendor_added", null, data.name)
  revalidatePath("/operations/property-info")
  return { ok: true }
}

export async function updateVendorContact(
  id        : string,
  propertyId: string,
  data: { category: string; name: string; phone?: string; email?: string; notes?: string },
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { error } = await admin
    .from("vendor_contacts")
    .update({
      category: data.category,
      name    : data.name,
      phone   : data.phone || null,
      email   : data.email || null,
      notes   : data.notes || null,
    })
    .eq("id", id)

  if (error) return { error: error.message }
  await logChange(propertyId, user.id, user.name, "vendor_updated", null, data.name)
  revalidatePath("/operations/property-info")
  return { ok: true }
}

export async function deleteVendorContact(
  id        : string,
  propertyId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { error } = await admin.from("vendor_contacts").delete().eq("id", id)
  if (error) return { error: error.message }
  await logChange(propertyId, user.id, user.name, "vendor_deleted", null, null)
  revalidatePath("/operations/property-info")
  return { ok: true }
}

// ── Recurring maintenance ─────────────────────────────────────────────────────

export async function addRecurringItem(
  propertyId: string,
  data: { item_name: string; interval_days: number; notes?: string; filter_size?: string },
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { error } = await admin.from("recurring_maintenance").insert({
    property_id  : propertyId,
    item_name    : data.item_name,
    interval_days: data.interval_days,
    notes        : data.notes || null,
    filter_size  : data.filter_size || null,
  })

  if (error) return { error: error.message }
  revalidatePath("/operations/property-info")
  return { ok: true }
}

export async function markRecurringComplete(
  id        : string,
  filterSize?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { data: item } = await admin
    .from("recurring_maintenance")
    .select("item_name, interval_days, property_id")
    .eq("id", id)
    .single()

  if (!item) return { error: "Item not found" }

  const today   = new Date().toISOString().slice(0, 10)
  const nextDue = new Date()
  nextDue.setDate(nextDue.getDate() + (item.interval_days as number))

  const patch: Record<string, unknown> = {
    last_completed_date: today,
    last_completed_by  : user.name,
    next_due_date      : nextDue.toISOString().slice(0, 10),
    updated_at         : new Date().toISOString(),
  }
  if (filterSize) patch.filter_size = filterSize

  const { error } = await admin
    .from("recurring_maintenance")
    .update(patch)
    .eq("id", id)

  if (error) return { error: error.message }

  await logChange(
    item.property_id as string,
    user.id,
    user.name,
    item.item_name as string,
    null,
    `Completed ${today}`,
  )

  revalidatePath("/operations/property-info")
  return { ok: true }
}

export async function deleteRecurringItem(
  id        : string,
  propertyId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getUser()
  if (!user) return { error: "Unauthorized" }
  if (!["admin", "cleaner"].includes(user.role)) return { error: "Forbidden" }

  const admin = createAdminClient() as any
  const { error } = await admin.from("recurring_maintenance").delete().eq("id", id)
  if (error) return { error: error.message }
  await logChange(propertyId, user.id, user.name, "recurring_deleted", null, null)
  revalidatePath("/operations/property-info")
  return { ok: true }
}
