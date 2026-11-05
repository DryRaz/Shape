// Shared by analyze-meal-photo (a food detected in a photo but not yet in the
// catalog) and analyze-nutrition-label (a product read off its label) — both
// grow the `foods` catalog from AI-derived values rather than only the Yazio
// import. Every row this writes is normalized to a 100g basis so repeated
// sightings of the same food (different portions, different photos) upsert
// into the same catalog row instead of spawning near-duplicates.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export interface CatalogFoodRow {
  id: string
  name: string
  category: string
  kcal_per_100g: number
  protein_g_per_100g: number | null
  carbs_g_per_100g: number | null
  fat_g_per_100g: number | null
}

export interface UpsertFoodInput {
  name: string
  kcalPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  source: string
  category: string
}

export async function upsertFoodFrom100gBasis(
  supabase: SupabaseClient,
  input: UpsertFoodInput
): Promise<CatalogFoodRow | null> {
  const name = input.name.trim()
  if (!name || !Number.isFinite(input.kcalPer100g) || input.kcalPer100g < 0) return null

  const { data, error } = await supabase
    .from('foods')
    .upsert(
      {
        name,
        category: input.category,
        subcategory: null,
        portion_label: '100 g',
        portion_grams: 100,
        kcal: Math.round(input.kcalPer100g),
        kcal_per_100g: Math.round(input.kcalPer100g * 100) / 100,
        protein_g_per_100g: Math.round(Math.max(0, input.proteinPer100g) * 10) / 10,
        carbs_g_per_100g: Math.round(Math.max(0, input.carbsPer100g) * 10) / 10,
        fat_g_per_100g: Math.round(Math.max(0, input.fatPer100g) * 10) / 10,
        source: input.source,
      },
      { onConflict: 'name,portion_label,category' }
    )
    .select('id, name, category, kcal_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g')
    .single()

  if (error || !data) {
    console.error('upsertFoodFrom100gBasis: failed to upsert food into catalog', error)
    return null
  }
  return data
}
