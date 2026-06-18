import { AMENITIES, MAX_SCORE } from "@/lib/amenities"

// ── Data types ────────────────────────────────────────────────────────────────

export interface PropertyReportRow {
  id          : string
  name        : string
  revenue     : number
  revenuePrev : number
  bookedNights: number
  adr         : number
  occupancy   : number // 0–100
  amenityScore: number // 0–100 or -1 if no data
  topRec      : string | null
  avgRating   : number | null
}

export interface AmenityGap {
  label       : string
  missingCount: number
  totalProps  : number
}

export interface MonthlyReportData {
  month      : string // "June 2026"
  periodLabel: string // "Jun 1 – Jun 30"
  properties : PropertyReportRow[]
  topGaps    : AmenityGap[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US")
}

function fmtPct(n: number) {
  return Math.round(n) + "%"
}

function revChange(cur: number, prev: number) {
  if (prev === 0) return cur > 0 ? "+∞%" : "—"
  const pct = ((cur - prev) / prev) * 100
  const sign = pct >= 0 ? "+" : ""
  return sign + Math.round(pct) + "%"
}

function healthColor(score: number): string {
  if (score >= 70) return "#22c55e"
  if (score >= 50) return "#f59e0b"
  return "#ef4444"
}

function scoreBar(score: number, maxWidth = 80): string {
  const filled = Math.round((score / 100) * maxWidth)
  const color  = healthColor(score)
  return `<span style="display:inline-block;width:${maxWidth}px;height:6px;background:#e5e7eb;border-radius:3px;vertical-align:middle;">` +
    `<span style="display:inline-block;width:${filled}px;height:6px;background:${color};border-radius:3px;"></span></span>`
}

// ── Email builder ─────────────────────────────────────────────────────────────

export function buildMonthlyEmailHtml(data: MonthlyReportData): string {
  const { month, periodLabel, properties, topGaps } = data

  // Portfolio totals
  const totalRevenue     = properties.reduce((s, p) => s + p.revenue, 0)
  const totalRevPrev     = properties.reduce((s, p) => s + p.revenuePrev, 0)
  const avgOccupancy     = properties.length
    ? properties.reduce((s, p) => s + p.occupancy, 0) / properties.length
    : 0
  const avgAdr           = properties.length
    ? properties.filter(p => p.bookedNights > 0).reduce((s, p) => s + p.adr, 0) /
      Math.max(1, properties.filter(p => p.bookedNights > 0).length)
    : 0
  const needsAttention   = properties.filter(p => {
    const score = p.amenityScore >= 0 ? p.amenityScore : 50
    return score < 50 || (p.avgRating !== null && p.avgRating < 4.5)
  }).length
  const revChangeStr     = revChange(totalRevenue, totalRevPrev)
  const revChangeColor   = totalRevenue >= totalRevPrev ? "#22c55e" : "#ef4444"

  const propRows = [...properties]
    .sort((a, b) => b.revenue - a.revenue)
    .map(p => {
      const healthScore = p.amenityScore >= 0
        ? (p.avgRating !== null
          ? Math.round(p.amenityScore * 0.5 + (p.avgRating / 5) * 100 * 0.5)
          : p.amenityScore)
        : (p.avgRating !== null ? Math.round((p.avgRating / 5) * 100) : 50)

      const changeStr   = revChange(p.revenue, p.revenuePrev)
      const changeColor = p.revenue >= p.revenuePrev ? "#22c55e" : "#ef4444"

      return `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px 8px;font-size:13px;color:#111827;font-weight:500;min-width:130px;">${p.name}</td>
        <td style="padding:10px 8px;font-size:13px;color:#111827;text-align:right;">${fmt$(p.revenue)}</td>
        <td style="padding:10px 8px;font-size:12px;color:${changeColor};text-align:right;font-weight:600;">${changeStr}</td>
        <td style="padding:10px 8px;font-size:13px;color:#374151;text-align:right;">${fmtPct(p.occupancy)}</td>
        <td style="padding:10px 8px;font-size:13px;color:#374151;text-align:right;">${p.adr > 0 ? fmt$(p.adr) : "—"}</td>
        <td style="padding:10px 8px;font-size:12px;color:#6b7280;max-width:160px;">${p.topRec ?? "<span style='color:#9ca3af;font-style:italic;'>No open recs</span>"}</td>
        <td style="padding:10px 8px;text-align:right;">
          <span style="font-size:12px;font-weight:700;color:${healthColor(healthScore)};">${healthScore}</span>
          <br>${scoreBar(healthScore, 60)}
        </td>
      </tr>`
    }).join("")

  const gapRows = topGaps.map((g, i) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#374151;">
        <span style="display:inline-block;background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;margin-right:8px;">#${i + 1}</span>
        ${g.label}
      </td>
      <td style="padding:8px 0;font-size:13px;text-align:right;">
        <span style="color:#dc2626;font-weight:600;">${g.missingCount}</span>
        <span style="color:#9ca3af;font-size:12px;"> / ${g.totalProps} properties</span>
      </td>
    </tr>`).join("")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${month} Portfolio Report</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:none;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr><td align="center" style="padding:24px 16px;">

    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#0A0D10;border-radius:12px 12px 0 0;padding:28px 28px 24px;">
        <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6FA1AF;">FCCH · Monthly Report</p>
        <h1 style="margin:6px 0 0;font-size:24px;font-weight:700;color:#E88159;font-family:'Courier New',Courier,monospace;">${month}</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${periodLabel}</p>
      </td></tr>

      <!-- Portfolio KPIs -->
      <tr><td style="background:#ffffff;padding:24px 28px;">
        <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;">Portfolio Summary</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:25%;text-align:center;padding:12px 8px;background:#f9fafb;border-radius:8px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#111827;">${fmt$(totalRevenue)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Total Revenue</p>
              <p style="margin:2px 0 0;font-size:11px;font-weight:600;color:${revChangeColor};">${revChangeStr} vs prev</p>
            </td>
            <td style="width:4%;"></td>
            <td style="width:25%;text-align:center;padding:12px 8px;background:#f9fafb;border-radius:8px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#111827;">${fmtPct(avgOccupancy)}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Avg Occupancy</p>
            </td>
            <td style="width:4%;"></td>
            <td style="width:25%;text-align:center;padding:12px 8px;background:#f9fafb;border-radius:8px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#111827;">${avgAdr > 0 ? fmt$(avgAdr) : "—"}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Avg Daily Rate</p>
            </td>
            <td style="width:4%;"></td>
            <td style="width:25%;text-align:center;padding:12px 8px;background:${needsAttention > 0 ? "#fef2f2" : "#f0fdf4"};border-radius:8px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:${needsAttention > 0 ? "#dc2626" : "#16a34a"};">${needsAttention}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Need Attention</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Divider -->
      <tr><td style="background:#ffffff;padding:0 28px;"><hr style="border:none;border-top:1px solid #f3f4f6;margin:0;"></td></tr>

      <!-- Per-property table -->
      <tr><td style="background:#ffffff;padding:20px 28px 24px;">
        <p style="margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;">Property Performance</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <thead>
            <tr style="border-bottom:2px solid #e5e7eb;">
              <th style="padding:6px 8px;text-align:left;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Property</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Revenue</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">vs Last</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Occ</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">ADR</th>
              <th style="padding:6px 8px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Top Rec</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Health</th>
            </tr>
          </thead>
          <tbody>
            ${propRows || `<tr><td colspan="7" style="padding:16px 8px;color:#9ca3af;font-size:13px;text-align:center;">No properties with booking data</td></tr>`}
          </tbody>
        </table>
      </td></tr>

      ${topGaps.length > 0 ? `
      <!-- Amenity gap callout -->
      <tr><td style="background:#fffbeb;border-left:4px solid #E88159;padding:20px 24px 20px 24px;margin:0 28px;">
      </td></tr>
      <tr><td style="background:#ffffff;padding:4px 28px 0;">
        <div style="background:#fffbeb;border-left:4px solid #E88159;border-radius:0 8px 8px 0;padding:16px 20px;">
          <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#92400e;">
            ⚡ Top Amenity Gaps — Quick Revenue Wins
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${gapRows}
          </table>
          <p style="margin:12px 0 0;font-size:12px;color:#6b7280;">Adding these amenities can improve search ranking and occupancy rates.</p>
        </div>
      </td></tr>` : ""}

      <!-- Footer -->
      <tr><td style="background:#0A0D10;border-radius:0 0 12px 12px;padding:20px 28px;margin-top:4px;">
        <p style="margin:0;font-size:12px;color:#6b7280;">
          This report was automatically generated for your FCCH short-term rental portfolio.
        </p>
        <p style="margin:8px 0 0;font-size:12px;">
          <a href="https://fcch.vercel.app/settings" style="color:#6FA1AF;text-decoration:none;">Manage report settings</a>
          <span style="color:#4b5563;margin:0 8px;">·</span>
          <a href="https://fcch.vercel.app/settings" style="color:#6FA1AF;text-decoration:none;">Unsubscribe</a>
        </p>
      </td></tr>

    </table>

  </td></tr>
</table>
</body>
</html>`
}

// ── Data computation helpers ───────────────────────────────────────────────────

export function computeAmenityGaps(
  properties: Array<{ id: string }>,
  amenityRows: Array<{ property_id: string; amenity_key: string; is_present: boolean }>,
): AmenityGap[] {
  const amenityMap = AMENITIES.reduce<Record<string, string>>((m, a) => {
    m[a.key] = a.label
    return m
  }, {})

  // Count how many properties are MISSING each amenity
  const missingCounts: Record<string, number> = {}
  for (const prop of properties) {
    const propAmenities = amenityRows.filter(r => r.property_id === prop.id)
    for (const a of AMENITIES) {
      const row = propAmenities.find(r => r.amenity_key === a.key)
      if (!row || !row.is_present) {
        missingCounts[a.key] = (missingCounts[a.key] ?? 0) + 1
      }
    }
  }

  return Object.entries(missingCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => {
      // Sort by missing count desc, then by impact desc
      if (b[1] !== a[1]) return b[1] - a[1]
      const impactA = AMENITIES.find(x => x.key === a[0])?.impact ?? 0
      const impactB = AMENITIES.find(x => x.key === b[0])?.impact ?? 0
      return impactB - impactA
    })
    .slice(0, 3)
    .map(([key, count]) => ({
      label       : amenityMap[key] ?? key,
      missingCount: count,
      totalProps  : properties.length,
    }))
}

export function computePropertyAmenityScore(
  propertyId: string,
  amenityRows: Array<{ property_id: string; amenity_key: string; is_present: boolean }>,
): number {
  const propRows = amenityRows.filter(r => r.property_id === propertyId)
  if (propRows.length === 0) return -1

  let score = 0
  for (const a of AMENITIES) {
    const row = propRows.find(r => r.amenity_key === a.key)
    if (row?.is_present) score += a.impact
  }
  return Math.round((score / MAX_SCORE) * 100)
}
