import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PropertyInfoClient, type PropertyItem } from "@/components/operations/property-info/property-info-client"

export default async function PropertyInfoPage() {
  const supabase      = await createClient()
  const adminClient   = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: propData }, { data: infoData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user!.id)
      .single(),

    supabase
      .from("properties")
      .select("id, external_name, internal_name, city, state")
      .eq("is_active", true)
      .order("external_name"),

    adminClient
      .from("property_operational_info")
      .select("*"),
  ])

  const infoMap = new Map((infoData ?? []).map(i => [i.property_id, i]))

  const properties: PropertyItem[] = (propData ?? []).map(p => ({
    id          : p.id,
    name        : p.internal_name || p.external_name,
    externalName: p.external_name,
    city        : p.city ?? null,
    state       : p.state ?? null,
    info        : infoMap.get(p.id) ?? null,
  }))

  const isAdmin = profile?.role === "admin"

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Property Info</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Access codes, Wi-Fi, check-in/out details, and operational notes for each property.
        </p>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No properties found</p>
          <p className="mt-1 text-xs text-muted-foreground">Add active properties to manage their info.</p>
        </div>
      ) : (
        <PropertyInfoClient properties={properties} isAdmin={isAdmin} />
      )}
    </div>
  )
}
