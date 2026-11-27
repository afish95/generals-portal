'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { BellRing, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Dumbbell, Megaphone, Plus, Target, Trophy, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, prettyDate, type Group, type Profile, type Workout } from '@/lib/training'
import { needsAttention, type Checkin } from '@/lib/wellness'
import { kindOf, KIND_STYLE, minutesOf, timeRange, type ScheduleEvent } from '@/lib/schedule'
import { INTENT_LABEL, INTENT_STYLE } from '@/lib/programs'
import { initialsOf, useOpponents } from '@/lib/opponents'
import { notifyPlayers } from '@/lib/notify'
import OpponentBadge from '@/components/OpponentBadge'
import BaseballIcon from '@/components/BaseballIcon'
import AthleteSheet from './AthleteSheet'
import StreakAlerts from './StreakAlerts'

type Ev = ScheduleEvent & { is_cancelled?: boolean | null }
type WeekW = { id: number; title: string; workout_date: string; group_id: number | null; intent: Workout['intent'] }
type PlanItem = {
  key: string
  title: string
  sub: string
  time: number
  icon: ReactNode
  stripe: string
  expected: Profile[]
  done: Set<string> | null
  edit: string
  opp?: number | null
}

const weekStartOf = (d: string) => addDays(d, -new Date(`${d}T12:00:00`).getDay())

