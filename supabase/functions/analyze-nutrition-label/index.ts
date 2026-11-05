// Supabase Edge Function: reads a product's nutrition facts label with Claude
// vision, normalizes the values to a per-100g basis (converting from
// per-serving itself if that's how the label is printed), and adds/updates
// the product in the shared `foods` catalog. The client then scales these
// per-100g values by whatever quantity the user says they ate.
//
// Deploy: supabase functions deploy analyze-nutrition-label
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically to edge functions)

import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import { corsHeaders, extractJson } from '../_shared/edgeUtils.ts'
import { upsertFoodFrom100gBasis } from '../_shared/foodCatalog.ts'

const LABEL_PROMPT = `Lis le tableau des valeurs nutritionnelles sur cette étiquette de produit alimentaire. Donne les valeurs normalisées pour 100g ou 100ml : si l'étiquette les indique seulement par portion, convertis-les toi-même en valeurs pour 100g/100ml. Indique aussi le nom du produit s'il est visible sur l'emballage, et la taille d'une portion en grammes si elle est précisée sur l'étiquette (sinon null). Réponds uniquement en JSON avec la structure : { product_name: string|null, per_100g: {kcal: number, protein_g: number, carbs_g: number, fat_g: number}, suggested_portion_g: number|null }`

interface LabelAnalysis {
  product_name: string | null
  per_100g: {
    kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  suggested_portion_g: number | null
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

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
      max_tokens: 512,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: LABEL_PROMPT },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return new Response(JSON.stringify({ error: "L'analyse de cette étiquette a été refusée." }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) throw new Error('No text content in model response')

    const analysis = extractJson<LabelAnalysis>(textBlock.text)
    const per100g = analysis.per_100g
    if (!per100g || !Number.isFinite(per100g.kcal)) {
      return new Response(
        JSON.stringify({ error: "Impossible de lire les valeurs nutritionnelles sur cette étiquette." }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const productName = (analysis.product_name ?? '').trim() || 'Produit (étiquette)'
    const foodRow = await upsertFoodFrom100gBasis(supabase, {
      name: productName,
      kcalPer100g: per100g.kcal,
      proteinPer100g: per100g.protein_g ?? 0,
      carbsPer100g: per100g.carbs_g ?? 0,
      fatPer100g: per100g.fat_g ?? 0,
      source: 'label',
    })

    return new Response(
      JSON.stringify({
        product_name: analysis.product_name ?? null,
        per_100g: {
          kcal: per100g.kcal,
          protein_g: per100g.protein_g ?? 0,
          carbs_g: per100g.carbs_g ?? 0,
          fat_g: per100g.fat_g ?? 0,
        },
        suggested_portion_g: analysis.suggested_portion_g ?? null,
        food_id: foodRow?.id ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('analyze-nutrition-label error', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
