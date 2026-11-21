'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, round1 } from '@/lib/training'
import { seasonStart } from '@/lib/points'
import { ordinal, percentileRank, rankOf } from '@/lib/rank'

type Group = 'pitchers' | 'hitters'
type Metric = { key: string; label: string; short: string; unit: string; lowerIsBetter?: boolean; howTo: string; catchersOnly?: boolean }
type Row = { athlete_id: string; full_name: string; position_group: string | null; metric: string; value: number; sample: number }

export const METRICS: Record<Group, Metric[]> = {
  pitchers: [
    { key: 'mound_velo', label: 'Mound velo', short: 'Mound', unit: ' mph', howTo: 'Log Mound Velo or a bullpen with velo.' },
    { key: 'pulldown_velo', label: 'Pulldown velo', short: 'Pulldown', unit: ' mph', howTo: 'Log Pulldown Throws.' },
    { key: 'long_toss', label: 'Long toss distance', short: 'Long toss', unit: ' ft', howTo: 'Log Long Toss.' },
    { key: 'strike_pct', label: 'Strike %', short: 'Strike %', unit: '%', howTo: 'Throw a tracked bullpen (10+ pitches).' },
    { key: 'ahead_pct', label: 'Ahead %', short: 'Ahead %', unit: '%', howTo: 'Log Ahead in Count after live ABs or a sim game.' },
    { key: 'miss_in', label: 'Avg. miss distance', short: 'Avg miss', unit: '"', lowerIsBetter: true, howTo: 'Track intended zones in a bullpen (10+ pitches).' },
  ],
  hitters: [
    { key: 'bat_speed', label: 'Bat speed', short: 'Bat speed', unit: ' mph', howTo: 'Log Bat Speed.' },
    { key: 'exit_velo', label: 'Exit velo', short: 'Exit velo', unit: ' mph', howTo: 'Log Exit Velo (tee or front toss).' },
    { key: 'time_to_first', label: 'Home to 1st', short: 'Home-1st', unit: 's', lowerIsBetter: true, howTo: 'Log Home to 1st.' },
    { key: 'pos_velo', label: 'Positional velo', short: 'Pos. velo', unit: ' mph', howTo: 'Log Positional Throw Velo.' },
    { key: 'pop_time', label: 'Pop time (catchers)', short: 'Pop time', unit: 's', lowerIsBetter: true, howTo: 'Catchers: log Pop Time.', catchersOnly: true },
  ],
}

const fmt = (m: Metric, v: number) => (m.lowerIsBetter && m.unit === 's' ? v.toFixed(2) : String(round1(v))) + m.unit

