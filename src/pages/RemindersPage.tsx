import { useEffect, useState, type FormEvent } from 'react'
import { Bell, BellOff, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getPushPermissionState, isPushSupported, subscribeToPush } from '@/lib/push'
import type { HabitType, Reminder } from '@/types/database'

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

export default function RemindersPage() {
  const { user } = useAuth()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [habitTypes, setHabitTypes] = useState<HabitType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushState, setPushState] = useState<NotificationPermission | 'unsupported'>('default')
  const [pushError, setPushError] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [time, setTime] = useState('08:00')
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [linkedHabit, setLinkedHabit] = useState('')

  async function load() {
    if (!user) return
    setLoading(true)
    const [{ data: rem }, { data: types }] = await Promise.all([
      supabase.from('reminders').select('*').eq('user_id', user.id).order('time'),
      supabase.from('habit_types').select('*').eq('user_id', user.id).eq('active', true),
    ])
    setReminders(rem ?? [])
    setHabitTypes(types ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    getPushPermissionState().then(setPushState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function handleEnablePush() {
    if (!user) return
    setPushError(null)
    const { error } = await subscribeToPush(user.id)
    if (error) setPushError(error)
    setPushState(await getPushPermissionState())
  }

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!user || !label.trim()) return
    setSaving(true)
    await supabase.from('reminders').insert({
      user_id: user.id,
      label: label.trim(),
      time,
      days_of_week: days,
      linked_habit_type_id: linkedHabit || null,
      channel: 'push',
    })
    setSaving(false)
    setShowForm(false)
    setLabel('')
    setTime('08:00')
    setDays([0, 1, 2, 3, 4, 5, 6])
    setLinkedHabit('')
    load()
  }

  async function toggleActive(reminder: Reminder) {
    await supabase.from('reminders').update({ active: !reminder.active }).eq('id', reminder.id)
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, active: !r.active } : r)))
  }

  async function removeReminder(id: string) {
    await supabase.from('reminders').delete().eq('id', id)
    setReminders((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Rappels</h1>
          <p className="text-xs text-slate-400">Notifications pour vos repas et habitudes</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary">
          {showForm ? <X size={16} /> : <Plus size={16} />}
        </button>
      </header>

      {isPushSupported() && pushState !== 'granted' && (
        <div className="card flex items-center gap-3">
          <Bell size={20} className="text-brand-400" />
          <div className="flex-1">
            <p className="text-sm text-slate-200">Activer les notifications push</p>
            <p className="text-xs text-slate-500">Recevez vos rappels même app fermée.</p>
          </div>
          <button onClick={handleEnablePush} className="btn-secondary">
            Activer
          </button>
        </div>
      )}
      {pushError && <p className="text-xs text-red-400">{pushError}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-4">
          <div>
            <label className="label">Libellé</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Sport du soir" required />
          </div>
          <div>
            <label className="label">Heure</label>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div>
            <label className="label">Jours</label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((d, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`h-9 w-9 rounded-full text-xs font-medium ${
                    days.includes(i) ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          {habitTypes.length > 0 && (
            <div>
              <label className="label">Habitude liée (optionnel)</label>
              <select className="input" value={linkedHabit} onChange={(e) => setLinkedHabit(e.target.value)}>
                <option value="">Aucune</option>
                {habitTypes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Création…' : 'Créer le rappel'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Chargement…</p>
      ) : reminders.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Aucun rappel configuré.</p>
      ) : (
        <ul className="space-y-2">
          {reminders.map((r) => (
            <li key={r.id} className="card flex items-center gap-3 py-3">
              <button onClick={() => toggleActive(r)} className={r.active ? 'text-brand-400' : 'text-slate-600'}>
                {r.active ? <Bell size={18} /> : <BellOff size={18} />}
              </button>
              <div className="flex-1">
                <p className="text-sm text-slate-200">{r.label}</p>
                <p className="text-xs text-slate-500">
                  {r.time.slice(0, 5)} · {r.days_of_week.map((d) => DAY_LABELS[d]).join(' ')}
                </p>
              </div>
              <button onClick={() => removeReminder(r.id)} className="text-red-400">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
