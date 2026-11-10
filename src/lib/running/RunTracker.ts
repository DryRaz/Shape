// The run-tracking engine. Deliberately free of React, Supabase and i18n so it can be driven by
// a fake position source in a plain Node script, and so a native background-location plugin
// can later replace WebGeolocationSource without touching anything else.
//
// Known limit of the web source: browsers pause geolocation when the screen locks or the page
// is hidden. The engine therefore treats a long silence between fixes as a "gap": the straight-
// line distance across it still counts (the runner kept moving) but it is flagged as an estimate.

import { buildRunResult, haversineM, paceSecPerKm, PositionSmoother, type LatLng, type RunResult, type TrackPoint } from './geo'

export type RunPhase = 'idle' | 'running' | 'paused'
export type GpsStatus = 'unsupported' | 'denied' | 'searching' | 'poor' | 'ok' | 'good'

export interface PositionFix {
  lat: number
  lng: number
  accuracy: number
  altitude: number | null
  /** Epoch ms reported by the device for this fix. */
  timestamp: number
}

export interface PositionError {
  code: 'unsupported' | 'denied' | 'unavailable' | 'timeout'
  message: string
}

export interface PositionSource {
  start(onFix: (fix: PositionFix) => void, onError: (error: PositionError) => void): void
  stop(): void
}

export class WebGeolocationSource implements PositionSource {
  private watchId: number | null = null

  start(onFix: (fix: PositionFix) => void, onError: (error: PositionError) => void) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      onError({ code: 'unsupported', message: 'Geolocation is not available' })
      return
    }
    this.watchId = navigator.geolocation.watchPosition(
      (p) =>
        onFix({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          altitude: p.coords.altitude,
          timestamp: p.timestamp,
        }),
      (e) =>
        onError({
          code: e.code === 1 ? 'denied' : e.code === 2 ? 'unavailable' : 'timeout',
          message: e.message,
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )
  }

  stop() {
    if (this.watchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.watchId)
    }
    this.watchId = null
  }
}

// --- Tuning -------------------------------------------------------------------------------
/** Fixes less precise than this are ignored. */
export const MAX_ACCURACY_M = 25
/** Floor for the "moved enough to count" test; the real threshold also scales with accuracy. */
const MIN_STEP_M = 3
/** ...and the threshold grows with the fix's reported uncertainty by this factor. */
const STEP_ACCURACY_FACTOR = 0.7
/** A fix implying a faster jump than this (m/s, ~43 km/h) is a GPS glitch, not running. */
const MAX_SPEED_MS = 12
/** Silence between fixes longer than this counts as a GPS gap. */
const GAP_MS = 20_000
/** Slower than this (m/s) the runner is considered stopped for the "moving time" figure. */
const MOVING_SPEED_MS = 0.5
const PACE_WINDOW_MS = 20_000
const PERSIST_EVERY_MS = 5_000
const STORAGE_KEY = 'shape.run.active.v1'

type Pending = 'none' | 'start' | 'resume' | 'gap'

export interface RunSnapshot {
  phase: RunPhase
  gps: GpsStatus
  accuracy: number | null
  startedAt: number | null
  distanceM: number
  activeMs: number
  movingMs: number
  gapMs: number
  rejected: number
  pointCount: number
  currentPaceSecPerKm: number | null
  avgPaceSecPerKm: number | null
  kmCompleted: number
  /** Ms since the last usable GPS fix while running, null otherwise. */
  lastFixAgeMs: number | null
}

export interface KilometerEvent {
  km: number
  /** Time taken for that kilometre alone, in seconds. */
  splitS: number
  /** Average pace over the whole run so far, seconds per km. */
  avgPaceSecPerKm: number | null
}

type PersistedPoint = [number, number, number, number, number | null, number, number, 0 | 1]

