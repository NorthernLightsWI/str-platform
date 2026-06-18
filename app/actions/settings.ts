"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { runOwnerRezSync }   from "@/lib/sync/ownerrez"
import { runReviewsSync }    from "@/lib/sync/reviews"
import { runAmenitiesSync }  from "@/lib/sync/amenities"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") throw new Error("Admin only")
  return user
}

// ── Credential storage ────────────────────────────────────────────────────────

export async function saveSetting(key: string, value: string) {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { error } = await admin
      .from("app_settings")
      .upsert({ key, value: value || null }, { onConflict: "key" })
    if (error) return { error: error.message }
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

export async function saveSettings(entries: Record<string, string>) {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    for (const [key, value] of Object.entries(entries)) {
      const { error } = await admin
        .from("app_settings")
        .upsert({ key, value: value || null }, { onConflict: "key" })
      if (error) return { error: error.message }
    }
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ── OwnerRez sync ─────────────────────────────────────────────────────────────

export async function syncOwnerRez(): Promise<
  | { ok: true; propertiesSynced: number; bookingsSynced: number }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const result = await runOwnerRezSync()
    revalidatePath("/settings")
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed" }
  }
}

// ── Reviews sync ─────────────────────────────────────────────────────────────

export async function syncReviews(): Promise<
  | { ok: true; propertiesProcessed: number; reviewsSynced: number }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const result = await runReviewsSync()
    revalidatePath("/settings")
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Reviews sync failed" }
  }
}

// ── Amenities sync ────────────────────────────────────────────────────────────

export async function syncAmenities(): Promise<
  | { ok: true; propertiesSynced: number; amenitiesSynced: number }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const result = await runAmenitiesSync()
    revalidatePath("/amenity-gap")
    revalidatePath("/settings")
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Amenities sync failed" }
  }
}

// ── Connection tests ──────────────────────────────────────────────────────────

export async function testOwnerRezConnection(email: string, token: string) {
  try {
    await requireAdmin()
    if (!email || !token) return { error: "Email and API token are required" }

    const encoded = Buffer.from(`${email}:${token}`).toString("base64")
    const res = await fetch("https://api.ownerrez.com/v2/properties?limit=1", {
      headers: {
        Authorization: `Basic ${encoded}`,
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { error: `OwnerRez returned ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}` }
    }

    const data = await res.json()
    const count = data?.total_count ?? data?.items?.length ?? "?"
    return { ok: true, message: `Connected — ${count} propert${count === 1 ? "y" : "ies"} found` }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connection failed" }
  }
}

export async function testPriceLabsConnection(apiKey: string) {
  try {
    await requireAdmin()
    if (!apiKey) return { error: "API key is required" }

    const res = await fetch("https://api.pricelabs.co/v1/listings?size=1", {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { error: `PriceLabs returned ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}` }
    }

    return { ok: true, message: "Connected to PriceLabs" }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connection failed" }
  }
}

// ── User management ───────────────────────────────────────────────────────────

export async function inviteCleaner(data: {
  name     : string
  email    : string
  password : string
}) {
  try {
    await requireAdmin()
    if (!data.email.trim() || !data.password.trim()) return { error: "Email and password required" }

    const admin = createAdminClient()
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email         : data.email.trim(),
      password      : data.password,
      email_confirm : true,
      user_metadata : { full_name: data.name.trim() || data.email.trim() },
    })

    if (authError) return { error: authError.message }

    // Ensure role is cleaner (trigger may have set it correctly, but force it)
    if (authData?.user?.id) {
      await admin
        .from("profiles")
        .update({ role: "cleaner", full_name: data.name.trim() || null })
        .eq("id", authData.user.id)
    }

    revalidatePath("/settings")
    return { ok: true, userId: authData?.user?.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

export async function deleteUser(userId: string) {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return { error: error.message }
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function sendTestReport(): Promise<
  | { ok: true; emailId: string; recipient: string }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    // Ensure report_email is set before triggering
    const { data: emailSetting } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "report_email")
      .single()

    if (!emailSetting?.value) {
      return { ok: false, error: "Set a report_email address in Reports settings first" }
    }

    // Call the report API internally (server-side fetch)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

    const secret = process.env.SYNC_SECRET
    const res = await fetch(`${baseUrl}/api/reports/monthly`, {
      method : "POST",
      headers: {
        "Content-Type" : "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      cache: "no-store",
    })

    const json = await res.json()
    if (!res.ok || json.error) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` }
    }

    return { ok: true, emailId: json.emailId, recipient: json.recipient }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send report" }
  }
}

// ── Property visibility ───────────────────────────────────────────────────────

export async function setHiddenProperties(
  hiddenIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { error } = await admin
      .from("app_settings")
      .upsert({ key: "hidden_properties", value: JSON.stringify(hiddenIds) }, { onConflict: "key" })
    if (error) return { ok: false, error: error.message }
    revalidatePath("/overview")
    revalidatePath("/properties")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save" }
  }
}
