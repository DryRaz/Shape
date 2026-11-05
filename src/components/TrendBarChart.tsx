import type { ComponentType } from 'react'
import { displayDate } from '@/lib/date'

export interface TrendPoint {
  date: string
  value: number | null
}

interface Props {
  title: string
  icon: ComponentType<{ size?: number | string }>
  iconWrapClassName: string
  barClassName: string
  unit: string
  decimals?: number
  data: TrendPoint[]
}

function formatValue(value: number, decimals: number): string {
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}

export default function TrendBarChart({
  title,
  icon: Icon,
  iconWrapClassName,
  barClassName,
  unit,
  decimals = 0,
  data,
}: Props) {
  const known = data.filter((d): d is TrendPoint & { value: number } => d.value !== null)
  const average = known.length > 0 ? known.reduce((sum, d) => sum + d.value, 0) / known.length : 0
  const max = Math.max(1, ...known.map((d) => d.value))

  const compact = data.length <= 10
  const labelIndexes = new Set(
    compact ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1]
  )

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconWrapClassName}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-200">{title}</p>
          <p className="text-xs text-slate-500">
            Moyenne : {known.length > 0 ? `${formatValue(average, decimals)} ${unit}/jour` : '—'}
          </p>
        </div>
      </div>

      <div className="flex h-24 items-end gap-[2px]">
        {data.map((d) => {
          const heightPct = d.value !== null ? Math.max(4, (d.value / max) * 100) : 6
          return (
            <div key={d.date} className="flex h-full flex-1 items-end">
              <div
                className={`w-full rounded-t-sm transition-all ${d.value !== null ? barClassName : 'bg-slate-800'}`}
                style={{ height: `${heightPct}%` }}
                title={`${displayDate(d.date)} · ${d.value !== null ? formatValue(d.value, decimals) : '—'} ${unit}`}
              />
            </div>
          )
        })}
      </div>

      <div className="flex gap-[2px] text-[9px] text-slate-600">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {labelIndexes.has(i) ? displayDate(d.date, compact ? 'EEEEE' : 'd/MM') : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
