import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { todayInTimezone } from '@/lib/date'
import { paceSecPerKm } from '@/lib/running/geo'
import { saveManualRun } from '@/lib/running/runs'

export default function RunManualPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [date, setDate] = useState(() => todayInTimezone(profile?.timezone))
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [distance, setDistance] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const durationS = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0)
    const distanceKm = Number(distance.replace(',', '.'))
    if (!(durationS > 0) || !(distanceKm > 0)) {
      setError(t('run.manual.invalid'))
      return
    }
    const pace = paceSecPerKm(distanceKm * 1000, durationS)
    if (pace === null || pace < 120 || pace > 1200) {
      setError(t('run.manual.implausible'))
      return
    }
    setError('')
    setSaving(true)
    const { id } = await saveManualRun(user.id, { dateIso: date, durationS, distanceKm })
    navigate(`/sport/course/${id}`, { replace: true })
  }

  const timeInput = (value: string, set: (v: string) => void, unit: string, label: string) => (
    <label className="flex flex-1 items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        className="input text-center"
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-label={label}
        placeholder="0"
      />
      <span className="text-xs text-slate-400">{unit}</span>
    </label>
  )

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/sport" className="btn-ghost p-2" aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{t('run.manual.title')}</h1>
          <p className="text-xs text-slate-400">{t('run.manual.subtitle')}</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="run-date" className="label">
            {t('run.manual.date')}
          </label>
          <input
            id="run-date"
            type="date"
            required
            max={todayInTimezone(profile?.timezone)}
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <span className="label">{t('run.manual.duration')}</span>
          <div className="flex gap-2">
            {timeInput(hours, setHours, t('run.manual.hours'), t('run.manual.hours'))}
            {timeInput(minutes, setMinutes, t('run.manual.minutes'), t('run.manual.minutes'))}
            {timeInput(seconds, setSeconds, t('run.manual.seconds'), t('run.manual.seconds'))}
          </div>
        </div>

        <div>
          <label htmlFor="run-distance" className="label">
            {t('run.manual.distance')}
          </label>
          <input
            id="run-distance"
            type="text"
            inputMode="decimal"
            required
            className="input"
            placeholder="5.00"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? t('run.saving') : t('run.manual.save')}
        </button>
      </form>
    </div>
  )
}
