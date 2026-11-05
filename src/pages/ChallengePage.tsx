import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Calculator, CheckCircle2, Flame, Lightbulb, Pencil, Trophy, X, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { displayDate, todayInTimezone, weekEndIso, weekStartIso } from '@/lib/date'
import { computeNutritionGoal, missingFieldsFor, MISSING_FIELD_KEYS } from '@/lib/nutritionGoals'
import type { WeeklyChallenge } from '@/types/database'

interface WeekActuals {
  sessions: number
  calories: number
  protein: number
}

const EMPTY_ACTUALS: WeekActuals = { sessions: 0, calories: 0, protein: 0 }
const TOLERANCE = 0.1

function isHit(target: number, actual: number): boolean {
  if (target === 0) return actual === 0
  return Math.abs(actual - target) / target <= TOLERANCE
}

interface MetricResult {
  key: 'sessions' | 'calories' | 'protein'
  label: string
  unit: string
  target: number
  actual: number
  hit: boolean
}

function computeMetrics(challenge: WeeklyChallenge, actuals: WeekActuals, t: TFunction): MetricResult[] {
  return [
    {
      key: 'sessions',
      label: t('challenge.metric.sessions'),
      unit: '',
      target: challenge.target_sessions,
      actual: actuals.sessions,
      hit: isHit(challenge.target_sessions, actuals.sessions),
    },
    {
      key: 'calories',
      label: t('challenge.metric.calories'),
      unit: 'kcal',
      target: challenge.target_calories,
      actual: Math.round(actuals.calories),
      hit: isHit(challenge.target_calories, actuals.calories),
    },
    {
      key: 'protein',
      label: t('challenge.metric.protein'),
      unit: 'g',
      target: challenge.target_protein_g,
      actual: Math.round(actuals.protein),
      hit: isHit(challenge.target_protein_g, actuals.protein),
    },
  ]
}

function suggestionFor(metric: MetricResult, t: TFunction): string | null {
  if (metric.hit) return null
  const under = metric.actual < metric.target
  switch (metric.key) {
    case 'sessions':
      return t(under ? 'challenge.suggestion.sessionsUnder' : 'challenge.suggestion.sessionsOver')
    case 'calories':
      return t(under ? 'challenge.suggestion.caloriesUnder' : 'challenge.suggestion.caloriesOver')
    case 'protein':
      return t(under ? 'challenge.suggestion.proteinUnder' : 'challenge.suggestion.proteinOver')
    default:
      return null
  }
}

function MetricRow({ metric }: { metric: MetricResult }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-slate-300">
        {metric.hit ? (
          <CheckCircle2 size={16} className="text-brand-400" />
        ) : (
          <XCircle size={16} className="text-amber-400" />
        )}
        {metric.label}
      </span>
      <span className="text-xs text-slate-400">
        {metric.actual}
        {metric.unit}{' '}
        <span className="text-slate-600">{t('challenge.ofTarget', { target: metric.target, unit: metric.unit })}</span>
      </span>
    </div>
  )
}

