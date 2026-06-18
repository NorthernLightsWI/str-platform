import { createAdminClient } from "@/lib/supabase/admin"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import { computeAudit, type AuditInput } from "@/lib/listing-audit"
import { ListingAuditClient } from "@/components/listing-audit/listing-audit-client"

export default async function ListingAuditPage() {
  const admin = createAdminClient() as any

  const [
    { data: propData,   error: propErr   },
    { data: reviewData, error: reviewErr },
    hiddenIds,
  ] = await Promise.all([
    admin
      .from("properties")
      .select("id, external_name, internal_name, description, thumbnail_url, photo_count, is_active")
      .eq("is_active", true)
      .order("external_name"),

    admin
      .from("reviews")
      .select("property_id, overall_rating"),

    getHiddenPropertyIds(),
  ])

  if (propErr)   console.error("[listing-audit] properties query error:", propErr)
  if (reviewErr) console.error("[listing-audit] reviews query error:",    reviewErr)

  // Pre-aggregate reviews per property
  const reviewMap = new Map<string, { total: number; ratedCount: number; reviewCount: number }>()
  for (const r of (reviewData ?? []) as { property_id: string; overall_rating: number | null }[]) {
    if (!r.property_id) continue
    const cur    = reviewMap.get(r.property_id) ?? { total: 0, ratedCount: 0, reviewCount: 0 }
    const rating = r.overall_rating != null ? Number(r.overall_rating) : null
    reviewMap.set(r.property_id, {
      total       : cur.total + (rating ?? 0),
      ratedCount  : cur.ratedCount + (rating != null ? 1 : 0),
      reviewCount : cur.reviewCount + 1,
    })
  }

  type RawProp = {
    id           : string
    external_name: string
    internal_name: string | null
    description  : string | null
    thumbnail_url: string | null
    photo_count  : number | null
    is_active    : boolean
  }

  const audits = ((propData ?? []) as RawProp[])
    .filter(p => !hiddenIds.has(p.id))
    .map(p => {
      const rws = reviewMap.get(p.id)
      const input: AuditInput = {
        id           : p.id,
        name         : p.internal_name || p.external_name,
        title        : p.external_name,
        description  : p.description,
        thumbnail_url: p.thumbnail_url,
        photo_count  : p.photo_count ?? null,
        reviewCount  : rws?.reviewCount ?? 0,
        avgRating    : rws && rws.ratedCount > 0 ? rws.total / rws.ratedCount : 0,
      }
      return computeAudit(input)
    })

  const activeCount = audits.length

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Listing Audit</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Rule-based audit across title, description, photos, and reviews ·{" "}
          {activeCount} active {activeCount === 1 ? "property" : "properties"}
        </p>
      </div>

      <ListingAuditClient audits={audits} />
    </div>
  )
}
