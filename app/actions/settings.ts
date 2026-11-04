"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { runOwnerRezSync }   from "@/lib/sync/ownerrez"
import { runReviewsSync }    from "@/lib/sync/reviews"
import { runAmenitiesSync }  from "@/lib/sync/amenities"
import { getPriceLabsListings, updateListingTags } from "@/lib/pricelabs"

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

// ── PriceLabs per-property settings ──────────────────────────────────────────

export async function savePriceLabsPropertySettings(
  rows: { id: string; pricelabs_listing_id: string | null; pricelabs_price_floor: number | null }[],
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    for (const row of rows) {
      const { error } = await (admin as any)
        .from("properties")
        .update({
          pricelabs_listing_id : row.pricelabs_listing_id  || null,
          pricelabs_price_floor: row.pricelabs_price_floor ?? null,
        })
        .eq("id", row.id)
      if (error) return { error: error.message }
    }
    revalidatePath("/settings")
    revalidatePath("/proposals")
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

// ── PriceLabs read / write helpers ───────────────────────────────────────────

async function getPriceLabsApiKey(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "pricelabs_api_key").single()
  if (!data) return null
  const v = data.value
  if (typeof v === "string") return v || null
  if (v === null || v === undefined) return null
  try { return String(JSON.parse(String(v))) || null } catch { return String(v) || null }
}

export async function fetchPriceLabsListings(): Promise<
  | { ok: true;  listings: { id: string; name: string; base: number | null; min: number | null; pms: string }[] }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const admin  = createAdminClient()
    const apiKey = await getPriceLabsApiKey(admin)
    if (!apiKey) return { ok: false, error: "PriceLabs API key not configured" }

    const result = await getPriceLabsListings(apiKey)
    if (!result.ok) return result

    return {
      ok      : true,
      listings: result.listings.map(l => ({
        id  : l.id,
        name: l.name,
        base: l.base,
        min : l.min,
        pms : l.pms,
      })),
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to fetch PriceLabs listings" }
  }
}

export async function testPriceLabsTagWrite(
  listingId: string,
  action   : "add" | "remove",
): Promise<{ ok?: boolean; error?: string; message?: string }> {
  try {
    await requireAdmin()
    const admin  = createAdminClient()
    const apiKey = await getPriceLabsApiKey(admin)
    if (!apiKey) return { error: "PriceLabs API key not configured" }

    // Fetch current tags so we don't clobber existing ones
    const fetchResult = await getPriceLabsListings(apiKey)
    if (!fetchResult.ok) return { error: fetchResult.error }

    const listing = fetchResult.listings.find(l => l.id === listingId)
    if (!listing) return { error: `Listing ${listingId} not found in PriceLabs account` }

    const TEST_TAG    = "claude-test"
    const currentTags = listing.tags ?? []
    let newTags: string[]

    if (action === "add") {
      if (currentTags.includes(TEST_TAG)) return { ok: true, message: "Tag already present" }
      if (currentTags.length >= 10) return { error: "Listing already has 10 tags (PriceLabs maximum)" }
      newTags = [...currentTags, TEST_TAG]
    } else {
      newTags = currentTags.filter(t => t !== TEST_TAG)
      if (newTags.length === currentTags.length) return { ok: true, message: "Tag was not present" }
    }

    const writeResult = await updateListingTags(apiKey, listingId, listing.pms, newTags)
    if (!writeResult.ok) return { error: writeResult.error }

    return {
      ok     : true,
      message: action === "add"
        ? `Tag 'claude-test' added to "${listing.name}"`
        : `Tag 'claude-test' removed from "${listing.name}"`,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" }
  }
}

export async function getPropertyPlPrice(propertyId: string): Promise<{
  base        : number | null
  min         : number | null
  max         : number | null
  push_enabled: boolean
  listing_name: string
  listing_id  : string
} | null> {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    const { data: prop } = await (admin as any)
      .from("properties")
      .select("pricelabs_listing_id")
      .eq("id", propertyId)
      .single()

    if (!prop?.pricelabs_listing_id) return null

    const apiKey = await getPriceLabsApiKey(admin)
    if (!apiKey) return null

    const result = await getPriceLabsListings(apiKey)
    if (!result.ok) return null

    const listing = result.listings.find(l => l.id === prop.pricelabs_listing_id)
    if (!listing) return null

    return {
      base        : listing.base,
      min         : listing.min,
      max         : listing.max,
      push_enabled: listing.push_enabled,
      listing_name: listing.name,
      listing_id  : listing.id,
    }
  } catch {
    return null
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
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

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

// ── Property groups ───────────────────────────────────────────────────────────

export async function setPropertyParent(
  propertyId: string,
  parentId  : string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    // Validate: the chosen parent must not itself be a child
    if (parentId) {
      const { data: parent } = await admin
        .from("properties")
        .select("parent_property_id")
        .eq("id", parentId)
        .single()
      if (parent?.parent_property_id) {
        return { ok: false, error: "Cannot nest groups more than one level deep" }
      }
    }

    const { error } = await admin
      .from("properties")
      .update({ parent_property_id: parentId })
      .eq("id", propertyId)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/settings")
    revalidatePath("/properties")
    revalidatePath("/overview")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save" }
  }
}

// ── Benchmark per-property settings ──────────────────────────────────────────

export async function saveBenchmarkPropertySettings(
  rows: { id: string; benchmark_adr_override: number | null; benchmark_occupancy_override: number | null; listing_type: string | null }[],
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    for (const row of rows) {
      const { error } = await (admin as any)
        .from("properties")
        .update({
          benchmark_adr_override      : row.benchmark_adr_override ?? null,
          benchmark_occupancy_override: row.benchmark_occupancy_override ?? null,
          listing_type                : row.listing_type || null,
        })
        .eq("id", row.id)
      if (error) return { error: error.message }
    }
    revalidatePath("/settings")
    revalidatePath("/benchmarks")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
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