export default function ChallengePage() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const timezone = profile?.timezone ?? 'Africa/Nairobi'
  const today = useMemo(() => todayInTimezone(timezone), [timezone])
  const currentWeekStart = useMemo(() => weekStartIso(today), [today])

  const [challenges, setChallenges] = useState<WeeklyChallenge[]>([])
  const [actualsByWeek, setActualsByWeek] = useState<Record<string, WeekActuals>>({})
  const [latestWeightKg, setLatestWeightKg] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [popupChallenge, setPopupChallenge] = useState<WeeklyChallenge | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)
  const [sessionsInput, setSessionsInput] = useState('')
  const [caloriesInput, setCaloriesInput] = useState('')
  const [proteinInput, setProteinInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!user) return
    setLoading(true)

    const { data: rows } = await supabase
      .from('weekly_challenges')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
    const list = rows ?? []

    const earliestStart = list.length > 0 ? list[list.length - 1].week_start : currentWeekStart

    const [{ data: mealRows }, { data: sessionRows }, { data: weightRows }] = await Promise.all([
      supabase
        .from('meals')
        .select('date, estimated_calories, estimated_protein_g')
        .eq('user_id', user.id)
        .gte('date', earliestStart)
        .lte('date', today),
      supabase
        .from('workout_sessions')
        .select('date')
        .eq('user_id', user.id)
        .not('completed_at', 'is', null)
        .gte('date', earliestStart)
        .lte('date', today),
      supabase
        .from('weight_logs')
        .select('weight_kg')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1),
    ])
    setLatestWeightKg(weightRows?.[0]?.weight_kg ?? null)

    const byWeek: Record<string, WeekActuals> = {}
    function bucket(dateIso: string): WeekActuals {
      const ws = weekStartIso(dateIso)
      if (!byWeek[ws]) byWeek[ws] = { sessions: 0, calories: 0, protein: 0 }
      return byWeek[ws]
    }
    for (const m of mealRows ?? []) {
      const b = bucket(m.date)
      b.calories += m.estimated_calories ?? 0
      b.protein += m.estimated_protein_g ?? 0
    }
    for (const s of sessionRows ?? []) {
      bucket(s.date).sessions += 1
    }

    setChallenges(list)
    setActualsByWeek(byWeek)
    setPopupChallenge(list.find((c) => c.week_start !== currentWeekStart && !c.result_seen) ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, today])

  const currentChallenge = challenges.find((c) => c.week_start === currentWeekStart) ?? null
  const pastChallenges = challenges.filter((c) => c.week_start !== currentWeekStart)
  const currentActuals = actualsByWeek[currentWeekStart] ?? EMPTY_ACTUALS
  const currentWeekEnd = weekEndIso(currentWeekStart)
  const daysRemaining = Math.max(
    0,
    Math.round((new Date(`${currentWeekEnd}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000)
  )

  function openForm(existing: WeeklyChallenge | null) {
    setSessionsInput(existing ? String(existing.target_sessions) : '')
    setCaloriesInput(existing ? String(existing.target_calories) : '')
    setProteinInput(existing ? String(existing.target_protein_g) : '')
    setShowCalculator(false)
    setShowForm(true)
  }

  const goalInput = {
    sex: profile?.sex ?? null,
    heightCm: profile?.height_cm ?? null,
    age: profile?.age ?? null,
    goalType: profile?.goal_type ?? null,
    activityLevel: profile?.activity_level ?? null,
    weightKg: latestWeightKg,
  }
  const missingFields = missingFieldsFor(goalInput)
  const suggestedGoal = computeNutritionGoal(goalInput)

  function useSuggestedGoal() {
    if (!suggestedGoal) return
    setSessionsInput(String(suggestedGoal.weeklySessions))
    setCaloriesInput(String(suggestedGoal.weeklyCalories))
    setProteinInput(String(suggestedGoal.weeklyProteinG))
    setShowCalculator(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const sessions = Number(sessionsInput)
    const calories = Number(caloriesInput)
    const protein = Number(proteinInput)
    if (![sessions, calories, protein].every(Number.isFinite)) return

    setSaving(true)
    await supabase
      .from('weekly_challenges')
      .upsert(
        {
          user_id: user.id,
          week_start: currentWeekStart,
          target_sessions: sessions,
          target_calories: calories,
          target_protein_g: protein,
        },
        { onConflict: 'user_id,week_start' }
      )
    setSaving(false)
    setShowForm(false)
    load()
  }

  async function dismissPopup() {
    if (!popupChallenge) return
    await supabase.from('weekly_challenges').update({ result_seen: true }).eq('id', popupChallenge.id)
    setPopupChallenge(null)
  }

  const popupMetrics = popupChallenge
    ? computeMetrics(popupChallenge, actualsByWeek[popupChallenge.week_start] ?? EMPTY_ACTUALS, t)
    : null
  const popupSuccess = popupMetrics ? popupMetrics.every((m) => m.hit) : false

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-50">{t('challenge.title')}</h1>
        <p className="text-xs text-slate-400">{t('challenge.subtitle')}</p>
      </header>

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : (
        <>
          {showForm ? (
            <form onSubmit={handleSubmit} className="card space-y-4">
              <p className="text-sm font-medium text-slate-100">
                {t('challenge.betForWeek', { start: displayDate(currentWeekStart), end: displayDate(currentWeekEnd) })}
              </p>

              {showCalculator ? (
                <div className="space-y-3 rounded-xl bg-slate-800/60 p-3">
                  {suggestedGoal ? (
                    <>
                      <p className="text-xs text-slate-400">{t('challenge.basedOnProfile')}</p>
                      <ul className="space-y-1 text-sm text-slate-200">
                        <li>{t('challenge.suggestedSessions', { count: suggestedGoal.weeklySessions })}</li>
                        <li>
                          {t('challenge.suggestedCalories', {
                            weekly: suggestedGoal.weeklyCalories,
                            daily: suggestedGoal.dailyCalories,
                          })}
                        </li>
                        <li>
                          {t('challenge.suggestedProtein', {
                            weekly: suggestedGoal.weeklyProteinG,
                            daily: suggestedGoal.dailyProteinG,
                          })}
                        </li>
                      </ul>
                      <button type="button" onClick={useSuggestedGoal} className="btn-secondary w-full">
                        {t('challenge.useTheseValues')}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">
                      {t('challenge.missingFieldsBefore', {
                        fields: missingFields.map((f) => t(MISSING_FIELD_KEYS[f])).join(', '),
                      })}{' '}
                      <Link to="/profil" className="text-brand-400 underline">
                        {t('challenge.yourProfile')}
                      </Link>
                      .
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCalculator(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-400"
                >
                  <Calculator size={14} />
                  {t('challenge.calculateSuggested')}
                </button>
              )}

              <div>
                <label className="label">{t('challenge.metric.sessions')}</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={sessionsInput}
                  onChange={(e) => setSessionsInput(e.target.value)}
                  placeholder="4"
                  required
                />
              </div>
              <div>
                <label className="label">{t('challenge.caloriesWeeklyLabel')}</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={caloriesInput}
                  onChange={(e) => setCaloriesInput(e.target.value)}
                  placeholder="15000"
                  required
                />
              </div>
              <div>
                <label className="label">{t('challenge.proteinWeeklyLabel')}</label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={proteinInput}
                  onChange={(e) => setProteinInput(e.target.value)}
                  placeholder="700"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? t('challenge.saving') : t('challenge.submitBet')}
                </button>
              </div>
            </form>
          ) : currentChallenge ? (
            <section className="card space-y-3 border-brand-500/30 bg-brand-500/5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-100">
                  {t('challenge.weekOf', { start: displayDate(currentWeekStart), end: displayDate(currentWeekEnd) })}
                </p>
                <button onClick={() => openForm(currentChallenge)} className="btn-ghost p-1.5">
                  <Pencil size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-400">
                {daysRemaining === 0 ? t('challenge.lastDay') : t('challenge.daysRemaining', { count: daysRemaining })}
              </p>
              <div className="space-y-2.5">
                {computeMetrics(currentChallenge, currentActuals, t).map((m) => (
                  <div key={m.key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{m.label}</span>
                      <span>
                        {m.actual}{m.unit} / {m.target}{m.unit}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${Math.min(100, m.target > 0 ? (m.actual / m.target) * 100 : 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="card flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
                <Trophy size={22} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-100">{t('challenge.placeBetTitle')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('challenge.placeBetSubtitle')}</p>
              </div>
              <button onClick={() => openForm(null)} className="btn-primary">
                {t('challenge.placeBetButton')}
              </button>
            </section>
          )}

          {pastChallenges.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-slate-300">{t('challenge.history')}</h2>
              <ul className="space-y-2">
                {pastChallenges.map((c) => {
                  const metrics = computeMetrics(c, actualsByWeek[c.week_start] ?? EMPTY_ACTUALS, t)
                  const success = metrics.every((m) => m.hit)
                  return (
                    <li key={c.id} className="card space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                          {displayDate(c.week_start)} – {displayDate(weekEndIso(c.week_start))}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            success ? 'bg-brand-500/15 text-brand-400' : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {success ? t('challenge.success') : t('challenge.adjust')}
                        </span>
                      </div>
                      {metrics.map((m) => (
                        <MetricRow key={m.key} metric={m} />
                      ))}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {popupChallenge && popupMetrics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card relative w-full max-w-sm space-y-4">
            <button onClick={dismissPopup} className="absolute right-3 top-3 text-slate-500 hover:text-slate-300">
              <X size={18} />
            </button>
            <div className="flex flex-col items-center gap-2 text-center">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  popupSuccess ? 'bg-brand-500/15 text-brand-400' : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                {popupSuccess ? <Trophy size={24} /> : <Flame size={24} />}
              </div>
              <p className="text-base font-semibold text-slate-50">
                {popupSuccess ? t('challenge.popupSuccessTitle') : t('challenge.popupEncourageTitle')}
              </p>
              <p className="text-xs text-slate-400">
                {t('challenge.weekOf', {
                  start: displayDate(popupChallenge.week_start),
                  end: displayDate(weekEndIso(popupChallenge.week_start)),
                })}
              </p>
            </div>

            <div className="space-y-2.5">
              {popupMetrics.map((m) => (
                <MetricRow key={m.key} metric={m} />
              ))}
            </div>

            {!popupSuccess && (
              <div className="space-y-2 rounded-xl bg-slate-800/60 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Lightbulb size={14} className="text-amber-400" />
                  {t('challenge.forNextWeek')}
                </p>
                <ul className="space-y-1.5 text-xs text-slate-400">
                  {popupMetrics.map((m) => {
                    const suggestion = suggestionFor(m, t)
                    return suggestion ? <li key={m.key}>• {suggestion}</li> : null
                  })}
                </ul>
              </div>
            )}

            <button onClick={dismissPopup} className="btn-primary w-full">
              {t('common.continue')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
