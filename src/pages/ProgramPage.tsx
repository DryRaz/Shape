import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Dumbbell, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { Exercise, Program, Routine, RoutineExercise } from '@/types/database'

interface RoutineExerciseWithExercise extends RoutineExercise {
  exercises: Exercise
}

interface RoutineWithItems extends Routine {
  routine_exercises: RoutineExerciseWithExercise[]
}

export default function ProgramPage() {
  const { programId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [program, setProgram] = useState<Program | null>(null)
  const [routines, setRoutines] = useState<RoutineWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [startingId, setStartingId] = useState<string | null>(null)

  useEffect(() => {
    if (!programId) return
    ;(async () => {
      const [{ data: prog }, { data: rts }] = await Promise.all([
        supabase.from('programs').select('*').eq('id', programId).single(),
        supabase
          .from('routines')
          .select('*, routine_exercises(*, exercises(*))')
          .eq('program_id', programId)
          .order('week_number')
          .order('session_number'),
      ])
      setProgram(prog ?? null)
      setRoutines((rts as RoutineWithItems[]) ?? [])
      setLoading(false)
    })()
  }, [programId])

  async function startSession(routineId: string) {
    if (!user) return
    setStartingId(routineId)
    const { data } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user.id, routine_id: routineId, started_at: new Date().toISOString() })
      .select('*')
      .single()
    setStartingId(null)
    if (data) navigate(`/sport/seance/${data.id}`)
  }

  if (loading) return <p className="py-12 text-center text-sm text-slate-500">Chargement…</p>

  if (!program) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-slate-500">Programme introuvable.</p>
        <button onClick={() => navigate('/sport')} className="btn-secondary mx-auto">
          Retour
        </button>
      </div>
    )
  }

  const weeks = Array.from(new Set(routines.map((r) => r.week_number).filter((w): w is number => w !== null))).sort(
    (a, b) => a - b
  )

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate('/sport')} className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-50">{program.name}</h1>
          <p className="text-xs text-slate-400">{routines.length} séances générées</p>
        </div>
      </header>

      {weeks.map((week) => (
        <section key={week}>
          <h2 className="mb-2 text-sm font-medium text-slate-300">Semaine {week}</h2>
          <ul className="space-y-2">
            {routines
              .filter((r) => r.week_number === week)
              .map((r) => {
                const muscleGroups = Array.from(
                  new Set(r.routine_exercises.map((it) => it.exercises?.muscle_group).filter(Boolean))
                ) as string[]
                return (
                  <li key={r.id} className="card space-y-2 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                        <Dumbbell size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-100">{r.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {r.routine_exercises.length} exercices
                          {muscleGroups.length > 0 ? ` · ${muscleGroups.join(', ')}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => startSession(r.id)}
                        disabled={startingId === r.id || r.routine_exercises.length === 0}
                        className="btn-secondary shrink-0 px-3 py-2"
                      >
                        <Play size={16} />
                        {startingId === r.id ? '…' : 'Démarrer'}
                      </button>
                    </div>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}
