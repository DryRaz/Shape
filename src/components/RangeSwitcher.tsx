import { ChevronLeft, ChevronRight } from 'lucide-react'
import { displayDate, shiftAnchor, type RangeKind } from '@/lib/date'

interface Props {
  kind: RangeKind
  anchorIso: string
  onKindChange: (kind: RangeKind) => void
  onAnchorChange: (iso: string) => void
}

const KIND_LABELS: Record<RangeKind, string> = { day: 'Jour', week: 'Semaine', month: 'Mois' }

export default function RangeSwitcher({ kind, anchorIso, onKindChange, onAnchorChange }: Props) {
  const pattern = kind === 'day' ? 'EEEE d MMMM' : kind === 'week' ? "'Semaine du' d MMM" : 'MMMM yyyy'

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex rounded-xl bg-slate-900 p-1">
        {(Object.keys(KIND_LABELS) as RangeKind[]).map((k) => (
          <button
            key={k}
            onClick={() => onKindChange(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              kind === k ? 'bg-brand-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 text-sm text-slate-300">
        <button
          aria-label="Précédent"
          className="rounded-lg p-1.5 hover:bg-slate-800"
          onClick={() => onAnchorChange(shiftAnchor(kind, anchorIso, -1))}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[9rem] text-center capitalize">{displayDate(anchorIso, pattern)}</span>
        <button
          aria-label="Suivant"
          className="rounded-lg p-1.5 hover:bg-slate-800"
          onClick={() => onAnchorChange(shiftAnchor(kind, anchorIso, 1))}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
