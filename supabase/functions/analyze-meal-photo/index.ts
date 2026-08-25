// Supabase Edge Function: analyzes a meal photo with Claude vision and returns
// structured nutrition estimates. Keeps ANTHROPIC_API_KEY server-side only.
//
// Each detected item is then matched against the `foods` catalog (imported from
// Yazio, see scripts/import-yazio-foods.ts) so its calories come from a real
// value instead of the vision model's guess whenever a confident match exists.
// If the catalog is empty (not imported yet) or no match is found, the item
// simply keeps the vision model's own estimate.
//
// Deploy: supabase functions deploy analyze-meal-photo
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically to edge functions)

import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANALYSIS_PROMPT = `Analyse cette photo de repas. Identifie chaque aliment visible, estime la portion en grammes, et calcule les calories et macronutriments totaux. Réponds uniquement en JSON avec la structure : { items: [{name, portion_g, calories}], total_calories, total_protein_g, total_carbs_g, total_fat_g }`

interface RawMealItem {
  name: string
  portion_g: number
  calories: number
}

interface MealAnalysis {
  items: RawMealItem[]
  total_calories: number
  total_protein_g: number
  total_carbs_g: number
  total_fat_g: number
}

interface GroundedMealItem {
  name: string
  portion_g: number
  calories: number
  source: 'catalog' | 'estimated'
  food_id: string | null
  matched_name: string | null
  category: string | null
}

function extractJson(text: string): MealAnalysis {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in model response')
  return JSON.parse(candidate.slice(start, end + 1))
}

// ============================================================================
// Food catalog matching
// ============================================================================

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const FRENCH_STOPWORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'au', 'aux', 'et', 'a', 'en'])

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter((t) => t && !FRENCH_STOPWORDS.has(t)))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

interface CatalogFood {
  id: string
  name: string
  category: string
  kcal_per_100g: number
  normName: string
  tokens: Set<string>
}

const FOODS_CACHE_TTL_MS = 30 * 60 * 1000 // ~30 min
let foodsCache: { foods: CatalogFood[]; loadedAt: number } | null = null

async function getFoods(): Promise<CatalogFood[]> {
  if (foodsCache && Date.now() - foodsCache.loadedAt < FOODS_CACHE_TTL_MS) {
    return foodsCache.foods
  }
  const { data, error } = await supabase.from('foods').select('id, name, category, kcal_per_100g')
  if (error) {
    console.error('analyze-meal-photo: failed to load foods catalog, falling back to vision estimates', error)
    foodsCache = { foods: [], loadedAt: Date.now() }
    return []
  }
  const foods: CatalogFood[] = (data ?? []).map((f) => {
    const normName = normalize(f.name)
    return { id: f.id, name: f.name, category: f.category, kcal_per_100g: f.kcal_per_100g, normName, tokens: tokenize(normName) }
  })
  foodsCache = { foods, loadedAt: Date.now() }
  return foods
}

const JACCARD_THRESHOLD = 0.45

/** 1) exact normalized-name match, 2) substring either way (closest length wins), 3) Jaccard token similarity. */
function matchFood(itemName: string, foods: CatalogFood[]): CatalogFood | null {
  const normItem = normalize(itemName)
  if (!normItem || foods.length === 0) return null

  const exact = foods.find((f) => f.normName === normItem)
  if (exact) return exact

  let bestSubstring: CatalogFood | null = null
  let bestSubstringScore = 0
  for (const f of foods) {
    if (!f.normName) continue
    if (normItem.includes(f.normName) || f.normName.includes(normItem)) {
      const shorter = Math.min(f.normName.length, normItem.length)
      const longer = Math.max(f.normName.length, normItem.length)
      const score = shorter / longer
      if (score > bestSubstringScore) {
        bestSubstringScore = score
        bestSubstring = f
      }
    }
  }
  if (bestSubstring) return bestSubstring

  const itemTokens = tokenize(normItem)
  let bestToken: CatalogFood | null = null
  let bestScore = 0
  for (const f of foods) {
    const score = jaccard(itemTokens, f.tokens)
    if (score > bestScore) {
      bestScore = score
      bestToken = f
    }
  }
  return bestToken && bestScore >= JACCARD_THRESHOLD ? bestToken : null
}

async function groundItems(items: RawMealItem[]): Promise<{ items: GroundedMealItem[]; matchedCount: number }> {
  const foods = await getFoods()
  let matchedCount = 0
  const grounded = items.map((item): GroundedMealItem => {
    const match = item.portion_g > 0 ? matchFood(item.name, foods) : null
    if (match) {
      matchedCount++
      return {
        name: item.name,
        portion_g: item.portion_g,
        calories: Math.round((match.kcal_per_100g * item.portion_g) / 100),
        source: 'catalog',
        food_id: match.id,
        matched_name: match.name,
        category: match.category,
      }
    }
    return {
      name: item.name,
      portion_g: item.portion_g,
      calories: item.calories,
      source: 'estimated',
      food_id: null,
      matched_name: null,
      category: null,
    }
  })
  return { items: grounded, matchedCount }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { imageBase64, mediaType } = await req.json()
    if (!imageBase64 || !mediaType) {
      return new Response(JSON.stringify({ error: 'imageBase64 and mediaType are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: ANALYSIS_PROMPT },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return new Response(JSON.stringify({ error: "L'analyse de cette photo a été refusée." }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) throw new Error('No text content in model response')

    const analysis = extractJson(textBlock.text)
    const { items: groundedItems, matchedCount } = await groundItems(analysis.items ?? [])

    return new Response(JSON.stringify({ ...analysis, items: groundedItems, matched_count: matchedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('analyze-meal-photo error', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
