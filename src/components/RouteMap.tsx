import type { RunRoutePoint } from '@/types/database'

const W = 300
const H = 200
const PAD = 18

/**
 * Draws a run's track as an SVG line: no map tiles, so it works offline and sends no location
 * to a third-party tile server. Each segment (a pause or GPS gap starts a new one) is its own line.
 */
export default function RouteMap({ route, label }: { route: RunRoutePoint[]; label: string }) {
  if (route.length < 2) return null

  const lats = route.map((p) => p[0])
  const lngs = route.map((p) => p[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180))
  const spanX = Math.max((maxLng - minLng) * kx, 1e-5)
  const spanY = Math.max(maxLat - minLat, 1e-5)
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY)
  const offX = (W - spanX * scale) / 2
  const offY = (H - spanY * scale) / 2
  const project = (p: RunRoutePoint): [number, number] => [
    offX + (p[1] - minLng) * kx * scale,
    offY + (maxLat - p[0]) * scale,
  ]

  const segments: RunRoutePoint[][] = []
  for (const p of route) {
    if (p[4] === 1 || segments.length === 0) segments.push([p])
    else segments[segments.length - 1].push(p)
  }

  const [sx, sy] = project(route[0])
  const [ex, ey] = project(route[route.length - 1])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className="w-full rounded-2xl border border-slate-800 bg-slate-900/60"
    >
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => project(p).join(',')).join(' ')}
          fill="none"
          stroke="#48c78a"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <circle cx={sx} cy={sy} r={5} fill="#48c78a" stroke="#020617" strokeWidth={2} />
      <circle cx={ex} cy={ey} r={5} fill="#f87171" stroke="#020617" strokeWidth={2} />
    </svg>
  )
}
