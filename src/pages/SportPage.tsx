import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dumbbell, ListChecks, Play, Plus, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { displayDate } from '@/lib/date'
import type { Program, Routine, WorkoutSession } from '@/types/database'

export default function SportPage() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [recentSessions, setRecentSessions] = useState<WorkoutSession[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
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
      supabase.from('programs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]).then(([{ data: r }, { data: s }, { data: p }]) => {
      setRoutines(r ?? [])
      setRecentSessions(s ?? [])
      setPrograms(p ?? [])
      setLoading(false)
    })
  }, [user])

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{t('nav.sport')}</h1>
          <p className="text-xs text-slate-400">{t('sport.subtitle')}</p>
        </div>
        <Link to="/sport/exercices" className="btn-ghost">
          <Dumbbell size={16} />
          {t('sport.exercises')}
        </Link>
      </header>

      <section className="card space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-100">{t('sport.aiProgramTitle')}</p>
            <p className="text-xs text-slate-500">{t('sport.aiProgramSubtitle')}</p>
          </div>
        </div>
        {!profile?.goal_type && (
          <p className="text-xs text-amber-400">
            {t('sport.setGoalBefore')} <Link to="/profil" className="underline">{t('nav.profile').toLowerCase()}</Link>
            {t('sport.setGoalAfter')}
          </p>
        )}
        <Link to="/sport/programme/nouveau" className="btn-primary w-full">
          <Sparkles size={16} />
          {t('sport.generateProgram')}
        </Link>
      </section>

      {programs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-300">{t('sport.myPrograms')}</h2>
          <ul className="space-y-2">
            {programs.map((p) => (
              <li key={p.id} className="card py-3">
                <Link to={`/sport/programme/${p.id}`} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100">{p.name}</span>
                  <span className="text-xs text-slate-500">{displayDate(p.created_at.slice(0, 10))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">{t('sport.myRoutines')}</h2>
          <Link to="/sport/routines/nouveau" className="text-xs font-medium text-brand-400">
            <Plus size={14} className="mr-1 inline" />
            {t('sport.newRoutine')}
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : routines.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            {t('sport.noRoutines')}
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
        <h2 className="mb-2 text-sm font-medium text-slate-300">{t('sport.recentSessions')}</h2>
        {recentSessions.length === 0 ? (
          <p className="text-sm text-slate-500">{t('sport.noSessionsYet')}</p>
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
