-- Macro nutrients (protein/carbs/fat per 100g) for the foods catalog, and the
-- resolved per-item macro breakdown on meal_items. Nullable throughout: not
-- every catalog entry has macro data, and the vision model's own per-item
-- estimate may be all that's available for a given meal item.

alter table public.foods
  add column protein_g_per_100g numeric(6, 2),
  add column carbs_g_per_100g numeric(6, 2),
  add column fat_g_per_100g numeric(6, 2);

alter table public.meal_items
  add column protein_g numeric(6, 1),
  add column carbs_g numeric(6, 1),
  add column fat_g numeric(6, 1);
