const BASE = "https://api.pricelabs.co/v1"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PriceLabsListing {
  id               : string
  pms              : string
  name             : string
  base             : number | null
  min              : number | null
  max              : number | null
  // Always a string[] after parsePlTags() — never null.
  // Note: GET /listings returns tags as a comma-separated string (e.g. "tag1,tag2").
  //       POST /listings expects tags as an array (e.g. ["tag1","tag2"]).
  //       parsePlTags() normalises GET output to string[].
  tags             : string[]
  push_enabled     : boolean
  last_date_pushed : string | null
  last_refreshed_at: string | null
}

export interface PriceLabsListingUpdate {
  id   : string
  pms  : string
  base?: number
  min ?: number
  max ?: number
}

export interface PriceDay {
  date          : string
  price         : number | null
  user_price    : number | null
  booking_status: string | null
}

export interface PriceListing {
  id               : string
  pms              : string
  currency         : string | null
  last_refreshed_at: string | null
  error?           : string
  data             : PriceDay[]
}

// ── Tag parsing ────────────────────────────────────────────────────────────────
//
// PriceLabs Customer API v1 (confirmed via docs at developers.pricelabs.co):
//   GET  /v1/listings  → tags is a comma-separated STRING  e.g. "tag1,tag2"
//   POST /v1/listings  → tags must be an ARRAY of strings  e.g. ["tag1","tag2"]
//
// parsePlTags() normalises whatever the GET response sends into string[].

export function parsePlTags(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return (raw as unknown[]).map(String).map(s => s.trim()).filter(Boolean)
  }
  if (typeof raw === "string") {
    if (raw.trim() === "") return []
    return raw.split(",").map(s => s.trim()).filter(Boolean)
  }
  return []
}

// ── Read ───────────────────────────────────────────────────────────────────────

export async function getPriceLabsListings(
  apiKey: string,
): Promise<{ ok: true; listings: PriceLabsListing[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE}/listings`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: `PriceLabs API error ${res.status}: ${JSON.stringify(json)}` }
    }
    const raw: unknown[] = Array.isArray(json) ? json : (json as any).listings ?? []
    return {
      ok      : true,
      listings: raw.map((l: any) => ({
        id               : String(l.id),
        pms              : l.pms ?? "ownerrez",
        name             : l.name ?? "",
        base             : l.base  != null ? Number(l.base)  : null,
        min              : l.min   != null ? Number(l.min)   : null,
        max              : l.max   != null ? Number(l.max)   : null,
        tags             : parsePlTags(l.tags),
        push_enabled     : l.push_enabled === true || l.push_enabled === "true",
        last_date_pushed : l.last_date_pushed  ?? null,
        last_refreshed_at: l.last_refreshed_at ?? null,
      })),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error calling PriceLabs" }
  }
}

// POST /v1/listing_prices — returns last-refreshed prices for each listing.
// dateFrom / dateTo are YYYY-MM-DD strings (optional; omit for full calendar).
export async function getListingPrices(
  apiKey  : string,
  listings: Array<{ id: string; pms: string; dateFrom?: string; dateTo?: string }>,
): Promise<{ ok: true; results: PriceListing[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE}/listing_prices`, {
      method : "POST",
      headers: {
        "X-API-Key"   : apiKey,
        "Content-Type": "application/json",
        Accept        : "application/json",
      },
      body : JSON.stringify({ listings }),
      cache: "no-store",
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: `PriceLabs ${res.status}: ${JSON.stringify(json)}` }
    }
    const raw: unknown[] = Array.isArray(json) ? json : (json as any).listings ?? []
    return {
      ok     : true,
      results: raw.map((l: any) => ({
        id               : String(l.id ?? ""),
        pms              : l.pms ?? "",
        currency         : l.currency ?? null,
        last_refreshed_at: l.last_refreshed_at ?? null,
        error            : typeof l.error === "string" ? l.error : undefined,
        data             : Array.isArray(l.data)
          ? (l.data as any[]).map(d => ({
              date          : String(d.date ?? ""),
              price         : d.price      != null ? Number(d.price)      : null,
              user_price    : d.user_price != null ? Number(d.user_price) : null,
              booking_status: d.booking_status ?? null,
            }))
          : [],
      })),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error calling PriceLabs" }
  }
}

// ── Writes ─────────────────────────────────────────────────────────────────────

export async function updatePriceLabsListings(
  apiKey  : string,
  listings: PriceLabsListingUpdate[],
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  if (listings.length === 0) {
    return { ok: false, error: "No listings to update" }
  }
  try {
    const res = await fetch(`${BASE}/listings`, {
      method : "POST",
      headers: {
        "X-API-Key"   : apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listings }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: `PriceLabs API error ${res.status}: ${JSON.stringify(json)}` }
    }
    return { ok: true, raw: json }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error calling PriceLabs" }
  }
}

// ── Neighborhood data ──────────────────────────────────────────────────────────

export async function fetchNeighborhoodData(
  apiKey   : string,
  listingId: string,
  pms      : string,
): Promise<{ ok: true; payload: unknown } | { ok: false; error: string }> {
  try {
    const qs  = new URLSearchParams({ listing_id: listingId, pms })
    const res = await fetch(`${BASE}/neighborhood_data?${qs}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cache  : "no-store",
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (json as any)?.error
      return { ok: false, error: typeof msg === "string" ? msg : `PriceLabs ${res.status}` }
    }
    if ((json as any)?.status !== "Success") {
      const msg = (json as any)?.error ?? (json as any)?.status
      return { ok: false, error: typeof msg === "string" ? msg : "PriceLabs neighborhood fetch failed" }
    }
    return { ok: true, payload: json }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error calling PriceLabs" }
  }
}

// tags is the FULL desired tag array (PriceLabs replaces, not appends).
// Always call parsePlTags() on the GET response before diffing/passing here.
export async function updateListingTags(
  apiKey   : string,
  listingId: string,
  pms      : string,
  tags     : string[],
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE}/listings`, {
      method : "POST",
      headers: {
        "X-API-Key"   : apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listings: [{ id: listingId, pms, tags }] }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: `PriceLabs API error ${res.status}: ${JSON.stringify(json)}` }
    }
    return { ok: true, raw: json }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error calling PriceLabs" }
  }
}
