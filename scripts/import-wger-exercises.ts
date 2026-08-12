/**
 * Imports the exercise catalog from the wger API (https://wger.de/api/v2/)
 * into the `exercises` table, using the Supabase service role key (bypasses RLS).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run wger:import
 */
import { createClient } from '@supabase/supabase-js'

const WGER_BASE = 'https://wger.de/api/v2'
const ENGLISH_LANGUAGE_ID = 2
const PAGE_LIMIT = 50

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

interface WgerTranslation {
  language: number
  name: string
  description: string
}

interface WgerImage {
  image: string
  is_main: boolean
}

interface WgerExerciseInfo {
  id: number
  category: { name: string } | null
  equipment: { name: string }[]
  images: WgerImage[]
  translations: WgerTranslation[]
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchAllExercises(): Promise<WgerExerciseInfo[]> {
  const results: WgerExerciseInfo[] = []
  let url: string | null = `${WGER_BASE}/exerciseinfo/?limit=${PAGE_LIMIT}&format=json`

  while (url) {
    const res: Response = await fetch(url)
    if (!res.ok) throw new Error(`wger API error ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as { results: WgerExerciseInfo[]; next: string | null }
    results.push(...body.results)
    url = body.next
    console.log(`Fetched ${results.length} exercises so far…`)
  }

  return results
}

async function main() {
  console.log('Fetching exercises from wger…')
  const wgerExercises = await fetchAllExercises()

  const rows = wgerExercises
    .map((ex) => {
      const translation = ex.translations.find((t) => t.language === ENGLISH_LANGUAGE_ID) ?? ex.translations[0]
      if (!translation?.name) return null
      const mainImage = ex.images.find((img) => img.is_main) ?? ex.images[0]
      return {
        wger_id: ex.id,
        name: translation.name,
        muscle_group: ex.category?.name ?? null,
        instructions: translation.description ? stripHtml(translation.description) : null,
        visual_url: mainImage?.image ?? null,
        video_url: null,
        equipment: ex.equipment.map((e) => e.name).join(', ') || null,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  console.log(`Upserting ${rows.length} exercises into Supabase…`)

  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('exercises').upsert(chunk, { onConflict: 'wger_id' })
    if (error) throw error
    console.log(`Upserted ${Math.min(i + chunkSize, rows.length)}/${rows.length}`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
