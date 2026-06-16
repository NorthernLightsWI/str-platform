import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Returns a Set of property UUIDs that have been hidden in Settings.
 *
 * The app_settings.value column is JSONB, so Supabase returns the stored
 * array as a parsed JavaScript array — NOT a JSON string. Both cases are
 * handled so this works regardless of column type.
 */
export async function getHiddenPropertyIds(): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "hidden_properties")
    .maybeSingle()

  const raw = (data as { value: unknown } | null)?.value
  return parseHiddenIds(raw)
}

export function parseHiddenIds(raw: unknown): Set<string> {
  if (!raw) return new Set()
  // JSONB column: Supabase already parsed it to an array
  if (Array.isArray(raw)) {
    return new Set(raw.filter((v): v is string => typeof v === "string"))
  }
  // TEXT column: stored as a JSON string, needs parsing
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((v): v is string => typeof v === "string"))
      }
    } catch {}
  }
  return new Set()
}
