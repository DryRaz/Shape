import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ChevronDown, Database, Flame, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import RangeSwitcher from '@/components/RangeSwitcher'
import { displayDate, isoDate, rangeFor, todayInTimezone, type RangeKind } from '@/lib/date'
import type { Meal as MealType, MealItem, MealType as MealKind } from '@/types/database'

const MEAL_LABELS: Record<MealKind, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
}

export default function NutritionPage() {
  const { user, profile } = useAuth()
  const timezone = profile?.timezone ?? 'Africa/Nairobi'
  const [kind, setKind] = useState<RangeKind>('day')
  const [anchor, setAnchor] = useState(() => todayInTimezone(timezone))
  const [meals, setMeals] = useState<MealType[]>([])
  const [loading, setLoading] = useState(true)
  const [mealItems, setMealItems] = useState<Record<string, MealItem[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const range = useMemo(() => rangeFor(kind, anchor, timezone), [kind, anchor, timezone])
  const startIso = isoDate(range.start)
  const endIso = isoDate(range.end)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('meals')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startIso)
      .lte('date', endIso)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setMeals(data ?? [])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, startIso, endIso])

  useEffect(() => {
    if (meals.length === 0) {
      setMealItems({})
      return
    }
    let cancelled = false
    supabase
      .from('meal_items')
      .select('*')
      .in('meal_id', meals.map((m) => m.id))
      .then(({ data }) => {
        if (cancelled) return
        const grouped: Record<string, MealItem[]> = {}
        for (const item of data ?? []) {
          (grouped[item.meal_id] ??= []).push(item)
        }
        setMealItems(grouped)
      })
    return () => {
      cancelled = true
    }
  }, [meals])

  function toggleExpanded(mealId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(mealId)) next.delete(mealId)
      else next.add(mealId)
      return next
    })
  }

  const totalCalories = meals.reduce((s, m) => s + (m.estimated_calories ?? 0), 0)
  const totalProtein = meals.reduce((s, m) => s + (m.estimated_protein_g ?? 0), 0)
  const totalCarbs = meals.reduce((s, m) => s + (m.estimated_carbs_g ?? 0), 0)
  const totalFat = meals.reduce((s, m) => s + (m.estimated_fat_g ?? 0), 0)

  const grouped = meals.reduce<Record<string, MealType[]>>((acc, m) => {
    (acc[m.date] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Nutrition</h1>
          <p className="text-xs text-slate-400">Suivi des repas et calories</p>
        </div>
        <Link to="/nutrition/nouveau" className="btn-primary">
          <Camera size={16} />
          Repas
        </Link>
      </header>

      <RangeSwitcher kind={kind} anchorIso={anchor} onKindChange={setKind} onAnchorChange={setAnchor} />

      <div className="card flex items-center gap-3 border-orange-500/30 bg-orange-500/5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400">
          <Flame size={22} />
        </div>
        <div className="flex-1">
          <p className="text-lg font-semibold text-slate-50">{Math.round(totalCalories)} kcal</p>
          <p className="text-xs text-slate-400">
            P {Math.round(totalProtein)}g · G {Math.round(totalCarbs)}g · L {Math.round(totalFat)}g
          </p>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Aucun repas enregistré sur cette période.</p>
      ) : (
        Object.entries(grouped).map(([date, dayMeals]) => (
          <section key={date}>
            <h2 className="mb-2 text-sm font-medium text-slate-300">{displayDate(date)}</h2>
            <ul className="space-y-2">
              {dayMeals.map((meal) => {
                const items = mealItems[meal.id] ?? []
                const matchedCount = items.filter((i) => i.source === 'catalog').length
                const isExpanded = expanded.has(meal.id)
                return (
                  <li key={meal.id} className="card space-y-2 py-3">
                    <div className="flex items-center gap-3">
                      {meal.photo_url ? (
                        <img src={meal.photo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-800 text-slate-600">
                          <Camera size={18} />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm text-slate-200">{MEAL_LABELS[meal.meal_type]}</p>
                        <p className="text-xs text-slate-500">
                          P {Math.round(meal.estimated_protein_g ?? 0)}g · G {Math.round(meal.estimated_carbs_g ?? 0)}g · L{' '}
                          {Math.round(meal.estimated_fat_g ?? 0)}g
                        </p>
                      </div>
                      <p className="text-sm font-medium text-slate-100">{Math.round(meal.estimated_calories ?? 0)} kcal</p>
                      <button
                        onClick={() => toggleExpanded(meal.id)}
                        disabled={items.length === 0}
                        className="shrink-0 text-slate-500 disabled:opacity-30"
                      >
                        <ChevronDown size={16} className={isExpanded ? 'rotate-180' : ''} />
                      </button>
                    </div>
                    {isExpanded && items.length > 0 && (
                      <div className="space-y-1 border-t border-slate-800 pt-2">
                        <p className="text-xs text-slate-500">
                          {matchedCount}/{items.length} depuis la base de données
                        </p>
                        <ul className="space-y-1">
                          {items.map((item) => (
                            <li key={item.id} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-2 text-slate-400">
                                {item.source === 'catalog' ? (
                                  <Database size={12} className="shrink-0 text-brand-400" />
                                ) : (
                                  <Sparkles size={12} className="shrink-0 text-slate-500" />
                                )}
                                {item.name}
                                {item.portion_g ? ` · ${item.portion_g}g` : ''}
                              </span>
                              <span className="text-slate-400">
                                {item.kcal !== null ? `${Math.round(item.kcal)} kcal` : '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
