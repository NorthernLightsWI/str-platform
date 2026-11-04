"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { runOwnerRezSync }   from "@/lib/sync/ownerrez"
import { runReviewsSync }    from "@/lib/sync/reviews"
import { runAmenitiesSync }  from "@/lib/sync/amenities"
import { getPriceLabsListings, getListingPrices, getListingLogs, fetchNeighborhoodData } from "@/lib/pricelabs"
import {
  getMarketDefaults,
  aggregateBookings,
  resolveListingType,
  computeBenchmark,
  extractPlBenchmark,
  getPlNeighborhoodCache,
  type PropertyMeta,
} from "@/lib/benchmarks"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"

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
  _listingId: string,
  _action   : "add" | "remove",
): Promise<{ ok?: boolean; error?: string; message?: string }> {
  return { error: "Tag writes disabled until tag handling is verified" }
}

// ── Verify prices (read-only) ─────────────────────────────────────────────────
//
// Evidence for format used:
//   POST https://api.pricelabs.co/v1/listing_prices
//   Request:  { listings: [{ id, pms, dateFrom?, dateTo? }] }
//   Response: Array<{
//     id, pms, group, currency, last_refreshed_at, error?, error_status?,
//     data: Array<{ date, price, user_price, booking_status, booking_status_STLY,
//                   unbookable, occupancy, weekly_discount, monthly_discount, ... }>
//   }>
//   Source: developers.pricelabs.co/customer-api/api-reference/customer-api/prices/for-listings
//
//   base field on GET /v1/listings: "base price for the listing" — the API does NOT
//   indicate whether this is user-set or system-calculated. No base_type or
//   base_calculated field exists. Labelled "(source unknown)" in the UI.
//   Source: developers.pricelabs.co/customer-api/api-reference/customer-api/listings/all-listings

export type VerifyPricesDay = {
  date          : string
  price         : number | null
  user_price    : number | null
  booking_status: string | null
  // pms_drift: user_price is a valid positive price that differs from PL price on a non-booked day
  flag?         : "null_price" | "zero_price" | "big_jump" | "pms_drift"
}

export async function verifyPriceLabsPrices(
  listingId: string,
  pms      : string,
): Promise<
  | {
      ok              : true
      base            : number | null
      push_enabled    : boolean
      last_date_pushed: string | null
      currency        : string | null
      last_refreshed_at: string | null
      days            : VerifyPricesDay[]
      flagCount       : number
    }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const admin  = createAdminClient()
    const apiKey = await getPriceLabsApiKey(admin)
    if (!apiKey) return { ok: false, error: "PriceLabs API key not configured" }

    const today    = new Date()
    const dateFrom = today.toISOString().slice(0, 10)
    const dateTo   = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)

    const [listingsResult, pricesResult] = await Promise.all([
      getPriceLabsListings(apiKey),
      getListingPrices(apiKey, [{ id: listingId, pms, dateFrom, dateTo }]),
    ])

    const listing = listingsResult.ok
      ? listingsResult.listings.find(l => l.id === listingId)
      : undefined

    if (!pricesResult.ok) return pricesResult
    const priceData = pricesResult.results[0]
    if (!priceData)        return { ok: false, error: "No price data returned for this listing" }
    if (priceData.error)   return { ok: false, error: priceData.error }

    const days: VerifyPricesDay[] = priceData.data.map((d, i, arr) => {
      const price = d.price
      let flag: VerifyPricesDay["flag"]
      if (price === null) {
        flag = "null_price"
      } else if (price === 0) {
        flag = "zero_price"
      } else if (i > 0) {
        const prev = arr[i - 1].price
        if (prev != null && prev > 0 && Math.abs((price - prev) / prev) >= 0.5) {
          flag = "big_jump"
        }
      }
      // pms_drift: user_price > 0, differs from PL price, on a non-booked day.
      // user_price === -1 means "not seen on PMS yet" per API docs — not a drift.
      if (!flag && price != null && price > 0 &&
          d.user_price != null && d.user_price > 0 && d.user_price !== price) {
        const booked = typeof d.booking_status === "string" &&
          d.booking_status.toLowerCase().includes("booked")
        if (!booked) flag = "pms_drift"
      }
      return { date: d.date, price: d.price, user_price: d.user_price, booking_status: d.booking_status, flag }
    })

    return {
      ok              : true,
      base            : listing?.base ?? null,
      push_enabled    : listing?.push_enabled ?? false,
      last_date_pushed: listing?.last_date_pushed ?? null,
      currency        : priceData.currency,
      last_refreshed_at: priceData.last_refreshed_at,
      days,
      flagCount       : days.filter(d => d.flag).length,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to verify prices" }
  }
}

