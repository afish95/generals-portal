'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Crosshair, Footprints, Gauge, MoveRight, Rocket, Target, Timer, TrendingUp, Zap, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, round1 } from '@/lib/training'
import { ordinal, percentileRank, rankOf } from '@/lib/rank'
import { METRICS } from '@/components/stats/PositionLeaderboard'
import { METRIC_INFO, sidesFor } from '@/lib/trainingMetrics'
import { useDrillsOfWeek } from './useDrillsOfWeek'
import DrillOfWeekCard from './DrillOfWeekCard'
import Trend from '@/components/Trend'
import { useStatTrends } from './useStatTrends'

type Row = { athlete_id: string; metric: string; value: number }
type M = (typeof METRICS)['pitchers'][number]

const ICONS: Record<string, LucideIcon> = {
  mound_velo: Gauge,
  pulldown_velo: Zap,
  long_toss: MoveRight,
  strike_pct: Target,
  ahead_pct: TrendingUp,
  miss_in: Crosshair,
  bat_speed: Activity,
  exit_velo: Rocket,
  time_to_first: Footprints,
  pos_velo: Zap,
  pop_time: Timer,
}
/** Green 70th+, yellow 40–69th, red under 40th. */
const toneFor = (p: number | null) =>
  p == null ? { text: 'text-white', pill: 'bg-white/10 text-white' } : p >= 70 ? { text: 'text-green-300', pill: 'bg-green-500 text-white' } : p >= 40 ? { text: 'text-yellow-300', pill: 'bg-yellow-400 text-slate-900' } : { text: 'text-red-300', pill: 'bg-red-500 text-white' }
const unitOf = (m: M) => ({ ' mph': 'MPH', '%': 'PCT', '"': 'IN', ' ft': 'FT', s: 'SEC' } as Record<string, string>)[m.unit] || m.unit.trim().toUpperCase()
const valueOf = (m: M, v: number) => (m.unit === 's' ? v.toFixed(2) : String(round1(v)))

/** Slim percentile bars (toward the 99th) for every training stat the player tracks; tap for why it matters, how to improve and the Drill of the Week. */
export default function TrainingOverview({ athleteId, position }: { athleteId: string; position: string | null | undefined }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const dow = useDrillsOfWeek()
  const trends = useStatTrends(athleteId)

  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('position_leaderboard', { p_since: '2000-01-01' })
      .then(({ data }) => !cancelled && setRows(((data as Row[]) || []).map((r) => ({ ...r, value: Number(r.value) }))))
    return () => {
      cancelled = true
    }
  }, [])

  const sections = useMemo(
    () =>
      sidesFor(position).map((side) => {
        const list = (side === 'pitching' ? METRICS.pitchers : METRICS.hitters).filter((m) => !m.catchersOnly || position === 'catcher')
        return {
          side,
          items: list.map((m) => {
            const board = (rows || []).filter((r) => r.metric === m.key)
            const mine = board.find((r) => r.athlete_id === athleteId)
            const pctl = mine ? percentileRank(rankOf(board.map((b) => b.value), mine.value, !m.lowerIsBetter), board.length) : null
            return { m, mine, pctl, n: board.length }
          }),
        }
      }),
    [rows, position, athleteId]
  )

  const pickInfo = (() => {
    for (const sec of sections) for (const it of sec.items) if (it.m.key === open) return it
    return null
  })()

  return (
    <section className="rounded-3xl bg-gradient-to-br from-[#0f2a6e] via-[#1746b8] to-[#1e54d4] shadow-md overflow-hidden text-white">
      <div className="px-4 pt-3.5 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-white/70">Training Ranks</div>
      {rows === null ? (
        <div className="h-24 m-4 rounded-2xl bg-white/10 animate-pulse" />
      ) : (
        sections.map((sec) => (
          <div key={sec.side} className="px-2 pb-2">
            {sections.length > 1 && (
              <div className="px-2 pb-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white/60">{sec.side === 'pitching' ? 'Pitching' : 'Hitting'}</div>
            )}
            <div className="grid" style={{ gridTemplateColumns: `repeat(${sec.items.length}, minmax(0, 1fr))` }}>
              {sec.items.map(({ m, mine, pctl }) => {
                const tone = toneFor(pctl)
                const sel = open === m.key
                const Icon = ICONS[m.key] || Gauge
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setOpen(sel ? null : m.key)}
                    className={`min-w-0 flex flex-col items-center py-1.5 rounded-xl cursor-pointer ${sel ? 'bg-white/15' : ''}`}
                  >
                    <Icon className="w-3.5 h-3.5 text-white/85 mb-0.5" />
                    <span className="text-[8.5px] font-extrabold uppercase tracking-tight text-white/80 text-center leading-tight h-[1.35rem] flex items-center">{m.short}</span>
                    <span className={`text-lg font-black leading-none mt-0.5 ${mine ? tone.text : 'text-white/30'}`}>{mine ? valueOf(m, mine.value) : '—'}</span>
                    <span className="text-[8px] font-bold uppercase text-white/60">{unitOf(m)}</span>
                    <span className="h-3 flex items-center text-[9px]">
                      {trends.get(m.key)?.isPR ? (
                        <span className="px-1 rounded bg-amber-400 text-[8px] font-black text-slate-900">PR</span>
                      ) : (
                        <Trend delta={trends.get(m.key)?.delta} lowerIsBetter={m.lowerIsBetter} digits={m.unit === 's' ? 2 : 1} dark />
                      )}
                    </span>
                    <span className={`mt-1 px-1.5 py-px rounded-full text-[9px] font-black ${mine ? tone.pill : 'bg-white/10 text-white/50'}`}>{pctl != null ? ordinal(pctl) : '—'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))
      )}
      {pickInfo && (
        <div className="mx-3 mb-3 rounded-2xl bg-white text-slate-900 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-900">{pickInfo.m.label}</span>
            <button type="button" onClick={() => setOpen(null)} className="text-[11px] font-extrabold text-slate-400 cursor-pointer">Close</button>
          </div>
          {!pickInfo.mine && <p className="text-xs font-bold text-[#1746b8]">{pickInfo.m.howTo}</p>}
          {METRIC_INFO[pickInfo.m.key] && (
            <>
              <p className="text-xs text-slate-600">
                <span className="font-extrabold text-slate-900">Why it matters: </span>
                {METRIC_INFO[pickInfo.m.key].why}
              </p>
              <p className="text-xs text-slate-600">
                <span className="font-extrabold text-slate-900">How to improve: </span>
                {METRIC_INFO[pickInfo.m.key].improve}
              </p>
            </>
          )}
          {dow.byMetric.get(pickInfo.m.key) ? (
            <DrillOfWeekCard drill={dow.byMetric.get(pickInfo.m.key)!} />
          ) : dow.team ? (
            <DrillOfWeekCard drill={dow.team} label="Team Drill of the Week" />
          ) : null}
        </div>
      )}
      <div className="px-4 pb-2.5 text-center text-[9px] font-bold text-white/55">Team percentile · all time · tap a stat for tips</div>
    </section>
  )
}
