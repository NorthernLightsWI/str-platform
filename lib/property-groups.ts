// Utilities for grouping parent/child properties (multi-listing units).
// Two-level hierarchy only: a parent can have many children; children cannot be parents.

export type PropertyGroup<T> = {
  parent  : T
  children: T[]
  allIds  : string[]
}

/**
 * Given a flat array of properties (each optionally having parent_property_id),
 * returns groups where the parent has at least one child.
 * Ungrouped properties (no parent, no children) are not included.
 */
export function buildPropertyGroups<
  T extends { id: string; parent_property_id?: string | null }
>(items: T[]): PropertyGroup<T>[] {
  // Collect all IDs that appear as a parent
  const parentIdSet = new Set(
    items.filter(p => p.parent_property_id).map(p => p.parent_property_id!)
  )

  const byId = new Map(items.map(p => [p.id, p]))

  return Array.from(parentIdSet).flatMap(parentId => {
    const parent = byId.get(parentId)
    if (!parent) return []
    const children = items.filter(p => p.parent_property_id === parentId)
    return [{ parent, children, allIds: [parentId, ...children.map(c => c.id)] }]
  })
}

/**
 * Remap bookings whose property_id is a child → replace with parent ID.
 * Used to aggregate child-listing revenue under the parent in charts/reports.
 */
export function mergeChildBookings<
  B extends { property_id: string }
>(bookings: B[], groups: PropertyGroup<{ id: string }>[]) : B[] {
  const childToParent = new Map<string, string>()
  for (const g of groups) {
    for (const c of g.children) {
      childToParent.set(c.id, g.parent.id)
    }
  }
  return bookings.map(b => {
    const parentId = childToParent.get(b.property_id)
    return parentId ? { ...b, property_id: parentId } : b
  })
}

/** Set of all child property IDs across all groups. */
export function childIdSet(groups: PropertyGroup<{ id: string }>[]): Set<string> {
  const s = new Set<string>()
  for (const g of groups) g.children.forEach(c => s.add(c.id))
  return s
}
