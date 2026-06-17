// ── Keyword lists ──────────────────────────────────────────────────────────────

const LOCATION_KWS = [
  "appleton", "wisconsin", "fox cities", "fox valley", "menasha",
  "neenah", "kaukauna", "oshkosh", "downtown",
]

const AMENITY_KWS = [
  "kitchen", "parking", "wifi", "wi-fi", "workspace", "office",
  "pet", "pool", "patio", "deck", "fireplace", "hot tub",
  "game room", "yard", "garage", "washer", "dryer", "grill", "bbq",
]

const LOCAL_ATTRACTIONS = [
  "fox river", "thedacare", "lawrence university", "lambeau",
  "houdini", "performing arts", "memorial park", "downtown appleton",
  "fox valley", "valley fair",
]

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditCategory = {
  score      : number   // actual points earned
  max        : number   // maximum possible (varies for photos when count unknown)
  cap        : number   // hard max for this category (always 25)
  label      : string
  issues     : string[]
  suggestions: string[]
}

export type PropertyAudit = {
  id          : string
  name        : string
  total       : number   // 0–100
  title       : AuditCategory
  description : AuditCategory
  photos      : AuditCategory
  reviews     : AuditCategory
}

// ── Scoring helpers ────────────────────────────────────────────────────────────

function has(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase()
  return keywords.filter(kw => lower.includes(kw))
}

// ── Title Score (0–25) ─────────────────────────────────────────────────────────
// Length 40-80 ideal (10pts) · Location keyword (8pts) · Amenity keywords (7pts)

function scoreTitle(title: string): AuditCategory {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 0
  const len = title.length

  // Length (0–10)
  if (len >= 40 && len <= 80) {
    score += 10
  } else if ((len >= 20 && len < 40) || (len > 80 && len <= 100)) {
    score += 6
    if (len < 40) {
      issues.push(`Title is short (${len} chars) — ideal is 40–80`)
      suggestions.push("Expand your title to 40–80 characters to fill the search result preview")
    } else {
      issues.push(`Title is long (${len} chars) — most platforms truncate after 80`)
      suggestions.push("Trim your title to under 80 characters so it doesn't get cut off in search results")
    }
  } else {
    score += 2
    if (len < 20) {
      issues.push(`Title is very short (${len} chars)`)
      suggestions.push("Write a 40–80 character title that includes your location and top 2 amenities")
    } else {
      issues.push(`Title is very long (${len} chars)`)
      suggestions.push("Keep your title under 80 characters — Airbnb and Vrbo truncate long titles in search")
    }
  }

  // Location (0–8)
  const foundLoc = has(title, LOCATION_KWS)
  if (foundLoc.length > 0) {
    score += 8
  } else {
    issues.push("No location keyword in title")
    suggestions.push("Add 'Appleton' or 'Fox Cities' to your title — guests always search by city")
  }

  // Amenities (0–7)
  const foundAmenity = has(title, AMENITY_KWS)
  if (foundAmenity.length >= 2) {
    score += 7
  } else if (foundAmenity.length === 1) {
    score += 4
    suggestions.push("Add one more top amenity to your title (WiFi, parking, pet-friendly, workspace)")
  } else {
    issues.push("No amenity keywords in title")
    suggestions.push("Include your top 1–2 amenities: 'WiFi + Parking · Appleton Home Near Downtown'")
  }

  return { score: Math.min(25, score), max: 25, cap: 25, label: "Title", issues, suggestions }
}

// ── Description Score (0–25) ───────────────────────────────────────────────────
// Length (12pts) · Location mention (5pts) · Local attractions (4pts) · Amenity coverage (4pts)

