import { createAdminClient } from "@/lib/supabase/admin"
import { ReviewsClient, type ReviewData } from "@/components/reviews/reviews-client"

export default async function ReviewsPage() {
  const admin = createAdminClient()

  const { data } = await admin
    .from("reviews")
    .select(`
      id, reviewer_name, listing_site,
      overall_rating, cleanliness_rating, communication_rating,
      location_rating, accuracy_rating, value_rating,
      review_text, response_text, reviewed_at,
      properties(external_name, internal_name)
    `)
    .order("reviewed_at", { ascending: false })

  type RawReview = NonNullable<typeof data>[number] & {
    properties: { external_name: string; internal_name: string | null } | null
  }

  const reviews: ReviewData[] = ((data ?? []) as RawReview[]).map(r => ({
    id                   : r.id,
    property_name        : r.properties
      ? (r.properties.internal_name || r.properties.external_name)
      : "Unknown property",
    reviewer_name        : r.reviewer_name,
    listing_site         : r.listing_site,
    overall_rating       : r.overall_rating ? Number(r.overall_rating) : null,
    cleanliness_rating   : r.cleanliness_rating ? Number(r.cleanliness_rating) : null,
    communication_rating : r.communication_rating ? Number(r.communication_rating) : null,
    location_rating      : r.location_rating ? Number(r.location_rating) : null,
    accuracy_rating      : r.accuracy_rating ? Number(r.accuracy_rating) : null,
    value_rating         : r.value_rating ? Number(r.value_rating) : null,
    review_text          : r.review_text,
    response_text        : r.response_text,
    reviewed_at          : r.reviewed_at,
  }))

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reviews</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Guest reviews synced from OwnerRez.
        </p>
      </div>

      <ReviewsClient reviews={reviews} />
    </div>
  )
}
