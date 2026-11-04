const BASE = "https://api.pricelabs.co/v1"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PriceLabsListing {
  id          : string
  pms         : string
  name        : string
  base        : number | null
  min         : number | null
  max         : number | null
  tags        : string[] | null
  push_enabled: boolean
}

export interface PriceLabsListingUpdate {
  id   : string
  pms  : string
  base?: number
  min ?: number
  max ?: number
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
        id          : String(l.id),
        pms         : l.pms ?? "ownerrez",
        name        : l.name ?? "",
        base        : l.base  != null ? Number(l.base)  : null,
        min         : l.min   != null ? Number(l.min)   : null,
        max         : l.max   != null ? Number(l.max)   : null,
        tags        : Array.isArray(l.tags) ? l.tags : null,
        push_enabled: l.push_enabled === true || l.push_enabled === "true",
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

// tags is the FULL desired tag array (PriceLabs replaces, not appends)
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
