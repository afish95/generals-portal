'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, round1 } from '@/lib/training'
import { ordinal, percentileRank, rankOf } from '@/lib/rank'
import { METRICS } from '@/components/stats/PositionLeaderboard'
import { METRIC_INFO, sidesFor } from '@/lib/trainingMetrics'
import { useDrillsOfWeek } from './useDrillsOfWeek'
import DrillOfWeekCard from './DrillOfWeekCard'

type Row = { athlete_id: string; metric: string; value: number }
type M = (typeof METRICS)['pitchers'][number]

const fmt = (m: M, v: number) => (m.lowerIsBetter && m.unit === 's' ? v.toFixed(2) : String(round1(v))) + m.unit
const barColor = (p: number) => (p >= 75 ? 'bg-red-500' : p >= 40 ? 'bg-slate-400' : 'bg-blue-500')

/** Slim percentile bars (toward the 99th) for every training stat the player tracks; tap for why it matters, how to improve and the Drill of the Week. */
export default function TrainingOverview({ athleteId, position }: { athleteId: string; position: string | null | undefined }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const dow = useDrillsOfWeek()

  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('position_leaderboard', { p_since: addDays(localDate(), -364) })
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

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="px-5 pt-4 pb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Training Ranks</span>
        <span className="text-[10px] font-bold text-slate-400">Team %ile · last 12 months</span>
      </div>
      {rows === null ? (
        <div className="h-40 m-4 rounded-2xl bg-slate-50 animate-pulse" />
      ) : (
        sections.map((sec) => (
          <div key={sec.side} className="pb-2">
            {sections.length > 1 && (
              <div className={`px-5 pt-2 text-[10px] font-extrabold uppercase tracking-wider ${sec.side === 'pitching' ? 'text-sky-700' : 'text-orange-600'}`}>
                {sec.side === 'pitching' ? 'Pitching' : 'Hitting'}
              </div>
            )}
            <ul>
              {sec.items.map(({ m, mine, pctl }) => {
                const k = m.key
                const isOpen = open === k
                const info = METRIC_INFO[k]
                const drill = dow.byMetric.get(k) || null
                return (
                  <li key={k} className="border-t border-slate-100 first:border-t-0">
                    <button type="button" onClick={() => setOpen(isOpen ? null : k)} className="w-full flex items-center gap-3 px-5 py-2 text-left cursor-pointer">
                      <span className="w-24 shrink-0 text-xs font-extrabold text-slate-800 truncate">{m.short}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        {pctl != null && <div className={`h-full rounded-full ${barColor(pctl)}`} style={{ width: `${Math.max(4, Math.min(99, pctl))}%` }} />}
                      </div>
                      <span className="w-14 shrink-0 text-right text-[11px] font-black text-slate-900">{mine ? fmt(m, mine.value) : '—'}</span>
                      <span className="w-9 shrink-0 text-right text-[10px] font-extrabold text-slate-500">{pctl != null ? ordinal(pctl) : ''}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-3 space-y-2">
                        {!mine && <p className="text-xs font-bold text-[#1746b8]">{m.howTo}</p>}
                        {info && (
                          <>
                            <p className="text-xs text-slate-600">
                              <span className="font-extrabold text-slate-900">Why it matters: </span>
                              {info.why}
                            </p>
                            <p className="text-xs text-slate-600">
                              <span className="font-extrabold text-slate-900">How to improve: </span>
                              {info.improve}
                            </p>
                          </>
                        )}
                        {drill ? <DrillOfWeekCard drill={drill} /> : dow.team ? <DrillOfWeekCard drill={dow.team} label="Team Drill of the Week" /> : null}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
