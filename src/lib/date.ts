import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'
import i18n from '@/i18n'

export const DEFAULT_TIMEZONE = 'Africa/Nairobi'

function currentDateFnsLocale() {
  return i18n.language === 'en' ? enUS : fr
}

/** Today's date (YYYY-MM-DD) as seen from the user's timezone. */
export function todayInTimezone(timezone = DEFAULT_TIMEZONE): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd')
}

export function isoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function displayDate(iso: string, pattern = 'EEE d MMM'): string {
  return format(new Date(`${iso}T00:00:00`), pattern, { locale: currentDateFnsLocale() })
}

export type RangeKind = 'day' | 'week' | 'month'

export function rangeFor(kind: RangeKind, anchorIso: string, timezone = DEFAULT_TIMEZONE) {
  const anchor = toZonedTime(`${anchorIso}T00:00:00`, timezone)
  if (kind === 'day') {
    return { start: anchor, end: anchor, days: [anchor] }
  }
  if (kind === 'week') {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    const end = endOfWeek(anchor, { weekStartsOn: 1 })
    return { start, end, days: eachDayOfInterval({ start, end }) }
  }
  const start = startOfMonth(anchor)
  const end = endOfMonth(anchor)
  return { start, end, days: eachDayOfInterval({ start, end }) }
}

export function shiftAnchor(kind: RangeKind, anchorIso: string, direction: 1 | -1): string {
  const anchor = new Date(`${anchorIso}T00:00:00`)
  if (kind === 'day') return isoDate(addDays(anchor, direction))
  if (kind === 'week') return isoDate(addDays(anchor, direction * 7))
  return isoDate(addMonths(anchor, direction))
}

/** ISO date (Monday) of the week containing `dateIso`. */
export function weekStartIso(dateIso: string): string {
  return isoDate(startOfWeek(new Date(`${dateIso}T00:00:00`), { weekStartsOn: 1 }))
}

/** ISO date (Sunday) of the week that starts on `weekStartDateIso`. */
export function weekEndIso(weekStartDateIso: string): string {
  return isoDate(addDays(new Date(`${weekStartDateIso}T00:00:00`), 6))
}

/** ISO dates for the trailing `days`-day window ending today (inclusive), oldest first. */
export function trailingDays(days: number, timezone = DEFAULT_TIMEZONE): string[] {
  const today = new Date(`${todayInTimezone(timezone)}T00:00:00`)
  return Array.from({ length: days }, (_, i) => isoDate(addDays(today, i - (days - 1))))
}

/** Longest current run of consecutive days (ending today or yesterday) present in `datesWithActivity`. */
export function computeStreak(datesWithActivity: Set<string>, timezone = DEFAULT_TIMEZONE): number {
  let cursor = new Date(`${todayInTimezone(timezone)}T00:00:00`)
  let streak = 0
  // Allow the streak to still "count" if today just hasn't been logged yet.
  if (!datesWithActivity.has(isoDate(cursor))) {
    cursor = addDays(cursor, -1)
  }
  while (datesWithActivity.has(isoDate(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}
