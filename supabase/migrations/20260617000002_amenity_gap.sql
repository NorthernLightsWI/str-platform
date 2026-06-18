create table if not exists property_amenities (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  amenity_key text not null,
  is_present boolean not null default false,
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id),
  unique(property_id, amenity_key)
);

alter table property_amenities enable row level security;

drop policy if exists "Admins manage amenities" on property_amenities;
drop policy if exists "Staff can read amenities" on property_amenities;

create policy "Admins manage amenities"
  on property_amenities for all
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Staff can read amenities"
  on property_amenities for select
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role in ('cleaner', 'maintenance')));

create index if not exists idx_property_amenities_property_id on property_amenities(property_id);
