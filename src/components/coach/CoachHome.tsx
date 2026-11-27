'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { BellRing, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Dumbbell, Megaphone, Plus, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, prettyDate, type Group, type Profile, type Workout } from '@/lib/training'
import { needsAttention, type Checkin } from '@/lib/wellness'
import { kindOf, KIND_STYLE, minutesOf, timeRange, type ScheduleEvent } from '@/lib/schedule'
import { INTENT_LABEL, INTENT_STYLE } from '@/lib/programs'
import { useOpponents } from '@/lib/opponents'
import { notifyPlayers } from '@/lib/notify'
import OpponentBadge from '@/components/OpponentBadge'
import BaseballIcon from '@/components/BaseballIcon'
import AthleteSheet from './AthleteSheet'
import StreakAlerts from './StreakAlerts'

type Ev = ScheduleEvent & { is_cancelled?: boolean | null }
type PlanRow = {
  key: string
  kind: 'event' | 'lift' | 'workout'
  title: string
  sub: string
  time: number
  icon: ReactNode
  stripe: string
  expected: Profile[]
  done: Set<string> | null
  edit: string
  ev?: Ev
}

const weekStartOf = (d: string) => addDays(d, -new Date(`${d}T12:00:00`).getDay())
const DOW1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Coach Home: day picker, today at a glance, team day plan, needs a look, and the week strip. */
export default function CoachHome() {
  const today = localDate()
  const [day, setDay] = useState(today)
  const [players, setPlayers] = useState<Profile[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<{ group_id: number; athlete_id: string }[]>([])
  const [checkins, setCheckins] = useState<Map<string, Checkin>>(new Map())
  const [flags, setFlags] = useState<Map<string, string | null>>(new Map())
  const [events, setEvents] = useState<Ev[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [workoutDone, setWorkoutDone] = useState<Map<number, Set<string>>>(new Map())
  const [liftDone, setLiftDone] = useState<Set<string>>(new Set())
  const [perfect, setPerfect] = useState(0)
  const [week, setWeek] = useState<{ events: Ev[]; workouts: { workout_date: string }[] }>({ events: [], workouts: [] })
  const [loaded, setLoaded] = useState(false)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Profile | null>(null)
  const [nudged, setNudged] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const opponents = useOpponents()

  useEffect(() => {
    let cancelled = false
    const sb = createClient()
    const ws = weekStartOf(day)
    const we = addDays(ws, 6)
    const dayStart = new Date(`${day}T00:00:00`).toISOString()
    const dayEnd = new Date(`${addDays(day, 1)}T00:00:00`).toISOString()
    ;(async () => {
      const [p, g, m, c, f, ev, w, hl, pc, dp, wev, ww] = await Promise.all([
        sb.from('profiles').select('id, username, full_name, role, position_group, grad_year, is_active, is_demo').eq('role', 'player').eq('is_active', true).eq('has_login', true).order('full_name'),
        sb.from('team_groups').select('*').order('sort_order'),
        sb.from('group_members').select('group_id, athlete_id'),
        sb.from('daily_checkins').select('*').eq('check_date', day),
        sb.from('athlete_flags').select('athlete_id, reason'),
        sb.from('team_schedule').select('*').eq('event_date', day),
        sb.from('workouts').select('*').eq('workout_date', day).order('sort_order'),
        sb.from('habit_logs').select('athlete_id, status').eq('log_date', day).eq('habit', 'lift'),
        sb.from('plan_checks').select('athlete_id, item_id').eq('check_date', day).eq('item_type', 'workout'),
        sb.rpc('daily_points', { p_from: day, p_to: day }),
        sb.from('team_schedule').select('id, event_date, event_type, is_cancelled').gte('event_date', ws).lte('event_date', we),
        sb.from('workouts').select('workout_date, group_id').gte('workout_date', ws).lte('workout_date', we),
      ])
      const wl = ((w.data as (Workout & { is_demo?: boolean })[]) || []).filter((x) => !x.is_demo)
      const ids = wl.map((x) => x.id)
      const { data: it } = ids.length ? await sb.from('workout_items').select('id, workout_id').in('workout_id', ids) : { data: [] }
      const items = (it as { id: number; workout_id: number }[]) || []
      const itemIds = items.map((i) => i.id)
      const { data: logs } = itemIds.length
        ? await sb.from('set_logs').select('athlete_id, workout_item_id').in('workout_item_id', itemIds).gte('logged_at', dayStart).lt('logged_at', dayEnd)
        : { data: [] }
      if (cancelled) return
      const doneMap = new Map<number, Set<string>>()
      const itemToW = new Map(items.map((i) => [i.id, i.workout_id]))
      for (const l of (logs as { athlete_id: string; workout_item_id: number }[]) || []) {
        const wid = itemToW.get(l.workout_item_id)
        if (wid) (doneMap.get(wid) || doneMap.set(wid, new Set()).get(wid)!).add(l.athlete_id)
      }
      for (const x of (pc.data as { athlete_id: string; item_id: number }[]) || []) (doneMap.get(x.item_id) || doneMap.set(x.item_id, new Set()).get(x.item_id)!).add(x.athlete_id)
      setPlayers((p.data as Profile[]) || [])
      setGroups((g.data as Group[]) || [])
      setMembers((m.data as { group_id: number; athlete_id: string }[]) || [])
      setCheckins(new Map(((c.data as Checkin[]) || []).filter((x) => x.readiness != null).map((x) => [x.athlete_id, x])))
      setFlags(new Map(((f.data as { athlete_id: string; reason: string | null }[]) || []).map((x) => [x.athlete_id, x.reason])))
      setEvents(((ev.data as Ev[]) || []).filter((e) => !e.is_cancelled))
      setWorkouts(wl)
      setWorkoutDone(doneMap)
      setLiftDone(new Set(((hl.data as { athlete_id: string; status: string }[]) || []).filter((x) => x.status === 'done').map((x) => x.athlete_id)))
      setPerfect(((dp.data as { earned: number | null; available: number }[]) || []).filter((r) => r.available > 0 && Number(r.earned ?? 0) === Number(r.available)).length)
      setWeek({ events: ((wev.data as Ev[]) || []).filter((e) => !e.is_cancelled), workouts: (ww.data as { workout_date: string }[]) || [] })
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [day, version])

  const playerIds = useMemo(() => new Set(players.map((p) => p.id)), [players])
  const inGroups = useCallback(
    (gids: number[] | null | undefined) => {
      if (!gids?.length) return players
      const ids = new Set(members.filter((m) => gids.includes(m.group_id)).map((m) => m.athlete_id))
      return players.filter((p) => ids.has(p.id))
    },
    [players, members]
  )
  const gName = (id: number | null) => (id == null ? 'Whole Team' : groups.find((g) => g.id === id)?.name ?? 'Group')

  const rows: PlanRow[] = useMemo(() => {
    const out: PlanRow[] = []
    for (const e of events) {
      const k = kindOf(e.event_type)
      const who = e.group_ids?.length ? e.group_ids.map((id) => gName(id)).join(', ') : 'Whole Team'
      const lift = k === 'lift'
      out.push({
        key: `e${e.id}`,
        kind: lift ? 'lift' : 'event',
        title: e.title,
        sub: [timeRange(e), e.location, who].filter(Boolean).join(' · '),
        time: minutesOf(e.start_time) ?? 0,
        icon: lift ? <Dumbbell className="w-4 h-4" /> : null,
        stripe: KIND_STYLE[k].bar,
        expected: inGroups(e.group_ids),
        done: lift ? liftDone : null,
        edit: `/office?tab=schedule&event=${e.id}`,
        ev: e,
      })
    }
    for (const w of workouts) {
      const exp = w.group_id == null ? players : inGroups([w.group_id])
      out.push({
        key: `w${w.id}`,
        kind: 'workout',
        title: w.title,
        sub: [w.intent ? `${INTENT_LABEL[w.intent]} intent` : null, gName(w.group_id)].filter(Boolean).join(' · '),
        time: 24 * 60,
        icon: w.intent ? <Target className="w-4 h-4" /> : <BaseballIcon className="w-4 h-4" />,
        stripe: w.intent ? INTENT_STYLE[w.intent].dot : 'bg-amber-500',
        expected: exp,
        done: workoutDone.get(w.id) || new Set(),
        edit: `/office?tab=workouts&date=${day}&workout=${w.id}`,
      })
    }
    return out.sort((a, b) => a.time - b.time)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, workouts, players, members, groups, liftDone, workoutDone, day])

  const checkedIn = players.filter((p) => checkins.has(p.id)).length
  const missing = players.filter((p) => !checkins.has(p.id))
  const alerts = players.filter((p) => needsAttention(checkins.get(p.id)) || flags.has(p.id))
  const isToday = day === today
  const dayLabel = isToday ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : day === addDays(today, -1) ? 'Yesterday' : prettyDate(day)

  const nudge = async () => {
    if (!missing.length || !window.confirm(`Send a check-in reminder to ${missing.length} player${missing.length === 1 ? '' : 's'}?`)) return
    const res = await notifyPlayers({ title: 'Readiness Check-In', body: 'Take 30 seconds to check in for today.', url: '/', recipientIds: missing.map((p) => p.id) })
    setNudged(res.ok ? `Reminder sent to ${missing.length}` : res.error)
  }

  const ws = weekStartOf(day)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i))

  return (
    <div className="space-y-4">
      {/* Day picker */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setDay(addDays(day, -1))} className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer" aria-label="Previous day">
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <button type="button" onClick={() => setDay(today)} className="flex-1 text-center cursor-pointer">
          <div className="text-base font-extrabold text-slate-900">{dayLabel}</div>
          {!isToday && <div className="text-[11px] font-semibold text-[#1746b8]">Back to Today</div>}
        </button>
        <button type="button" onClick={() => setDay(addDays(day, 1))} className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer" aria-label="Next day">
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { href: '/office?tab=workouts', label: 'Workout', icon: Plus },
          { href: '/office?tab=schedule', label: 'Event', icon: CalendarPlus },
          { href: '/messages?tab=announcements', label: 'Announce', icon: Megaphone },
          { href: '/office?tab=attendance', label: 'Attendance', icon: ClipboardCheck },
        ].map((a) => (
          <Link key={a.label} href={a.href} className="rounded-2xl bg-white border border-slate-200 py-2.5 flex flex-col items-center gap-1 text-[11px] font-extrabold text-slate-700">
            <a.icon className="w-4 h-4 text-[#1746b8]" />
            {a.label}
          </Link>
        ))}
      </div>

      <StreakAlerts compact />

      {/* Week strip */}
      <section className="bg-white rounded-3xl border border-slate-200 p-3">
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d, i) => {
            const kinds = new Set(week.events.filter((e) => e.event_date === d).map((e) => kindOf(e.event_type)))
            const hasW = week.workouts.some((w) => w.workout_date === d)
            const sel = d === day
            return (
              <button key={d} type="button" onClick={() => setDay(d)} className={`rounded-xl py-1.5 flex flex-col items-center cursor-pointer ${sel ? 'bg-[#1746b8] text-white' : d === today ? 'bg-blue-50' : ''}`}>
                <span className={`text-[10px] font-bold ${sel ? 'text-blue-100' : 'text-slate-400'}`}>{DOW1[i]}</span>
                <span className="text-sm font-extrabold">{Number(d.slice(8))}</span>
                <span className="flex gap-0.5 h-1.5 mt-0.5">
                  {(['game', 'practice', 'lift'] as const).filter((k) => kinds.has(k)).map((k) => (
                    <span key={k} className={`w-1.5 h-1.5 rounded-full ${KIND_STYLE[k].dot}`} />
                  ))}
                  {hasW && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {!loaded ? (
        <div className="h-48 rounded-3xl bg-white/60 animate-pulse" />
      ) : (
        <>
          {/* At a glance */}
          <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{dayLabel} at a Glance</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-slate-50 p-2.5">
                <div className="text-xl font-black text-slate-900">{checkedIn}<span className="text-xs font-extrabold text-slate-400">/{players.length}</span></div>
                <div className="text-[10px] font-bold text-slate-500">Checked In</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-2.5">
                <div className="text-xl font-black text-emerald-600">{perfect}</div>
                <div className="text-[10px] font-bold text-slate-500">Perfect Days</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-2.5">
                <div className={`text-xl font-black ${alerts.length ? 'text-amber-600' : 'text-slate-900'}`}>{alerts.length}</div>
                <div className="text-[10px] font-bold text-slate-500">Needs a Look</div>
              </div>
            </div>
            {isToday && missing.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="flex-1 text-xs font-semibold text-slate-500">{nudged || `${missing.length} haven’t checked in yet`}</span>
                {!nudged && (
                  <button type="button" onClick={nudge} className="px-3 py-1.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer">
                    <BellRing className="w-3.5 h-3.5" /> Nudge
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Needs a look */}
          {alerts.length > 0 && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 mb-1.5">Needs a Look</div>
              <ul className="space-y-1">
                {alerts.map((p) => {
                  const c = checkins.get(p.id)
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => setSheet(p)} className="text-sm font-bold text-amber-900 cursor-pointer text-left">
                        {flags.has(p.id) && '🚩 '}
                        {p.full_name}
                        {c && needsAttention(c) ? ` · readiness ${c.readiness}, body ${c.soreness}/5${c.arm_soreness != null ? `, arm ${c.arm_soreness}/5` : ''}` : flags.get(p.id) ? ` · ${flags.get(p.id)}` : ''}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Team day plan */}
          <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-4 pt-4 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Team Day Plan</div>
            {rows.length === 0 ? (
              <p className="px-4 pb-4 text-xs font-medium text-slate-500">
                Nothing scheduled. <Link href="/office?tab=workouts" className="font-bold text-[#1746b8]">Build a Workout</Link>
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const exp = r.expected.filter((p) => playerIds.has(p.id))
                  const doneN = r.done ? exp.filter((p) => r.done!.has(p.id)).length : null
                  const opp = r.ev?.opponent_id ? opponents.get(r.ev.opponent_id) : null
                  const isOpen = openRow === r.key
                  return (
                    <li key={r.key}>
                      <button type="button" onClick={() => setOpenRow(isOpen ? null : r.key)} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
                        <span className={`w-1 self-stretch rounded-full ${r.stripe}`} />
                        {opp ? <OpponentBadge opp={opp} size={26} /> : r.icon && <span className="text-slate-500">{r.icon}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-extrabold text-slate-900 truncate">{r.title}</div>
                          <div className="text-[11px] font-semibold text-slate-500 truncate">{r.sub}</div>
                        </div>
                        {doneN != null && (
                          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${exp.length && doneN === exp.length ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {doneN}/{exp.length}
                          </span>
                        )}
                        <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 space-y-2">
                          {r.done && (
                            <div>
                              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Not Done Yet</div>
                              {exp.filter((p) => !r.done!.has(p.id)).length === 0 ? (
                                <p className="text-xs font-bold text-emerald-700">Everyone’s done.</p>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {exp.filter((p) => !r.done!.has(p.id)).map((p) => (
                                    <button key={p.id} type="button" onClick={() => setSheet(p)} className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer">
                                      {p.full_name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <Link href={r.edit} className="inline-block text-xs font-extrabold text-[#1746b8]">Edit</Link>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {sheet && <AthleteSheet athlete={sheet} onClose={() => setSheet(null)} onChanged={refresh} />}
    </div>
  )
}
