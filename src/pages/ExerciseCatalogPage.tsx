import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Exercise } from '@/types/database'

export default function ExerciseCatalogPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const routineId = searchParams.get('routineId')

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<string>('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    supabase
      .from('exercises')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setExercises(data ?? [])
        setLoading(false)
      })
  }, [])

  const muscleGroups = useMemo(
    () => Array.from(new Set(exercises.map((e) => e.muscle_group).filter(Boolean))) as string[],
    [exercises]
  )

  const filtered = exercises.filter((e) => {
    const matchesQuery = e.name.toLowerCase().includes(query.toLowerCase())
    const matchesMuscle = !muscleFilter || e.muscle_group === muscleFilter
    return matchesQuery && matchesMuscle
  })

  async function handleSelect(exercise: Exercise) {
    if (!routineId || adding) return
    setAdding(true)
    const { count } = await supabase
      .from('routine_exercises')
      .select('*', { count: 'exact', head: true })
      .eq('routine_id', routineId)
    await supabase.from('routine_exercises').insert({
      routine_id: routineId,
      exercise_id: exercise.id,
      order: count ?? 0,
      sets: 3,
      reps: 10,
      rest_seconds: 60,
    })
    navigate(`/sport/routines/${routineId}`)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold text-slate-50">Catalogue d'exercices</h1>
      </header>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-9"
          placeholder="Rechercher un exercice…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {muscleGroups.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setMuscleFilter('')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              muscleFilter === '' ? 'bg-brand-500 text-slate-950' : 'bg-slate-900 text-slate-400'
            }`}
          >
            Tous
          </button>
          {muscleGroups.map((mg) => (
            <button
              key={mg}
              onClick={() => setMuscleFilter(mg)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                muscleFilter === mg ? 'bg-brand-500 text-slate-950' : 'bg-slate-900 text-slate-400'
              }`}
            >
              {mg}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Aucun exercice trouvé. Importez le catalogue avec <code>npm run wger:import</code>.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((ex) => (
            <li key={ex.id}>
              <button
                onClick={() => handleSelect(ex)}
                disabled={adding}
                className="card flex w-full items-center gap-3 py-3 text-left disabled:opacity-50"
              >
                {ex.visual_url ? (
                  <img src={ex.visual_url} alt="" className="h-14 w-14 rounded-lg bg-slate-800 object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{ex.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {ex.muscle_group ?? '—'} {ex.equipment ? `· ${ex.equipment}` : ''}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