function scoreDescription(desc: string | null): AuditCategory {
  const issues: string[] = []
  const suggestions: string[] = []

  if (!desc || desc.trim().length === 0) {
    return {
      score: 0, max: 25, cap: 25, label: "Description",
      issues: ["No description found — not synced from OwnerRez or not set"],
      suggestions: [
        "Add a detailed property description in OwnerRez (300+ characters recommended)",
        "Open with a strong first sentence about your property's unique character",
        "Mention the neighborhood, nearby attractions (Fox River Trail, downtown Appleton), and top amenities",
        "Run a full sync to pull the description into this platform",
      ],
    }
  }

  let score = 0
  const len = desc.trim().length

  // Length (0–12)
  if (len >= 300) {
    score += 12
  } else if (len >= 150) {
    score += 8
    issues.push(`Description is short (${len} chars) — aim for 300+ characters`)
    suggestions.push("Expand your description to at least 300 characters — longer descriptions rank higher")
  } else if (len >= 50) {
    score += 4
    issues.push(`Description is very short (${len} chars)`)
    suggestions.push("Expand to 300+ characters covering location, amenities, and nearby attractions")
  } else {
    score += 1
    issues.push(`Description is minimal (${len} chars)`)
    suggestions.push("Rewrite your description from scratch — aim for 400–600 characters")
  }

  // Location mention (0–5)
  const foundLoc = has(desc, LOCATION_KWS)
  if (foundLoc.length > 0) {
    score += 5
  } else {
    issues.push("Description doesn't mention the city or region")
    suggestions.push("Mention 'Appleton, Wisconsin' and 'Fox Cities' area early in your description")
  }

  // Local attractions (0–4)
  const foundAttr = has(desc, LOCAL_ATTRACTIONS)
  if (foundAttr.length > 0) {
    score += 4
  } else {
    issues.push("No local attraction mentions in description")
    suggestions.push("Reference nearby draws: Fox River Trail, Lawrence University, downtown Appleton restaurants, ThedaCare Medical Center")
  }

  // Amenity coverage (0–4)
  const foundAmenity = has(desc, AMENITY_KWS)
  if (foundAmenity.length >= 3) {
    score += 4
  } else if (foundAmenity.length >= 1) {
    score += 2
    suggestions.push("List more amenities in your description (WiFi speed, parking details, pet policy, workspace setup)")
  } else {
    issues.push("Description doesn't highlight amenities")
    suggestions.push("Explicitly list your top amenities with details: 'High-speed WiFi (500 Mbps), private driveway parking, pet-friendly (up to 50 lbs)'")
  }

  return { score: Math.min(25, score), max: 25, cap: 25, label: "Description", issues, suggestions }
}

// ── Photo Score (0–25) ────────────────────────────────────────────────────────
// Thumbnail presence (5pts) · Photo count from OwnerRez (20pts, if synced)

function scorePhotos(thumbnailUrl: string | null, photoCount: number | null): AuditCategory {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 0
  let max = 25

  // Thumbnail existence (5pts)
  if (thumbnailUrl) {
    score += 5
    suggestions.push("Confirm your cover photo is your best exterior shot — it's the first thing guests see in search")
  } else {
    issues.push("No cover photo — thumbnail URL missing from sync data")
    suggestions.push("Add photos to your OwnerRez listing immediately — listings without photos receive virtually no bookings")
    max = 25
  }

  // Photo count (0–20)
  if (photoCount !== null) {
    if (photoCount >= 20) {
      score += 20
      if (photoCount < 25) {
        suggestions.push(`You have ${photoCount} photos — aim for 25+ to maximize ranking on Airbnb and Vrbo`)
      }
    } else if (photoCount >= 15) {
      score += 15
      issues.push(`${photoCount} photos — Airbnb recommends 20+ for best search placement`)
      suggestions.push(`Add ${20 - photoCount} more photos: try different lighting, add floor plan, show workspace and outdoor areas`)
    } else if (photoCount >= 10) {
      score += 10
      issues.push(`Only ${photoCount} photos — well below the recommended 20+`)
      suggestions.push("Hire a professional photographer — listings with professional photos earn 40% more on average")
      suggestions.push("Every room needs at least 2 angles; add exterior, neighborhood, and detail shots")
    } else if (photoCount >= 5) {
      score += 5
      issues.push(`Only ${photoCount} photos — critically below the recommended 20+`)
      suggestions.push("Add photos immediately — this is likely suppressing your search ranking significantly")
    } else if (photoCount > 0) {
      score += 2
      issues.push(`Only ${photoCount} photo(s) — this will severely hurt bookings`)
      suggestions.push("Add at minimum 15 photos covering every room, exterior, and key features")
    } else {
      issues.push("Zero photos in OwnerRez — listing likely invisible in search")
      suggestions.push("Add 20+ professional photos before relaunching this listing")
    }
  } else if (thumbnailUrl) {
    // Has thumbnail but count unknown
    score += 10
    max = 15
    issues.push("Photo count not yet synced from OwnerRez")
    suggestions.push("Run a sync to capture your photo count, then verify you have 20+ photos in OwnerRez")
    suggestions.push("Aim for 25+ photos: exterior (day + dusk), each room (2 angles), details, and neighborhood")
  } else {
    max = 25
  }

  return { score: Math.min(25, score), max, cap: 25, label: "Photos", issues, suggestions }
}

