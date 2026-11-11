"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createSeamProvider } from "@/lib/thermostat/seam"
import { reconcileAll } from "@/lib/thermostat/reconcile"
import type { SeamDevice } from "@/lib/thermostat/provider"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") throw new Error("Admin only")
  return user
}

async function getSeamKey(): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin.from("app_settings").select("value").eq("key", "seam_api_key").single()
  const key = typeof data?.value === "string" ? data.value.trim() : ""
  if (!key) throw new Error("Seam API key not configured. Add it in Settings → Thermostats.")
  return key
}

// ── API key / master settings ─────────────────────────────────────────────────

export async function saveSeamSettings(entries: Record<string, string>) {
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

// ── Device discovery ──────────────────────────────────────────────────────────

export async function listSeamDevices(): Promise<
  { ok: true; devices: SeamDevice[] } | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const apiKey   = await getSeamKey()
    const provider = createSeamProvider(apiKey)
    const devices  = await provider.listDevices()
    return { ok: true, devices }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ── Device assignment ─────────────────────────────────────────────────────────

export async function assignThermostat(params: {
  property_id   : string
  seam_device_id: string
  label         : string
  capabilities  : Record<string, unknown>
}): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from("thermostats")
      .upsert(
        {
          property_id   : params.property_id,
          seam_device_id: params.seam_device_id,
          label         : params.label,
          capabilities  : params.capabilities,
          last_seen     : new Date().toISOString(),
        },
        { onConflict: "seam_device_id" },
      )
    if (error) return { error: error.message }
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

export async function unassignThermostat(id: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { error } = await (admin as any).from("thermostats").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ── Per-property thermostat settings ─────────────────────────────────────────

export async function saveThermostatPropertySettings(settings: {
  property_id            : string
  enabled                : boolean
  dry_run                : boolean
  occupied_heat          : number
  occupied_cool          : number
  vacant_heat            : number
  vacant_cool            : number
  freeze_floor           : number
  warmup_minutes         : number
  checkout_buffer_minutes: number
}): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin()

    if (settings.occupied_heat < settings.freeze_floor) {
      return { error: `occupied_heat (${settings.occupied_heat}°F) is below freeze_floor (${settings.freeze_floor}°F)` }
    }
    if (settings.vacant_heat < settings.freeze_floor) {
      return { error: `vacant_heat (${settings.vacant_heat}°F) is below freeze_floor (${settings.freeze_floor}°F)` }
    }
    if (settings.freeze_floor < 55) {
      return { error: "freeze_floor cannot be set below 55°F" }
    }

    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from("thermostat_settings")
      .upsert(settings, { onConflict: "property_id" })
    if (error) return { error: error.message }
    revalidatePath("/settings")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ── Preview (forced dry-run) ──────────────────────────────────────────────────

export async function previewThermostatReconcile() {
  try {
    await requireAdmin()
    const results = await reconcileAll(true)
    return { ok: true as const, results }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Unknown error" }
  }
}

// ── Last 50 events ────────────────────────────────────────────────────────────

export async function getThermostatEvents() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await (admin as any)
      .from("visible_thermostat_events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(50)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const, events: data ?? [] }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Unknown error" }
  }
}
