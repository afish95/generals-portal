'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { BookOpen, ChevronDown, Dumbbell, HeartPulse, Moon, Trophy } from 'lucide-react'
import BaseballIcon from '@/components/BaseballIcon'
import { createClient } from '@/lib/supabase'
import { addDays, localDate } from '@/lib/training'
import { className, CUP_CLASSES, CUP_SEASON_START } from '@/lib/points'
import { weekStart } from '@/components/stats/WeeklyRecap'

type Standing = { grad_year: number; players: number; earned: number; available: number; pct: number; perfect_days: number }
type Period = 'last' | 'week' | 'season'
type Day = { athlete_id: string; full_name: string; grad_year: number; sleep_ok: boolean; readiness_ok: boolean; attend_avail: boolean; attend_ok: boolean; lift_avail: boolean; lift_ok: boolean; throw_avail: boolean; throw_ok: boolean; available: number; earned: number | null }

export default function ClassStandings({ myClass, coach = false }: { myClass?: number | null; coach?: boolean }) {
  const [period, setPeriod] = useState<Period>('week')
  const [rows, setRows] = useState<Standing[] | null>(null)
  const [openClass, setOpenClass] = useState<number | null>(null)
  const [today, setToday] = useState<Day[] | null>(null)

  useEffect(() => {
    if (!coach || openClass == null || today) return
    const d = localDate()
    createClient()
      .rpc('daily_points', { p_from: d, p_to: d })
      .then(({ data }) => setToday((data as Day[]) || []))
  }, [coach, openClass, today])

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
                <div className={`flex items-center gap-2 ${coach ? 'cursor-pointer' : ''}`} onClick={coach ? () => setOpenClass((c) => (c === r.grad_year ? null : r.grad_year)) : undefined}>
                  <span className="w-6 text-center text-base">{r.earned > 0 ? medal[i] ?? i + 1 : '–'}</span>
                  <span className={`flex-1 text-sm font-extrabold ${mine ? 'text-[#1746b8]' : 'text-slate-900'}`}>
                    {className(r.grad_year)} {mine && <span className="text-[10px] font-bold">(you)</span>}
                  </span>
                  <span className="text-lg font-black text-slate-900">{r.pct}%</span>
                  {coach && <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openClass === r.grad_year ? 'rotate-180' : ''}`} />}
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-white overflow-hidden">
                  <div className={`h-full ${lead ? 'bg-amber-500' : 'bg-[#1746b8]'}`} style={{ width: `${r.pct}%` }} />
                </div>
                <div className="text-[10px] font-bold text-slate-500 mt-1">
                  {r.players ? `${r.earned}/${r.available} pts · ${r.players} player${r.players === 1 ? '' : 's'} · ${r.perfect_days} perfect day${r.perfect_days === 1 ? '' : 's'}` : 'No points yet'}
                </div>
                {coach && openClass === r.grad_year && <ClassToday rows={today?.filter((x) => Number(x.grad_year) === r.grad_year) ?? null} />}
              </li>
            )
          })}
        </ol>
      )}
      <p className="text-[10px] font-semibold text-slate-400">Ranked by % of available points. Season started Nov 25.</p>
    </section>
  )
}

/** Coach view: each player in a class with today's points and which ones they've earned. */
function ClassToday({ rows }: { rows: Day[] | null }) {
  if (rows === null) return <div className="mt-2 h-16 animate-pulse bg-white rounded-xl" />
  if (rows.length === 0) return <p className="mt-2 text-[11px] font-semibold text-slate-400">No players with a login in this class.</p>
  const list = [...rows].sort((a, b) => (b.earned ?? 0) - (a.earned ?? 0) || a.full_name.localeCompare(b.full_name))
  const Dot = ({ on, avail = true, icon: Icon, label }: { on: boolean; avail?: boolean; icon: ComponentType<{ className?: string }>; label: string }) =>
    !avail ? (
      <span className="w-5 h-5" />
    ) : (
      <span title={label} className={`w-5 h-5 rounded-full flex items-center justify-center ${on ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
        <Icon className="w-3 h-3" />
      </span>
    )
  return (
    <div className="mt-2 bg-white rounded-xl divide-y divide-slate-100">
      <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex">
        <span className="flex-1">Today’s Points</span>
      </div>
      {list.map((p) => {
        const e = p.earned ?? 0
        const perfect = p.available > 0 && e === p.available
        return (
          <div key={p.athlete_id} className="px-3 py-1.5 flex items-center gap-2">
            <span className="flex-1 min-w-0 text-xs font-bold text-slate-800 truncate">{p.full_name}</span>
            <div className="flex gap-1">
              <Dot on={p.sleep_ok} icon={Moon} label="Sleep" />
              <Dot on={p.attend_ok} avail={p.attend_avail} icon={BookOpen} label="Class" />
              <Dot on={p.lift_ok} avail={p.lift_avail} icon={Dumbbell} label="Lift" />
              <Dot on={p.throw_ok} avail={p.throw_avail} icon={BaseballIcon} label="Workouts" />
              <Dot on={p.readiness_ok} icon={HeartPulse} label="Readiness" />
            </div>
            <span className={`w-10 text-center text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${perfect ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
              {e}/{p.available}
            </span>
          </div>
        )
      })}
    </div>
  )
}
