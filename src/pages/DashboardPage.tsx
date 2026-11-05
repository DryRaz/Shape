import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, CheckCircle2, Moon, UtensilsCrossed, Dumbbell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import RangeSwitcher from '@/components/RangeSwitcher'
import TrendBarChart, { type TrendPoint } from '@/components/TrendBarChart'
import { computeStreak, isoDate, rangeFor, todayInTimezone, trailingDays, type RangeKind } from '@/lib/date'
import type { HabitLog, HabitType, Meal, SleepLog } from '@/types/database'

type TrendWindow = 7 | 30 | 90

const TREND_WINDOW_OPTIONS: { value: TrendWindow; label: string }[] = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '3 mois' },
]

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

  const [trendWindow, setTrendWindow] = useState<TrendWindow>(7)
  const [calorieTrend, setCalorieTrend] = useState<TrendPoint[]>([])
  const [sleepTrend, setSleepTrend] = useState<TrendPoint[]>([])
  const [sportTrend, setSportTrend] = useState<TrendPoint[]>([])
  const [trendsLoading, setTrendsLoading] = useState(true)

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

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setTrendsLoading(true)

    async function loadTrends() {
      const days = trailingDays(trendWindow, timezone)
      const start = days[0]
      const end = days[days.length - 1]

      const [{ data: mealRows }, { data: sleepRows }, { data: sessionRows }] = await Promise.all([
        supabase.from('meals').select('date, estimated_calories').eq('user_id', user!.id).gte('date', start).lte('date', end),
        supabase.from('sleep_logs').select('date, duration_hours').eq('user_id', user!.id).gte('date', start).lte('date', end),
        supabase
          .from('workout_sessions')
          .select('date, started_at, completed_at')
          .eq('user_id', user!.id)
          .not('completed_at', 'is', null)
          .gte('date', start)
          .lte('date', end),
      ])
      if (cancelled) return

      const caloriesByDate = new Map<string, number>()
      for (const m of mealRows ?? []) {
        caloriesByDate.set(m.date, (caloriesByDate.get(m.date) ?? 0) + (m.estimated_calories ?? 0))
      }

      const sleepByDate = new Map<string, number>()
      for (const s of sleepRows ?? []) {
        if (s.duration_hours !== null) sleepByDate.set(s.date, s.duration_hours)
      }

      const sportMinutesByDate = new Map<string, number>()
      for (const s of sessionRows ?? []) {
        if (!s.started_at || !s.completed_at) continue
        const minutes = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000
        sportMinutesByDate.set(s.date, (sportMinutesByDate.get(s.date) ?? 0) + minutes)
      }

      setCalorieTrend(days.map((d) => ({ date: d, value: caloriesByDate.get(d) ?? 0 })))
      setSleepTrend(days.map((d) => ({ date: d, value: sleepByDate.has(d) ? sleepByDate.get(d)! : null })))
      setSportTrend(days.map((d) => ({ date: d, value: sportMinutesByDate.get(d) ?? 0 })))
      setTrendsLoading(false)
    }

    loadTrends()
    return () => {
      cancelled = true
    }
  }, [user, trendWindow, timezone])

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

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-300">Progression</h2>
              <div className="flex rounded-xl bg-slate-900 p-1">
                {TREND_WINDOW_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTrendWindow(opt.value)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      trendWindow === opt.value ? 'bg-brand-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {trendsLoading ? (
              <p className="py-6 text-center text-sm text-slate-500">Chargement…</p>
            ) : (
              <div className="space-y-3">
                <TrendBarChart
                  title="Calories"
                  icon={UtensilsCrossed}
                  iconWrapClassName="bg-orange-500/15 text-orange-400"
                  barClassName="bg-orange-400"
                  unit="kcal"
                  data={calorieTrend}
                />
                <TrendBarChart
                  title="Sommeil"
                  icon={Moon}
                  iconWrapClassName="bg-indigo-500/15 text-indigo-400"
                  barClassName="bg-indigo-400"
                  unit="h"
                  decimals={1}
                  data={sleepTrend}
                />
                <TrendBarChart
                  title="Sport"
                  icon={Dumbbell}
                  iconWrapClassName="bg-brand-500/15 text-brand-400"
                  barClassName="bg-brand-400"
                  unit="min"
                  data={sportTrend}
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
