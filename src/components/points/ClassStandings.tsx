'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate } from '@/lib/training'
import { className, CUP_CLASSES, CUP_SEASON_START } from '@/lib/points'
import { weekStart } from '@/components/stats/WeeklyRecap'

type Standing = { grad_year: number; players: number; earned: number; available: number; pct: number; perfect_days: number }
type Period = 'last' | 'week' | 'season'

export default function ClassStandings({ myClass }: { myClass?: number | null }) {
  const [period, setPeriod] = useState<Period>('week')
  const [rows, setRows] = useState<Standing[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const today = localDate()
    const thisWeek = weekStart(today)
    const from = period === 'last' ? addDays(thisWeek, -7) : period === 'week' ? thisWeek : CUP_SEASON_START
    const to = period === 'last' ? addDays(thisWeek, -1) : today
    createClient()
      .rpc('class_points', { p_from: from, p_to: to < from ? from : to })
      .then(({ data }) => {
        if (cancelled) return
        const got = new Map(
          ((data as Standing[]) || []).map((r) => [
            Number(r.grad_year),
            { grad_year: Number(r.grad_year), players: Number(r.players), earned: Number(r.earned), available: Number(r.available), pct: Number(r.pct), perfect_days: Number(r.perfect_days) },
          ])
        )
        // Always show all four classes, best first; a class with no points yet sits at 0%.
        setRows(
          CUP_CLASSES.map((g) => got.get(g) || { grad_year: g, players: 0, earned: 0, available: 0, pct: 0, perfect_days: 0 }).sort((a, b) => b.pct - a.pct || b.earned - a.earned || a.grad_year - b.grad_year)
        )
      })
    return () => {
      cancelled = true
    }
  }, [period])

  const medal = ['🥇', '🥈', '🥉']

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-500" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex-1">Class Cup · Daily Points</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-slate-100">
        {(['last', 'week', 'season'] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`py-1.5 rounded-xl text-xs font-extrabold cursor-pointer ${period === p ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
            {p === 'last' ? 'Last Week' : p === 'week' ? 'This Week' : 'Season'}
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="h-24 animate-pulse bg-slate-50 rounded-2xl" />
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r, i) => {
            const lead = i === 0 && r.earned > 0
            const mine = myClass != null && r.grad_year === myClass
            return (
              <li key={r.grad_year} className={`rounded-2xl p-3 ${mine ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="w-6 text-center text-base">{r.earned > 0 ? medal[i] ?? i + 1 : '–'}</span>
                  <span className={`flex-1 text-sm font-extrabold ${mine ? 'text-[#1746b8]' : 'text-slate-900'}`}>
                    {className(r.grad_year)} {mine && <span className="text-[10px] font-bold">(you)</span>}
                  </span>
                  <span className="text-lg font-black text-slate-900">{r.pct}%</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-white overflow-hidden">
                  <div className={`h-full ${lead ? 'bg-amber-500' : 'bg-[#1746b8]'}`} style={{ width: `${r.pct}%` }} />
                </div>
                <div className="text-[10px] font-bold text-slate-500 mt-1">
                  {r.players ? `${r.earned}/${r.available} pts · ${r.players} player${r.players === 1 ? '' : 's'} · ${r.perfect_days} perfect day${r.perfect_days === 1 ? '' : 's'}` : 'No points yet'}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <p className="text-[10px] font-semibold text-slate-400">Ranked by % of available points. Season started Nov 25.</p>
    </section>
  )
}
