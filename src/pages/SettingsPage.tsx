import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, LogOut, Scale } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { displayDate, todayInTimezone } from '@/lib/date'
import type { GoalType, Sex, WeightLog } from '@/types/database'

const TIMEZONES = ['Africa/Nairobi', 'Europe/Paris', 'America/New_York', 'UTC']
const GOAL_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'lose_weight', label: 'Perdre du poids' },
  { value: 'maintain', label: 'Maintenir' },
  { value: 'gain_muscle', label: 'Prendre du muscle' },
  { value: 'improve_fitness', label: 'Améliorer ma forme' },
  { value: 'wellbeing', label: 'Bien-être général' },
]

export default function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const timezone = profile?.timezone ?? 'Africa/Nairobi'
  const today = useMemo(() => todayInTimezone(timezone), [timezone])

  const [heightCm, setHeightCm] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')
  const [goalType, setGoalType] = useState<GoalType | ''>('')
  const [tz, setTz] = useState(timezone)
  const [savingProfile, setSavingProfile] = useState(false)

  const [weightKg, setWeightKg] = useState('')
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])
  const [savingWeight, setSavingWeight] = useState(false)

  useEffect(() => {
    if (!profile) return
    setHeightCm(profile.height_cm?.toString() ?? '')
    setAge(profile.age?.toString() ?? '')
    setSex(profile.sex ?? '')
    setGoalType(profile.goal_type ?? '')
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

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Profil</h1>
          <p className="text-xs text-slate-400">{user?.email}</p>
        </div>
        <button onClick={signOut} className="btn-ghost">
          <LogOut size={16} />
        </button>
      </header>

      <Link to="/rappels" className="card flex items-center gap-3">
        <BellRing size={20} className="text-brand-400" />
        <span className="flex-1 text-sm text-slate-200">Gérer les rappels</span>
      </Link>

      <form onSubmit={handleProfileSubmit} className="card space-y-4">
        <p className="text-sm font-medium text-slate-200">Informations personnelles</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Taille (cm)</label>
            <input type="number" className="input" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </div>
          <div>
            <label className="label">Âge</label>
            <input type="number" className="input" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sexe</label>
            <select className="input" value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="">—</option>
              <option value="female">Femme</option>
              <option value="male">Homme</option>
              <option value="other">Autre</option>
            </select>
          </div>
          <div>
            <label className="label">Fuseau horaire</label>
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
          <label className="label">Objectif</label>
          <select className="input" value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)}>
            <option value="">—</option>
            {GOAL_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={savingProfile}>
          {savingProfile ? 'Enregistrement…' : 'Enregistrer le profil'}
        </button>
      </form>

      <div className="card space-y-4">
        <p className="text-sm font-medium text-slate-200">Poids</p>
        <form onSubmit={handleWeightSubmit} className="flex gap-2">
          <input
            type="number"
            step="0.1"
            className="input"
            placeholder="Poids du jour (kg)"
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
