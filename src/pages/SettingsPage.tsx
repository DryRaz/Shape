import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, Download, LogOut, Scale, Share } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useInstallPrompt } from '@/lib/useInstallPrompt'
import { displayDate, todayInTimezone } from '@/lib/date'
import { ACTIVITY_LEVEL_KEYS } from '@/lib/nutritionGoals'
import i18n from '@/i18n'
import type { ActivityLevel, AppLanguage, GoalType, Sex, WeightLog } from '@/types/database'

const TIMEZONES = ['Africa/Nairobi', 'Europe/Paris', 'America/New_York', 'UTC']
const GOAL_KEYS: { value: GoalType; labelKey: string }[] = [
  { value: 'lose_weight', labelKey: 'settings.goal.loseWeight' },
  { value: 'maintain', labelKey: 'settings.goal.maintain' },
  { value: 'gain_muscle', labelKey: 'settings.goal.gainMuscle' },
  { value: 'improve_fitness', labelKey: 'settings.goal.improveFitness' },
  { value: 'wellbeing', labelKey: 'settings.goal.wellbeing' },
]
const LANGUAGE_OPTIONS: { value: AppLanguage; labelKey: string }[] = [
  { value: 'fr', labelKey: 'settings.languageFr' },
  { value: 'en', labelKey: 'settings.languageEn' },
]

export default function SettingsPage() {
  const { t } = useTranslation()
  const { user, profile, refreshProfile, signOut } = useAuth()
  const timezone = profile?.timezone ?? 'Africa/Nairobi'
  const today = useMemo(() => todayInTimezone(timezone), [timezone])
  const { installed, canPromptInstall, needsIosInstructions, promptInstall } = useInstallPrompt()

  const [heightCm, setHeightCm] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')
  const [goalType, setGoalType] = useState<GoalType | ''>('')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | ''>('')
  const [tz, setTz] = useState(timezone)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState(false)

  const [weightKg, setWeightKg] = useState('')
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [savingWeight, setSavingWeight] = useState(false)

  useEffect(() => {
    if (!profile) return
    setHeightCm(profile.height_cm?.toString() ?? '')
    setAge(profile.age?.toString() ?? '')
    setSex(profile.sex ?? '')
    setGoalType(profile.goal_type ?? '')
    setActivityLevel(profile.activity_level ?? '')
    setTz(profile.timezone)
  }, [profile])

  useEffect(() => {
    if (!user) return
    supabase
      .from('weight_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(20)
      .then(({ data }) => setWeightLogs(data ?? []))
  }, [user])

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSavingProfile(true)
    await supabase
      .from('users')
      .update({
        height_cm: heightCm ? Number(heightCm) : null,
        age: age ? Number(age) : null,
        sex: sex || null,
        goal_type: goalType || null,
        activity_level: activityLevel || null,
        timezone: tz,
      })
      .eq('id', user.id)
    await refreshProfile()
    setSavingProfile(false)
  }

  async function handleWeightSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || !weightKg) return
    setSavingWeight(true)
    const { data } = await supabase
      .from('weight_logs')
      .upsert({ user_id: user.id, date: today, weight_kg: Number(weightKg) }, { onConflict: 'user_id,date' })
      .select('*')
      .single()
    if (data) setWeightLogs((prev) => [data, ...prev.filter((w) => w.date !== today)])
    setWeightKg('')
    setSavingWeight(false)
  }

  async function handleLanguageChange(language: AppLanguage) {
    if (!user || language === profile?.language) return
    setSavingLanguage(true)
    i18n.changeLanguage(language)
    await supabase.from('users').update({ language }).eq('id', user.id)
    await refreshProfile()
    setSavingLanguage(false)
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{t('settings.title')}</h1>
          <p className="text-xs text-slate-400">{user?.email}</p>
        </div>
        <button onClick={signOut} className="btn-ghost">
          <LogOut size={16} />
        </button>
      </header>

      <div className="card space-y-2">
        <p className="text-sm font-medium text-slate-200">{t('settings.languageLabel')}</p>
        <div className="flex rounded-xl bg-slate-900 p-1">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleLanguageChange(opt.value)}
              disabled={savingLanguage}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                (profile?.language ?? 'fr') === opt.value
                  ? 'bg-brand-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <Link to="/rappels" className="card flex items-center gap-3">
        <BellRing size={20} className="text-brand-400" />
        <span className="flex-1 text-sm text-slate-200">{t('settings.manageReminders')}</span>
      </Link>

      {canPromptInstall && (
        <button onClick={promptInstall} className="card flex w-full items-center gap-3 text-left">
          <Download size={20} className="text-brand-400" />
          <span className="flex-1 text-sm text-slate-200">{t('settings.installApp')}</span>
        </button>
      )}

      {needsIosInstructions && (
        <div className="card flex items-center gap-3">
          <Share size={20} className="shrink-0 text-brand-400" />
          <span className="flex-1 text-sm text-slate-300">
            {t('settings.installInstructionsBefore')} <span className="font-medium text-slate-100">{t('settings.share')}</span>{' '}
            {t('settings.installInstructionsMiddle')} <span className="font-medium text-slate-100">{t('settings.addToHomeScreen')}</span>.
          </span>
        </div>
      )}

      {installed && (
        <div className="card flex items-center gap-3 text-sm text-slate-400">
          <Check size={18} className="shrink-0 text-brand-400" />
          {t('settings.appInstalled')}
        </div>
      )}

      <form onSubmit={handleProfileSubmit} className="card space-y-4">
        <p className="text-sm font-medium text-slate-200">{t('settings.personalInfo')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('settings.heightLabel')}</label>
            <input type="number" className="input" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </div>
          <div>
            <label className="label">{t('settings.ageLabel')}</label>
            <input type="number" className="input" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('settings.sexLabel')}</label>
            <select className="input" value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="">—</option>
              <option value="female">{t('settings.sexFemale')}</option>
              <option value="male">{t('settings.sexMale')}</option>
              <option value="other">{t('settings.sexOther')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('settings.timezoneLabel')}</label>
            <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
              {TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t('settings.goalLabel')}</label>
          <select className="input" value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)}>
            <option value="">—</option>
            {GOAL_KEYS.map((g) => (
              <option key={g.value} value={g.value}>
                {t(g.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('settings.activityLevelLabel')}</label>
          <select
            className="input"
            value={activityLevel}
            onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
          >
            <option value="">—</option>
            {ACTIVITY_LEVEL_KEYS.map((a) => (
              <option key={a.value} value={a.value}>
                {t(a.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={savingProfile}>
          {savingProfile ? t('settings.saving') : t('settings.saveProfile')}
        </button>
      </form>

      <div className="card space-y-4">
        <p className="text-sm font-medium text-slate-200">{t('settings.weight')}</p>
        <form onSubmit={handleWeightSubmit} className="flex gap-2">
          <input
            type="number"
            step="0.1"
            className="input"
            placeholder={t('settings.weightPlaceholder')}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
          <button type="submit" className="btn-secondary shrink-0" disabled={savingWeight}>
            <Scale size={16} />
          </button>
        </form>
        {weightLogs.length > 0 && (
          <ul className="space-y-1.5">
            {weightLogs.map((w) => (
              <li key={w.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{displayDate(w.date)}</span>
                <span className="text-slate-200">{w.weight_kg} kg</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
