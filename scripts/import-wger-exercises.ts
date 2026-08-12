/**
 * Imports the exercise catalog from the wger API (https://wger.de/api/v2/)
 * into the `exercises` table, using the Supabase service role key (bypasses RLS).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run wger:import
 *
 * This script is not wired into any automated pipeline — it must be run manually
 * (or from your own CI) whenever you want to (re)populate/refresh the `exercises`
 * table. If that table is empty, the most likely reason is simply that nobody has
 * run this command yet against the target Supabase project.
 */
import { createClient } from '@supabase/supabase-js'

const WGER_BASE = 'https://wger.de/api/v2'
const ENGLISH_LANGUAGE_ID = 2
const PAGE_LIMIT = 50
const MAX_ATTEMPTS = 4
const REQUEST_TIMEOUT_MS = 20_000

const rawSupabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

if (!rawSupabaseUrl || !SERVICE_ROLE_KEY) {
  fail(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
      'Run: SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... npm run wger:import'
  )
}

if (rawSupabaseUrl.includes('your-project') || SERVICE_ROLE_KEY.includes('your-service-role-key')) {
  fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY still look like the .env.example placeholders. Set real values.')
}

// Same misconfiguration guard as src/lib/supabase.ts: the dashboard's "REST API"
// URL already ends in /rest/v1, which would silently break every request below.
let SUPABASE_URL = rawSupabaseUrl
const stripped = SUPABASE_URL.replace(/\/(rest|auth|storage|realtime|functions)\/v1\/?$/, '')
if (stripped !== SUPABASE_URL) {
  console.warn(
    `⚠️  SUPABASE_URL should be the bare project URL, not an API path. Using "${stripped}" instead of "${SUPABASE_URL}".`
  )
  SUPABASE_URL = stripped
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

interface ExerciseRow {
  wger_id: number
  name: string
  muscle_group: string | null
  instructions: string | null
  visual_url: string | null
  video_url: string | null
  equipment: string | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetches a URL with a timeout and retries on network errors / 429 / 5xx.
 * Fails fast (no retry) on other 4xx responses, since retrying those is pointless.
 */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (res.ok) return res
      if (res.status !== 429 && res.status < 500) {
        // Non-retryable: bad request, auth, not found, etc.
        throw new Error(`wger API error ${res.status} on ${url}: ${await res.text()}`)
      }
      lastError = new Error(`wger API error ${res.status} on ${url}: ${await res.text()}`)
    } catch (err) {
      clearTimeout(timeout)
      lastError = err
    }
    if (attempt < MAX_ATTEMPTS) {
      const backoffMs = 1000 * 2 ** (attempt - 1)
      console.warn(`  Retry ${attempt}/${MAX_ATTEMPTS - 1} for ${url} in ${backoffMs}ms — ${String(lastError)}`)
      await sleep(backoffMs)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function fetchAllExercises(): Promise<WgerExerciseInfo[]> {
  const results: WgerExerciseInfo[] = []
  let url: string | null = `${WGER_BASE}/exerciseinfo/?limit=${PAGE_LIMIT}&format=json`
  let page = 0
  let announcedTotal: number | null = null

  while (url) {
    page++
    const res = await fetchWithRetry(url)
    const body = (await res.json()) as { count?: number; results?: WgerExerciseInfo[]; next: string | null }
    if (!Array.isArray(body.results)) {
      throw new Error(
        `Unexpected wger API response shape on page ${page} (no "results" array) — the API contract may have changed: ${JSON.stringify(body).slice(0, 300)}`
      )
    }
    if (announcedTotal === null && typeof body.count === 'number') announcedTotal = body.count
    results.push(...body.results)
    url = body.next
    console.log(`  Page ${page}: fetched ${results.length}${announcedTotal !== null ? `/${announcedTotal}` : ''} exercises…`)
  }

  return results
}

async function main() {
  const startedAt = Date.now()
  console.log(`Fetching exercises from ${WGER_BASE}/exerciseinfo/ …`)
  const wgerExercises = await fetchAllExercises()

  if (wgerExercises.length === 0) {
    throw new Error(
      'wger API returned 0 exercises. Aborting without touching Supabase — this almost always means the API ' +
        'response shape changed (see the raw response above) rather than the catalog genuinely being empty.'
    )
  }
  console.log(`Fetched ${wgerExercises.length} exercises total.`)

  const rows: ExerciseRow[] = []
  const skipped: { id: number; reason: string }[] = []

  for (const ex of wgerExercises) {
    if (!Array.isArray(ex.translations) || ex.translations.length === 0) {
      skipped.push({ id: ex.id, reason: 'no translations' })
      continue
    }
    const translation = ex.translations.find((t) => t.language === ENGLISH_LANGUAGE_ID) ?? ex.translations[0]
    if (!translation?.name?.trim()) {
      skipped.push({ id: ex.id, reason: 'translation has no name' })
      continue
    }
    const mainImage = ex.images?.find((img) => img.is_main) ?? ex.images?.[0]
    rows.push({
      wger_id: ex.id,
      name: translation.name.trim(),
      muscle_group: ex.category?.name ?? null,
      instructions: translation.description ? stripHtml(translation.description) : null,
      visual_url: mainImage?.image ?? null,
      video_url: null,
      equipment: ex.equipment?.map((e) => e.name).join(', ') || null,
    })
  }

  if (skipped.length > 0) {
    console.warn(
      `Skipped ${skipped.length}/${wgerExercises.length} exercises with no usable translation (examples: ${skipped
        .slice(0, 5)
        .map((s) => `#${s.id} (${s.reason})`)
        .join(', ')}).`
    )
  }

  if (rows.length === 0) {
    throw new Error('Every fetched exercise was skipped (no usable translation) — nothing to upsert. Aborting.')
  }

  console.log(`Upserting ${rows.length} exercises into Supabase (chunks of 200)…`)

  const chunkSize = 200
  let upserted = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase.from('exercises').upsert(chunk, { onConflict: 'wger_id' })
    if (error) {
      throw new Error(
        `Supabase upsert failed on rows ${i}-${i + chunk.length - 1} (wger_id ${chunk[0].wger_id}..${chunk[chunk.length - 1].wger_id}): ` +
          `${error.message} (code: ${error.code ?? 'n/a'}, details: ${error.details ?? 'n/a'}, hint: ${error.hint ?? 'n/a'}). ` +
          'Check that SUPABASE_SERVICE_ROLE_KEY is the real service_role key (not anon) and that migrations have been applied.'
      )
    }
    upserted += chunk.length
    console.log(`  Upserted ${upserted}/${rows.length}`)
  }

  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `\n✅ Done in ${elapsedS}s — fetched ${wgerExercises.length}, upserted ${upserted}, skipped ${skipped.length}.`
  )
}

main().catch((err) => {
  console.error('\n❌ wger import failed:')
  console.error(err)
  process.exit(1)
})
