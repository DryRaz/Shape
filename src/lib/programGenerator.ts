import { supabase } from './supabase'
import type { GoalType } from '@/types/database'

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

/** Calls the `generate-training-program` Edge Function with the user's goal + the exercise catalog. */
async function requestPlan(goalType: GoalType | null, exercises: { id: string; name: string; muscle_group: string | null }[]): Promise<TrainingPlan> {
  const { data, error } = await supabase.functions.invoke('generate-training-program', {
    body: { goal_type: goalType, exercises },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as TrainingPlan
}

/**
 * Generates a full training program for `userId`: calls Claude for a 3-week × 4-session
 * plan restricted to the given exercise catalog, then creates 1 `programs` row + 12
 * linked `routines` rows (one per session) + their `routine_exercises` rows.
 * Returns the new program's id.
 */
export async function generateAndSaveProgram(
  userId: string,
  goalType: GoalType | null,
  exercises: { id: string; name: string; muscle_group: string | null }[]
): Promise<string> {
  if (exercises.length === 0) {
    throw new Error("Le catalogue d'exercices est vide — importez-le d'abord (voir le README, npm run wger:import).")
  }

  const plan = await requestPlan(goalType, exercises)

  const { data: program, error: programError } = await supabase
    .from('programs')
    .insert({ user_id: userId, goal_type: goalType, name: plan.program_name })
    .select('*')
    .single()
  if (programError) throw programError

  try {
    for (const session of plan.sessions) {
      const { data: routine, error: routineError } = await supabase
        .from('routines')
        .insert({
          user_id: userId,
          name: session.name,
          program_id: program.id,
          week_number: session.week,
          session_number: session.session,
        })
        .select('*')
        .single()
      if (routineError) throw routineError

      const routineExercises = session.exercises.map((ex, index) => ({
        routine_id: routine.id,
        exercise_id: ex.exercise_id,
        order: index,
        sets: ex.sets,
        reps: ex.reps,
        rest_seconds: ex.rest_seconds,
      }))
      const { error: itemsError } = await supabase.from('routine_exercises').insert(routineExercises)
      if (itemsError) throw itemsError
    }
  } catch (err) {
    // Best-effort cleanup so a partially-created program doesn't linger — routines/
    // routine_exercises cascade-delete via their program_id/routine_id foreign keys.
    await supabase.from('programs').delete().eq('id', program.id)
    throw err
  }

  return program.id as string
}
