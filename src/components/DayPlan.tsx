'use client'

import BaseballIcon from '@/components/BaseballIcon'
import CoachEdit from '@/components/CoachEdit'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Crosshair, FileDown, Pencil, Dumbbell, ExternalLink, GraduationCap, HeartPulse, MapPin, Moon, Play, Target, Trophy, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { canLogDay, itemLabel, localDate, phaseLabel, prettyDate, type Exercise, type Group, type Workout, type WorkoutItem } from '@/lib/training'
import { withPointsDelta } from '@/lib/pointsDelta'
import { PopCircle, buzz } from '@/components/points/PointBurst'
import PracticePlanView from '@/components/practice/PracticePlanView'
import { normalizePlan } from '@/lib/practicePlan'
import { INTENT_LABEL, INTENT_STYLE, sectionOf } from '@/lib/programs'
import type { FocusDrill } from '@/lib/focus'
import { normalizePoints, type DayPoints } from '@/lib/points'
import { KIND_STYLE, kindOf, minutesOf, timeRange, visibleTo } from '@/lib/schedule'
import ReadinessCheckIn from '@/components/wellness/ReadinessCheckIn'
import { useDrillsOfWeek } from '@/components/training/useDrillsOfWeek'
import DrillOfWeekCard from '@/components/training/DrillOfWeekCard'
import LogStat from '@/components/training/LogStat'
import { useOpponents } from '@/lib/opponents'
import { useAppText } from '@/lib/appText'
import Txt from '@/components/Txt'
import OpponentBadge from '@/components/OpponentBadge'

const DRIVELINE_APP_URL = 'https://apps.apple.com/us/app/driveline-training/id6445937141'

type Event = { id: number; title: string; event_type: string; opponent_id: number | null; series_id: string | null; start_time: string | null; end_time: string | null; location: string | null; practice_plan: string | null; notes: string | null; group_ids: number[] | null; is_cancelled: boolean | null; plan: unknown }
type Tool = { id: number; workout_id: number; script_id: number; notes: string | null }
type Script = { id: number; title: string; pitch_count: number }

// Two color families, used on Home and Calendar:
//   Games & Practice (schedule + attendance) = indigo, Training & Workouts = amber
const SCHEDULE = { stripe: 'border-l-indigo-500', tone: 'bg-indigo-100 text-indigo-700' }
const TRAINING = { stripe: 'border-l-amber-500', tone: 'bg-amber-100 text-amber-700' }

const isSchoolDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return dow >= 1 && dow <= 5
}

