import { createAdminClient } from "@/lib/supabase/admin"
import { fetchReviewsForProperty, type OwnerRezCredentials } from "@/lib/integrations/ownerrez"

const BETWEEN_PROPERTIES_MS = 3_000

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export type ReviewsSyncResult = {
  propertiesProcessed : number
  reviewsSynced       : number
}

export async function runReviewsSync(): Promise<ReviewsSyncResult> {
  const supabase  = createAdminClient()
  const startedAt = new Date().toISOString()

  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("key, value")

  const NEEDED = new Set(["ownerrez_email", "ownerrez_api_token"])
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) {
    if (!NEEDED.has(row.key)) continue
    try { settings[row.key] = JSON.parse(row.value as string) } catch { settings[row.key] = row.value as string }
  }

  const creds: OwnerRezCredentials = {
    email    : settings.ownerrez_email,
    apiToken : settings.ownerrez_api_token,
  }

  if (!creds.email || !creds.apiToken) {
    throw new Error("ownerrez_email and ownerrez_api_token must be set in app_settings")
  }

  const { data: syncEntry } = await supabase
    .from("sync_log")
    .insert({ sync_type: "reviews", status: "running", started_at: startedAt })
    .select("id")
    .single()

  const syncId = syncEntry?.id
  let propertiesProcessed = 0
  let reviewsSynced       = 0

  try {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, ownerrez_id")
      .not("ownerrez_id", "is", null)

    const props = properties ?? []

    for (let i = 0; i < props.length; i++) {
      if (i > 0) await sleep(BETWEEN_PROPERTIES_MS)

      const prop = props[i]
      if (!prop.ownerrez_id) continue

      const orReviews = await fetchReviewsForProperty(creds, prop.ownerrez_id)

      const reviewRows = orReviews.map(r => {
        // OwnerRez v2 field names vary — try all known aliases so nothing is
        // silently dropped when the API uses a different key than expected.
        const a = r as any  // escape hatch for undocumented / aliased fields
        return ({
        ownerrez_id          : String(r.id),
        property_id          : prop.id,
        listing_site         : r.listing_site  ?? a.platform    ?? a.channel       ?? null,
        reviewer_name        : r.reviewer_name ?? a.guest_name  ?? a.author        ?? a.guest?.name ?? null,
        overall_rating       : r.rating        ?? a.overall     ?? a.overall_rating ?? a.score       ?? null,
        cleanliness_rating   : r.cleanliness   ?? a.cleanliness_rating             ?? null,
        communication_rating : r.communication ?? a.communication_rating           ?? null,
        location_rating      : r.location      ?? a.location_rating                ?? null,
        accuracy_rating      : r.accuracy      ?? a.accuracy_rating                ?? null,
        value_rating         : r.value         ?? a.value_rating                   ?? null,
        review_text          : r.comments      ?? a.body        ?? a.review        ?? a.review_text  ?? null,
        response_text        : r.response      ?? a.response_text                  ?? null,
        response_at          : r.response_date  ?? a.response_at  ?? null,
        reviewed_at          : r.submitted_date ?? a.submitted_at ?? a.reviewed_at ?? null,
      })
      })

      if (reviewRows.length > 0) {
        const { error } = await supabase
          .from("reviews")
          .upsert(reviewRows, { onConflict: "ownerrez_id" })
        if (error) throw error
        reviewsSynced += reviewRows.length
      }

      propertiesProcessed++
    }

    if (syncId) {
      await supabase
        .from("sync_log")
        .update({
          status         : "success",
          records_synced : reviewsSynced,
          records_failed : 0,
          completed_at   : new Date().toISOString(),
        })
        .eq("id", syncId)
    }

    return { propertiesProcessed, reviewsSynced }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (syncId) {
      await supabase
        .from("sync_log")
        .update({
          status         : "error",
          error_message  : message,
          records_synced : reviewsSynced,
          completed_at   : new Date().toISOString(),
        })
        .eq("id", syncId)
    }

    throw err
  }
}
