// Pure helpers for run tracking: no DOM, no React, no Supabase — so they can be exercised
// from a plain Node script and reused unchanged if the GPS source ever becomes native.

import type { RunRoutePoint, RunSplit } from '@/types/database'

const EARTH_RADIUS_M = 6371008.8

export interface LatLng {
  lat: number
  lng: number
}

/** One accepted GPS point as the tracker keeps it while a run is in progress. */
export interface TrackPoint extends LatLng {
  /** Epoch ms of the fix. */
  ts: number
  /** Reported horizontal accuracy in metres. */
  acc: number
  alt: number | null
  /** Cumulative distance (m) when this point was accepted. */
  dist: number
  /** Active (paused time excluded) elapsed ms when this point was accepted. */
  act: number
  /** True if the point starts a new segment (first point, after a pause, or after a GPS gap). */
  seg: boolean
}

export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ---------------------------------------------------------------------------
// Position smoothing
// ---------------------------------------------------------------------------

/**
 * Constant-velocity Kalman filter working in local metres (east/north) around the first fix of
 * a segment, weighting each fix by its own reported accuracy.
 *
 * Why: raw GPS jitters by several metres between fixes. Summing those jitters inflates distance
 * by 5-15 % and makes a stationary phone wander. A position-only filter removes the jitter but
 * lags behind a moving runner and cuts corners; tracking velocity as well removes that lag on
 * straights while still adapting to turns. `accelNoise` (m/s²) is how sharply the runner may
 * speed up or turn: larger follows turns more tightly but smooths less.
 */
export class PositionSmoother {
  private origin: LatLng | null = null
  private kx = 1
  private ky = 1
  private ts = 0
  // Per axis: position, velocity, and the 2x2 covariance [pp, pv, vv].
  private ax = { p: 0, v: 0, pp: 0, pv: 0, vv: 0 }
  private ay = { p: 0, v: 0, pp: 0, pv: 0, vv: 0 }

  constructor(private accelNoise = 1) {}

  /** Forget the current estimate (new segment: after a pause or a GPS gap). */
  reset() {
    this.origin = null
  }

  process(lat: number, lng: number, accuracyM: number, ts: number): LatLng {
    const acc = Math.max(accuracyM, 1)
    const r = acc * acc
    if (!this.origin) {
      this.origin = { lat, lng }
      this.kx = Math.cos((lat * Math.PI) / 180) * 111320
      this.ky = 110540
      this.ts = ts
      this.ax = { p: 0, v: 0, pp: r, pv: 0, vv: 25 }
      this.ay = { p: 0, v: 0, pp: r, pv: 0, vv: 25 }
      return { lat, lng }
    }
    const dt = Math.max(0, (ts - this.ts) / 1000)
    this.ts = ts
    const mx = (lng - this.origin.lng) * this.kx
    const my = (lat - this.origin.lat) * this.ky
    this.step(this.ax, mx, r, dt)
    this.step(this.ay, my, r, dt)
    return {
      lat: this.origin.lat + this.ay.p / this.ky,
      lng: this.origin.lng + this.ax.p / this.kx,
    }
  }

  private step(s: { p: number; v: number; pp: number; pv: number; vv: number }, z: number, r: number, dt: number) {
    // Predict (white-noise acceleration model).
    const q = this.accelNoise * this.accelNoise
    const dt2 = dt * dt
    s.p += s.v * dt
    const pp = s.pp + 2 * dt * s.pv + dt2 * s.vv + (q * dt2 * dt2) / 4
    const pv = s.pv + dt * s.vv + (q * dt2 * dt) / 2
    const vv = s.vv + q * dt2
    // Update with the position measurement.
    const innovation = z - s.p
    const sInv = 1 / (pp + r)
    const kp = pp * sInv
    const kv = pv * sInv
    s.p += kp * innovation
    s.v += kv * innovation
    s.pp = (1 - kp) * pp
    s.pv = (1 - kp) * pv
    s.vv = vv - kv * pv
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 3725 -> "1:02:05", 342 -> "5:42". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Seconds per km -> "5:42". */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--'
  const total = Math.round(secPerKm)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function formatDistanceKm(distanceM: number): string {
  return (distanceM / 1000).toFixed(2)
}

/** Average pace in s/km, or null when the distance is too short to mean anything. */
export function paceSecPerKm(distanceM: number, seconds: number): number | null {
  if (distanceM < 10 || seconds <= 0) return null
  return seconds / (distanceM / 1000)
}

// ---------------------------------------------------------------------------
// Splits & elevation
// ---------------------------------------------------------------------------

/**
 * Full-kilometre splits. Time at each kilometre mark is interpolated between the two points
 * surrounding it, so a split isn't skewed by where the GPS fixes happened to fall.
 * `act` is in ms; returned `time_s` is the time taken for that kilometre alone.
 */
export function computeSplits(points: Pick<TrackPoint, 'dist' | 'act'>[]): RunSplit[] {
  const splits: RunSplit[] = []
  let nextKm = 1
  let prevMarkAct = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    while (b.dist >= nextKm * 1000 && b.dist > a.dist) {
      const frac = (nextKm * 1000 - a.dist) / (b.dist - a.dist)
      const markAct = a.act + frac * (b.act - a.act)
      splits.push({ index: nextKm, distance_m: 1000, time_s: Math.round((markAct - prevMarkAct) / 1000) })
      prevMarkAct = markAct
      nextKm++
    }
  }
  return splits
}

/**
 * Total climb in metres, or null if altitude is mostly missing. GPS altitude is noisy, so the
 * series is smoothed and a rise only counts once it exceeds a small threshold.
 */
export function elevationGainM(alts: (number | null)[]): number | null {
  const vals = alts.filter((a): a is number => a !== null && Number.isFinite(a))
  if (vals.length < 5 || vals.length < alts.length * 0.5) return null
  const smoothed = vals.map((_, i) => {
    const lo = Math.max(0, i - 2)
    const hi = Math.min(vals.length - 1, i + 2)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += vals[j]
    return sum / (hi - lo + 1)
  })
  const THRESHOLD_M = 3
  let gain = 0
  let ref = smoothed[0]
  for (let i = 1; i < smoothed.length; i++) {
    const v = smoothed[i]
    if (v - ref >= THRESHOLD_M) {
      gain += v - ref
      ref = v
    } else if (v < ref) {
      ref = v
    }
  }
  return Math.round(gain)
}

// ---------------------------------------------------------------------------
// Route simplification (Ramer–Douglas–Peucker) so a run stores ~hundreds of points, not thousands
// ---------------------------------------------------------------------------

function pointToSegmentM(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function simplifyPoints<T extends LatLng>(pts: T[], epsilonM: number): T[] {
  if (pts.length <= 2) return pts.slice()
  const kx = Math.cos((pts[0].lat * Math.PI) / 180) * 111320
  const ky = 110540
  const xs = pts.map((p) => p.lng * kx)
  const ys = pts.map((p) => p.lat * ky)
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number]
    let maxD = 0
    let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = pointToSegmentM(xs[i], ys[i], xs[s], ys[s], xs[e], ys[e])
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (idx !== -1 && maxD > epsilonM) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i] === 1)
}

