import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Moon, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { displayDate, todayInTimezone } from '@/lib/date'
import type { SleepLog } from '@/types/database'

function computeDuration(bedtime: string, wakeTime: string): number | null {
  if (!bedtime || !wakeTime) return null
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let minutes = wh * 60 + wm - (bh * 60 + bm)
  if (minutes <= 0) minutes += 24 * 60 // wrapped past midnight
  return Math.round((minutes / 60) * 100) / 100
}

export default function SleepPage() {
  const { user, profile } = useAuth()
  const timezone = profile?.timezone ?? 'Africa/Nairobi'
  const today = useMemo(() => todayInTimezone(timezone), [timezone])

  const [logs, setLogs] = useState<SleepLog[]>([])
  const [loading, setLoading] = useState(true)
  const [bedtime, setBedtime] = useState('22:30')
  const [wakeTime, setWakeTime] = useState('06:30')
  const [quality, setQuality] = useState(3)
  const [saving, setSaving] = useState(false)

  async function loadLogs() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('sleep_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(30)
    setLogs(data ?? [])
    const todayLog = data?.find((l) => l.date === today)
    if (todayLog) {
      if (todayLog.bedtime) setBedtime(todayLog.bedtime.slice(0, 5))
      if (todayLog.wake_time) setWakeTime(todayLog.wake_time.slice(0, 5))
      if (todayLog.quality_rating) setQuality(todayLog.quality_rating)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, today])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const duration_hours = computeDuration(bedtime, wakeTime)
    await supabase.from('sleep_logs').upsert(
      {
        user_id: user.id,
        date: today,
        bedtime,
        wake_time: wakeTime,
        duration_hours,
        quality_rating: quality,
      },
      { onConflict: 'user_id,date' }
    )
    setSaving(false)
    loadLogs()
  }

  const avg7 =
    logs.slice(0, 7).length > 0
      ? logs.slice(0, 7).reduce((s, l) => s + (l.duration_hours ?? 0), 0) / logs.slice(0, 7).length
      : null

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
          <Moon size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-50">Sommeil</h1>
          <p className="text-xs text-slate-400">{avg7 !== null ? `Moyenne 7 jours : ${avg7.toFixed(1)} h` : 'Aucune donnée'}</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <p className="text-sm font-medium text-slate-200">Nuit du {displayDate(today, 'd MMMM')}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Coucher</label>
            <input type="time" className="input" value={bedtime} onChange={(e) => setBedtime(e.target.value)} required />
          </div>
          <div>
            <label className="label">Réveil</label>
            <input type="time" className="input" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} required />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Durée estimée : {computeDuration(bedtime, wakeTime)?.toFixed(1) ?? '—'} h
        </p>
        <div>
          <label className="label">Qualité du sommeil</label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setQuality(n)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  n <= quality ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-600'
                }`}
              >
                <Star size={18} fill={n <= quality ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Enregistrement…' : "Enregistrer la nuit"}
        </button>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Historique récent</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li key={log.id} className="card flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-slate-200">{displayDate(log.date)}</p>
                  <p className="text-xs text-slate-500">
                    {log.bedtime?.slice(0, 5)} → {log.wake_time?.slice(0, 5)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-100">{log.duration_hours?.toFixed(1)} h</p>
                  <p className="text-xs text-amber-400">{'★'.repeat(log.quality_rating ?? 0)}</p>
                </div>
              </li>
            ))}
            {logs.length === 0 && <p className="text-sm text-slate-500">Aucune nuit enregistrée pour le moment.</p>}
          </ul>
        )}
      </section>
    </div>
  )
}