export default function DayPlan({
  athleteId,
  date,
  isCoach = false,
  onChange,
  refreshKey = 0,
  showHeader = true,
  onStartTool,
  renderWorkout,
}: {
  athleteId: string
  date?: string
  isCoach?: boolean
  onChange?: () => void
  refreshKey?: number
  showHeader?: boolean
  /** Start a prescribed training tool; when absent, the Start button links to the Training tab */
  onStartTool?: (scriptId: number, workoutId: number, title: string) => void
  /** Replaces the simple drill list inside an open workout (the Training tab uses this for set logging) */
  renderWorkout?: (workout: Workout, items: WorkoutItem[]) => React.ReactNode
}) {
  const day = date ?? localDate()
  const today = localDate()
  // Players check items off for today and the past week (to catch up on forgotten items); older days are read-only.
  const interactive = !isCoach && canLogDay(day, today)

  const [events, setEvents] = useState<Event[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [items, setItems] = useState<WorkoutItem[]>([])
  const [exercises, setExercises] = useState<Map<number, Exercise>>(new Map())
  const [groups, setGroups] = useState<Map<number, string>>(new Map())
  const [logged, setLogged] = useState<Map<number, number>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [liftStatus, setLiftStatus] = useState<'done' | 'rest' | null>(null)
  const [pts, setPts] = useState<DayPoints | null>(null)
  const [sleepHours, setSleepHours] = useState<number | null>(null)
  const [hoursInput, setHoursInput] = useState('')
  const [classOverride, setClassOverride] = useState<string | null>(null)
  const [schoolOff, setSchoolOff] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const dow = useDrillsOfWeek(day)
  const opps = useOpponents()
  const t = useAppText()
  const [busy, setBusy] = useState<string | null>(null)
  const [pop, setPop] = useState<{ key: string; amount: number } | null>(null)
  const [tools, setTools] = useState<Tool[]>([])
  const [scripts, setScripts] = useState<Map<number, Script>>(new Map())
  const [toolDone, setToolDone] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<{ title: string; drills: FocusDrill[] }[]>([])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const load = async () => {
      const [{ data: ev }, { data: w }, { data: gr }, { data: off }] = await Promise.all([
        supabase.from('team_schedule').select('id, title, event_type, start_time, end_time, location, practice_plan, notes, group_ids, is_cancelled, plan, opponent_id, series_id').eq('event_date', day),
        supabase.from('workouts').select('*').eq('workout_date', day).order('sort_order'),
        supabase.from('team_groups').select('id, name'),
        supabase.from('school_days_off').select('label').eq('day', day).maybeSingle(),
      ])
      let wList = (w as Workout[]) || []
      let evList = ((ev as Event[]) || []).filter((e) => !e.is_cancelled)
      if (!isCoach) {
        const { data: gm } = await supabase.from('group_members').select('group_id').eq('athlete_id', athleteId)
        const mine = new Set(((gm as { group_id: number }[]) || []).map((g) => g.group_id))
        wList = wList.filter((x) => x.group_id == null || mine.has(x.group_id))
        evList = evList.filter((e) => visibleTo(e, mine))
      }
      evList.sort((a, b) => (minutesOf(a.start_time) ?? -1) - (minutesOf(b.start_time) ?? -1))
      const ids = wList.map((x) => x.id)
      const [{ data: it }, { data: ex }, { data: tl }, { data: sc }, { data: bs }, { data: pf }] = await Promise.all([
        ids.length ? supabase.from('workout_items').select('*').in('workout_id', ids) : Promise.resolve({ data: [] }),
        supabase.from('exercises').select('*'),
        ids.length ? supabase.from('workout_tools').select('id, workout_id, script_id, notes').in('workout_id', ids).order('sort_order') : Promise.resolve({ data: [] }),
        supabase.from('bullpen_scripts').select('id, title, pitch_count'),
        !isCoach && ids.length
          ? supabase.from('bullpen_sessions').select('workout_id, script_id').eq('player_id', athleteId).in('workout_id', ids)
          : Promise.resolve({ data: [] }),
        !isCoach && wList.some((x) => x.focus_block)
          ? supabase.from('player_focus').select('title, drills').eq('athlete_id', athleteId).eq('status', 'published').order('sort_order')
          : Promise.resolve({ data: [] }),
      ])
      const itemList = (it as WorkoutItem[]) || []
      const itemIds = itemList.map((i) => i.id)
      const [{ data: lg }, { data: pc }, { data: hl }, { data: dp }, { data: ci }, { data: ca }] = await Promise.all([
        !isCoach && itemIds.length
          ? supabase.from('set_logs').select('workout_item_id').eq('athlete_id', athleteId).in('workout_item_id', itemIds)
          : Promise.resolve({ data: [] }),
        !isCoach
          ? supabase.from('plan_checks').select('item_type, item_id').eq('athlete_id', athleteId).eq('check_date', day)
          : Promise.resolve({ data: [] }),
        !isCoach
          ? supabase.from('habit_logs').select('status').eq('athlete_id', athleteId).eq('log_date', day).eq('habit', 'lift').maybeSingle()
          : Promise.resolve({ data: null }),
        !isCoach ? supabase.rpc('athlete_points', { p_athlete: athleteId, p_from: day, p_to: day }) : Promise.resolve({ data: [] }),
        !isCoach ? supabase.from('daily_checkins').select('sleep_hours').eq('athlete_id', athleteId).eq('check_date', day).maybeSingle() : Promise.resolve({ data: null }),
        !isCoach ? supabase.from('class_attendance').select('status').eq('athlete_id', athleteId).eq('attend_date', day).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (cancelled) return
      const counts = new Map<number, number>()
      for (const l of (lg as { workout_item_id: number }[]) || []) counts.set(l.workout_item_id, (counts.get(l.workout_item_id) || 0) + 1)
      setChecks(new Set(((pc as { item_type: string; item_id: number }[]) || []).map((c) => `${c.item_type}:${c.item_id}`)))
      const ls = (hl as { status: string } | null)?.status
      setLiftStatus(ls === 'done' || ls === 'rest' ? ls : null)
      setPts(normalizePoints(dp).find((x) => x.athlete_id === athleteId) || null)
      const sh = (ci as { sleep_hours: number | null } | null)?.sleep_hours ?? null
      setSleepHours(sh)
      setHoursInput(sh != null ? String(sh) : '')
      setClassOverride((ca as { status: string } | null)?.status ?? null)
      setSchoolOff((off as { label: string | null } | null) ? (off as { label: string | null }).label || 'No school' : null)
      setEvents(evList)
      setWorkouts(wList)
      setItems(itemList)
      setExercises(new Map(((ex as Exercise[]) || []).map((e) => [e.id, e])))
      setGroups(new Map(((gr as Pick<Group, 'id' | 'name'>[]) || []).map((g) => [g.id, g.name])))
      setLogged(counts)
      setTools((tl as Tool[]) || [])
      setScripts(new Map(((sc as Script[]) || []).map((x) => [x.id, x])))
      setFocus(((pf as { title: string; drills: FocusDrill[] | null }[]) || []).map((f) => ({ title: f.title, drills: f.drills || [] })).filter((f) => f.drills.length))
      setToolDone(new Set(((bs as { workout_id: number; script_id: number }[]) || []).map((b) => `${b.workout_id}:${b.script_id}`)))
      setLoadedFor(day)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [athleteId, day, isCoach, refreshKey, reload])

  // Plays the "+N point" animation only when the check-off actually earned points.
  const celebrate = (key: string, amount: number) => {
    buzz()
    if (amount <= 0) return
    setPop({ key, amount })
    setTimeout(() => setPop((p) => (p?.key === key ? null : p)), 1300)
  }
  const popFor = (key: string) => (pop?.key === key ? pop.amount : 0)

  // Each check-off saves (or removes) just that one record, then refreshes Today's points.
  const after = () => {
    setReload((n) => n + 1)
    onChange?.()
  }

  const toggleCheck = async (type: 'event' | 'workout' | 'class' | 'training', id: number) => {
    if (!interactive) return
    const key = `${type}:${id}`
    const supabase = createClient()
    setBusy(key)
    if (checks.has(key)) {
      const { error } = await supabase.from('plan_checks').delete().eq('athlete_id', athleteId).eq('check_date', day).eq('item_type', type).eq('item_id', id)
      if (!error)
        setChecks((c) => {
          const n = new Set(c)
          n.delete(key)
          return n
        })
    } else {
      let failed = false
      const gained = await withPointsDelta(athleteId, day, async () => {
        const { error } = await supabase.from('plan_checks').insert({ athlete_id: athleteId, check_date: day, item_type: type, item_id: id })
        failed = !!error
      })
      if (!failed) {
        setChecks((c) => new Set(c).add(key))
        celebrate(key, gained)
      }
    }
    setBusy(null)
    after()
  }

  // Lift: 'done' earns the point; 'rest' takes lift (and unassigned baseball training) off the board for the day.
  const setLift = async (status: 'done' | 'rest') => {
    if (!interactive) return
    const supabase = createClient()
    setBusy('lift')
    if (liftStatus === status) {
      const { error } = await supabase.from('habit_logs').delete().eq('athlete_id', athleteId).eq('log_date', day).eq('habit', 'lift')
      if (!error) setLiftStatus(null)
    } else {
      let failed = false
      const gained = await withPointsDelta(athleteId, day, async () => {
        const { error } = await supabase.from('habit_logs').upsert({ athlete_id: athleteId, log_date: day, habit: 'lift', status }, { onConflict: 'athlete_id,log_date,habit' })
        failed = !!error
      })
      if (!failed) {
        setLiftStatus(status)
        if (status === 'done') celebrate('lift', gained)
      }
    }
    setBusy(null)
    after()
  }

  const saveSleep = async () => {
    const h = parseFloat(hoursInput)
    if (!interactive || !Number.isFinite(h) || h < 0 || h > 16) return
    setBusy('sleep')
    let failed = false
    const gained = await withPointsDelta(athleteId, day, async () => {
      const { error } = await createClient().from('daily_checkins').upsert({ athlete_id: athleteId, check_date: day, sleep_hours: h }, { onConflict: 'athlete_id,check_date' })
      failed = !!error
    })
    setBusy(null)
    if (failed) return
    setSleepHours(h)
    setOpen(null)
    if (h >= 8) celebrate('sleep', gained)
    else buzz()
    after()
  }

  if (loadedFor !== day) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />

  const toggle = (k: string) => setOpen((o) => (o === k ? null : k))
  const school = isSchoolDay(day) && !schoolOff
  const showCheck = !isCoach
  const idleLabel = interactive ? 'Mark Complete' : day > today ? 'Upcoming' : 'Not Done'

  const teamLift = events.find((e) => kindOf(e.event_type) === 'lift') || null
  const earned = pts?.earned ?? 0
  const available = pts?.available ?? 0
  const perfect = available > 0 && earned >= available
  const trainingRest = liftStatus === 'rest' && workouts.length === 0

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      {showHeader && (
        <div className="px-5 pt-4 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Day Plan</span>
              {!isCoach && <CoachEdit href={`/office?tab=data&player=${athleteId}&sub=daily`} label="Edit" />}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400">{prettyDate(day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              {!isCoach && pts && (
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${perfect ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {earned}/{available} pts
                </span>
              )}
            </div>
          </div>
          {!isCoach && pts && (
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full transition-all ${perfect ? 'bg-emerald-500' : 'bg-[#1746b8]'}`} style={{ width: `${available ? Math.round((100 * earned) / available) : 0}%` }} />
            </div>
          )}
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {/* ---- Schedule: games & practices (info only) ---- */}
        {events.filter((e) => kindOf(e.event_type) !== 'lift').map((e) => {
          const k = `e${e.id}`
          const isGame = /game/i.test(e.event_type)
          return (
            <li key={k} className={`border-l-4 ${SCHEDULE.stripe}`}>
              <Row
                icon={e.opponent_id && opps.get(e.opponent_id) ? <OpponentBadge opp={opps.get(e.opponent_id)} size={36} /> : isGame ? <Trophy className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                tone={SCHEDULE.tone}
                title={e.title}
                subtitle={[KIND_STYLE[kindOf(e.event_type)].label, e.start_time ? timeRange(e) : null, e.location].filter(Boolean).join(' · ')}
                open={open === k}
                onClick={() => toggle(k)}
                showCheck={false}
                interactive={interactive}
            idleLabel={idleLabel}
                checked={checks.has(`event:${e.id}`)}
                busy={busy === `event:${e.id}`}
                popping={popFor(`event:${e.id}`)}
                onCheck={() => toggleCheck('event', e.id)}
              />
              {open === k && (
                <div className="px-4 pb-4 space-y-2">
                  {e.location && (
                    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {e.location}
                    </div>
                  )}
                  {(() => {
                    const plan = normalizePlan(e.plan)
                    if (!plan || plan.blocks.length === 0)
                      return <p className="text-xs text-slate-600 whitespace-pre-line">{e.notes || e.practice_plan || (kindOf(e.event_type) === 'practice' ? 'No plan posted yet.' : 'No details yet.')}</p>
                    return (
                      <>
                        <PracticePlanView plan={plan} startTime={e.start_time} />
                        <div className="flex gap-2 pt-1">
                          <a href={`/practice-print?event=${e.id}`} className="flex-1 py-2 rounded-xl bg-[#1746b8] text-white text-[11px] font-extrabold flex items-center justify-center gap-1">
                            <FileDown className="w-3.5 h-3.5" /> Export 1-page
                          </a>
                          {isCoach && (
                            <Link href={`/office?tab=practices&event=${e.id}`} className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1">
                              <Pencil className="w-3.5 h-3.5" /> Edit Plan
                            </Link>
                          )}
                        </div>
                      </>
                    )
                  })()}
                  {isCoach && kindOf(e.event_type) === 'practice' && !normalizePlan(e.plan)?.blocks.length && (
                    <Link href={`/office?tab=practices&event=${e.id}`} className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#1746b8]">
                      <Pencil className="w-3.5 h-3.5" /> Build a Practice Plan
                    </Link>
                  )}
                  <CoachEdit href={`/office?tab=schedule&event=${e.id}`} label={e.series_id ? 'Edit Event · Repeat' : 'Edit Event'} className="ml-3" />
                </div>
              )}
            </li>
          )
        })}


        {!isCoach && (
          <>
            {/* 1. Sleep */}
            <li className="border-l-4 border-l-indigo-500">
              <Row
                icon={<Moon className="w-4 h-4" />}
                tone={SCHEDULE.tone}
                title="8+ Hours Sleep"
                subtitle={sleepHours != null ? `${sleepHours}h last night${sleepHours < 8 ? ' · under 8' : ''}` : <Txt k="dayplan.sleep.sub" />}
                open={open === 'sleep'}
                onClick={() => toggle('sleep')}
                showCheck={showCheck}
                interactive={interactive}
                idleLabel={sleepHours != null ? 'Under 8' : interactive ? 'Enter Hours' : idleLabel}
                checked={!!pts?.sleep_ok}
                busy={busy === 'sleep'}
                popping={popFor('sleep')}
                onCheck={() => toggle('sleep')}
              />
              {open === 'sleep' && (
                <div className="px-5 pb-4 pl-[4.25rem] flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={hoursInput}
                    onChange={(e) => setHoursInput(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="8"
                    disabled={!interactive}
                    className="w-20 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-slate-900 text-center"
                  />
                  <span className="text-xs font-bold text-slate-500 flex-1">hours</span>
                  {interactive && (
                    <button type="button" onClick={saveSleep} disabled={busy === 'sleep' || !hoursInput} className="px-4 py-2 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold disabled:opacity-40 cursor-pointer">
                      Save
                    </button>
                  )}
                </div>
              )}
            </li>

            {/* 2. Class attendance (school days; honor system, coach can override) */}
            <li className="border-l-4 border-l-indigo-500">
              <Row
                icon={<GraduationCap className="w-4 h-4" />}
                tone={school ? SCHEDULE.tone : 'bg-slate-100 text-slate-400'}
                title="Class Attendance"
                subtitle={!school ? schoolOff || 'No school today' : classOverride ? `Coach marked ${classOverride}` : <Txt k="dayplan.class.sub" />}
                open={open === 'class'}
                onClick={() => toggle('class')}
                showCheck={showCheck && school}
                interactive={interactive && !classOverride}
                idleLabel={idleLabel}
                checked={classOverride ? classOverride !== 'absent' : checks.has('class:0')}
                busy={busy === 'class:0'}
                popping={popFor('class:0')}
                onCheck={() => toggleCheck('class', 0)}
              />
              {open === 'class' && (
                <p className="px-5 pb-4 pl-[4.25rem] text-xs text-slate-600">
                  {school ? <Txt k="dayplan.class.help" /> : 'No school, so this doesn’t count today.'}
                </p>
              )}
            </li>
          </>
        )}

        {/* 3. Lift / workout (Driveline Baseball app) */}
        <li className={`border-l-4 ${TRAINING.stripe}`}>
          <Row
            icon={<Dumbbell className="w-4 h-4" />}
            tone={TRAINING.tone}
            title="Lift / Workout"
            subtitle={liftStatus === 'rest' ? 'Rest Day' : teamLift ? `${teamLift.title} · ${timeRange(teamLift)}${teamLift.location ? ` · ${teamLift.location}` : ''}` : <Txt k="dayplan.lift.sub" />}
            open={open === 'driveline'}
            onClick={() => toggle('driveline')}
            showCheck={showCheck && liftStatus !== 'rest'}
            interactive={interactive}
            idleLabel={idleLabel}
            checked={liftStatus === 'done'}
            busy={busy === 'lift'}
            popping={popFor('lift')}
            onCheck={() => setLift('done')}
          />
          {open === 'driveline' && (
            <div className="px-5 pb-4 pl-[4.25rem] space-y-2">
              {teamLift && (
                <div className="rounded-xl bg-purple-50 border border-purple-200 px-3 py-2 text-xs">
                  <div className="font-extrabold text-purple-800">{teamLift.title} · {timeRange(teamLift)}</div>
                  <div className="font-semibold text-purple-700">{teamLift.notes || <>{teamLift.location || 'Weight Room'} · <Txt k="dayplan.teamlift.note" /></>}</div>
                  <CoachEdit href={`/office?tab=schedule&event=${teamLift.id}`} label="Edit Event · Repeat" className="mt-1" />
                </div>
              )}
              <p className="text-xs text-slate-600">
                {isCoach ? 'Players’ lifts and mobility are programmed in the Driveline Baseball app.' : <Txt k="dayplan.lift.help" />}
              </p>
              {interactive && (
                <button type="button" onClick={() => setLift('rest')} disabled={busy === 'lift'} className={`w-full py-2 rounded-xl text-xs font-extrabold cursor-pointer ${liftStatus === 'rest' ? 'bg-slate-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {liftStatus === 'rest' ? 'Rest day · tap to undo' : 'Mark Rest Day'}
                </button>
              )}
              <a href={DRIVELINE_APP_URL} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-extrabold">
                Open Driveline Baseball <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </li>

        {/* 4. Baseball training: assigned throwing / hitting work, or your own on the honor system */}
        {workouts.map((w) => {
          const k = `w${w.id}`
          const its = items.filter((i) => i.workout_id === w.id).sort((a, b) => a.block_index - b.block_index || a.item_index - b.item_index)
          const counts = new Map<number, number>()
          its.forEach((i) => counts.set(i.block_index, (counts.get(i.block_index) || 0) + 1))
          const total = its.reduce((n, i) => n + i.sets, 0)
          const done = its.reduce((n, i) => n + Math.min(i.sets, logged.get(i.id) || 0), 0)
          const group = w.group_id ? groups.get(w.group_id) : 'Whole Team'
          const wTools = tools.filter((t) => t.workout_id === w.id)
          const toolsDone = wTools.filter((t) => toolDone.has(`${w.id}:${t.script_id}`)).length
          return (
            <li key={k} className={`border-l-4 ${w.intent ? INTENT_STYLE[w.intent].stripe : TRAINING.stripe}`}>
              <Row
                icon={w.intent ? <Target className="w-4 h-4" /> : <BaseballIcon className="w-4 h-4" />}
                tone={w.intent ? INTENT_STYLE[w.intent].chip : TRAINING.tone}
                title={w.title}
                subtitle={
                  isCoach
                    ? `${group} · ${w.intent ? `${INTENT_LABEL[w.intent]} intent` : phaseLabel(w.phase)}${wTools.length ? ` · ${wTools.length} tool${wTools.length === 1 ? '' : 's'}` : ''}`
                    : [w.intent ? `${INTENT_LABEL[w.intent]} intent` : phaseLabel(w.phase), total ? `${done}/${total} sets` : null, wTools.length ? `${toolsDone}/${wTools.length} bullpen` : null].filter(Boolean).join(' · ')
                }
                open={open === k}
                onClick={() => toggle(k)}
                showCheck={showCheck}
                interactive={interactive}
            idleLabel={idleLabel}
                checked={checks.has(`workout:${w.id}`) || (total > 0 && done >= total)}
                busy={busy === `workout:${w.id}`}
                popping={popFor(`workout:${w.id}`)}
                onCheck={() => toggleCheck('workout', w.id)}
              />
              {open === k && (
                <div className="px-4 pb-4 space-y-2">
                  {wTools.length > 0 && (
                    <ul className="space-y-1.5">
                      {wTools.map((t) => {
                        const sc = scripts.get(t.script_id)
                        const finished = toolDone.has(`${w.id}:${t.script_id}`)
                        return (
                          <li key={t.id} className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                            <Crosshair className="w-4 h-4 text-amber-700 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-extrabold text-slate-900 truncate">{sc?.title ?? 'Bullpen'}</div>
                              <div className="text-[10px] font-semibold text-slate-500">{sc ? `${sc.pitch_count} pitches` : ''}{t.notes ? ` · ${t.notes}` : ''}</div>
                            </div>
                            {isCoach ? null : finished ? (
                              <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg">Done</span>
                            ) : onStartTool ? (
                              <button type="button" onClick={() => onStartTool(t.script_id, w.id, sc?.title ?? 'Bullpen')} className="px-2.5 py-1.5 rounded-lg bg-[#1746b8] text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer">
                                <Play className="w-3 h-3" /> Start
                              </button>
                            ) : (
                              <Link href="/training" className="px-2.5 py-1.5 rounded-lg bg-[#1746b8] text-white text-[11px] font-extrabold">Start</Link>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {!renderWorkout && w.notes && w.intent && <p className="text-xs font-semibold text-slate-600 pl-1">{w.notes}</p>}
                  {w.focus_block && focus.length > 0 && (
                    <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-violet-700 mb-1">Your Focus</div>
                      {focus.map((f) => (
                        <div key={f.title} className="text-xs font-semibold text-slate-700">
                          <span className="font-extrabold text-slate-900">{f.title}:</span> {f.drills.map((d) => d.name + (d.freq ? ` (${d.freq})` : '')).join(', ')}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pl-1">
                    <CoachEdit href={w.program_assignment_id ? '/office?tab=drills&sub=programs' : `/office?tab=workouts&date=${day}&workout=${w.id}`} label={w.program_assignment_id ? 'Edit Program' : 'Edit Workout'} />
                  </div>
                  {!isCoach && dow.team && <DrillOfWeekCard drill={dow.team} />}
                  {!isCoach && <LogStat athleteId={athleteId} date={day} interactive={interactive} />}
                  {renderWorkout ? (
                    its.length > 0 && renderWorkout(w, its)
                  ) : (
                    <div className="pl-[3.25rem] space-y-2">
                      <ul className="space-y-1.5">
                        {its.map((i, n) => (
                          <li key={i.id} className="text-xs font-semibold text-slate-700">
                            {sectionOf(i.notes) && sectionOf(i.notes) !== sectionOf(its[n - 1]?.notes) && (
                              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mt-1 mb-1">{sectionOf(i.notes)}</div>
                            )}
                            <div className="flex items-center gap-2">
                            <span className="w-7 h-6 rounded-md bg-amber-50 text-amber-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                              {itemLabel(i.block_index, i.item_index, counts.get(i.block_index) || 1)}
                            </span>
                            <span className="flex-1">{exercises.get(i.exercise_id)?.name ?? 'Drill'}</span>
                            <span className="text-slate-400">{i.sets}× {i.reps || ''}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {!isCoach && its.length > 0 && (
                        <Link href="/training" className="block text-center py-2.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold">
                          Log It in Training
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}

        {!isCoach && workouts.length === 0 && (
          <li className={`border-l-4 ${TRAINING.stripe}`}>
            <Row
              icon={<BaseballIcon className="w-4 h-4" />}
              tone={trainingRest ? 'bg-slate-100 text-slate-400' : TRAINING.tone}
              title="Baseball Training"
              subtitle={trainingRest ? 'Rest Day' : <Txt k="dayplan.training.sub" />}
              open={open === 'training'}
              onClick={() => toggle('training')}
              showCheck={showCheck && !trainingRest}
              interactive={interactive}
              idleLabel={idleLabel}
              checked={checks.has('training:0')}
              busy={busy === 'training:0'}
              popping={popFor('training:0')}
              onCheck={() => toggleCheck('training', 0)}
            />
            {open === 'training' && (
              <div className="px-4 pb-4 space-y-2">
                <p className="pl-[3.25rem] text-xs text-slate-600"><Txt k="dayplan.training.help" /></p>
                {dow.team && <DrillOfWeekCard drill={dow.team} />}
                <LogStat athleteId={athleteId} date={day} interactive={interactive} />
              </div>
            )}
          </li>
        )}

        {/* 5. Readiness check-in */}
        {!isCoach && (
          <li className="border-l-4 border-l-emerald-500">
            <Row
              icon={<HeartPulse className="w-4 h-4" />}
              tone="bg-emerald-100 text-emerald-700"
              title="Readiness Check-In"
              subtitle={pts?.readiness_ok ? 'Done · tap to see your score' : <Txt k="dayplan.readiness.sub" />}
              open={open === 'readiness'}
              onClick={() => toggle('readiness')}
              showCheck={showCheck}
              interactive={interactive}
              idleLabel={interactive ? 'Check In' : idleLabel}
              checked={!!pts?.readiness_ok}
              busy={false}
              popping={0}
              onCheck={() => toggle('readiness')}
            />
            {open === 'readiness' && (
              <div className="px-4 pb-4">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                  {interactive ? (
                    <ReadinessCheckIn athleteId={athleteId} date={day} embedded onSaved={() => { setOpen(null); after() }} />
                  ) : (
                    <p className="text-xs text-slate-500">{day > today ? 'Check in on the day.' : 'Too far back to change.'}</p>
                  )}
                </div>
              </div>
            )}
          </li>
        )}
      </ul>
      {!isCoach && day !== today && (
        <p className="px-5 py-3 text-[10px] font-semibold text-slate-400">
          {interactive ? 'Past day: check off anything you forgot to log.' : day < today ? 'More than a week ago: showing what you completed.' : 'Upcoming: you can check items off on the day.'}
        </p>
      )}
    </section>
  )
}

function Row({
  icon,
  tone,
  title,
  subtitle,
  open,
  onClick,
  showCheck,
  interactive,
  checked,
  busy,
  onCheck,
  popping = 0,
  idleLabel,
}: {
  icon: React.ReactNode
  tone: string
  title: string
  subtitle: React.ReactNode
  open: boolean
  onClick: () => void
  showCheck: boolean
  interactive: boolean
  checked: boolean
  busy: boolean
  onCheck: () => void
  popping?: number
  idleLabel: string
}) {
  return (
    <div className="flex items-center gap-1 pr-2">
      <button type="button" onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 pl-4 py-3 text-left cursor-pointer">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-extrabold truncate ${checked && showCheck ? 'text-slate-400 line-through decoration-2' : 'text-slate-900'}`}>{title}</div>
          <div className="text-[11px] font-semibold text-slate-500 truncate">{subtitle}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {showCheck && (
        <button
          type="button"
          onClick={onCheck}
          disabled={busy || !interactive}
          aria-label={checked ? `Mark ${title} not done` : `Mark ${title} complete`}
          aria-pressed={checked}
          className={`shrink-0 w-[4.5rem] flex flex-col items-center gap-1 py-2 ${interactive ? 'cursor-pointer' : 'cursor-default'} ${busy ? 'opacity-60' : ''}`}
        >
          {checked ? (
            <PopCircle amount={popping}>
              <Check className="w-5 h-5" strokeWidth={3} />
            </PopCircle>
          ) : (
            <span className={`w-10 h-10 rounded-full flex items-center justify-center bg-white border-[2.5px] text-slate-300 transition active:scale-90 ${interactive ? 'border-slate-300' : 'border-dashed border-slate-200'}`}>
              <Check className="w-5 h-5" strokeWidth={3} />
            </span>
          )}
          <span className={`text-[9px] font-extrabold uppercase tracking-wide leading-none ${checked ? 'text-emerald-600' : 'text-slate-400'}`}>
            {checked ? 'Complete' : idleLabel}
          </span>
        </button>
      )}
    </div>
  )
}
