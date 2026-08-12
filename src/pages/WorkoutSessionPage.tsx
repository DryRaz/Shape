import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Pause, Play, SkipForward, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Exercise, RoutineExercise, WorkoutSession } from '@/types/database'

interface RoutineExerciseWithExercise extends RoutineExercise {
  exercises: Exercise
}

type Phase = 'exercise' | 'rest' | 'summary'

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function WorkoutSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [steps, setSteps] = useState<RoutineExerciseWithExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('exercise')
  const [setsCompleted, setSetsCompleted] = useState(0)
  const [reps, setReps] = useState<number | ''>('')
  const [weight, setWeight] = useState<number | ''>('')
  const [timerRunning, setTimerRunning] = useState(true)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const finishingRef = useRef(false)

  useEffect(() => {
    if (!sessionId) return
    ;(async () => {
      const { data: sess } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).single()
      if (!sess?.routine_id) {
        setLoading(false)
        return
      }
      setSession(sess)
      const { data: exs } = await supabase
        .from('routine_exercises')
        .select('*, exercises(*)')
        .eq('routine_id', sess.routine_id)
        .order('order')
      setSteps((exs as RoutineExerciseWithExercise[]) ?? [])
      setLoading(false)
    })()
  }, [sessionId])

  const current = steps[index]

  const resetForStep = useCallback((step: RoutineExerciseWithExercise | undefined) => {
    if (!step) return
    setSetsCompleted(0)
    setReps(step.reps ?? '')
    setWeight('')
    if (step.duration_seconds) {
      setSecondsLeft(step.duration_seconds)
      setTimerRunning(true)
    }
  }, [])

  useEffect(() => {
    resetForStep(current)
  }, [current, resetForStep])

  useEffect(() => {
    if (phase === 'exercise' && current?.duration_seconds && timerRunning && secondsLeft > 0) {
      const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [phase, current, timerRunning, secondsLeft])

  useEffect(() => {
    if (phase === 'rest' && secondsLeft > 0) {
      const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
      return () => clearTimeout(t)
    }
    if (phase === 'rest' && secondsLeft === 0) {
      goToNext()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft])

  async function logCurrentExercise() {
    if (!current || !sessionId) return
    await supabase.from('workout_session_logs').insert({
      session_id: sessionId,
      exercise_id: current.exercise_id,
      sets_completed: current.duration_seconds ? 1 : setsCompleted,
      reps_completed: current.duration_seconds ? null : reps === '' ? null : reps,
      weight_used: weight === '' ? null : weight,
    })
  }

  async function goToRestOrNext() {
    await logCurrentExercise()
    const rest = current?.rest_seconds ?? 60
    if (index < steps.length - 1 && rest > 0) {
      setSecondsLeft(rest)
      setPhase('rest')
    } else {
      goToNext()
    }
  }

  function goToNext() {
    if (index < steps.length - 1) {
      setIndex((i) => i + 1)
      setPhase('exercise')
    } else {
      finishSession()
    }
  }

  async function finishSession() {
    if (finishingRef.current || !sessionId) return
    finishingRef.current = true
    await supabase.from('workout_sessions').update({ completed_at: new Date().toISOString() }).eq('id', sessionId)
    setPhase('summary')
  }

  if (loading) return <p className="py-12 text-center text-sm text-slate-500">Chargement…</p>
  if (!session || steps.length === 0) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-slate-500">Séance introuvable.</p>
        <button onClick={() => navigate('/sport')} className="btn-secondary mx-auto">
          Retour
        </button>
      </div>
    )
  }

  if (phase === 'summary') {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
          <Check size={32} />
        </div>
        <h1 className="text-xl font-semibold text-slate-50">Séance terminée !</h1>
        <p className="text-sm text-slate-400">{steps.length} exercices complétés.</p>
        <button onClick={() => navigate('/sport')} className="btn-primary">
          Retour au sport
        </button>
      </div>
    )
  }

  const progress = ((index + (phase === 'rest' ? 1 : 0)) / steps.length) * 100

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/sport')} className="text-slate-500">
          <X size={20} />
        </button>
        <div className="progress-bar flex-1">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-slate-500">
          {index + 1}/{steps.length}
        </span>
      </div>

      {phase === 'rest' ? (
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-400">Repos</p>
          <p className="text-6xl font-bold text-brand-400">{formatSeconds(secondsLeft)}</p>
          <p className="text-sm text-slate-500">Prochain : {steps[index + 1]?.exercises.name}</p>
          <button onClick={goToNext} className="btn-secondary">
            <SkipForward size={16} />
            Passer le repos
          </button>
        </div>
      ) : (
        current && (
          <div className="space-y-5">
            {current.exercises.visual_url ? (
              <img
                src={current.exercises.visual_url}
                alt={current.exercises.name}
                className="h-64 w-full rounded-2xl bg-slate-900 object-cover"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-slate-900 text-slate-600">
                Pas de visuel
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-slate-50">{current.exercises.name}</h1>
              <p className="text-sm text-slate-400">{current.exercises.muscle_group}</p>
            </div>

            {current.exercises.instructions && (
              <p className="text-sm text-slate-400">{current.exercises.instructions}</p>
            )}

            {current.duration_seconds ? (
              <div className="card flex flex-col items-center gap-4 py-8">
                <p className="text-6xl font-bold text-slate-50">{formatSeconds(secondsLeft)}</p>
                <button
                  onClick={() => setTimerRunning((r) => !r)}
                  className="btn-secondary"
                >
                  {timerRunning ? <Pause size={16} /> : <Play size={16} />}
                  {timerRunning ? 'Pause' : 'Reprendre'}
                </button>
              </div>
            ) : (
              <div className="card space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-200">
                    Série {Math.min(setsCompleted + 1, current.sets ?? 1)}/{current.sets ?? 1}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Répétitions</label>
                    <input
                      type="number"
                      className="input"
                      value={reps}
                      onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="label">Charge (kg)</label>
                    <input
                      type="number"
                      className="input"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                </div>
                <button
                  className="btn-secondary w-full"
                  onClick={() => setSetsCompleted((s) => Math.min(s + 1, current.sets ?? 1))}
                  disabled={setsCompleted >= (current.sets ?? 1)}
                >
                  <Check size={16} />
                  Série terminée
                </button>
              </div>
            )}

            <button
              className="btn-primary w-full"
              onClick={goToRestOrNext}
              disabled={
                current.duration_seconds ? secondsLeft > 0 : setsCompleted < (current.sets ?? 1)
              }
            >
              {index < steps.length - 1 ? "Exercice suivant" : 'Terminer la séance'}
            </button>
          </div>
        )
      )}
    </div>
  )
}
