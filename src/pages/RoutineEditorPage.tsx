import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Play, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import type { Exercise, RoutineExercise } from '@/types/database'

interface RoutineExerciseWithExercise extends RoutineExercise {
  exercises: Exercise
}

export default function RoutineEditorPage() {
  const { routineId: routineIdParam } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [routineId, setRoutineId] = useState<string | null>(routineIdParam ?? null)
  const [name, setName] = useState('')
  const [items, setItems] = useState<RoutineExerciseWithExercise[]>([])
  const [loading, setLoading] = useState(true)
  const [startingSession, setStartingSession] = useState(false)

  useEffect(() => {
    if (!user) return
    if (!routineIdParam) {
      supabase
        .from('routines')
        .insert({ user_id: user.id, name: 'Nouvelle routine' })
        .select('*')
        .single()
        .then(({ data }) => {
          if (data) navigate(`/sport/routines/${data.id}`, { replace: true })
        })
      return
    }
    setRoutineId(routineIdParam)
  }, [user, routineIdParam, navigate])

  async function loadRoutine(id: string) {
    setLoading(true)
    const [{ data: routine }, { data: exercises }] = await Promise.all([
      supabase.from('routines').select('*').eq('id', id).single(),
      supabase
        .from('routine_exercises')
        .select('*, exercises(*)')
        .eq('routine_id', id)
        .order('order'),
    ])
    if (routine) setName(routine.name)
    setItems((exercises as RoutineExerciseWithExercise[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (routineId) loadRoutine(routineId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineId])

  async function handleNameBlur() {
    if (!routineId || !name.trim()) return
    await supabase.from('routines').update({ name: name.trim() }).eq('id', routineId)
  }

  async function updateItem(id: string, patch: Partial<RoutineExercise>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    await supabase.from('routine_exercises').update(patch).eq('id', id)
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
    await supabase.from('routine_exercises').delete().eq('id', id)
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)
    await Promise.all([
      supabase.from('routine_exercises').update({ order: index }).eq('id', next[index].id),
      supabase.from('routine_exercises').update({ order: target }).eq('id', next[target].id),
    ])
  }

  async function startSession() {
    if (!routineId || !user || items.length === 0) return
    setStartingSession(true)
    const { data } = await supabase
      .from('workout_sessions')
      .insert({ user_id: user.id, routine_id: routineId, started_at: new Date().toISOString() })
      .select('*')
      .single()
    setStartingSession(false)
    if (data) navigate(`/sport/seance/${data.id}`)
  }

  if (loading || !routineId) {
    return <p className="py-12 text-center text-sm text-slate-500">Chargement…</p>
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate('/sport')} className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </button>
        <input
          className="input flex-1 text-base font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
        />
      </header>

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="card space-y-3">
            <div className="flex items-center gap-3">
              {item.exercises.visual_url ? (
                <img src={item.exercises.visual_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-800" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">{item.exercises.name}</p>
                <p className="truncate text-xs text-slate-500">{item.exercises.muscle_group ?? '—'}</p>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => moveItem(index, -1)} disabled={index === 0} className="text-slate-500 disabled:opacity-30">
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => moveItem(index, 1)}
                  disabled={index === items.length - 1}
                  className="text-slate-500 disabled:opacity-30"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <button onClick={() => removeItem(item.id)} className="text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <label className="label !mb-1">Séries</label>
                <input
                  type="number"
                  className="input py-1.5"
                  value={item.sets ?? ''}
                  onChange={(e) => updateItem(item.id, { sets: Number(e.target.value) || null })}
                />
              </div>
              <div>
                <label className="label !mb-1">Reps</label>
                <input
                  type="number"
                  className="input py-1.5"
                  value={item.reps ?? ''}
                  onChange={(e) => updateItem(item.id, { reps: Number(e.target.value) || null })}
                />
              </div>
              <div>
                <label className="label !mb-1">Durée (s)</label>
                <input
                  type="number"
                  className="input py-1.5"
                  value={item.duration_seconds ?? ''}
                  onChange={(e) => updateItem(item.id, { duration_seconds: Number(e.target.value) || null })}
                />
              </div>
              <div>
                <label className="label !mb-1">Repos (s)</label>
                <input
                  type="number"
                  className="input py-1.5"
                  value={item.rest_seconds ?? ''}
                  onChange={(e) => updateItem(item.id, { rest_seconds: Number(e.target.value) || null })}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={() => navigate(`/sport/exercices?routineId=${routineId}`)}
        className="btn-secondary w-full"
      >
        <Plus size={16} />
        Ajouter un exercice
      </button>

      {items.length > 0 && (
        <button onClick={startSession} disabled={startingSession} className="btn-primary w-full">
          <Play size={16} />
          {startingSession ? 'Démarrage…' : 'Démarrer la séance'}
        </button>
      )}
    </div>
  )
}
