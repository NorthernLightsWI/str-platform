"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import { updatePriceLabsListings } from "@/lib/pricelabs"
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

async function getAppSetting(
  admin: ReturnType<typeof createAdminClient>,
  key  : string,
): Promise<string | null> {
  const { data } = await (admin as any)
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single()
  if (!data) return null
  const v = data.value
  if (typeof v === "string") return v
  if (v === null || v === undefined) return null
  try { return String(JSON.parse(String(v))) } catch { return String(v) }
}

export async function createProposal(data: {
  property_id       : string
  change_type       : ChangeTypeValue
  label             : string
  current_value     : string
  proposed_value    : string
  reason            : string
  recommendation_id?: string | null
  risk_note         : string
}): Promise<{ ok?: boolean; id?: string; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden — admin only" }

  const admin     = createAdminClient()
  const hiddenIds = await getHiddenPropertyIds()
  if (hiddenIds.has(data.property_id)) {
    return { error: "Cannot propose changes for hidden properties" }
  }

  // Fetch PriceLabs listing ID for this property
  const { data: prop } = await (admin as any)
    .from("properties")
    .select("pricelabs_listing_id")
    .eq("id", data.property_id)
    .single()

  const listingId = prop?.pricelabs_listing_id ?? null

  const proposed = Number(data.proposed_value)
  const listings: Record<string, unknown>[] = [{
    id : listingId ?? "(not mapped)",
    pms: "ownerrez",
    ...(data.change_type === "price_base" && !isNaN(proposed) ? { base: proposed } : {}),
    ...(data.change_type === "price_min"  && !isNaN(proposed) ? { min:  proposed } : {}),
  }]

  const payload = { listings }

  const { data: row, error } = await (admin as any)
    .from("proposed_changes")
    .insert({
      property_id      : data.property_id,
      change_type      : data.change_type,
      label            : data.label.trim(),
      current_value    : data.current_value.trim() || null,
      proposed_value   : data.proposed_value.trim() || null,
      reason           : data.reason.trim()         || null,
      recommendation_id: data.recommendation_id     || null,
      risk_note        : data.risk_note.trim()       || null,
      status           : "pending",
      payload,
      created_by       : user.id,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/proposals")
  return { ok: true, id: row.id }
}

export async function approveProposal(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden" }

  const admin = createAdminClient()
  const { error } = await (admin as any)
    .from("proposed_changes")
    .update({
      status    : "approved",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")

  if (error) return { error: error.message }

  revalidatePath("/proposals")
  return { ok: true }
}

export async function rejectProposal(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden" }

  const admin = createAdminClient()
  const { error } = await (admin as any)
    .from("proposed_changes")
    .update({
      status    : "rejected",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["pending", "approved"])

  if (error) return { error: error.message }

  revalidatePath("/proposals")
  return { ok: true }
}

export async function applyProposal(
  id: string,
): Promise<{ ok?: boolean; dryRun?: boolean; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden" }

  const admin = createAdminClient()

  const { data: proposal } = await (admin as any)
    .from("proposed_changes")
    .select(`
      *,
      properties ( pricelabs_listing_id, pricelabs_price_floor )
    `)
    .eq("id", id)
    .eq("status", "approved")
    .single()

  if (!proposal) return { error: "Proposal not found or not approved" }

  // Hidden property guardrail
  const hiddenIds = await getHiddenPropertyIds()
  if (hiddenIds.has(proposal.property_id)) {
    return { error: "Cannot apply changes to hidden properties" }
  }

  // Max change % guardrail
  const maxPctStr = await getAppSetting(admin, "pricelabs_max_change_pct")
  const maxPct    = Number(maxPctStr ?? "10")
  const current   = Number(proposal.current_value)
  const proposed  = Number(proposal.proposed_value)
  if (!isNaN(current) && !isNaN(proposed) && current > 0) {
    const pct = Math.abs((proposed - current) / current) * 100
    if (pct > maxPct) {
      await (admin as any)
        .from("proposed_changes")
        .update({
          status    : "failed",
          result    : { error: `Change of ${pct.toFixed(1)}% exceeds max ${maxPct}%` },
          applied_at: new Date().toISOString(),
        })
        .eq("id", id)
      revalidatePath("/proposals")
      return { error: `Change of ${pct.toFixed(1)}% exceeds max ${maxPct}%` }
    }
  }

  // Price floor guardrail
  const floor = proposal.properties?.pricelabs_price_floor
  if (floor != null && !isNaN(proposed) && proposed < Number(floor)) {
    await (admin as any)
      .from("proposed_changes")
      .update({
        status    : "failed",
        result    : { error: `Proposed $${proposed} is below floor $${floor}` },
        applied_at: new Date().toISOString(),
      })
      .eq("id", id)
    revalidatePath("/proposals")
    return { error: `Proposed $${proposed} is below floor $${floor}` }
  }

  // One-per-30-days guardrail
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: recent } = await (admin as any)
    .from("proposed_changes")
    .select("id")
    .eq("property_id", proposal.property_id)
    .eq("status", "applied")
    .gte("applied_at", thirtyDaysAgo)
    .neq("id", id)
    .limit(1)

  if (recent && recent.length > 0) {
    return { error: "A change was already applied to this property in the last 30 days" }
  }

  // Determine dry-run mode
  const writesEnabled = (await getAppSetting(admin, "pricelabs_writes_enabled")) === "true"
  const isDryRun      = !writesEnabled

  let result: Record<string, unknown> = {}

  if (!isDryRun) {
    const apiKey = await getAppSetting(admin, "pricelabs_api_key")
    if (!apiKey) return { error: "PriceLabs API key not configured" }

    const listingId = proposal.properties?.pricelabs_listing_id
    if (!listingId) {
      return { error: "PriceLabs listing ID not mapped for this property — set it in Settings → PriceLabs" }
    }

    const payload  = proposal.payload as { listings?: Record<string, unknown>[] }
    const listings = (payload?.listings ?? []).map((l: Record<string, unknown>) => ({
      ...l,
      id: listingId,
    }))

    const plRes = await updatePriceLabsListings(apiKey, listings as any)
    if (!plRes.ok) {
      await (admin as any)
        .from("proposed_changes")
        .update({
          status    : "failed",
          result    : { error: plRes.error },
          applied_at: new Date().toISOString(),
        })
        .eq("id", id)
      revalidatePath("/proposals")
      return { error: plRes.error }
    }
    result = { raw: plRes.raw }
  } else {
    result = { dry_run: true, payload: proposal.payload }
  }

  // Mark applied
  await (admin as any)
    .from("proposed_changes")
    .update({
      status    : "applied",
      result,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
    })
    .eq("id", id)

  // Auto-create listing_change record
  await (admin as any)
    .from("listing_changes")
    .insert({
      property_id      : proposal.property_id,
      change_type      : proposal.change_type,
      label            : proposal.label,
      before_value     : proposal.current_value,
      after_value      : proposal.proposed_value,
      reason           : proposal.reason,
      recommendation_id: proposal.recommendation_id,
      source           : isDryRun ? "manual" : "pricelabs_api",
      applied_at       : new Date().toISOString().slice(0, 10),
      applied_by       : user.id,
      status           : "active",
    })

  revalidatePath("/proposals")
  revalidatePath("/changes")
  revalidatePath("/properties")
  return { ok: true, dryRun: isDryRun }
}
