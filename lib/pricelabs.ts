const BASE = "https://api.pricelabs.co/v1"

export interface PriceLabsListingUpdate {
  id   : string
  pms  : string
  base?: number
  min ?: number
  max ?: number
}

export async function updatePriceLabsListings(
  apiKey  : string,
  listings: PriceLabsListingUpdate[],
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
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