/** Coach Home: day picker, the day at a glance (check-ins + the day's plan by group), needs a look, and this week. */
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
  const [lift, setLift] = useState<{ done: Set<string>; rest: Set<string> }>({ done: new Set(), rest: new Set() })
  const [perfect, setPerfect] = useState(0)
  const [week, setWeek] = useState<{ events: Ev[]; workouts: WeekW[] }>({ events: [], workouts: [] })
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
        sb.from('team_schedule').select('*').gte('event_date', ws).lte('event_date', we),
        sb.from('workouts').select('id, title, workout_date, group_id, intent').gte('workout_date', ws).lte('workout_date', we).order('sort_order'),
      ])
      const wl = (w.data as Workout[]) || []
      const ids = wl.map((x) => x.id)
      const { data: it } = ids.length ? await sb.from('workout_items').select('id, workout_id').in('workout_id', ids) : { data: [] }
      const items = (it as { id: number; workout_id: number }[]) || []
      const itemIds = items.map((i) => i.id)
      const { data: logs } = itemIds.length
        ? await sb.from('set_logs').select('athlete_id, workout_item_id').in('workout_item_id', itemIds).gte('logged_at', dayStart).lt('logged_at', dayEnd)
        : { data: [] }
      if (cancelled) return
      const doneMap = new Map<number, Set<string>>()
      const add = (wid: number, a: string) => (doneMap.get(wid) || doneMap.set(wid, new Set()).get(wid)!).add(a)
      const itemToW = new Map(items.map((i) => [i.id, i.workout_id]))
      for (const l of (logs as { athlete_id: string; workout_item_id: number }[]) || []) {
        const wid = itemToW.get(l.workout_item_id)
        if (wid) add(wid, l.athlete_id)
      }
      for (const x of (pc.data as { athlete_id: string; item_id: number }[]) || []) add(x.item_id, x.athlete_id)
      const hls = (hl.data as { athlete_id: string; status: string }[]) || []
      setPlayers((p.data as Profile[]) || [])
      setGroups((g.data as Group[]) || [])
      setMembers((m.data as { group_id: number; athlete_id: string }[]) || [])
      setCheckins(new Map(((c.data as Checkin[]) || []).filter((x) => x.readiness != null).map((x) => [x.athlete_id, x])))
      setFlags(new Map(((f.data as { athlete_id: string; reason: string | null }[]) || []).map((x) => [x.athlete_id, x.reason])))
      setEvents(((ev.data as Ev[]) || []).filter((e) => !e.is_cancelled))
      setWorkouts(wl)
      setWorkoutDone(doneMap)
      setLift({ done: new Set(hls.filter((x) => x.status === 'done').map((x) => x.athlete_id)), rest: new Set(hls.filter((x) => x.status === 'rest').map((x) => x.athlete_id)) })
      setPerfect(((dp.data as { earned: number | null; available: number }[]) || []).filter((r) => r.available > 0 && Number(r.earned ?? 0) === Number(r.available)).length)
      setWeek({ events: ((wev.data as Ev[]) || []).filter((e) => !e.is_cancelled), workouts: (ww.data as WeekW[]) || [] })
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
  const gName = useCallback((id: number) => groups.find((g) => g.id === id)?.name ?? 'Group', [groups])

  /** The day's plan, bucketed by who it's for: Everyone first, then each group that has something. */
  const byGroup = useMemo(() => {
    const buckets = new Map<string, { label: string; items: PlanItem[] }>()
    const put = (key: string, label: string, item: PlanItem) => {
      if (!buckets.has(key)) buckets.set(key, { label, items: [] })
      buckets.get(key)!.items.push(item)
    }
    const teamLift = events.find((e) => kindOf(e.event_type) === 'lift' && !e.group_ids?.length)
    for (const e of events) {
      const k = kindOf(e.event_type)
      const isLift = k === 'lift'
      const item: PlanItem = {
        key: `e${e.id}`,
        title: e.title,
        sub: [timeRange(e), e.location].filter(Boolean).join(' · '),
        time: minutesOf(e.start_time) ?? 0,
        icon: isLift ? <Dumbbell className="w-4 h-4 text-purple-600" /> : <span className={`w-2.5 h-2.5 rounded-full ${KIND_STYLE[k].dot}`} />,
        stripe: KIND_STYLE[k].bar,
        expected: inGroups(e.group_ids).filter((p) => !(isLift && lift.rest.has(p.id))),
        done: isLift ? lift.done : null,
        edit: `/office?tab=schedule&event=${e.id}`,
        opp: e.opponent_id,
      }
      if (!e.group_ids?.length) put('all', 'Everyone', item)
      else e.group_ids.forEach((gid) => put(`g${gid}`, gName(gid), { ...item, key: `${item.key}-${gid}`, expected: inGroups([gid]) }))
    }
    // Everyone has the Driveline Baseball lift every day (unless they mark rest); a Team Lift event already covers it.
    if (!teamLift)
      put('all', 'Everyone', {
        key: 'lift',
        title: 'Lift',
        sub: 'Driveline Baseball',
        time: 23 * 60,
        icon: <Dumbbell className="w-4 h-4 text-purple-600" />,
        stripe: 'bg-purple-600',
        expected: players.filter((p) => !lift.rest.has(p.id)),
        done: lift.done,
        edit: '/office?tab=data&sub=daily',
      })
    for (const w of workouts) {
      const item: PlanItem = {
        key: `w${w.id}`,
        title: w.title,
        sub: w.intent ? `${INTENT_LABEL[w.intent]} intent` : 'Workout',
        time: 24 * 60,
        icon: w.intent ? <Target className="w-4 h-4 text-slate-500" /> : <BaseballIcon className="w-4 h-4 text-amber-600" />,
        stripe: w.intent ? INTENT_STYLE[w.intent].dot : 'bg-amber-500',
        expected: w.group_id == null ? players : inGroups([w.group_id]),
        done: workoutDone.get(w.id) || new Set(),
        edit: `/office?tab=workouts&date=${day}&workout=${w.id}`,
      }
      if (w.group_id == null) put('all', 'Everyone', item)
      else put(`g${w.group_id}`, gName(w.group_id), item)
    }
    const list = [...buckets.entries()].map(([key, b]) => ({ key, ...b, items: b.items.sort((a, c) => a.time - c.time) }))
    return list.sort((a, b) => (a.key === 'all' ? -1 : b.key === 'all' ? 1 : a.label.localeCompare(b.label)))
  }, [events, workouts, players, inGroups, gName, lift, workoutDone, day])

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
  const short = (gid: number | null) => (gid == null ? 'All' : gName(gid))

  return (
    <div className="space-y-4">
      {/* Day picker */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setDay(addDays(day, -1))} className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer" aria-label="Previous day">
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <button type="button" onClick={() => setDay(today)} className="flex-1 text-center cursor-pointer">
          <div className="text-base font-extrabold text-slate-900">{dayLabel}</div>
          <div className="text-[11px] font-semibold text-slate-400">{isToday ? prettyDate(day) : <span className="text-[#1746b8]">Back to Today</span>}</div>
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

      {!loaded ? (
        <div className="h-48 rounded-3xl bg-white/60 animate-pulse" />
      ) : (
        <>
          {/* The day at a glance: check-ins, then the day's plan by group */}
          <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="p-4 space-y-2">
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
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-semibold text-slate-500">{nudged || `${missing.length} haven’t checked in yet`}</span>
                  {!nudged && (
                    <button type="button" onClick={nudge} className="px-3 py-1.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer">
                      <BellRing className="w-3.5 h-3.5" /> Nudge
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100">
              <div className="px-4 pt-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Day Plan by Group</div>
              {byGroup.map((b) => (
                <div key={b.key} className="pt-2">
                  <div className="px-4 pb-1 flex items-center gap-1.5 text-xs font-extrabold text-[#1746b8]">
                    <Users className="w-3.5 h-3.5" /> {b.label}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {b.items.map((r) => {
                      const exp = r.expected.filter((p) => playerIds.has(p.id))
                      const doneN = r.done ? exp.filter((p) => r.done!.has(p.id)).length : null
                      const opp = r.opp ? opponents.get(r.opp) : null
                      const isOpen = openRow === r.key
                      const notDone = r.done ? exp.filter((p) => !r.done!.has(p.id)) : []
                      return (
                        <li key={r.key}>
                          <button type="button" onClick={() => setOpenRow(isOpen ? null : r.key)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer">
                            <span className={`w-1 self-stretch rounded-full ${r.stripe}`} />
                            <span className="w-6 flex justify-center">{opp ? <OpponentBadge opp={opp} size={24} /> : r.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-extrabold text-slate-900 truncate">{r.title}</div>
                              {r.sub && <div className="text-[11px] font-semibold text-slate-500 truncate">{r.sub}</div>}
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
                                  {notDone.length === 0 ? (
                                    <p className="text-xs font-bold text-emerald-700">Everyone’s done.</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {notDone.map((p) => (
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
                </div>
              ))}
              <div className="h-2" />
            </div>
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
        </>
      )}

      {/* This week: what's actually on each day */}
      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-4 pt-4 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">This Week</div>
        <ul className="divide-y divide-slate-100">
          {weekDays.map((d) => {
            const evs = week.events.filter((e) => e.event_date === d).sort((a, b) => (minutesOf(a.start_time) ?? 0) - (minutesOf(b.start_time) ?? 0))
            const wks = week.workouts.filter((w) => w.workout_date === d)
            const sel = d === day
            const chips: { key: string; text: string; cls: string; icon?: ReactNode }[] = [
              ...evs.map((e) => {
                const k = kindOf(e.event_type)
                const opp = e.opponent_id ? opponents.get(e.opponent_id) : null
                const t = e.start_time ? ` ${e.start_time.replace(':00', '').replace(' ', '').toLowerCase()}` : ''
                return {
                  key: `e${e.id}`,
                  text: k === 'game' && opp ? `${/ @ /.test(e.title) ? '@' : 'vs'} ${initialsOf(opp)}${t}` : `${e.title}${t}`,
                  cls: `${KIND_STYLE[k].block} ${KIND_STYLE[k].text}`,
                  icon: k === 'lift' ? <Dumbbell className="w-3 h-3" /> : k === 'game' ? <Trophy className="w-3 h-3" /> : undefined,
                }
              }),
              ...wks.map((w) => ({
                key: `w${w.id}`,
                text: `${w.title} · ${short(w.group_id)}`,
                cls: w.intent ? INTENT_STYLE[w.intent].chip : 'bg-amber-50 border-amber-200 text-amber-700',
                icon: w.intent ? <Target className="w-3 h-3" /> : <BaseballIcon className="w-3 h-3" />,
              })),
            ]
            return (
              <li key={d}>
                <button type="button" onClick={() => setDay(d)} className={`w-full flex items-start gap-3 px-4 py-2.5 text-left cursor-pointer ${sel ? 'bg-blue-50' : ''}`}>
                  <div className="w-10 shrink-0">
                    <div className={`text-[10px] font-extrabold uppercase ${d === today ? 'text-[#1746b8]' : 'text-slate-400'}`}>{prettyDate(d, { weekday: 'short' })}</div>
                    <div className={`text-base font-black leading-tight ${sel ? 'text-[#1746b8]' : 'text-slate-900'}`}>{Number(d.slice(8))}</div>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-1 pt-0.5">
                    {chips.length === 0 ? (
                      <span className="text-[11px] font-semibold text-slate-300 pt-1">Nothing scheduled</span>
                    ) : (
                      chips.map((c) => (
                        <span key={c.key} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-bold ${c.cls}`}>
                          {c.icon}
                          {c.text}
                        </span>
                      ))
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {sheet && <AthleteSheet athlete={sheet} onClose={() => setSheet(null)} onChanged={refresh} />}
    </div>
  )
}
