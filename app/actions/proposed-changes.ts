"use server"

import { revalidatePath } from "next/cache"
import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { updatePriceLabsListings } from "@/lib/pricelabs"
import { MANUAL_ONLY_CHANGE_TYPES } from "@/lib/change-impact"
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

  const admin = createAdminClient()

  // Reject hidden or inactive properties
  const { data: visibleProp } = await (admin as any)
    .from("visible_properties")
    .select("id, pricelabs_listing_id, is_active")
    .eq("id", data.property_id)
    .maybeSingle()
  if (!visibleProp) {
    return { error: "Cannot propose changes for hidden properties" }
  }
  if (!visibleProp.is_active) {
    return { error: "Cannot propose changes for inactive properties" }
  }

  const prop = visibleProp

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
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden" }

  const admin = createAdminClient()

  const { data: proposal } = await (admin as any)
    .from("visible_proposed_changes")
    .select(`*, properties ( pricelabs_listing_id, pricelabs_price_floor, is_active )`)
    .eq("id", id)
    .eq("status", "approved")
    .single()

  if (!proposal) return { error: "Proposal not found or not approved" }
  if (proposal.properties?.is_active === false) {
    return { error: "Cannot apply changes to inactive properties" }
  }

  // Block change types that cannot be applied via the API
  if (MANUAL_ONLY_CHANGE_TYPES.has(proposal.change_type)) {
    return { error: `${proposal.change_type} changes cannot be applied via the PriceLabs API — use 'I applied this manually'` }
  }

  // Block if writes are disabled — dry-run must NOT mark the proposal as applied
  const writesEnabled = (await getAppSetting(admin, "pricelabs_writes_enabled")) === "true"
  if (!writesEnabled) {
    return { error: "API writes are disabled — use 'I applied this manually' or enable writes in Settings → PriceLabs" }
  }

  // Block if another pending or approved proposal exists for this property
  const { data: activeSiblings } = await (admin as any)
    .from("visible_proposed_changes")
    .select("id")
    .eq("property_id", proposal.property_id)
    .in("status", ["pending", "approved"])
    .neq("id", id)
    .limit(1)

  if (activeSiblings?.length > 0) {
    return { error: "Another proposal is already pending or approved for this property" }
  }

  // One-per-30-days: count only truly applied proposals (not dry-run, not failed/rejected)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: recentApplied } = await (admin as any)
    .from("visible_proposed_changes")
    .select("id")
    .eq("property_id", proposal.property_id)
    .eq("status", "applied")
    .gte("applied_at", thirtyDaysAgo)
    .neq("id", id)
    .limit(1)

  if (recentApplied?.length > 0) {
    return { error: "A change was already applied to this property in the last 30 days" }
  }

  // Max change % guardrail
  const maxPctStr = await getAppSetting(admin, "pricelabs_max_change_pct")
  const maxPct    = Number(maxPctStr ?? "10")
  const current   = Number(proposal.current_value)
  const proposed  = Number(proposal.proposed_value)
  if (!isNaN(current) && !isNaN(proposed) && current > 0) {
    const pct = Math.abs((proposed - current) / current) * 100
    if (pct > maxPct) {
      await (admin as any).from("proposed_changes").update({
        status: "failed",
        result: { error: `Change of ${pct.toFixed(1)}% exceeds max ${maxPct}%` },
        applied_at: new Date().toISOString(),
      }).eq("id", id)
      revalidatePath("/proposals")
      return { error: `Change of ${pct.toFixed(1)}% exceeds max ${maxPct}%` }
    }
  }

  // Price floor guardrail
  const floor = proposal.properties?.pricelabs_price_floor
  if (floor != null && !isNaN(proposed) && proposed < Number(floor)) {
    await (admin as any).from("proposed_changes").update({
      status: "failed",
      result: { error: `Proposed $${proposed} is below floor $${floor}` },
      applied_at: new Date().toISOString(),
    }).eq("id", id)
    revalidatePath("/proposals")
    return { error: `Proposed $${proposed} is below floor $${floor}` }
  }

  // Confirm listing ID is mapped
  const listingId = proposal.properties?.pricelabs_listing_id
  if (!listingId) {
    return { error: "PriceLabs listing ID not mapped for this property — set it in Settings → PriceLabs" }
  }

  // Build a non-empty payload (guaranteed by blocking manual-only types above)
  const apiKey = await getAppSetting(admin, "pricelabs_api_key")
  if (!apiKey) return { error: "PriceLabs API key not configured" }

  const payload  = proposal.payload as { listings?: Record<string, unknown>[] }
  const listings = (payload?.listings ?? []).map((l: Record<string, unknown>) => ({
    ...l,
    id: listingId,
  }))

  if (listings.length === 0 || !listings.some(l => Object.keys(l).some(k => !["id","pms"].includes(k)))) {
    return { error: "Proposal has no price fields to update — re-create the proposal" }
  }

  const plStartedAt = new Date().toISOString()
  const plRes = await updatePriceLabsListings(apiKey, listings as any)
  const plCompletedAt = new Date().toISOString()

  // Audit every PriceLabs write in sync_log regardless of outcome
  await (admin as any).from("sync_log").insert({
    property_id  : proposal.property_id,
    sync_type    : "pricelabs_write",
    status       : plRes.ok ? "success" : "error",
    error_message: plRes.ok ? null : plRes.error,
    started_at   : plStartedAt,
    completed_at : plCompletedAt,
    metadata     : {
      listing_id  : listingId,
      request_body: { listings },
      response    : plRes.ok ? plRes.raw : null,
    },
  })

  if (!plRes.ok) {
    await (admin as any).from("proposed_changes").update({
      status: "failed",
      result: { error: plRes.error },
      applied_at: new Date().toISOString(),
    }).eq("id", id)
    revalidatePath("/proposals")
    return { error: plRes.error }
  }

  // Mark applied and create listing_change
  await (admin as any).from("proposed_changes").update({
    status    : "applied",
    result    : { raw: plRes.raw },
    decided_by: user.id,
    decided_at: new Date().toISOString(),
    applied_at: new Date().toISOString(),
  }).eq("id", id)

  await (admin as any).from("listing_changes").insert({
    property_id      : proposal.property_id,
    change_type      : proposal.change_type,
    label            : proposal.label,
    before_value     : proposal.current_value,
    after_value      : proposal.proposed_value,
    reason           : proposal.reason,
    recommendation_id: proposal.recommendation_id,
    source           : "pricelabs_api",
    applied_at       : new Date().toISOString().slice(0, 10),
    applied_by       : user.id,
    status           : "active",
  })

  revalidatePath("/proposals")
  revalidatePath("/changes")
  revalidatePath("/properties")
  return { ok: true }
}