interface Persisted {
  v: 1
  startedAt: number
  activeMs: number
  distanceM: number
  movingMs: number
  gapMs: number
  rejected: number
  kmMarks: number[]
  points: PersistedPoint[]
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export class RunTracker {
  private phase: RunPhase = 'idle'
  private gpsStatus: GpsStatus = 'searching'
  private accuracy: number | null = null
  private gpsWatching = false

  private startedAt: number | null = null
  private accMs = 0
  private runningSince: number | null = null
  private points: TrackPoint[] = []
  private distanceM = 0
  private movingMs = 0
  private gapMs = 0
  private rejected = 0
  private kmMarks: number[] = []
  private pending: Pending = 'start'
  private lastGoodFixTs: number | null = null
  /** Last usable raw fix, used to reject GPS teleports before they reach the smoother. */
  private lastRaw: (LatLng & { ts: number }) | null = null
  private smoother = new PositionSmoother()
  private lastPersist = 0
  private ticker: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<(s: RunSnapshot) => void>()

  onKilometer: ((e: KilometerEvent) => void) | null = null

  constructor(
    private source: PositionSource,
    private now: () => number = Date.now,
    private storage: StorageLike | null = null,
  ) {}

  // --- Subscription ------------------------------------------------------------------------
  subscribe(listener: (s: RunSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    if (this.listeners.size === 0) return
    const snap = this.getSnapshot()
    this.listeners.forEach((l) => l(snap))
  }

  getSnapshot(): RunSnapshot {
    const activeMs = this.activeMs()
    const age = this.phase === 'running' && this.lastGoodFixTs !== null ? this.now() - this.lastGoodFixTs : null
    const gps: GpsStatus =
      this.gpsStatus !== 'denied' && this.gpsStatus !== 'unsupported' && age !== null && age > 10_000
        ? 'searching'
        : this.gpsStatus
    return {
      phase: this.phase,
      gps,
      accuracy: this.accuracy,
      startedAt: this.startedAt,
      distanceM: this.distanceM,
      activeMs,
      movingMs: this.movingMs,
      gapMs: this.gapMs,
      rejected: this.rejected,
      pointCount: this.points.length,
      currentPaceSecPerKm: this.currentPace(activeMs),
      avgPaceSecPerKm: paceSecPerKm(this.distanceM, activeMs / 1000),
      kmCompleted: this.kmMarks.length,
      lastFixAgeMs: age,
    }
  }

  getPoints(): readonly TrackPoint[] {
    return this.points
  }

  private activeMs(): number {
    return this.accMs + (this.phase === 'running' && this.runningSince !== null ? this.now() - this.runningSince : 0)
  }

  // --- GPS source --------------------------------------------------------------------------
  /** Start listening for fixes (also used before the run to show signal quality). */
  startGps() {
    if (this.gpsWatching) return
    this.gpsWatching = true
    this.gpsStatus = 'searching'
    this.source.start(
      (fix) => this.onFix(fix),
      (err) => this.onError(err),
    )
    this.emit()
  }

  /** Stop listening, unless a run is in progress. */
  stopGps() {
    if (this.phase !== 'idle') return
    this.source.stop()
    this.gpsWatching = false
  }

  private onError(err: PositionError) {
    if (err.code === 'denied') this.gpsStatus = 'denied'
    else if (err.code === 'unsupported') this.gpsStatus = 'unsupported'
    else this.gpsStatus = 'searching'
    this.emit()
  }

  // --- Controls ----------------------------------------------------------------------------
  start() {
    if (this.phase !== 'idle') return
    this.resetRunState()
    this.startedAt = this.now()
    this.runningSince = this.now()
    this.lastGoodFixTs = this.now()
    this.phase = 'running'
    this.pending = 'start'
    this.startGps()
    this.startTicker()
    this.persist()
    this.emit()
  }

  pause() {
    if (this.phase !== 'running') return
    this.accMs = this.activeMs()
    this.runningSince = null
    this.phase = 'paused'
    this.stopTicker()
    this.persist()
    this.emit()
  }

  resume() {
    if (this.phase !== 'paused') return
    this.runningSince = this.now()
    this.phase = 'running'
    this.pending = 'resume'
    this.lastGoodFixTs = this.now()
    this.lastRaw = null
    this.smoother.reset()
    this.startGps()
    this.startTicker()
    this.persist()
    this.emit()
  }

  /** Ends the run and returns its summary (null if there is no run). */
  finish(): RunResult | null {
    if (this.phase === 'idle' || this.startedAt === null) return null
    const activeMs = this.activeMs()
    const result = buildRunResult({
      points: this.points,
      startedAt: this.startedAt,
      endedAt: this.now(),
      activeMs,
      movingMs: this.movingMs,
      gapMs: this.gapMs,
      distanceM: this.distanceM,
    })
    this.discard()
    return result
  }

  /** Throws the run away. */
  discard() {
    this.stopTicker()
    this.resetRunState()
    this.phase = 'idle'
    this.clearStorage()
    this.stopGps()
    this.emit()
  }

  private resetRunState() {
    this.startedAt = null
    this.accMs = 0
    this.runningSince = null
    this.points = []
    this.distanceM = 0
    this.movingMs = 0
    this.gapMs = 0
    this.rejected = 0
    this.kmMarks = []
    this.pending = 'start'
    this.lastGoodFixTs = null
    this.lastRaw = null
    this.smoother.reset()
  }

  // --- Fix processing ----------------------------------------------------------------------
  private onFix(fix: PositionFix) {
    this.accuracy = fix.accuracy
    this.gpsStatus = fix.accuracy <= 10 ? 'good' : fix.accuracy <= MAX_ACCURACY_M ? 'ok' : 'poor'

    if (this.phase !== 'running') {
      this.emit()
      return
    }

    const t = fix.timestamp

    // A fix too imprecise to use. It does NOT refresh lastGoodFixTs, so a long stretch of
    // unusable signal (tunnel, dense buildings) ends up counted as a GPS gap below.
    if (fix.accuracy > MAX_ACCURACY_M) {
      this.rejected++
      this.emit()
      return
    }

    // Long silence of *usable* fixes: screen locked, tunnel... Count it and flag the next
    // point as a new segment. (Pending 'start'/'resume' take precedence: no distance is added.)
    if (this.lastGoodFixTs !== null && t - this.lastGoodFixTs > GAP_MS) {
      this.gapMs += t - this.lastGoodFixTs
      if (this.pending === 'none') this.pending = 'gap'
      this.lastGoodFixTs = t
    }

    // A GPS teleport (one fix far from where we just were) is rejected on the raw fix, before it
    // can pull the smoother off the real path.
    const startsSegment = this.pending !== 'none'
    if (!startsSegment && this.lastRaw) {
      const rawDt = (t - this.lastRaw.ts) / 1000
      if (rawDt <= 0) return
      if (haversineM(this.lastRaw, { lat: fix.lat, lng: fix.lng }) / rawDt > MAX_SPEED_MS) {
        this.rejected++
        this.emit()
        return
      }
    }
    this.lastGoodFixTs = t
    this.lastRaw = { lat: fix.lat, lng: fix.lng, ts: t }

    // New segment (start, resume, GPS gap): the old estimate no longer applies.
    if (startsSegment) this.smoother.reset()
    const pos = this.smoother.process(fix.lat, fix.lng, fix.accuracy, t)

    const prev = this.points.length ? this.points[this.points.length - 1] : null
    const act = this.activeMs()
    const smoothedFix: PositionFix = { ...fix, lat: pos.lat, lng: pos.lng }

    // First point of the run, or first after a pause: starts a new segment, adds no distance.
    if (!prev || this.pending === 'start' || this.pending === 'resume') {
      this.addPoint(smoothedFix, act, true, 0)
      this.pending = 'none'
      return
    }

    const d = haversineM(prev, pos)
    const dtMs = t - prev.ts
    if (dtMs <= 0) return

    // After a GPS gap: keep the straight-line distance (flagged via gapMs) on a new segment.
    if (this.pending === 'gap') {
      this.addPoint(smoothedFix, act, true, d)
      this.pending = 'none'
      return
    }

    // Jitter while standing still: not enough movement relative to the fix's own uncertainty.
    if (d < Math.max(MIN_STEP_M, fix.accuracy * STEP_ACCURACY_FACTOR)) {
      this.emit()
      return
    }

    if (d / (dtMs / 1000) >= MOVING_SPEED_MS) this.movingMs += dtMs
    this.addPoint(smoothedFix, act, false, d)
  }

  private addPoint(fix: PositionFix, act: number, seg: boolean, addedDistance: number) {
    const prev = this.points.length ? this.points[this.points.length - 1] : null
    this.distanceM += addedDistance
    const point: TrackPoint = {
      lat: fix.lat,
      lng: fix.lng,
      ts: fix.timestamp,
      acc: fix.accuracy,
      alt: fix.altitude,
      dist: this.distanceM,
      act,
      seg,
    }
    this.points.push(point)

    // Whole kilometres crossed by this step (interpolating the moment of crossing).
    while (prev && this.distanceM >= (this.kmMarks.length + 1) * 1000 && point.dist > prev.dist) {
      const km = this.kmMarks.length + 1
      const frac = (km * 1000 - prev.dist) / (point.dist - prev.dist)
      const markAct = prev.act + frac * (act - prev.act)
      const lastMark = this.kmMarks.length ? this.kmMarks[this.kmMarks.length - 1] : 0
      this.kmMarks.push(markAct)
      this.onKilometer?.({
        km,
        splitS: Math.round((markAct - lastMark) / 1000),
        avgPaceSecPerKm: paceSecPerKm(km * 1000, markAct / 1000),
      })
    }

    if (this.now() - this.lastPersist >= PERSIST_EVERY_MS) this.persist()
    this.emit()
  }

  /** Pace over roughly the last 20 s of movement, null when standing still or too little data. */
  private currentPace(nowAct: number): number | null {
    const last = this.points[this.points.length - 1]
    if (!last || nowAct - last.act > 10_000) return null
    let first = last
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i]
      if (last.act - p.act > PACE_WINDOW_MS) break
      first = p
      if (p.seg) break
    }
    const dDist = last.dist - first.dist
    const dAct = last.act - first.act
    if (dDist < 15 || dAct <= 0) return null
    return dAct / 1000 / (dDist / 1000)
  }

