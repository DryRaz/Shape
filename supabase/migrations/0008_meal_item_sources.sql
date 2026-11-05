-- Two new meal_items.source values:
-- - 'new': the vision model's own estimate for a food not yet in the `foods`
--   catalog, which analyze-meal-photo has just added to it (see
--   supabase/functions/_shared/foodCatalog.ts) — distinct from 'catalog' so
--   the UI can show "just learned this" rather than claim it was grounded
--   against a pre-existing trusted entry.
-- - 'label': value read off a product's nutrition facts label
--   (analyze-nutrition-label), scaled to the quantity the user entered.

alter table public.meal_items drop constraint meal_items_source_check;

alter table public.meal_items
  add constraint meal_items_source_check check (source in ('catalog', 'estimated', 'new', 'label'));
