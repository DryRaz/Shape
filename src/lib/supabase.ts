import { createClient } from '@supabase/supabase-js'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// VITE_SUPABASE_URL must be the bare project URL (https://xxxx.supabase.co),
// not a specific API path. A common misconfiguration is pasting the "REST API"
// URL from the dashboard (which already ends in /rest/v1) — the SDK then
// appends /auth/v1/... on top of that, so auth calls hit /rest/v1/auth/v1/...
// and the Supabase gateway routes them to PostgREST instead of GoTrue,
// producing "Invalid path specified in request URL" instead of a real auth error.
let supabaseUrl = rawSupabaseUrl
if (supabaseUrl) {
  const stripped = supabaseUrl.replace(/\/(rest|auth|storage|realtime|functions)\/v1\/?$/, '')
  if (stripped !== supabaseUrl) {
    // eslint-disable-next-line no-console
    console.warn(
      `VITE_SUPABASE_URL should be the bare project URL, not an API path. Using "${stripped}" instead of "${supabaseUrl}".`
    )
    supabaseUrl = stripped
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project credentials.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
