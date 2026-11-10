import { useEffect, useState } from 'react'
import i18n from '@/i18n'
import { formatPace } from './geo'
import { RunTracker, WebGeolocationSource, type RunSnapshot } from './RunTracker'
import { isVoiceEnabled, speak } from './voice'
import { syncPendingRuns } from './runs'

let tracker: RunTracker | null = null

function spokenMinSec(totalSeconds: number): string {
  return i18n.t('run.spokenMinSec', { m: Math.floor(totalSeconds / 60), s: Math.round(totalSeconds % 60) })
}

/**
 * The one tracker for the whole app. It lives outside React so a run keeps going while the
 * person browses to another tab and comes back.
 */
export function getRunTracker(): RunTracker {
  if (tracker) return tracker
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    storage = null
  }
  const t = new RunTracker(new WebGeolocationSource(), Date.now, storage)
  t.onKilometer = (e) => {
    if (!isVoiceEnabled()) return
    const paceSpoken = e.avgPaceSecPerKm === null ? formatPace(null) : spokenMinSec(e.avgPaceSecPerKm)
    speak(
      i18n.t('run.voiceKm', { km: e.km, split: spokenMinSec(e.splitS), pace: paceSpoken }),
      i18n.language,
    )
  }
  // Save the in-progress run whenever the page is being hidden or closed.
  const flush = () => t.flush()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
  tracker = t
  return t
}

export function useRunTracker(): { tracker: RunTracker; snap: RunSnapshot } {
  const t = getRunTracker()
  const [snap, setSnap] = useState<RunSnapshot>(() => t.getSnapshot())
  useEffect(() => {
    setSnap(t.getSnapshot())
    return t.subscribe(setSnap)
  }, [t])
  return { tracker: t, snap }
}

/** Keeps the screen awake while `active` (browsers pause GPS the moment the screen locks). */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!active || !supported) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) {
          s.release().catch(() => undefined)
          return
        }
        sentinel = s
        setHeld(true)
        s.addEventListener('release', () => setHeld(false))
      } catch {
        // Refused (power saver, low battery, page hidden): the UI shows a warning.
        setHeld(false)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => undefined)
      setHeld(false)
    }
  }, [active, supported])

  return { supported, held }
}

/** Pushes queued runs to Supabase at startup and whenever the connection comes back. */
export function useRunSync(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    const run = () => void syncPendingRuns(userId)
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [userId])
}
