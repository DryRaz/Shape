// Supabase Edge Function: generates a 3-week × 4-session training program with
// Claude, referencing only exercises the caller passes in (from the `exercises`
// table). Keeps ANTHROPIC_API_KEY server-side only. Does not touch the database —
// the client is responsible for parsing the returned plan into program/routines/
// routine_exercises rows (RLS then applies normally, keyed to the caller's session).
//
// Deploy: supabase functions deploy generate-training-program
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WEEKS = 3
const SESSIONS_PER_WEEK = 4
const TOTAL_SESSIONS = WEEKS * SESSIONS_PER_WEEK
const MAX_EXERCISES_IN_PROMPT = 400

interface ExerciseInput {
  id: string
  name: string
  muscle_group: string | null
}

interface PlanExercise {
  exercise_id: string
  sets: number
  reps: number
  rest_seconds: number
}

interface PlanSession {
  week: number
  session: number
  name: string
  exercises: PlanExercise[]
}

interface TrainingPlan {
  program_name: string
  sessions: PlanSession[]
}

function goalDescription(goalType: string | null): string {
  switch (goalType) {
    case 'lose_weight':
      return 'perte de poids (cardio/renforcement, dépense calorique élevée)'
    case 'gain_muscle':
      return 'prise de masse musculaire (charges lourdes, hypertrophie)'
    case 'improve_fitness':
      return 'amélioration de la condition physique générale (endurance, mobilité, force fonctionnelle)'
    case 'wellbeing':
      return 'bien-être général (intensité modérée, faible risque de blessure)'
    case 'maintain':
      return 'maintien de la forme actuelle (équilibré)'
    default:
      return "forme générale (l'objectif précis n'a pas été renseigné par l'utilisateur)"
  }
}

function buildPrompt(goalType: string | null, exercises: ExerciseInput[]): string {
  const list = exercises.map((e) => `${e.id}|${e.name}|${e.muscle_group ?? '?'}`).join('\n')
  return `Tu es un coach sportif. Génère un programme d'entraînement de ${WEEKS} semaines, à raison de ${SESSIONS_PER_WEEK} séances par semaine (${TOTAL_SESSIONS} séances au total), adapté à l'objectif suivant : ${goalDescription(goalType)}.

Règles impératives :
- Utilise UNIQUEMENT des exercices de la liste ci-dessous, référencés par leur "id" exact tel quel (ne les modifie pas, ne les invente pas, ne réutilise pas un id absent de la liste).
- Chaque séance contient entre 4 et 6 exercices, en variant les groupes musculaires ciblés au fil de la semaine (pas la même séance répétée).
- Adapte séries / répétitions / repos à l'objectif, par exemple :
  - perte de poids : plus de répétitions (12-20), charges légères, repos courts (30-45s)
  - prise de masse : moins de répétitions (6-10), charges lourdes, repos longs (90-120s)
  - maintien / forme / bien-être : répétitions modérées (8-12), repos moyen (60-75s)
- Donne un nom court et parlant à chaque séance (ex. "Haut du corps — Force", "Cardio & jambes").
- Le tableau "sessions" doit contenir EXACTEMENT ${TOTAL_SESSIONS} entrées : week de 1 à ${WEEKS}, session de 1 à ${SESSIONS_PER_WEEK}, chaque combinaison (week, session) apparaissant une seule fois.

Liste des exercices disponibles (format : id|nom|groupe musculaire), un par ligne :
${list}

Réponds UNIQUEMENT avec un objet JSON valide de cette forme exacte, sans texte autour ni balises markdown :
{
  "program_name": "string",
  "sessions": [
    { "week": 1, "session": 1, "name": "string", "exercises": [ { "exercise_id": "string", "sets": 3, "reps": 10, "rest_seconds": 60 } ] }
  ]
}`
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in model response')
  return JSON.parse(candidate.slice(start, end + 1))
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}

/** Validates and sanitizes the model's raw output against the exercise ids we actually offered it. */
function validatePlan(raw: unknown, validExerciseIds: Set<string>): TrainingPlan {
  if (typeof raw !== 'object' || raw === null) throw new Error('Model response is not a JSON object')
  const obj = raw as Record<string, unknown>
  const programName = typeof obj.program_name === 'string' && obj.program_name.trim() ? obj.program_name.trim() : 'Programme personnalisé'

  if (!Array.isArray(obj.sessions)) throw new Error('Model response has no "sessions" array')

  const seen = new Set<string>()
  const sessions: PlanSession[] = []

  for (const rawSession of obj.sessions) {
    if (typeof rawSession !== 'object' || rawSession === null) continue
    const s = rawSession as Record<string, unknown>
    const week = typeof s.week === 'number' ? s.week : NaN
    const session = typeof s.session === 'number' ? s.session : NaN
    if (!Number.isInteger(week) || week < 1 || week > WEEKS) continue
    if (!Number.isInteger(session) || session < 1 || session > SESSIONS_PER_WEEK) continue
    const key = `${week}-${session}`
    if (seen.has(key)) continue

    const rawExercises = Array.isArray(s.exercises) ? s.exercises : []
    const exercises: PlanExercise[] = []
    for (const rawEx of rawExercises) {
      if (typeof rawEx !== 'object' || rawEx === null) continue
      const e = rawEx as Record<string, unknown>
      const exerciseId = typeof e.exercise_id === 'string' ? e.exercise_id : null
      if (!exerciseId || !validExerciseIds.has(exerciseId)) continue
      exercises.push({
        exercise_id: exerciseId,
        sets: clamp(e.sets, 1, 10, 3),
        reps: clamp(e.reps, 1, 50, 10),
        rest_seconds: clamp(e.rest_seconds, 0, 600, 60),
      })
    }
    if (exercises.length === 0) continue

    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `Semaine ${week} — Séance ${session}`
    seen.add(key)
    sessions.push({ week, session, name, exercises })
  }

  if (sessions.length !== TOTAL_SESSIONS) {
    throw new Error(
      `Model response has ${sessions.length}/${TOTAL_SESSIONS} valid sessions after validation (expected exactly ${WEEKS}×${SESSIONS_PER_WEEK})`
    )
  }

  sessions.sort((a, b) => a.week - b.week || a.session - b.session)
  return { program_name: programName, sessions }
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
    const { goal_type: goalType, exercises } = await req.json()

    if (!Array.isArray(exercises) || exercises.length === 0) {
      return new Response(JSON.stringify({ error: 'exercises must be a non-empty array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanExercises: ExerciseInput[] = exercises
      .filter((e): e is ExerciseInput => e && typeof e.id === 'string' && typeof e.name === 'string')
      .slice(0, MAX_EXERCISES_IN_PROMPT)

    if (cleanExercises.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid exercises (each needs id + name)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const validExerciseIds = new Set(cleanExercises.map((e) => e.id))
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: buildPrompt(typeof goalType === 'string' ? goalType : null, cleanExercises) }],
    })

    if (response.stop_reason === 'refusal') {
      return new Response(JSON.stringify({ error: 'La génération du programme a été refusée.' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) throw new Error('No text content in model response')

    let plan: TrainingPlan
    try {
      const raw = extractJson(textBlock.text)
      plan = validatePlan(raw, validExerciseIds)
    } catch (validationError) {
      console.error('generate-training-program: invalid model output', textBlock.text)
      throw validationError
    }

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('generate-training-program error', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
