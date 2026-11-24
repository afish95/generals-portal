'use client'

import { ArrowRight, X } from 'lucide-react'
import { LEVEL_LABEL, curve, fmtBench, percentile, typical, valueAt, xRange, type BenchMetric, type Level } from '@/lib/benchmarks'

const W = 320
const H = 120
const PAD = 12
const GRAY = '#64748b'
const BLUE = '#1746b8'
const YOU = '#059669'

const pctColor = (p: number) => (p >= 75 ? 'text-emerald-600' : p >= 50 ? 'text-[#1746b8]' : p >= 25 ? 'text-amber-600' : 'text-rose-600')
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`

function Chart({ m, levels, value, colors, showAvg }: { m: BenchMetric; levels: Level[]; value: number | null; colors: string[]; showAvg?: boolean }) {
  const [x0, x1] = xRange(m, levels, [value])
  const series = levels.map((l) => curve(m, l, x0, x1))
  const yMax = Math.max(...series.flat().map((p) => p[1]), 1e-9)
  const sx = (x: number) => PAD + ((x - x0) / (x1 - x0)) * (W - 2 * PAD)
  const sy = (y: number) => H - 18 - (y / yMax) * (H - 40)
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')
  // Shade the part of the first curve the player is better than
  const shade = (pts: [number, number][]) => {
    if (value == null) return ''
    const keep = pts.filter((p) => (m.lowerIsBetter ? p[0] >= value : p[0] <= value))
    if (!keep.length) return ''
    const a = keep[0][0]
    const b = keep[keep.length - 1][0]
    return `M${sx(a)},${sy(0)} ${keep.map((p) => `L${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')} L${sx(b)},${sy(0)} Z`
  }
  const ticks = levels.length === 1 ? [valueAt(m, levels[0], 16), typical(m, levels[0]), valueAt(m, levels[0], 84)] : []
  const label = (v: number | null) => (v == null ? '' : m.decimals === 3 ? v.toFixed(3).replace(/^0/, '') : Math.round(v).toString())
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${m.label} distribution`}>
      <line x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} stroke="#e2e8f0" />
      {series.map((pts, i) => (
        <g key={i}>
          {(levels.length > 1 || i === 0) && <path d={levels.length > 1 ? `${path(pts)} L${sx(x1)},${sy(0)} L${sx(x0)},${sy(0)} Z` : shade(pts)} fill={colors[i]} opacity={levels.length > 1 ? 0.12 : 0.15} />}
          <path d={path(pts)} fill="none" stroke={colors[i]} strokeWidth="2" />
          {showAvg && (
            <>
              <line x1={sx(typical(m, levels[i])!)} x2={sx(typical(m, levels[i])!)} y1={sy(0)} y2={22} stroke={colors[i]} strokeDasharray="3 3" />
              <text x={sx(typical(m, levels[i])!)} y={14 + i * 9} textAnchor="middle" fontSize="8" fontWeight="700" fill={colors[i]}>
                AVG {label(typical(m, levels[i]))}
              </text>
            </>
          )}
        </g>
      ))}
      {ticks.map((t, i) =>
        t == null ? null : (
          <text key={i} x={sx(t)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {label(t)}
          </text>
        )
      )}
      {levels.length > 1 &&
        [0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={sx(x0 + f * (x1 - x0))} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {label(x0 + f * (x1 - x0))}
          </text>
        ))}
      {value != null && levels.length === 1 && (
        <>
          <line x1={sx(value)} x2={sx(value)} y1={sy(0)} y2={20} stroke={YOU} strokeWidth="2.5" />
          <text x={sx(value)} y={14} textAnchor="middle" fontSize="10" fontWeight="800" fill={YOU}>
            you {label(value)}
          </text>
        </>
      )}
    </svg>
  )
}

/** Full breakdown of one stat: where the player sits at each level, and how levels line up. */
export default function BenchmarkDetail({ m, value, mine, vs, section, onClose }: { m: BenchMetric; value: number | null; mine: Level; vs: Level; section: string; onClose: () => void }) {
  const levels: Level[] = vs === mine || m.levels[vs] === m.levels[mine] ? [mine] : [mine, vs]
  const name = m.label.toLowerCase()
  return (
    <div className="fixed inset-0 lg:left-[220px] z-50 bg-[#0b1f55]/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#1746b8]">{section}</div>
            <h2 className="text-2xl font-black text-slate-900 leading-tight">{m.label}</h2>
            <div className="text-sm font-bold text-slate-500">
              You <span className="text-xl font-black text-[#1746b8]">{fmtBench(m, value)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {levels.map((l, i) => {
            const p = percentile(m, l, value)
            return (
              <div key={l} className="rounded-2xl border border-slate-200 p-4">
                <div className={`text-sm font-extrabold ${i ? 'text-[#1746b8]' : 'text-slate-600'}`}>{LEVEL_LABEL[l]}{m.levels[l]?.source === 'generals' ? ' (Generals Spring Varsity)' : m.levels[l]?.source === 'coach' ? ' (Coach benchmark)' : ''}</div>
                <Chart m={m} levels={[l]} value={value} colors={[i ? BLUE : GRAY]} />
                <div className={`text-center text-2xl font-black ${p == null ? 'text-slate-400' : pctColor(p)}`}>{p == null ? 'No data yet' : `${ord(p)} percentile`}</div>
              </div>
            )
          })}

          {levels.length > 1 && (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-500">Where {LEVEL_LABEL[mine]} percentiles land at {LEVEL_LABEL[vs]}</div>
              <div className="flex gap-4 text-xs font-extrabold">
                <span className="text-slate-600">— {LEVEL_LABEL[mine]}</span>
                <span className="text-[#1746b8]">— {LEVEL_LABEL[vs]}</span>
              </div>
              <Chart m={m} levels={levels} value={null} colors={[GRAY, BLUE]} showAvg />
              <div className="divide-y divide-slate-100">
                {[25, 50, 75].map((p) => {
                  const v = valueAt(m, mine, p)
                  const at = percentile(m, vs, v)
                  return (
                    <div key={p} className="flex gap-3 py-2 text-xs">
                      <span className="w-10 font-extrabold text-slate-400 uppercase">{ord(p)}</span>
                      <span className="text-slate-700">
                        <b>{fmtBench(m, v)}</b> {name} is a <b className="text-[#1746b8]">{at == null ? '–' : ord(at)} percentile {LEVEL_LABEL[vs]}</b> {name}.
                      </span>
                    </div>
                  )
                })}
              </div>
              {(() => {
                const need = percentile(m, mine, typical(m, vs))
                return (
                  <p className="flex gap-2 text-xs text-slate-700 bg-blue-50 rounded-xl p-3">
                    <ArrowRight className="w-4 h-4 text-[#1746b8] shrink-0" />
                    <span>
                      To be an average (50th percentile) <b>{LEVEL_LABEL[vs]}</b> {name}, you need to be about a <b className="text-[#1746b8]">{need == null ? '–' : ord(need)} percentile {LEVEL_LABEL[mine]}</b> ({fmtBench(m, typical(m, vs))}).
                    </span>
                  </p>
                )
              })()}
            </div>
          )}

          {m.why && (
            <div className="border-l-4 border-[#1746b8] pl-4 py-1">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#1746b8]">Why it matters</div>
              <p className="text-sm font-medium text-slate-700 mt-1">{m.why}</p>
            </div>
          )}
          {value == null && <p className="text-xs font-semibold text-slate-500">No number yet. {m.howTo}</p>}
        </div>
      </div>
    </div>
  )
}
