import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Footprints } from 'lucide-react'
import { formatDistanceKm, formatDuration } from '@/lib/running/geo'
import { useRunTracker } from '@/lib/running/hooks'

/** Sticky reminder, on every page but the run screen itself, that a run is in progress. */
export default function ActiveRunBanner() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { snap } = useRunTracker()

  if (snap.phase === 'idle' || pathname === '/sport/course') return null

  return (
    <Link
      to="/sport/course"
      className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950"
    >
      <span className="flex items-center gap-2">
        <Footprints size={16} />
        {snap.phase === 'paused' ? t('run.paused') : t('run.title')}
      </span>
      <span className="tabular-nums">
        {formatDuration(snap.activeMs / 1000)} · {formatDistanceKm(snap.distanceM)} km
      </span>
    </Link>
  )
}
