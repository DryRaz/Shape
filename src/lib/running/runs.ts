// Persistence for runs. A finished run is written to a local queue FIRST and only removed once
// Supabase has acknowledged it: GPS needs no data connection, but saving does, and the person
// running may be on a patchy network. The client-generated id makes retries idempotent.

import { supabase } from '@/lib/supabase'
import type { Run } from '@/types/database'
import { estimateCaloriesKcal, newRunId, type RunResult } from './geo'

const PENDING_KEY = 'shape.runs.pending.v1'

type RunRow = Omit<Run, 'created_at'>

function readPending(): RunRow[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    const parsed = raw ? (JSON.parse(raw) as RunRow[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePending(rows: RunRow[]) {
  try {
    if (rows.length === 0) window.localStorage.removeItem(PENDING_KEY)
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(rows))
  } catch {
    // Storage unavailable: the upsert attempt below is then the only chance to save.
  }
}

function enqueue(row: RunRow) {
  writePending([...readPending().filter((r) => r.id !== row.id), row])
}

function dequeue(id: string) {
  writePending(readPending().filter((r) => r.id !== id))
}

function normalize(row: RunRow & { created_at?: string }): Run {
  return {
    ...row,
    distance_m: Number(row.distance_m),
    created_at: row.created_at ?? row.started_at,
  }
}

export function isPending(id: string): boolean {
  return readPending().some((r) => r.id === id)
}

async function pushRow(row: RunRow): Promise<boolean> {
  const { error } = await supabase.from('runs').upsert(row, { onConflict: 'id' })
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('Run sync failed, kept in the local queue:', error.message)
    return false
  }
  dequeue(row.id)
  return true
}

async function latestWeightKg(userId: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from('weight_logs')
      .select('weight_kg')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
    const w = data?.[0]?.weight_kg
    return typeof w === 'number' ? w : w != null ? Number(w) : null
  } catch {
    return null
  }
}

async function saveRow(row: RunRow): Promise<{ id: string; status: 'saved' | 'queued' }> {
  enqueue(row)
  const ok = await pushRow(row)
  return { id: row.id, status: ok ? 'saved' : 'queued' }
}

export async function saveRunResult(userId: string, result: RunResult) {
  const weight = await latestWeightKg(userId)
  return saveRow({
    id: result.id,
    user_id: userId,
    started_at: result.startedAt,
    ended_at: result.endedAt,
    duration_s: result.durationS,
    moving_time_s: result.movingTimeS,
    distance_m: result.distanceM,
    elevation_gain_m: result.elevationGainM,
    calories_kcal: estimateCaloriesKcal(weight, result.distanceM),
    source: 'gps',
    gps_gap_s: result.gpsGapS,
    route: result.route,
    splits: result.splits,
  })
}

export async function saveManualRun(
  userId: string,
  args: { dateIso: string; durationS: number; distanceKm: number },
) {
  // The time of day is unknown for a manual entry: use noon local time on the chosen date.
  const start = new Date(`${args.dateIso}T12:00:00`)
  const distanceM = Math.round(args.distanceKm * 1000)
  const weight = await latestWeightKg(userId)
  return saveRow({
    id: newRunId(),
    user_id: userId,
    started_at: start.toISOString(),
    ended_at: new Date(start.getTime() + args.durationS * 1000).toISOString(),
    duration_s: args.durationS,
    moving_time_s: args.durationS,
    distance_m: distanceM,
    elevation_gain_m: null,
    calories_kcal: estimateCaloriesKcal(weight, distanceM),
    source: 'manual',
    gps_gap_s: 0,
    route: null,
    splits: null,
  })
}

/** Retries every run still waiting in the local queue. Returns how many were saved. */
export async function syncPendingRuns(userId: string): Promise<number> {
  let synced = 0
  for (const row of readPending().filter((r) => r.user_id === userId)) {
    if (await pushRow(row)) synced++
  }
  return synced
}

export async function listRuns(userId: string, limit = 30): Promise<Run[]> {
  const pending = readPending()
    .filter((r) => r.user_id === userId)
    .map(normalize)
  const { data } = await supabase
    .from('runs')
    .select('id, user_id, started_at, ended_at, duration_s, moving_time_s, distance_m, elevation_gain_m, calories_kcal, source, gps_gap_s, created_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)
  const remote = (data ?? []).map((r) => normalize({ ...r, route: null, splits: null }))
  const pendingIds = new Set(pending.map((r) => r.id))
  return [...pending, ...remote.filter((r) => !pendingIds.has(r.id))].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  )
}

export async function getRun(userId: string, id: string): Promise<Run | null> {
  const queued = readPending().find((r) => r.id === id && r.user_id === userId)
  if (queued) return normalize(queued)
  const { data } = await supabase.from('runs').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  return data ? normalize(data) : null
}

export async function deleteRun(id: string): Promise<boolean> {
  dequeue(id)
  const { error } = await supabase.from('runs').delete().eq('id', id)
  return !error
}