// ── Push status (read-only) ───────────────────────────────────────────────────
//
// No dedicated /v1/push_price_status endpoint is reachable in the current
// developer docs (the 2020 changelog entry has no live API reference page).
// This action uses two documented sources instead:
//   1. GET /v1/listings  → push_enabled (bool), last_date_pushed (string)
//      Source: developers.pricelabs.co/customer-api/api-reference/customer-api/listings/single-listing
//   2. POST /v1/logs     → recent activity log entries for the listing
//      Source: developers.pricelabs.co/customer-api/api-reference/customer-api/logs

export async function getPriceLabsPushStatus(
  listingId: string,
  pms      : string,
): Promise<
  | {
      ok               : true
      push_enabled     : boolean
      last_date_pushed : string | null
      last_refreshed_at: string | null
      recentLogs       : Array<{ action_label: string; created_at: string }>
    }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin()
    const admin  = createAdminClient()
    const apiKey = await getPriceLabsApiKey(admin)
    if (!apiKey) return { ok: false, error: "PriceLabs API key not configured" }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const [listingsResult, logsResult] = await Promise.all([
      getPriceLabsListings(apiKey),
      getListingLogs(apiKey, listingId, pms, thirtyDaysAgo),
    ])

    if (!listingsResult.ok) return listingsResult
    const listing = listingsResult.listings.find(l => l.id === listingId)
    if (!listing) return { ok: false, error: `Listing ${listingId} not found in PriceLabs account` }

    return {
      ok               : true,
      push_enabled     : listing.push_enabled,
      last_date_pushed : listing.last_date_pushed,
      last_refreshed_at: listing.last_refreshed_at,
      recentLogs       : logsResult.ok
        ? logsResult.logs.slice(0, 5).map(l => ({ action_label: l.action_label, created_at: l.created_at }))
        : [],
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to get push status" }
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

// ── Compare benchmark sources ─────────────────────────────────────────────────

export type TierResult = {
  tier   : string         // "(a)" … "(e)"
  label  : string
  adr    : number | null
  occ    : number | null
  revpar : number | null
  comps  : number
  active : boolean
  note   : string
}

export async function getPropertyBenchmarkTiers(
  propertyId: string,
): Promise<{ ok?: boolean; tiers?: TierResult[]; error?: string }> {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    const [
      { data: prop },
      { data: allPropsRaw },
      { data: comp90Raw },
      { data: propGroupsRaw },
      hiddenIds,
      { marketAdr, marketOcc },
    ] = await Promise.all([
      (admin as any)
        .from("properties")
        .select("id, external_name, internal_name, bedrooms, listing_type, benchmark_adr_override, benchmark_occupancy_override, pricelabs_listing_id")
        .eq("id", propertyId)
        .single(),

      (admin as any)
        .from("properties")
        .select("id, external_name, internal_name, bedrooms, listing_type, benchmark_adr_override, benchmark_occupancy_override")
        .eq("is_active", true),

      admin
        .from("bookings")
        .select("property_id, arrival, departure, net_revenue, total_amount")
        .neq("status", "cancelled")
        .eq("is_block", false)
        .gte("arrival", new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))
        .lt("arrival", new Date().toISOString().slice(0, 10)),

      admin
        .from("properties")
        .select("id, parent_property_id")
        .eq("is_active", true),

      getHiddenPropertyIds(),
      getMarketDefaults(admin),
    ])

    if (!prop) return { error: "Property not found" }

    const allProps     = (allPropsRaw ?? []) as PropertyMeta[]
    const aggBookings  = aggregateBookings(comp90Raw ?? [])
    const bookingMap   = new Map(aggBookings.map(b => [b.property_id, b]))

    // Build sibling set for this property
    const groupsByParent = new Map<string, string[]>()
    for (const p of propGroupsRaw ?? []) {
      if ((p as any).parent_property_id) {
        const arr = groupsByParent.get((p as any).parent_property_id) ?? []
        arr.push(p.id)
        groupsByParent.set((p as any).parent_property_id, arr)
      }
    }
    const siblingIds = new Set<string>()
    for (const [parentId, children] of groupsByParent) {
      const all = [parentId, ...children]
      if (all.includes(propertyId)) all.filter(id => id !== propertyId).forEach(id => siblingIds.add(id))
    }

    const propMeta: PropertyMeta = {
      id                           : prop.id,
      external_name                : prop.external_name,
      internal_name                : prop.internal_name ?? null,
      bedrooms                     : prop.bedrooms,
      listing_type                 : prop.listing_type ?? null,
      benchmark_adr_override       : prop.benchmark_adr_override ?? null,
      benchmark_occupancy_override : prop.benchmark_occupancy_override ?? null,
    }

    const propType     = resolveListingType(propMeta.listing_type, propMeta.internal_name ?? propMeta.external_name)
    const propBedrooms = propMeta.bedrooms

    const tiers: TierResult[] = []

    // ── (a) Override ─────────────────────────────────────────────────────────
    const oAdr = propMeta.benchmark_adr_override
    const oOcc = propMeta.benchmark_occupancy_override
    const hasOverride = oAdr != null && oOcc != null && oAdr > 0 && oOcc > 0
    tiers.push({
      tier  : "(a)",
      label : "Per-property override",
      adr   : hasOverride ? oAdr! : null,
      occ   : hasOverride ? oOcc! : null,
      revpar: hasOverride ? Math.round(oAdr! * oOcc!) / 100 : null,
      comps : 0,
      active: false,
      note  : hasOverride ? `$${Math.round(oAdr!)} ADR, ${oOcc!}% occ` : "Not configured",
    })

    // ── (b) PriceLabs neighborhood ────────────────────────────────────────────
    const plListingId: string | null = prop.pricelabs_listing_id ?? null
    let plData = plListingId ? await getPlNeighborhoodCache(admin, plListingId) : null

    // Attempt live fetch if no valid cache
    if (!plData && plListingId) {
      const { data: apiKeyRow } = await admin
        .from("app_settings").select("value").eq("key", "pricelabs_api_key").single()
      const apiKey = typeof apiKeyRow?.value === "string" ? apiKeyRow.value : null
      if (apiKey) {
        const r = await fetchNeighborhoodData(apiKey, plListingId, "ownerrez")
        if (r.ok) plData = extractPlBenchmark(r.payload, propMeta.bedrooms)
      }
    }

    const plUsable = propType === "nightly" && plData && plData.adr > 0 && plData.occ > 0 && plData.listingCount >= 5
    tiers.push({
      tier  : "(b)",
      label : "PriceLabs neighborhood",
      adr   : plUsable ? plData!.adr : null,
      occ   : plUsable ? plData!.occ : null,
      revpar: plUsable ? Math.round(plData!.adr * plData!.occ) / 100 : null,
      comps : plData?.listingCount ?? 0,
      active: false,
      note  : propType !== "nightly"
        ? "Weekly/monthly listing — PL tier skipped"
        : !plListingId
          ? "No PriceLabs listing mapping"
          : !plData
            ? "Sync not enabled in PriceLabs"
            : !plUsable
              ? `Only ${plData.listingCount} nearby listings (need ≥5)`
              : `${plData.listingCount} listings · ${plData.monthsLabel ?? "6 months"}`,
    })

    // ── (c) Same beds + same type, ≥2 ────────────────────────────────────────
    const sameBedMetrics = allProps
      .filter(p =>
        p.id !== propertyId &&
        !hiddenIds.has(p.id) &&
        !siblingIds.has(p.id) &&
        p.bedrooms === propBedrooms &&
        resolveListingType(p.listing_type, p.internal_name ?? p.external_name) === propType,
      )
      .map(p => bookingMap.get(p.id))
      .filter((b): b is typeof aggBookings[0] => b != null && b.bookedNights > 0)

    let cAdr: number | null = null, cOcc: number | null = null
    if (sameBedMetrics.length >= 2) {
      const adrs = sameBedMetrics.map(b => b.revenue / b.bookedNights).sort((a, b) => a - b)
      const occs = sameBedMetrics.map(b => (b.bookedNights / 90) * 100).sort((a, b) => a - b)
      const mid  = Math.floor(adrs.length / 2)
      cAdr = adrs.length % 2 === 1 ? adrs[mid] : (adrs[mid-1] + adrs[mid]) / 2
      cOcc = occs.length % 2 === 1 ? occs[mid] : (occs[mid-1] + occs[mid]) / 2
    }
    tiers.push({
      tier  : "(c)",
      label : "Same beds + same type",
      adr   : cAdr != null ? Math.round(cAdr * 100) / 100 : null,
      occ   : cOcc != null ? Math.round(cOcc * 10)  / 10  : null,
      revpar: cAdr != null && cOcc != null ? Math.round(cAdr * cOcc) / 100 : null,
      comps : sameBedMetrics.length,
      active: false,
      note  : sameBedMetrics.length >= 2
        ? `${sameBedMetrics.length} comps (${propBedrooms ?? "?"}br, ${propType})`
        : `${sameBedMetrics.length} comp${sameBedMetrics.length !== 1 ? "s" : ""} — need ≥2`,
    })

    // ── (d) Same type, any beds, ≥3 (ADR bed-scaled) ─────────────────────────
    type CB = { bookedNights: number; revenue: number; beds: number | null }
    const scaledMetrics: CB[] = allProps
      .filter(p =>
        p.id !== propertyId &&
        !hiddenIds.has(p.id) &&
        !siblingIds.has(p.id) &&
        resolveListingType(p.listing_type, p.internal_name ?? p.external_name) === propType,
      )
      .map(p => {
        const b = bookingMap.get(p.id)
        if (!b || b.bookedNights <= 0) return null
        return { bookedNights: b.bookedNights, revenue: b.revenue, beds: p.bedrooms }
      })
      .filter((x): x is CB => x !== null)

    let dAdr: number | null = null, dOcc: number | null = null
    if (scaledMetrics.length >= 3) {
      const propBeds = (propBedrooms ?? 1) > 0 ? (propBedrooms ?? 1) : 1
      const sadrs = scaledMetrics.map(b => {
        const cb = (b.beds ?? 1) > 0 ? (b.beds ?? 1) : 1
        return (b.revenue / b.bookedNights) * (propBeds / cb)
      }).sort((a, b) => a - b)
      const soccs = scaledMetrics.map(b => (b.bookedNights / 90) * 100).sort((a, b) => a - b)
      const mid = Math.floor(sadrs.length / 2)
      dAdr = sadrs.length % 2 === 1 ? sadrs[mid] : (sadrs[mid-1] + sadrs[mid]) / 2
      dOcc = soccs.length % 2 === 1 ? soccs[mid] : (soccs[mid-1] + soccs[mid]) / 2
    }
    tiers.push({
      tier  : "(d)",
      label : "Same type, any beds (bed-scaled)",
      adr   : dAdr != null ? Math.round(dAdr * 100) / 100 : null,
      occ   : dOcc != null ? Math.round(dOcc * 10)  / 10  : null,
      revpar: dAdr != null && dOcc != null ? Math.round(dAdr * dOcc) / 100 : null,
      comps : scaledMetrics.length,
      active: false,
      note  : scaledMetrics.length >= 3
        ? `${scaledMetrics.length} comps (${propType}, ADR scaled to ${propBedrooms ?? "?"}br)`
        : `${scaledMetrics.length} comp${scaledMetrics.length !== 1 ? "s" : ""} — need ≥3`,
    })

    // ── (e) Market constants ──────────────────────────────────────────────────
    tiers.push({
      tier  : "(e)",
      label : "Appleton market constants",
      adr   : marketAdr,
      occ   : marketOcc,
      revpar: Math.round(marketAdr * marketOcc) / 100,
      comps : 0,
      active: false,
      note  : "Configured in Settings → Benchmarks",
    })

    // Mark active tier
    const activeTier = computeBenchmark({
      property     : propMeta,
      allProperties: allProps,
      aggBookings,
      hiddenIds,
      siblingIds,
      marketAdr,
      marketOcc,
      plData       : plUsable ? plData! : null,
    })
    const sourceToTier: Record<string, string> = {
      override          : "(a)",
      pl_neighborhood   : "(b)",
      comparable        : "(c)",
      comparable_scaled : "(d)",
      market            : "(e)",
    }
    const activeTierKey = sourceToTier[activeTier.source]
    for (const t of tiers) t.active = t.tier === activeTierKey

    return { ok: true, tiers }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" }
  }
}
