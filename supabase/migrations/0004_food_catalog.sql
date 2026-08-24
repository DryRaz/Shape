-- Food calorie catalog (imported from Yazio's French food database) + per-item
-- meal breakdown, so photographed meals get grounded calorie values instead of
-- the vision model guessing them from scratch.

-- ============================================================================
-- foods — shared catalog, imported from Yazio (service role only, see
-- scripts/import-yazio-foods.ts). Same read-all/write-via-service-role pattern
-- as the `exercises` catalog.
-- ============================================================================

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  subcategory text,
  portion_label text not null,
  portion_grams numeric(7, 1) not null check (portion_grams > 0),
  kcal numeric(7, 1) not null check (kcal >= 0),
  kcal_per_100g numeric(7, 2) not null check (kcal_per_100g >= 0),
  source text not null default 'yazio',
  created_at timestamptz not null default now(),
  unique (name, portion_label, category)
);

create index foods_category_idx on public.foods (category);

-- Case/accent-insensitive matching: the vision model's item names won't always
-- match the catalog's capitalization or accents exactly.
create extension if not exists unaccent with schema extensions;

create or replace function public.normalize_food_name(txt text)
returns text
language sql
immutable
as $$
  select lower(extensions.unaccent(txt))
$$;

alter table public.foods
  add column search_name text generated always as (public.normalize_food_name(name)) stored;

create extension if not exists pg_trgm with schema extensions;
create index foods_search_name_trgm_idx on public.foods using gin (search_name extensions.gin_trgm_ops);

-- ============================================================================
-- meal_items — per-food breakdown of a meal, produced by analyze-meal-photo.
-- food_id is set when the item was matched against the `foods` catalog
-- (source = 'catalog'); left null when the vision model's own estimate was
-- used because no confident catalog match was found (source = 'estimated').
-- ============================================================================

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  name text not null,
  portion_g numeric(7, 1),
  kcal numeric(7, 1),
  source text not null default 'estimated' check (source in ('catalog', 'estimated')),
  created_at timestamptz not null default now()
);

create index meal_items_meal_idx on public.meal_items (meal_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.foods enable row level security;
alter table public.meal_items enable row level security;

-- foods: public read-only catalog, writes reserved for the service role
-- (the yazio import script uses the service role key, which bypasses RLS).
create policy "foods read all" on public.foods for select
  using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- meal_items: owned indirectly through the parent meal.
create policy "meal_items owner all" on public.meal_items for all
  using (exists (select 1 from public.meals where meals.id = meal_items.meal_id and meals.user_id = auth.uid()))
  with check (exists (select 1 from public.meals where meals.id = meal_items.meal_id and meals.user_id = auth.uid()));
