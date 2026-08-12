import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dumbbell, ListChecks, Play, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { displayDate } from '@/lib/date'
import type { Routine, WorkoutSession } from '@/types/database'

export default function SportPage() {
  const { user } = useAuth()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [recentSessions, setRecentSessions] = useState<WorkoutSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('routines').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', user.id)
        .not('completed_at', 'is', null)
        .order('date', { ascending: false })
        .limit(10),
    ]).then(([{ data: r }, { data: s }]) => {
      setRoutines(r ?? [])
      setRecentSessions(s ?? [])
      setLoading(false)
    })
  }, [user])

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Sport</h1>
          <p className="text-xs text-slate-400">Routines et séances d'entraînement</p>
        </div>
        <Link to="/sport/exercices" className="btn-ghost">
          <Dumbbell size={16} />
          Exercices
        </Link>
      </header>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">Mes routines</h2>
          <Link to="/sport/routines/nouveau" className="text-xs font-medium text-brand-400">
            <Plus size={14} className="mr-1 inline" />
            Nouvelle
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : routines.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            Aucune routine. Créez-en une pour commencer.
          </div>
        ) : (
          <ul className="space-y-2">
            {routines.map((r) => (
              <li key={r.id} className="card flex items-center justify-between py-3">
                <Link to={`/sport/routines/${r.id}`} className="flex flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                    <ListChecks size={18} />
                  </div>
                  <span className="text-sm font-medium text-slate-100">{r.name}</span>
                </Link>
                <Link to={`/sport/routines/${r.id}`} className="btn-ghost p-2">
                  <Play size={16} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Séances récentes</h2>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune séance terminée pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {recentSessions.map((s) => (
              <li key={s.id} className="card flex items-center justify-between py-3 text-sm">
                <span className="text-slate-300">{displayDate(s.date)}</span>
                <span className="text-xs text-slate-500">
                  {s.completed_at && s.started_at
                    ? `${Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000)} min`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
