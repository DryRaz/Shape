import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, CheckCircle2, Moon, UtensilsCrossed } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import RangeSwitcher from '@/components/RangeSwitcher'
import { computeStreak, isoDate, rangeFor, todayInTimezone, type RangeKind } from '@/lib/date'
import type { HabitLog, HabitType, Meal, SleepLog } from '@/types/database'

export default function DashboardPage() {
  const { profile, user } = useAuth()
  const timezone = profile?.timezone ?? 'Africa/Nairobi'
  const [kind, setKind] = useState<RangeKind>('day')
  const [anchor, setAnchor] = useState(() => todayInTimezone(timezone))
  const [habitTypes, setHabitTypes] = useState<HabitType[]>([])
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([])
  const [meals, setMeals] = useState<Meal[]>([])
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([])
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => rangeFor(kind, anchor, timezone), [kind, anchor, timezone])
  const startIso = isoDate(range.start)
  const endIso = isoDate(range.end)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)

    async function load() {
      const [{ data: types }, { data: logs }, { data: mealRows }, { data: sleepRows }, { data: allLogs }] =
        await Promise.all([
          supabase.from('habit_types').select('*').eq('user_id', user!.id).eq('active', true),
          supabase.from('habit_logs').select('*').eq('user_id', user!.id).gte('date', startIso).lte('date', endIso),
          supabase.from('meals').select('*').eq('user_id', user!.id).gte('date', startIso).lte('date', endIso),
          supabase.from('sleep_logs').select('*').eq('user_id', user!.id).gte('date', startIso).lte('date', endIso),
          supabase.from('habit_logs').select('date').eq('user_id', user!.id).order('date', { ascending: false }).limit(400),
        ])

      if (cancelled) return
      setHabitTypes(types ?? [])
      setHabitLogs(logs ?? [])
      setMeals(mealRows ?? [])
      setSleepLogs(sleepRows ?? [])
      setStreak(computeStreak(new Set((allLogs ?? []).map((l) => l.date)), timezone))
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user, startIso, endIso, timezone])

  const totalCalories = meals.reduce((sum, m) => sum + (m.estimated_calories ?? 0), 0)
  const daysInRange = range.days.length
  const possibleHabitCompletions = habitTypes.length * daysInRange
  const completedHabitCount = new Set(habitLogs.map((l) => `${l.habit_type_id}:${l.date}`)).size
  const avgSleep =
    sleepLogs.length > 0
      ? sleepLogs.reduce((sum, s) => sum + (s.duration_hours ?? 0), 0) / sleepLogs.length
      : null

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-slate-400">Bonjour 👋</p>
        <h1 className="text-xl font-semibold text-slate-50">Votre tableau de bord</h1>
      </header>

      <RangeSwitcher kind={kind} anchorIso={anchor} onKindChange={setKind} onAnchorChange={setAnchor} />

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Chargement…</div>
      ) : (
        <>
          <div className="card flex items-center gap-3 border-brand-500/30 bg-brand-500/5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
              <Flame size={22} />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-50">{streak} jour{streak > 1 ? 's' : ''}</p>
              <p className="text-xs text-slate-400">Streak en cours (habitudes)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link to="/nutrition" className="card block">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/15 text-orange-400">
                <UtensilsCrossed size={18} />
              </div>
              <p className="text-lg font-semibold text-slate-50">{Math.round(totalCalories)} kcal</p>
              <p className="text-xs text-slate-400">{meals.length} repas enregistrés</p>
            </Link>

            <div className="card">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <CheckCircle2 size={18} />
              </div>
              <p className="text-lg font-semibold text-slate-50">
                {completedHabitCount}/{possibleHabitCompletions || 0}
              </p>
              <p className="text-xs text-slate-400">Habitudes complétées</p>
            </div>

            <Link to="/sommeil" className="card block">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                <Moon size={18} />
              </div>
              <p className="text-lg font-semibold text-slate-50">
                {avgSleep !== null ? `${avgSleep.toFixed(1)} h` : '—'}
              </p>
              <p className="text-xs text-slate-400">Sommeil moyen</p>
            </Link>

            <div className="card">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Habitudes actives</p>
              <ul className="space-y-1.5">
                {habitTypes.length === 0 && <li className="text-xs text-slate-500">Aucune habitude définie</li>}
                {habitTypes.slice(0, 4).map((h) => {
                  const done = habitLogs.some((l) => l.habit_type_id === h.id)
                  return (
                    <li key={h.id} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-brand-400' : 'bg-slate-700'}`} />
                      <span className={done ? 'text-slate-200' : 'text-slate-500'}>{h.name}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
