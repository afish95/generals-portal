'use client'

import type { GcLine, SeasonType } from '@/lib/gcStats'
import { TYPE_LABEL, TYPE_ORDER } from './useGcData'

export type Period = 'all' | number

/** Team (Spring varsity / Summer / JV) chips plus a season menu with "All-time". */
export default function SeasonFilter({
  lines,
  type,
  period,
  onType,
  onPeriod,
}: {
  lines: GcLine[]
  type: SeasonType
  period: Period
  onType: (t: SeasonType) => void
  onPeriod: (p: Period) => void
}) {
  const types = TYPE_ORDER.filter((t) => lines.some((l) => l.season_type === t))
  const years = [...new Set(lines.filter((l) => l.season_type === type).map((l) => l.season_year))].sort((a, b) => b - a)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex p-1 rounded-xl bg-white border border-slate-200">
        {types.map((t) => (
          <button key={t} type="button" onClick={() => onType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer whitespace-nowrap ${type === t ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <select
        value={period === 'all' ? 'all' : String(period)}
        onChange={(e) => onPeriod(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-900"
        aria-label="Season"
      >
        <option value="all">All-time ({years.length} seasons)</option>
        {years.map((y) => (
          <option key={y} value={y}>{y} {type}</option>
        ))}
      </select>
    </div>
  )
}