// ── Review Score (0–25) ───────────────────────────────────────────────────────
// Count (22pts) · Avg rating (3pts)

function scoreReviews(reviewCount: number, avgRating: number): AuditCategory {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 0

  // Count (0–22)
  if (reviewCount === 0) {
    issues.push("No reviews — listing won't appear in filtered searches")
    suggestions.push("Focus on getting your first 5 reviews — offer a small welcome gift or discount for early guests")
    suggestions.push("Ask satisfied guests directly to leave a review within 24 hours of checkout")
  } else if (reviewCount < 5) {
    score += 8
    issues.push(`Only ${reviewCount} review${reviewCount === 1 ? "" : "s"} — 5+ reviews unlock better search placement`)
    suggestions.push(`Need ${5 - reviewCount} more reviews to reach the critical 5-review milestone — send a follow-up message to recent guests`)
  } else if (reviewCount < 10) {
    score += 13
    suggestions.push("Getting to 10+ reviews significantly improves search ranking — keep following up with guests post-stay")
  } else if (reviewCount < 20) {
    score += 18
    suggestions.push("Solid review base — aim for 20+ reviews to reach 'Superhost / Premier Host' territory")
  } else {
    score += 22
  }

  // Avg rating (0–3)
  if (reviewCount > 0) {
    if (avgRating >= 4.8) {
      score += 3
    } else if (avgRating >= 4.5) {
      score += 2
      suggestions.push(`Average rating ${avgRating.toFixed(2)} — identify any recurring complaints in reviews and address them`)
    } else if (avgRating >= 4.0) {
      score += 1
      issues.push(`Average rating ${avgRating.toFixed(2)} — below the 4.5 threshold for top search placement`)
      suggestions.push("Read your 3- and 4-star reviews carefully and identify the top 2 recurring issues to fix")
      suggestions.push("Consider updating your listing description to set more accurate expectations")
    } else if (avgRating > 0) {
      issues.push(`Average rating ${avgRating.toFixed(2)} — critically low, likely suppressing search visibility`)
      suggestions.push("Urgently audit your guest experience: check cleanliness standards, communication speed, and listing accuracy")
      suggestions.push("Consider temporarily pausing new bookings to resolve the root issues before collecting more reviews")
    }
  }

  return { score: Math.min(25, score), max: 25, cap: 25, label: "Reviews", issues, suggestions }
}

// ── Main audit function ────────────────────────────────────────────────────────

export type AuditInput = {
  id          : string
  name        : string
  description : string | null
  thumbnail_url: string | null
  photo_count : number | null
  reviewCount : number
  avgRating   : number
  title       : string   // external_name used as listing title
}

export function computeAudit(input: AuditInput): PropertyAudit {
  const title       = scoreTitle(input.title)
  const description = scoreDescription(input.description)
  const photos      = scorePhotos(input.thumbnail_url, input.photo_count)
  const reviews     = scoreReviews(input.reviewCount, input.avgRating)

  const total = Math.min(100, title.score + description.score + photos.score + reviews.score)

  return { id: input.id, name: input.name, total, title, description, photos, reviews }
}

export type AuditColor = "green" | "yellow" | "red"

export function auditColor(score: number): AuditColor {
  if (score >= 70) return "green"
  if (score >= 45) return "yellow"
  return "red"
}
