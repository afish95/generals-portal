'use client'

import { useRef, useState } from 'react'

export type Point = { x: string; y: number }

/**
 * Single-series line chart: 2px line, 8px markers, recessive grid, tap/hover readout.
 * One series only (the card title names it), so no legend.
 */
export default function LineChart({
  points,
  format = (v) => String(v),
  xLabel = (x) => x,
  height = 160,
  lowerIsBetter = false,
  color = '#1746b8',
}: {
  points: Point[]
  format?: (v: number) => string
  xLabel?: (x: string) => string
  height?: number
  lowerIsBetter?: boolean
  color?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const W = 320
  const H = height
  const pad = { l: 34, r: 10, t: 14, b: 22 }

  if (points.length === 0) return <p className="text-xs font-medium text-slate-500 py-6 text-center">No data yet.</p>

  const ys = points.map((p) => p.y)
  let min = Math.min(...ys)
  let max = Math.max(...ys)
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  min -= span * 0.1
  max += span * 0.1
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
  const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15]
  const best = lowerIsBetter ? Math.min(...ys) : Math.max(...ys)
  const bestIdx = ys.lastIndexOf(best)
  const shown = active ?? points.length - 1

  const pick = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const rel = ((clientX - r.left) / r.width) * W
    let nearest = 0
    let dist = Infinity
    points.forEach((_, i) => {
      const d = Math.abs(x(i) - rel)
      if (d < dist) {
        dist = d
        nearest = i
      }
    })
    setActive(nearest)
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-2xl font-black text-slate-900">{format(points[shown].y)}</span>
        <span className="text-[11px] font-bold text-slate-500">{xLabel(points[shown].x)}</span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ height: H }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label={`Trend from ${format(points[0].y)} to ${format(points[points.length - 1].y)}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontWeight={700}>
              {format(Number(t.toFixed(1)))}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} fontSize="9" fill="#94a3b8" fontWeight={700}>{xLabel(points[0].x)}</text>
        <text x={W - pad.r} y={H - 6} fontSize="9" fill="#94a3b8" fontWeight={700} textAnchor="end">{xLabel(points[points.length - 1].x)}</text>
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {active !== null && <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.y)}
            r={i === shown ? 5 : i === bestIdx ? 4.5 : 3}
            fill={i === bestIdx ? '#f59e0b' : color}
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 mt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Best</span>
        <span>Tap the chart to read any day</span>
      </div>
    </div>
  )
}
