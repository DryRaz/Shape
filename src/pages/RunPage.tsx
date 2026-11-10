import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Pause, Play, Square, Volume2 } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { formatDistanceKm, formatDuration, formatPace } from '@/lib/running/geo'
import { useRunTracker, useWakeLock } from '@/lib/running/hooks'
import { saveRunResult } from '@/lib/running/runs'
import { isVoiceEnabled, setVoiceEnabled } from '@/lib/running/voice'
import type { GpsStatus } from '@/lib/running/RunTracker'

const GPS_DOT: Record<GpsStatus, string> = {
  unsupported: 'bg-red-400',
  denied: 'bg-red-400',
  searching: 'bg-amber-400 animate-pulse',
  poor: 'bg-amber-400',
  ok: 'bg-brand-300',
  good: 'bg-brand-400',
}

export default function RunPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { tracker, snap } = useRunTracker()
  const active = snap.phase !== 'idle'
  const { supported: wakeSupported, held: wakeHeld } = useWakeLock(snap.phase === 'running')

  const [voice, setVoice] = useState(isVoiceEnabled)
  const [restored, setRestored] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Bring back a run that was interrupted by a reload, then warm up the GPS.
    if (tracker.getSnapshot().phase === 'idle' && tracker.restore()) setRestored(true)
    tracker.startGps()
    // Stops listening only if no run is in progress.
    return () => tracker.stopGps()
  }, [tracker])

  function toggleVoice(enabled: boolean) {
    setVoice(enabled)
    setVoiceEnabled(enabled)
  }

  async function handleFinish() {
    if (!user) return
    const result = tracker.finish()
    if (!result) return
    setSaving(true)
    const { id } = await saveRunResult(user.id, result)
    navigate(`/sport/course/${id}`, { replace: true })
  }

  function handleDiscard() {
    tracker.discard()
    setConfirmDiscard(false)
    setRestored(false)
  }

  if (saving) {
    return <p className="py-16 text-center text-sm text-slate-400">{t('run.saving')}</p>
  }

  const gpsBlocked = snap.gps === 'denied' || snap.gps === 'unsupported'
  const signalLostS = snap.lastFixAgeMs !== null && snap.lastFixAgeMs > 10_000 ? Math.round(snap.lastFixAgeMs / 1000) : null

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/sport" className="btn-ghost p-2" aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-50">{t('run.title')}</h1>
          {snap.phase === 'paused' && <p className="text-xs font-medium text-amber-400">{t('run.paused')}</p>}
        </div>
      </header>

      {restored && snap.phase === 'paused' && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">{t('run.restored')}</p>
      )}

      <div className="card flex items-center gap-3 py-3">
        <span className={`h-3 w-3 shrink-0 rounded-full ${GPS_DOT[snap.gps]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{t(`run.gps.${snap.gps}`)}</p>
          {snap.accuracy !== null && !gpsBlocked && (
            <p className="text-xs text-slate-500">{t('run.accuracy', { m: Math.round(snap.accuracy) })}</p>
          )}
        </div>
      </div>

      {snap.gps === 'denied' && <p className="text-xs text-amber-300">{t('run.gpsDeniedHelp')}</p>}

      {active && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card col-span-2 text-center">
              <p className="label">{t('run.time')}</p>
              <p className="text-6xl font-semibold tabular-nums text-slate-50">{formatDuration(snap.activeMs / 1000)}</p>
            </div>
            <div className="card text-center">
              <p className="label">{t('run.distanceKm')}</p>
              <p className="text-4xl font-semibold tabular-nums text-slate-50">{formatDistanceKm(snap.distanceM)}</p>
            </div>
            <div className="card text-center">
              <p className="label">{t('run.pace')}</p>
              <p className="text-4xl font-semibold tabular-nums text-slate-50">{formatPace(snap.currentPaceSecPerKm)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {t('run.avgPace')} {formatPace(snap.avgPaceSecPerKm)}
              </p>
            </div>
          </div>

          {snap.phase === 'running' && signalLostS !== null && (
            <p className="flex items-start gap-2 text-xs text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {t('run.signalLost', { s: signalLostS })}
            </p>
          )}
          {snap.gapMs > 0 && (
            <p className="text-xs text-slate-500">{t('run.gapSoFar', { s: Math.round(snap.gapMs / 1000) })}</p>
          )}
          {snap.phase === 'running' && (!wakeSupported || !wakeHeld) && (
            <p className="flex items-start gap-2 text-xs text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {t('run.wakeLockOff')}
            </p>
          )}

          {confirmFinish ? (
            <div className="card space-y-3">
              <p className="text-sm text-slate-200">{t('run.confirmFinish')}</p>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1" onClick={() => setConfirmFinish(false)}>
                  {t('run.keepRunning')}
                </button>
                <button className="btn-primary flex-1" onClick={handleFinish}>
                  {t('run.confirmYes')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              {snap.phase === 'running' ? (
                <button className="btn-secondary flex-1 py-4 text-base" onClick={() => tracker.pause()}>
                  <Pause size={20} />
                  {t('run.pause')}
                </button>
              ) : (
                <button className="btn-secondary flex-1 py-4 text-base" onClick={() => tracker.resume()}>
                  <Play size={20} />
                  {t('run.resume')}
                </button>
              )}
              <button className="btn-primary flex-1 py-4 text-base" onClick={() => setConfirmFinish(true)}>
                <Square size={18} />
                {t('run.finish')}
              </button>
            </div>
          )}

          {snap.phase === 'paused' &&
            (confirmDiscard ? (
              <div className="card space-y-3">
                <p className="text-sm text-slate-200">{t('run.confirmDiscard')}</p>
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={() => setConfirmDiscard(false)}>
                    {t('common.cancel')}
                  </button>
                  <button className="btn-secondary flex-1 text-red-400" onClick={handleDiscard}>
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-ghost w-full text-red-400" onClick={() => setConfirmDiscard(true)}>
                {t('run.discard')}
              </button>
            ))}
        </>
      )}

      {!active && (
        <>
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            {t('run.keepScreenOn')}
          </p>

          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-brand-500"
              checked={voice}
              onChange={(e) => toggleVoice(e.target.checked)}
            />
            <Volume2 size={16} className="text-slate-400" />
            {t('run.voice')}
          </label>

          <button className="btn-primary w-full py-4 text-base" disabled={gpsBlocked} onClick={() => tracker.start()}>
            <Play size={20} />
            {t('run.start')}
          </button>

          <Link to="/sport/course/manuelle" className="btn-ghost w-full">
            {t('run.manualEntry')}
          </Link>
        </>
      )}
    </div>
  )
}