/** Simplifies each segment on its own (a pause/gap must stay a break), capped to `maxPoints`. */
export function buildStoredRoute(points: TrackPoint[], startedAt: number, maxPoints = 800): RunRoutePoint[] {
  const segments: TrackPoint[][] = []
  for (const p of points) {
    if (p.seg || segments.length === 0) segments.push([p])
    else segments[segments.length - 1].push(p)
  }
  let epsilon = 3
  for (;;) {
    const out: RunRoutePoint[] = []
    for (const seg of segments) {
      simplifyPoints(seg, epsilon).forEach((p, i) => {
        out.push([
          Math.round(p.lat * 1e5) / 1e5,
          Math.round(p.lng * 1e5) / 1e5,
          Math.max(0, Math.round((p.ts - startedAt) / 1000)),
          p.alt === null ? null : Math.round(p.alt),
          i === 0 ? 1 : 0,
        ])
      })
    }
    if (out.length <= maxPoints || epsilon > 200) return out
    epsilon *= 1.6
  }
}

// ---------------------------------------------------------------------------
// Build the final summary of a finished run
// ---------------------------------------------------------------------------

export interface RunResult {
  id: string
  startedAt: string
  endedAt: string
  durationS: number
  movingTimeS: number
  distanceM: number
  gpsGapS: number
  elevationGainM: number | null
  splits: RunSplit[]
  route: RunRoutePoint[]
}

export function newRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function buildRunResult(args: {
  points: TrackPoint[]
  startedAt: number
  endedAt: number
  activeMs: number
  movingMs: number
  gapMs: number
  distanceM: number
}): RunResult {
  const { points, startedAt, endedAt, activeMs, movingMs, gapMs, distanceM } = args
  return {
    id: newRunId(),
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    durationS: Math.round(activeMs / 1000),
    movingTimeS: Math.min(Math.round(movingMs / 1000), Math.round(activeMs / 1000)),
    distanceM: Math.round(distanceM * 10) / 10,
    gpsGapS: Math.round(gapMs / 1000),
    elevationGainM: elevationGainM(points.map((p) => p.alt)),
    splits: computeSplits(points),
    route: buildStoredRoute(points, startedAt),
  }
}

/** Rough energy cost of running: about 1 kcal per kg of body weight per km. */
export function estimateCaloriesKcal(weightKg: number | null, distanceM: number): number | null {
  if (weightKg === null || !Number.isFinite(weightKg) || weightKg <= 0 || distanceM <= 0) return null
  return Math.round(weightKg * (distanceM / 1000))
}

// ---------------------------------------------------------------------------
// GPX export
// ---------------------------------------------------------------------------

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function runToGpx(args: { name: string; startedAtIso: string; route: RunRoutePoint[] }): string {
  const start = new Date(args.startedAtIso).getTime()
  const segs: RunRoutePoint[][] = []
  for (const p of args.route) {
    if (p[4] === 1 || segs.length === 0) segs.push([p])
    else segs[segs.length - 1].push(p)
  }
  const body = segs
    .map((seg) => {
      const pts = seg
        .map(([lat, lng, offsetS, alt]) => {
          const ele = alt === null ? '' : `<ele>${alt}</ele>`
          const time = new Date(start + offsetS * 1000).toISOString()
          return `      <trkpt lat="${lat}" lon="${lng}">${ele}<time>${time}</time></trkpt>`
        })
        .join('\n')
      return `    <trkseg>\n${pts}\n    </trkseg>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Shape" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xmlEscape(args.name)}</name><time>${new Date(start).toISOString()}</time></metadata>
  <trk>
    <name>${xmlEscape(args.name)}</name>
    <type>running</type>
${body}
  </trk>
</gpx>
`
}
