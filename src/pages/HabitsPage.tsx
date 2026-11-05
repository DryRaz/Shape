import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpenText, Check, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { todayInTimezone } from '@/lib/date'
import type { HabitCategory, HabitLog, HabitType, TrackingType } from '@/types/database'

const CATEGORY_KEYS: { value: HabitCategory; labelKey: string }[] = [
  { value: 'reading', labelKey: 'habits.category.reading' },
  { value: 'spiritual', labelKey: 'habits.category.spiritual' },
  { value: 'other', labelKey: 'habits.category.other' },
]

export default function HabitsPage() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const timezone = profile?.timezone ?? 'Africa/Nairobi'
  const today = useMemo(() => todayInTimezone(timezone), [timezone])

  const [habitTypes, setHabitTypes] = useState<HabitType[]>([])
  const [todayLogs, setTodayLogs] = useState<Record<string, HabitLog>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<HabitCategory>('reading')
  const [trackingType, setTrackingType] = useState<TrackingType>('boolean')
  const [targetValue, setTargetValue] = useState('')
  const [targetUnit, setTargetUnit] = useState('')
  const [reminderTime, setReminderTime] = useState('')

  async function load() {
    if (!user) return
    setLoading(true)
    const [{ data: types }, { data: logs }] = await Promise.all([
      supabase.from('habit_types').select('*').eq('user_id', user.id).eq('active', true).order('created_at'),
      supabase.from('habit_logs').select('*').eq('user_id', user.id).eq('date', today),
    ])
    setHabitTypes(types ?? [])
    const map: Record<string, HabitLog> = {}
    for (const log of logs ?? []) map[log.habit_type_id] = log
    setTodayLogs(map)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, today])

  async function toggleBoolean(habit: HabitType) {
    if (!user) return
    const existing = todayLogs[habit.id]
    if (existing) {
      await supabase.from('habit_logs').delete().eq('id', existing.id)
      setTodayLogs((prev) => {
        const next = { ...prev }
        delete next[habit.id]
        return next
      })
    } else {
      const { data } = await supabase
        .from('habit_logs')
        .insert({ habit_type_id: habit.id, user_id: user.id, date: today, value: 1 })
        .select('*')
        .single()
      if (data) setTodayLogs((prev) => ({ ...prev, [habit.id]: data }))
    }
  }

  async function logQuantity(habit: HabitType, value: number) {
    if (!user) return
    const { data } = await supabase
      .from('habit_logs')
      .upsert(
        { habit_type_id: habit.id, user_id: user.id, date: today, value },
        { onConflict: 'habit_type_id,date' }
      )
      .select('*')
      .single()
    if (data) setTodayLogs((prev) => ({ ...prev, [habit.id]: data }))
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !name.trim()) return
    setSaving(true)
    await supabase.from('habit_types').insert({
      user_id: user.id,
      name: name.trim(),
      category,
      tracking_type: trackingType,
      target_value: targetValue ? Number(targetValue) : null,
      target_unit: targetUnit || null,
      reminder_time: reminderTime || null,
    })
    setSaving(false)
    setShowForm(false)
    setName('')
    setTargetValue('')
    setTargetUnit('')
    setReminderTime('')
    load()
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{t('habits.title')}</h1>
          <p className="text-xs text-slate-400">{t('habits.subtitle')}</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? t('common.close') : t('habits.habitButton')}
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4">
          <div>
            <label className="label">{t('habits.nameLabel')}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('habits.namePlaceholder')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('habits.categoryLabel')}</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as HabitCategory)}>
                {CATEGORY_KEYS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('habits.trackingTypeLabel')}</label>
              <select className="input" value={trackingType} onChange={(e) => setTrackingType(e.target.value as TrackingType)}>
                <option value="boolean">{t('habits.trackingBoolean')}</option>
                <option value="quantity">{t('habits.trackingQuantity')}</option>
              </select>
            </div>
          </div>
          {trackingType === 'quantity' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('habits.targetLabel')}</label>
                <input type="number" className="input" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="30" />
              </div>
              <div>
                <label className="label">{t('habits.unitLabel')}</label>
                <input className="input" value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder={t('habits.unitPlaceholder')} />
              </div>
            </div>
          )}
          <div>
            <label className="label">{t('habits.reminderLabel')}</label>
            <input type="time" className="input" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? t('habits.creating') : t('habits.create')}
          </button>
        </form>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : habitTypes.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
          <BookOpenText size={28} />
          {t('habits.noneYet')}
        </div>
      ) : (
        <ul className="space-y-2">
          {habitTypes.map((habit) => {
            const log = todayLogs[habit.id]
            return (
              <li key={habit.id} className="card flex items-center gap-3 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-100">{habit.name}</p>
                  <p className="text-xs text-slate-500">
                    {t(CATEGORY_KEYS.find((c) => c.value === habit.category)?.labelKey ?? 'habits.category.other')}
                    {habit.target_value
                      ? ` · ${t('habits.targetSummary', { value: habit.target_value, unit: habit.target_unit ?? '' })}`
                      : ''}
                  </p>
                </div>
                {habit.tracking_type === 'boolean' ? (
                  <button
                    onClick={() => toggleBoolean(habit)}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      log ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-600'
                    }`}
                  >
                    <Check size={18} />
                  </button>
                ) : (
                  <input
                    type="number"
                    className="input w-24 py-1.5 text-center"
                    defaultValue={log?.value ?? ''}
                    placeholder={habit.target_unit ?? ''}
                    onBlur={(e) => {
                      const v = Number(e.target.value)
                      if (!Number.isNaN(v) && e.target.value !== '') logQuantity(habit, v)
                    }}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
