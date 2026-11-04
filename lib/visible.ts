import { createAdminClient } from "@/lib/supabase/admin"

export type InactiveHandling = "never" | "with_activity" | "always"

/**
 * Returns a Set of property IDs that are visible (not hidden).
 *
 * inactiveHandling controls whether inactive (is_active = false) properties
 * are included:
 *   "never"         — exclude inactive properties (default; use for all dashboards)
 *   "with_activity" — include inactive if they have bookings departing in the
 *                     last 90 days (use for historical reports)
 *   "always"        — include all non-hidden regardless of is_active
 *                     (use for admin-only settings screens)
 */
export async function getVisiblePropertyIds(opts?: {
  inactiveHandling?: InactiveHandling
}): Promise<Set<string>> {
  const handling = opts?.inactiveHandling ?? "never"
  const admin = createAdminClient()

  if (handling === "always") {
    const { data } = await (admin as any)
      .from("properties")
      .select("id")
      .eq("is_hidden", false)
    return new Set<string>((data ?? []).map((r: { id: string }) => r.id))
  }

  if (handling === "never") {
    const { data } = await (admin as any)
      .from("properties")
      .select("id")
      .eq("is_hidden", false)
      .eq("is_active", true)
    return new Set<string>((data ?? []).map((r: { id: string }) => r.id))
  }

  // "with_activity": active non-hidden + inactive non-hidden with recent bookings
  const [{ data: active }, { data: inactive }] = await Promise.all([
    (admin as any)
      .from("properties")
      .select("id")
      .eq("is_hidden", false)
      .eq("is_active", true),
    (admin as any)
      .from("properties")
      .select("id")
      .eq("is_hidden", false)
      .eq("is_active", false),
  ])

  const result = new Set<string>((active ?? []).map((r: { id: string }) => r.id))
  const inactiveIds: string[] = (inactive ?? []).map((r: { id: string }) => r.id)

  if (inactiveIds.length > 0) {
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
    const { data: withActivity } = await (admin as any)
      .from("bookings")
      .select("property_id")
      .in("property_id", inactiveIds)
      .gte("departure", cutoff)
    for (const row of (withActivity ?? [])) {
      result.add((row as { property_id: string }).property_id)
    }
  }

  return result
}
