const BASE_URL   = "https://api.ownerrez.com/v2"
const PAGE_LIMIT = 100

// ── Credentials ────────────────────────────────────────────────────────────

export interface OwnerRezCredentials {
  email: string
  apiToken: string  // starts with pt_
}

// ── Response shapes ────────────────────────────────────────────────────────

export interface OwnerRezAddress {
  street?      : string | null
  city?        : string | null
  state?       : string | null
  postal_code? : string | null
  country?     : string | null
}

export interface OwnerRezProperty {
  id            : number
  external_name : string
  name          : string
  active        : boolean
  is_snoozed    : boolean
  max_guests    : number | null
  public_url    : string | null
  thumbnail_url : string | null
  bedrooms      : number | null
  bathrooms     : number | null
  address       : OwnerRezAddress | null
}

export interface OwnerRezGuest {
  first_name : string
  last_name  : string
  email?     : string | null
  phone?     : string | null
}

export interface OwnerRezBooking {
  id           : number
  property_id  : number
  arrival      : string
  departure    : string
  total_amount : number | null
  listing_site : string | null
  status       : string
  adults       : number | null
  children     : number | null
  is_block     : boolean
  guest        : OwnerRezGuest | null
}

export interface OwnerRezReview {
  id             : number
  property_id    : number
  booking_id?    : number | null
  listing_site?  : string | null
  reviewer_name? : string | null
  rating?        : number | null
  cleanliness?   : number | null
  communication? : number | null
  location?      : number | null
  accuracy?      : number | null
  value?         : number | null
  comments?      : string | null
  response?      : string | null
  response_date? : string | null
  submitted_date?: string | null
}

interface PagedResponse<T> {
  total_count?   : number
  items          : T[]
  next_page_url? : string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── HTTP primitives ────────────────────────────────────────────────────────

function authHeader(creds: OwnerRezCredentials): string {
  const encoded = Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")
  return `Basic ${encoded}`
}

async function get<T>(
  creds  : OwnerRezCredentials,
  path   : string,
  params : Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader(creds),
      Accept: "application/json",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`OwnerRez ${res.status} on ${path}: ${body}`)
  }

  return res.json() as Promise<T>
}

async function fetchAllPages<T>(
  creds  : OwnerRezCredentials,
  path   : string,
  params : Record<string, string> = {},
): Promise<T[]> {
  const all: T[] = []
  let pageNum = 1

  while (true) {
    const data = await get<PagedResponse<T>>(creds, path, {
      ...params,
      limit    : String(PAGE_LIMIT),
      page_num : String(pageNum),
    })

    all.push(...data.items)

    if (data.items.length < PAGE_LIMIT || !data.next_page_url) break
    pageNum++
    await sleep(500)
  }

  return all
}

// ── Public fetch functions ─────────────────────────────────────────────────

export async function fetchProperties(
  creds: OwnerRezCredentials,
): Promise<OwnerRezProperty[]> {
  return fetchAllPages<OwnerRezProperty>(creds, "/properties")
}

const BOOKING_BATCH_SIZE  = 3
const BOOKING_BATCH_DELAY = 2000

export async function fetchBookings(
  creds       : OwnerRezCredentials,
  propertyIds : string[],
): Promise<OwnerRezBooking[]> {
  const now      = new Date()
  const sinceUtc = new Date(now.getTime() - 90  * 24 * 60 * 60 * 1000).toISOString()
  const untilUtc = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString()

  const all: OwnerRezBooking[] = []

  for (let i = 0; i < propertyIds.length; i += BOOKING_BATCH_SIZE) {
    if (i > 0) await sleep(BOOKING_BATCH_DELAY)

    const batch = propertyIds.slice(i, i + BOOKING_BATCH_SIZE)
    const page  = await fetchAllPages<OwnerRezBooking>(creds, "/bookings", {
      include_guest   : "true",
      include_charges : "true",
      property_ids    : batch.join(","),
      since_utc       : sinceUtc,
      until_utc       : untilUtc,
    })
    all.push(...page)
  }

  return all.filter((b) => !b.is_block)
}

export async function fetchReviews(
  creds: OwnerRezCredentials,
): Promise<OwnerRezReview[]> {
  return fetchAllPages<OwnerRezReview>(creds, "/reviews")
}
