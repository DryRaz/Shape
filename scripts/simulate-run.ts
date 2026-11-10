// Regression harness for the run-tracking engine (src/lib/running).
//
//   npm run run:simulate
//
// It feeds the real RunTracker a synthetic GPS stream (autocorrelated noise, glitches, pauses,
// gaps) along known paths and prints measured vs true distance. The filter constants in
// geo.ts (PositionSmoother accel noise) and RunTracker.ts (MAX_ACCURACY_M, STEP_ACCURACY_FACTOR,
// MAX_SPEED_MS, GAP_MS) trade noise inflation against corner cutting: run this before and after
// touching them. It validates the logic, not real-world GPS — calibrate on a known distance
// (a 400 m track lap) before trusting absolute numbers.

import { RunTracker, type PositionFix, type PositionSource } from '../src/lib/running/RunTracker'
import { formatDuration, formatPace } from '../src/lib/running/geo'

let seed = 987654
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const gauss = () => {
  let u = 0
  let v = 0
  while (!u) u = rnd()
  while (!v) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const lat0 = -1.0
const lng0 = 34.8
const mLat = 110540
const mLng = Math.cos((lat0 * Math.PI) / 180) * 111320

type PathKind = 'arc' | 'square' | 'switchback'
let PATH: PathKind = 'arc'

function posAt(s: number) {
  if (PATH === 'square') {
    const side = 100
    const m = s % (side * 4)
    const k = Math.floor(m / side)
    const f = m - k * side
    const pts = [[f, 0], [side, f], [side - f, side], [0, side - f]][k]
    return { lat: lat0 + pts[1] / mLat, lng: lng0 + pts[0] / mLng }
  }
  if (PATH === 'switchback') {
    const seg = 60
    const k = Math.floor(s / seg)
    const f = k % 2 === 0 ? s % seg : seg - (s % seg)
    return { lat: lat0 + (Math.floor(k / 2) * 8) / mLat, lng: lng0 + f / mLng }
  }
  const R = 2000
  const a = s / R
  return { lat: lat0 + (R * (1 - Math.cos(a))) / mLat, lng: lng0 + (R * Math.sin(a)) / mLng }
}

function makeWorld() {
  let clock = 1_800_000_000_000
  let cb: ((f: PositionFix) => void) | null = null
  const src: PositionSource = {
    start: (f) => {
      cb = f
    },
    stop: () => {
      cb = null
    },
  }
  const tracker = new RunTracker(src, () => clock, null)
  let s = 0
  let trueMoved = 0
  let ex = 0
  let ey = 0
  function step(sec: number, o: { fix?: boolean; moving?: boolean; acc?: number; speed?: number; glitchAt?: number } = {}) {
    const { fix = true, moving = true, acc = 8, speed = 3 } = o
    for (let i = 0; i < sec; i++) {
      clock += 1000
      if (moving) {
        s += speed
        trueMoved += speed
      }
      if (fix && cb) {
        const sigma = acc / 2.5
        ex = 0.9 * ex + Math.sqrt(0.19) * gauss() * sigma
        ey = 0.9 * ey + Math.sqrt(0.19) * gauss() * sigma
        const p = posAt(s)
        const f: PositionFix = {
          lat: p.lat + ey / mLat,
          lng: p.lng + ex / mLng,
          accuracy: acc + rnd() * 4,
          altitude: 1500 + gauss() * 2,
          timestamp: clock,
        }
        if (o.glitchAt === i) f.lat += 300 / mLat
        cb(f)
      }
    }
  }
  return { tracker, step, truth: () => trueMoved }
}

const rows: [string, number, number, string][] = []
function section(title: string) {
  rows.push([title, NaN, NaN, ''])
}
function report(name: string, measured: number, truth: number, extra = '') {
  rows.push([name, Math.round(measured), Math.round(truth), `${(((measured - truth) / truth) * 100).toFixed(1)}% ${extra}`])
}

function runCase(name: string, path: PathKind, speed: number, seconds: number, acc = 8) {
  PATH = path
  const w = makeWorld()
  w.tracker.startGps()
  w.tracker.start()
  w.step(seconds, { speed, acc })
  const r = w.tracker.finish()!
  report(name, r.distanceM, w.truth(), `pace ${formatPace(r.durationS / (r.distanceM / 1000))}`)
}

section('— Accuracy by speed and shape (running speeds: within ~±3 %; weak signal or walking: up to ~6 %) —')
runCase('walk 1.4 m/s', 'arc', 1.4, 1500)
runCase('jog 2.2 m/s', 'arc', 2.2, 1000)
runCase('run 3 m/s', 'arc', 3, 700)
runCase('fast 5 m/s', 'arc', 5, 420)
runCase('sprint 7 m/s', 'arc', 7, 300)
runCase('run 3 m/s noisy GPS (±14 m)', 'arc', 3, 700, 14)
runCase('3 m/s, 100 m city blocks', 'square', 3, 700)
runCase('5 m/s, 100 m city blocks', 'square', 5, 420)
runCase('3 m/s, 60 m hairpins', 'switchback', 3, 700)

section('— Failure modes —')
PATH = 'arc'
{
  const w = makeWorld()
  w.tracker.startGps()
  w.tracker.start()
  w.step(120, { moving: false })
  const r = w.tracker.finish()!
  rows.push(['standing still 120 s', Math.round(r.distanceM), 0, '(absolute metres; want < ~25)'])
}
{
  const w = makeWorld()
  w.tracker.startGps()
  w.tracker.start()
  w.step(300)
  w.step(300, { acc: 35 })
  w.step(300)
  const r = w.tracker.finish()!
  report('300 s of unusable accuracy', r.distanceM, w.truth(), `gap flagged ${r.gpsGapS}s (want ~300)`)
}
{
  const w = makeWorld()
  w.tracker.startGps()
  w.tracker.start()
  w.step(300)
  w.tracker.pause()
  w.step(60, { moving: false })
  w.tracker.resume()
  w.step(300)
  const r = w.tracker.finish()!
  report('pause 60 s then resume', r.distanceM, w.truth(), `duration ${formatDuration(r.durationS)} (want 10:00)`)
}
{
  const w = makeWorld()
  w.tracker.startGps()
  w.tracker.start()
  w.step(300)
  w.step(60, { fix: false })
  w.step(300)
  const r = w.tracker.finish()!
  report('screen locked 60 s mid-run', r.distanceM, w.truth(), `gap flagged ${r.gpsGapS}s, segments ${r.route.filter((p) => p[4] === 1).length}`)
}
{
  const w = makeWorld()
  w.tracker.startGps()
  w.tracker.start()
  w.step(300)
  w.step(1, { glitchAt: 0 })
  w.step(300)
  const r = w.tracker.finish()!
  report('one 300 m GPS teleport', r.distanceM, w.truth())
}
{
  const w = makeWorld()
  w.tracker.startGps()
  w.tracker.start()
  w.step(200)
  w.tracker.pause()
  w.step(20, { moving: false })
  w.tracker.resume()
  w.step(45, { fix: false })
  w.step(200)
  const r = w.tracker.finish()!
  report('lock right after resume', r.distanceM, w.truth(), `gap flagged ${r.gpsGapS}s (~135 m is unrecoverable)`)
}

for (const [n, m, t, e] of rows) {
  if (Number.isNaN(m)) console.log(`\n${n}`)
  else console.log(n.padEnd(32), 'measured', String(m).padStart(5), ' true', String(t).padStart(5), '  err', e)
}