  // --- Ticker ------------------------------------------------------------------------------
  private startTicker() {
    if (this.ticker !== null) return
    this.ticker = setInterval(() => {
      if (this.now() - this.lastPersist >= PERSIST_EVERY_MS) this.persist()
      this.emit()
    }, 1000)
  }

  private stopTicker() {
    if (this.ticker !== null) clearInterval(this.ticker)
    this.ticker = null
  }

  // --- Persistence (so a reload or a killed tab doesn't lose a run) ------------------------
  /** Writes the in-progress run to storage. Call it when the page is being hidden or closed. */
  flush() {
    this.persist()
  }

  private persist() {
    if (!this.storage || this.phase === 'idle' || this.startedAt === null) return
    this.lastPersist = this.now()
    const data: Persisted = {
      v: 1,
      startedAt: this.startedAt,
      activeMs: this.activeMs(),
      distanceM: this.distanceM,
      movingMs: this.movingMs,
      gapMs: this.gapMs,
      rejected: this.rejected,
      kmMarks: this.kmMarks,
      points: this.points.map((p) => [p.lat, p.lng, p.ts, p.acc, p.alt, p.dist, p.act, p.seg ? 1 : 0]),
    }
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage full or unavailable: the run continues in memory, it just can't be recovered.
    }
  }

  private clearStorage() {
    try {
      this.storage?.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  /**
   * Brings back a run that was in progress when the page was closed. It returns paused: the
   * time between the last save and now is unknown, so the runner decides whether to resume.
   */
  restore(): boolean {
    if (this.phase !== 'idle' || !this.storage) return false
    let data: Persisted
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return false
      data = JSON.parse(raw) as Persisted
    } catch {
      return false
    }
    if (data.v !== 1 || typeof data.startedAt !== 'number' || !Array.isArray(data.points)) return false
    this.resetRunState()
    this.startedAt = data.startedAt
    this.accMs = data.activeMs
    this.distanceM = data.distanceM
    this.movingMs = data.movingMs
    this.gapMs = data.gapMs
    this.rejected = data.rejected
    this.kmMarks = data.kmMarks ?? []
    this.points = data.points.map(([lat, lng, ts, acc, alt, dist, act, seg]) => ({
      lat,
      lng,
      ts,
      acc,
      alt,
      dist,
      act,
      seg: seg === 1,
    }))
    this.runningSince = null
    this.phase = 'paused'
    this.pending = 'resume'
    this.emit()
    return true
  }
}