export async function markProposalAppliedManually(
  id       : string,
  appliedAt: string,  // YYYY-MM-DD
): Promise<{ ok?: boolean; error?: string }> {
  const user = await getAdminUser()
  if (!user) return { error: "Forbidden" }

  const admin = createAdminClient()

  const { data: proposal } = await (admin as any)
    .from("visible_proposed_changes")
    .select("*")
    .eq("id", id)
    .eq("status", "approved")
    .single()

  if (!proposal) return { error: "Proposal not found or not in approved status" }

  // Create the listing_change row (manual)
  const { error: lcErr } = await (admin as any)
    .from("listing_changes")
    .insert({
      property_id      : proposal.property_id,
      change_type      : proposal.change_type,
      label            : proposal.label,
      before_value     : proposal.current_value,
      after_value      : proposal.proposed_value,
      reason           : proposal.reason,
      recommendation_id: proposal.recommendation_id,
      source           : "manual",
      applied_at       : appliedAt,
      applied_by       : user.id,
      status           : "active",
    })

  if (lcErr) return { error: lcErr.message }

  // Mark proposal applied
  await (admin as any)
    .from("proposed_changes")
    .update({
      status    : "applied",
      result    : { manual: true, applied_at: appliedAt },
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      applied_at: new Date().toISOString(),
    })
    .eq("id", id)

  revalidatePath("/proposals")
  revalidatePath("/changes")
  revalidatePath("/properties")
  return { ok: true }
}
