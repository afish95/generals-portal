'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import LineChart, { type Point } from '@/components/charts/LineChart'
import { addDays, localDate, prettyDate, round1, type Exercise } from '@/lib/training'
import { normalizePoints, pct } from '@/lib/points'
import { weekStart } from '@/components/stats/WeeklyRecap'

const RANGES = [
  { key: '30', label: '30 Days', days: 30 },
  { key: '90', label: '90 Days', days: 90 },
  { key: '365', label: '12 Months', days: 365 },
  { key: 'all', label: 'All Time', days: 0 },
] as const
type RangeKey = (typeof RANGES)[number]['key']

type Series = { key: string; label: string; points: Point[]; unit: string; lowerIsBetter?: boolean; byWeek?: boolean }

export default function ProgressTrends({ athleteId }: { athleteId: string }) {
  const [series, setSeries] = useState<Series[] | null>(null)
  const [selected, setSelected] = useState('points')
  const [range, setRange] = useState<RangeKey>('90')

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const today = localDate()
    const days = RANGES.find((r) => r.key === range)!.days
    const since = days ? addDays(today, -(days - 1)) : '2024-01-01'
    // Points are only tracked since the app started; cap the daily calculation at a year.
    const pointsFrom = days && days <= 365 ? weekStart(since) : addDays(weekStart(today), -364)
    Promise.all([
      supabase.rpc('athlete_points', { p_athlete: athleteId, p_from: pointsFrom, p_to: today }),
      supabase.from('daily_checkins').select('check_date, readiness').eq('athlete_id', athleteId).gte('check_date', since).order('check_date'),
      supabase.rpc('drill_trends', { p_athlete: athleteId, p_since: days ? since : '2000-01-01' }),
      supabase.from('exercises').select('*'),
    ]).then(([dp, ci, dt, ex]) => {
      if (cancelled) return
      // Daily points, as a weekly % (8 weeks)
      const mine = normalizePoints(dp.data).filter((r) => r.athlete_id === athleteId)
      const weeks = new Map<string, { e: number; a: number }>()
      for (const r of mine) {
        const w = weekStart(r.d)
        const cur = weeks.get(w) || { e: 0, a: 0 }
        weeks.set(w, { e: cur.e + r.earned, a: cur.a + r.available })
      }
      const out: Series[] = [
        {
          key: 'points',
          label: 'Daily Points',
          unit: '%',
          byWeek: true,
          points: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([w, v]) => ({ x: w, y: pct(v.e, v.a) })),
        },
        {
          key: 'readiness',
          label: 'Readiness',
          unit: '',
          points: ((ci.data as { check_date: string; readiness: number }[]) || []).filter((r) => r.readiness != null).map((r) => ({ x: r.check_date, y: Number(r.readiness) })),
        },
      ]
      // One series per drill that has data, most-logged first
      const exMap = new Map(((ex.data as Exercise[]) || []).map((e) => [e.id, e]))
      const byEx = new Map<number, Point[]>()
      for (const r of (dt.data as { exercise_id: number; d: string; best: number }[]) || []) {
        const list = byEx.get(r.exercise_id) || []
        list.push({ x: String(r.d), y: Number(r.best) })
        byEx.set(r.exercise_id, list)
      }
      ;[...byEx.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([id, pts]) => {
          const e = exMap.get(id)
          if (!e) return
          out.push({ key: `ex${id}`, label: e.name, points: pts, unit: e.tracking === 'accuracy' ? '%' : ` ${e.unit ?? ''}`, lowerIsBetter: e.tracking === 'time' })
        })
      setSeries(out)
    })
    return () => {
      cancelled = true
    }
  }, [athleteId, range])

  const current = useMemo(() => series?.find((s) => s.key === selected) ?? series?.[0], [series, selected])

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Progress &amp; Trends</div>
      </div>
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100">
        {RANGES.map((r) => (
          <button key={r.key} type="button" onClick={() => setRange(r.key)} className={`py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer ${range === r.key ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
            {r.label}
          </button>
        ))}
      </div>
      {!series ? (
        <div className="h-48 animate-pulse bg-slate-50 rounded-2xl" />
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {series.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSelected(s.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap cursor-pointer ${current?.key === s.key ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {current && (
            <div>
              <div className="text-sm font-extrabold text-slate-900 mb-1">
                {current.label}
                <span className="text-[11px] font-bold text-slate-400 ml-1.5">
                  {current.byWeek ? 'weekly % of points earned' : current.key === 'readiness' ? 'daily score' : 'best per session'}
                </span>
              </div>
              <LineChart
                points={current.points}
                lowerIsBetter={current.lowerIsBetter}
                format={(v) => `${round1(v)}${current.unit}`}
                xLabel={(x) => (current.byWeek ? `Wk of ${prettyDate(x, { month: 'short', day: 'numeric' })}` : prettyDate(x, { month: 'short', day: 'numeric' }))}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}
