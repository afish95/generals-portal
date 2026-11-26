'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, round1 } from '@/lib/training'
import { percentileRank, rankOf } from '@/lib/rank'
import { METRICS } from '@/components/stats/PositionLeaderboard'
import { sidesFor } from '@/lib/trainingMetrics'
import Trend from '@/components/Trend'
import { useStatTrends } from './useStatTrends'

type Row = { athlete_id: string; full_name: string; metric: string; value: number }
type Side = 'pitching' | 'hitting'
type M = (typeof METRICS)['pitchers'][number]

const PERIODS = [
  { key: '90', label: '90 Days', days: 90 },
  { key: '365', label: '12 Months', days: 365 },
  { key: 'all', label: 'All Time', days: 0 },
] as const

/** Savant-style colour: blue (poor) → grey (average) → red (great) */
function heat(p: number) {
  const lerp = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t))
  const c = p <= 50 ? lerp([50, 90, 175], [178, 186, 196], p / 50) : lerp([178, 186, 196], [214, 39, 40], (p - 50) / 50)
  return `rgb(${c.join(',')})`
}
const fmt = (m: M, v: number) => (m.unit === 's' ? v.toFixed(2) : String(round1(v))) + m.unit

/** Training-stat percentile bars and spider chart (team percentile from training logs), with Compare. */
export default function TrainingPercentiles({ myId, position }: { myId: string; position: string | null | undefined }) {
  const sides = sidesFor(position)
  const [side, setSide] = useState<Side>(sides[0])
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('365')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [compare, setCompare] = useState<string>('')
  const trends = useStatTrends(myId)

  useEffect(() => {
    let cancelled = false
    const d = PERIODS.find((p) => p.key === period)!.days
    createClient()
      .rpc('position_leaderboard', { p_since: d ? addDays(localDate(), -(d - 1)) : '2000-01-01' })
      .then(({ data }) => !cancelled && setRows(((data as Row[]) || []).map((r) => ({ ...r, value: Number(r.value) }))))
    return () => {
      cancelled = true
    }
  }, [period])

  const metrics = (side === 'pitching' ? METRICS.pitchers : METRICS.hitters).filter((m) => !m.catchersOnly || position === 'catcher')
  const pctlFor = (who: string, m: M) => {
    const board = (rows || []).filter((r) => r.metric === m.key)
    const mine = board.find((r) => r.athlete_id === who)
    if (!mine) return { value: null as number | null, pctl: null as number | null }
    return { value: mine.value, pctl: percentileRank(rankOf(board.map((b) => b.value), mine.value, !m.lowerIsBetter), board.length) }
  }
  const teammates = useMemo(() => {
    const keys = new Set(metrics.map((m) => m.key))
    const map = new Map<string, string>()
    for (const r of rows || []) if (keys.has(r.metric) && r.athlete_id !== myId) map.set(r.athlete_id, r.full_name)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows, metrics, myId])

  const mine = metrics.map((m) => pctlFor(myId, m))
  const other = compare ? metrics.map((m) => pctlFor(compare, m)) : null

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Training Percentiles</span>
        {sides.length > 1 && (
          <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100">
            {sides.map((s) => (
              <button key={s} type="button" onClick={() => { setSide(s); setCompare('') }} className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold cursor-pointer ${side === s ? 'bg-white shadow-sm text-[#1746b8]' : 'text-slate-500'}`}>
                {s === 'pitching' ? 'Pitching' : 'Hitting'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" onClick={() => setPeriod(p.key)} className={`py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer ${period === p.key ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="h-56 rounded-2xl bg-slate-50 animate-pulse" />
      ) : (
        <>
          <div className="space-y-2">
            <div className="grid grid-cols-3 text-[10px] font-extrabold">
              <span className="text-[#325aaf]">▼ POOR</span>
              <span className="text-center text-slate-400">AVERAGE</span>
              <span className="text-right text-[#d62728]">GREAT ▼</span>
            </div>
            {metrics.map((m, i) => {
              const v = mine[i]
              return (
                <div key={m.key} className="grid grid-cols-[88px_minmax(0,1fr)_64px] items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600 text-right truncate">{m.label.replace(' (Catchers)', '')}</span>
                  <div className="relative h-5">
                    <div className="absolute inset-y-1.5 inset-x-0 rounded-full bg-slate-100" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                    {v.pctl != null && (
                      <>
                        <div className="absolute inset-y-0.5 left-0 rounded-l-md" style={{ width: `${v.pctl}%`, background: heat(v.pctl) }} />
                        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-white text-[10px] font-black text-white flex items-center justify-center shadow" style={{ left: `${Math.max(v.pctl, 6)}%`, background: heat(v.pctl) }}>
                          {v.pctl}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-xs font-bold text-slate-900 tabular-nums leading-tight">
                    {v.value != null ? fmt(m, v.value) : '—'}
                    <span className="block text-[10px]">
                      <Trend delta={trends.get(m.key)?.delta} lowerIsBetter={m.lowerIsBetter} digits={m.unit === 's' ? 2 : 1} />
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Spider Chart</span>
              <select value={compare} onChange={(e) => setCompare(e.target.value)} className="max-w-[55%] px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700">
                <option value="">Compare With…</option>
                {teammates.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <Spider labels={metrics.map((m) => m.short)} values={mine.map((v) => v.pctl)} compare={other?.map((v) => v.pctl)} compareName={teammates.find(([id]) => id === compare)?.[1]} />
          </div>
        </>
      )}
    </section>
  )
}

function Spider({ labels, values, compare, compareName }: { labels: string[]; values: (number | null)[]; compare?: (number | null)[]; compareName?: string }) {
  const size = 300
  const c = size / 2
  const R = 100
  const n = labels.length
  const pt = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [c + Math.cos(ang) * r, c + Math.sin(ang) * r]
  }
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, ((v ?? 0) / 100) * R).join(',')).join(' ')
  const series = [values, compare].filter(Boolean) as (number | null)[][]
  const colors = ['#1746b8', '#f59e0b']
  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[320px] mx-auto" role="img" aria-label="Training spider chart">
        {[25, 50, 75, 100].map((r) => (
          <polygon key={r} points={labels.map((_, i) => pt(i, (r / 100) * R).join(',')).join(' ')} fill="none" stroke={r === 50 ? '#94a3b8' : '#e2e8f0'} strokeDasharray={r === 50 ? '4 3' : undefined} />
        ))}
        {labels.map((_, i) => {
          const [x, y] = pt(i, R)
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#e2e8f0" />
        })}
        {series.map((s, si) => (
          <g key={si}>
            <polygon points={poly(s)} fill={colors[si]} fillOpacity={0.18} stroke={colors[si]} strokeWidth={2} />
            {s.map((v, i) => {
              const [x, y] = pt(i, ((v ?? 0) / 100) * R)
              return <circle key={i} cx={x} cy={y} r={4} fill={colors[si]} stroke="#fff" strokeWidth={1.5} />
            })}
          </g>
        ))}
        {labels.map((l, i) => {
          const [x, y] = pt(i, R + 24)
          return (
            <g key={l}>
              <text x={x} y={y - 3} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0f172a">{l}</text>
              <text x={x} y={y + 10} textAnchor="middle" fontSize="10" fill="#64748b">{values[i] != null ? values[i] : '—'}</text>
            </g>
          )
        })}
      </svg>
      <div className="flex justify-center gap-4 text-[11px] font-bold mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1746b8]" />You</span>
        {compare && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500" />{compareName}</span>}
        <span className="flex items-center gap-1.5 text-slate-400"><span className="w-3 border-t-2 border-dashed border-slate-400" />Team Middle</span>
      </div>
      <p className="text-[10px] font-semibold text-slate-400 text-center mt-1">Further out = higher team percentile. Times and miss distance are flipped, so lower reaches further out.</p>
    </div>
  )
}
