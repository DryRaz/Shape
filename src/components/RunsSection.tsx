import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { startOfWeek } from 'date-fns'
import { Footprints, Play } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { displayDate } from '@/lib/date'
import { formatDistanceKm, formatDuration, formatPace, paceSecPerKm } from '@/lib/running/geo'
import { useRunTracker } from '@/lib/running/hooks'
import { isPending, listRuns } from '@/lib/running/runs'
import type { Run } from '@/types/database'

/** The running card on the Sport tab: start a run, this week's distance, recent runs. */
export default function RunsSection() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { snap } = useRunTracker()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    listRuns(user.id, 30).then((r) => {
      setRuns(r)
      setLoading(false)
    })
  }, [user])

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).getTime()
  const weekDistanceM = runs
    .filter((r) => new Date(r.started_at).getTime() >= weekStart)
    .reduce((sum, r) => sum + r.distance_m, 0)
  const inProgress = snap.phase !== 'idle'

  return (
    <section className="space-y-3">
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
            <Footprints size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-100">{t('run.title')}</p>
            <p className="text-xs text-slate-500">{t('run.sectionSubtitle')}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-slate-50">{formatDistanceKm(weekDistanceM)} km</p>
            <p className="text-[11px] text-slate-500">{t('run.thisWeek')}</p>
          </div>
        </div>
        <Link to="/sport/course" className="btn-primary w-full">
          <Play size={16} />
          {inProgress ? t('run.resumeInProgress') : t('run.start')}
        </Link>
        <Link to="/sport/course/manuelle" className="block text-center text-xs font-medium text-brand-400">
          {t('run.manualEntry')}
        </Link>
      </div>

      {!loading && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-300">{t('run.recent')}</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500">{t('run.none')}</p>
          ) : (
            <ul className="space-y-2">
              {runs.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <Link to={`/sport/course/${r.id}`} className="card flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="text-slate-200">{displayDate(r.started_at.slice(0, 10))}</p>
                      {isPending(r.id) && <p className="text-[11px] text-amber-400">{t('run.pendingSync')}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums text-slate-100">{formatDistanceKm(r.distance_m)} km</p>
                      <p className="text-xs tabular-nums text-slate-500">
                        {formatDuration(r.duration_s)} · {formatPace(paceSecPerKm(r.distance_m, r.duration_s))} /km
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
