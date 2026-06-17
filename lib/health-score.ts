// Market baselines — Appleton, WI
export const MARKET_OCC = 57    // percent
export const MARKET_ADR = 207   // dollars
export const MARKET_REVPAR = Math.round(MARKET_ADR * MARKET_OCC) / 100  // ~118

export type HealthInput = {
  occupancy12m          : number   // 0–100
  adr12m                : number   // dollars
  reviewCount           : number
  avgRating             : number   // 0–5
  hasRecentCleaning     : boolean
  openHighPriorityIssues: number
}

export type HealthScore = {
  total            : number  // 0–100
  revenueScore     : number  // 0–35
  listingScore     : number  // 0–35
  operationalScore : number  // 0–30
  // sub-components (for breakdown display)
  occupancyScore   : number  // 0–17.5
  adrScore         : number  // 0–17.5
  ratingScore      : number  // 0–21
  reviewCountScore : number  // 0–14
  cleaningScore    : number  // 0–15
  maintenanceScore : number  // 0–15
}

export function computeHealthScore(input: HealthInput): HealthScore {
  // Revenue (35 pts)
  const occupancyScore = Math.min(input.occupancy12m / MARKET_OCC, 1.0) * 17.5
  const adrScore       = Math.min(input.adr12m       / MARKET_ADR, 1.0) * 17.5
  const revenueScore   = occupancyScore + adrScore

  // Listing quality (35 pts) — 0 reviews = 0 listing score
  const ratingScore      = input.reviewCount > 0 ? (input.avgRating / 5.0) * 21 : 0
  const reviewCountScore = Math.min(input.reviewCount / 20, 1.0) * 14
  const listingScore     = ratingScore + reviewCountScore

  // Operational (30 pts)
  const cleaningScore    = input.hasRecentCleaning ? 15 : 0
  const maintenanceScore = Math.max(0, 15 - input.openHighPriorityIssues * 5)
  const operationalScore = cleaningScore + maintenanceScore

  const total = Math.min(100, Math.round(revenueScore + listingScore + operationalScore))

  function r1(n: number) { return Math.round(n * 10) / 10 }

  return {
    total,
    revenueScore    : r1(revenueScore),
    listingScore    : r1(listingScore),
    operationalScore: r1(operationalScore),
    occupancyScore  : r1(occupancyScore),
    adrScore        : r1(adrScore),
    ratingScore     : r1(ratingScore),
    reviewCountScore: r1(reviewCountScore),
    cleaningScore,
    maintenanceScore,
  }
}

export type ScoreColor = "green" | "yellow" | "red"

export function healthColor(score: number): ScoreColor {
  if (score >= 70) return "green"
  if (score >= 50) return "yellow"
  return "red"
}