export default function PositionLeaderboard({ myId, myPosition }: { myId: string; myPosition?: string | null }) {
  const [group, setGroup] = useState<Group>(myPosition && myPosition !== 'pitcher' ? 'hitters' : 'pitchers')
  const [period, setPeriod] = useState<'30d' | 'season'>('season')
  const [metricKey, setMetricKey] = useState<string>(METRICS[group][0].key)
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const today = localDate()
    createClient()
      .rpc('position_leaderboard', { p_since: period === '30d' ? addDays(today, -29) : seasonStart(today) })
      .then(({ data }) => {
        if (cancelled) return
        setRows(((data as Row[]) || []).map((r) => ({ ...r, value: Number(r.value), sample: Number(r.sample) })))
      })
    return () => {
      cancelled = true
    }
  }, [period])

  const metrics = METRICS[group]
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0]

  const boards = useMemo(() => {
    const out = new Map<string, Row[]>()
    for (const m of METRICS[group]) {
      const list = (rows || []).filter((r) => r.metric === m.key)
      list.sort((a, b) => (m.lowerIsBetter ? a.value - b.value : b.value - a.value) || a.full_name.localeCompare(b.full_name))
      out.set(m.key, list)
    }
    return out
  }, [rows, group])

  const myRanks = METRICS[group]
    .filter((m) => !m.catchersOnly || myPosition === 'catcher')
    .map((m) => {
      const list = boards.get(m.key) || []
      const mine = list.find((r) => r.athlete_id === myId)
      if (!mine) return { m, mine: null as Row | null, rank: 0, n: list.length, pctl: 0 }
      const rank = rankOf(list.map((r) => r.value), mine.value, !m.lowerIsBetter)
      return { m, mine, rank, n: list.length, pctl: percentileRank(rank, list.length) }
    })

  const board = boards.get(metric.key) || []
  const medal = ['🥇', '🥈', '🥉']

  const switchGroup = (g: Group) => {
    setGroup(g)
    setMetricKey(METRICS[g][0].key)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100">
        {(['pitchers', 'hitters'] as const).map((g) => (
          <button key={g} type="button" onClick={() => switchGroup(g)} className={`py-2 rounded-xl text-xs font-extrabold cursor-pointer ${group === g ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
            {g === 'pitchers' ? 'Pitchers' : 'Hitters'}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {(['season', '30d'] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold cursor-pointer ${period === p ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}>
            {p === 'season' ? 'Season best' : 'Last 30 days'}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="h-48 rounded-2xl bg-slate-50 animate-pulse" />
      ) : (
        <>
          {/* Your percentile ranks */}
          {myPosition != null && (
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Your %ile ranks</div>
            <div className="grid grid-cols-2 gap-2">
              {myRanks.map(({ m, mine, rank, n, pctl }) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetricKey(m.key)}
                  className={`text-left rounded-2xl p-3 cursor-pointer border ${metric.key === m.key ? 'border-[#1746b8] bg-blue-50/60' : 'border-transparent bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-500 truncate">{m.short}</span>
                    {mine && <PctlBadge p={pctl} />}
                  </div>
                  {mine ? (
                    <>
                      <div className="text-lg font-black text-slate-900 mt-1">{fmt(m, mine.value)}</div>
                      <div className="text-[10px] font-semibold text-slate-500">#{rank} of {n}</div>
                    </>
                  ) : (
                    <div className="text-[10px] font-semibold text-slate-400 mt-1 leading-snug">{m.howTo}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Metric picker + board */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {metrics.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetricKey(m.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap cursor-pointer ${metric.key === m.key ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <section className="rounded-2xl border border-slate-200 overflow-hidden">
            {board.length === 0 ? (
              <p className="p-4 text-xs font-medium text-slate-500">No one on the board yet. {metric.howTo}</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {board.map((r) => {
                  const rank = rankOf(board.map((b) => b.value), r.value, !metric.lowerIsBetter)
                  return (
                    <li key={r.athlete_id} className={`flex items-center gap-3 px-4 py-3 ${r.athlete_id === myId ? 'bg-blue-50' : ''}`}>
                      <span className="w-7 text-center text-sm font-black text-slate-400">{rank <= 3 ? medal[rank - 1] : rank}</span>
                      <span className={`flex-1 text-sm truncate ${r.athlete_id === myId ? 'font-black text-[#1746b8]' : 'font-bold text-slate-800'}`}>{r.full_name}</span>
                      <span className="text-right">
                        <span className="text-base font-black text-slate-900">{fmt(metric, r.value)}</span>
                        <span className="block text-[10px] font-bold text-slate-400">{ordinal(percentileRank(rank, board.length))} %ile</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
          <p className="text-[10px] font-semibold text-slate-400 px-1">
            {metric.lowerIsBetter ? 'Lower is better. ' : ''}
            {metric.key === 'strike_pct' && 'Every tracked bullpen pitch plus logged strike sets (10+ pitches to qualify). '}
            {metric.key === 'miss_in' && 'Estimated inches between the zone you aimed at and where it went, from tracked bullpens. '}
            {metric.key === 'ahead_pct' && 'Batters you got ahead of: strike on the first pitch, or on the 1-1 pitch. '}
            Percentile = how you compare with teammates (99th is the top).
          </p>
        </>
      )}
    </div>
  )
}

function PctlBadge({ p }: { p: number }) {
  const tone = p >= 75 ? 'bg-emerald-100 text-emerald-700' : p >= 50 ? 'bg-blue-100 text-[#1746b8]' : 'bg-amber-100 text-amber-700'
  return <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${tone}`}>{ordinal(p)}</span>
}
