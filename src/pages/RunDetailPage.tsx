import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Download, RefreshCw, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { displayDate } from '@/lib/date'
import { formatDistanceKm, formatDuration, formatPace, paceSecPerKm, runToGpx } from '@/lib/running/geo'
import { deleteRun, getRun, isPending, syncPendingRuns } from '@/lib/running/runs'
import RouteMap from '@/components/RouteMap'
import type { Run } from '@/types/database'

export default function RunDetailPage() {
  const { t } = useTranslation()
  const { runId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [run, setRun] = useState<Run | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [syncing, setSyncing] = useState(false)

  async function load() {
    if (!user || !runId) return
    setRun(await getRun(user.id, runId))
    setPending(isPending(runId))
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, runId])

  async function handleSync() {
    if (!user) return
    setSyncing(true)
    await syncPendingRuns(user.id)
    await load()
    setSyncing(false)
  }

  async function handleDelete() {
    if (!run) return
    await deleteRun(run.id)
    navigate('/sport', { replace: true })
  }

  function handleExportGpx() {
    if (!run?.route) return
    const day = run.started_at.slice(0, 10)
    const gpx = runToGpx({ name: `Shape run ${day}`, startedAtIso: run.started_at, route: run.route })
    const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `shape-run-${day}.gpx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="text-sm text-slate-500">{t('common.loading')}</p>

  if (!run) {
    return (
      <div className="space-y-4">
        <Link to="/sport" className="btn-ghost p-2" aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </Link>
        <p className="card text-center text-sm text-slate-500">{t('run.detail.notFound')}</p>
      </div>
    )
  }

  const avgPace = paceSecPerKm(run.distance_m, run.duration_s)
  const bestSplit = run.splits && run.splits.length ? Math.min(...run.splits.map((s) => s.time_s)) : null
  const slowestSplit = run.splits && run.splits.length ? Math.max(...run.splits.map((s) => s.time_s)) : null
  const startedTime = new Date(run.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/sport" className="btn-ghost p-2" aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{displayDate(run.started_at.slice(0, 10), 'EEEE d MMMM')}</h1>
          <p className="text-xs text-slate-400">
            {run.source === 'manual' ? t('run.detail.manual') : startedTime}
          </p>
        </div>
      </header>

      {pending && (
        <div className="card flex items-center justify-between gap-3 py-3">
          <p className="text-xs text-amber-300">{t('run.pendingSync')}</p>
          <button className="btn-secondary py-1.5 text-xs" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {t('run.detail.syncNow')}
          </button>
        </div>
      )}

      {run.route && run.route.length > 1 && <RouteMap route={run.route} label={t('run.detail.routeLabel')} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <p className="label">{t('run.detail.distance')}</p>
          <p className="text-3xl font-semibold tabular-nums text-slate-50">
            {formatDistanceKm(run.distance_m)} <span className="text-base text-slate-400">km</span>
          </p>
        </div>
        <div className="card text-center">
          <p className="label">{t('run.detail.duration')}</p>
          <p className="text-3xl font-semibold tabular-nums text-slate-50">{formatDuration(run.duration_s)}</p>
        </div>
        <div className="card text-center">
          <p className="label">{t('run.detail.avgPace')}</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-50">
            {formatPace(avgPace)} <span className="text-sm text-slate-400">/km</span>
          </p>
        </div>
        <div className="card text-center">
          <p className="label">{t('run.detail.calories')}</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-50">
            {run.calories_kcal ?? '—'} {run.calories_kcal !== null && <span className="text-sm text-slate-400">{t('run.detail.kcalUnit')}</span>}
          </p>
        </div>
        {run.elevation_gain_m !== null && (
          <div className="card text-center">
            <p className="label">{t('run.detail.elevation')}</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-50">
              {run.elevation_gain_m} <span className="text-sm text-slate-400">{t('run.detail.meters')}</span>
            </p>
          </div>
        )}
        {run.moving_time_s !== null && run.source === 'gps' && (
          <div className="card text-center">
            <p className="label">{t('run.detail.movingTime')}</p>
            <p className="text-2xl font-semibold tabular-nums text-slate-50">{formatDuration(run.moving_time_s)}</p>
          </div>
        )}
      </div>

      {run.gps_gap_s > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {t('run.detail.gapWarning', { s: run.gps_gap_s })}
        </p>
      )}

      {run.splits && run.splits.length > 0 && bestSplit !== null && slowestSplit !== null && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-300">{t('run.detail.splits')}</h2>
          <ul className="space-y-1.5">
            {run.splits.map((s) => {
              const range = Math.max(slowestSplit - bestSplit, 1)
              // Faster km => longer bar, so the eye reads "longer = better".
              const width = 40 + 60 * ((slowestSplit - s.time_s) / range)
              return (
                <li key={s.index} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-right tabular-nums text-slate-500">{s.index}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-slate-800">
                    <div
                      className={`h-full rounded ${s.time_s === bestSplit ? 'bg-brand-400' : 'bg-brand-600'}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums text-slate-200">{formatPace(s.time_s)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2">
        {run.route && run.route.length > 1 && (
          <button className="btn-secondary w-full" onClick={handleExportGpx}>
            <Download size={16} />
            {t('run.detail.exportGpx')}
          </button>
        )}
        {confirmDelete ? (
          <div className="card space-y-3">
            <p className="text-sm text-slate-200">{t('run.detail.confirmDelete')}</p>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setConfirmDelete(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-secondary flex-1 text-red-400" onClick={handleDelete}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-ghost w-full text-red-400" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} />
            {t('run.detail.delete')}
          </button>
        )}
      </div>
    </div>
  )
}
