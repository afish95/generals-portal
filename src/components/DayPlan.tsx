'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Crosshair, FileDown, Pencil, Dumbbell, ExternalLink, GraduationCap, MapPin, Play, Target, Trophy, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { canLogDay, itemLabel, localDate, phaseLabel, prettyDate, type Exercise, type Group, type Workout, type WorkoutItem } from '@/lib/training'
import { withPointsDelta } from '@/lib/pointsDelta'
import { PopCircle, buzz } from '@/components/points/PointBurst'
import PracticePlanView from '@/components/practice/PracticePlanView'
import { normalizePlan } from '@/lib/practicePlan'

const DRIVELINE_APP_URL = 'https://apps.apple.com/us/app/driveline-training/id6445937141'

type Event = { id: number; title: string; event_type: string; start_time: string | null; location: string | null; practice_plan: string | null; plan: unknown }
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
  const [liftDone, setLiftDone] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pop, setPop] = useState<{ key: string; amount: number } | null>(null)
  const [tools, setTools] = useState<Tool[]>([])
  const [scripts, setScripts] = useState<Map<number, Script>>(new Map())
  const [toolDone, setToolDone] = useState<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const load = async () => {
      const [{ data: ev }, { data: w }, { data: gr }] = await Promise.all([
        supabase.from('team_schedule').select('id, title, event_type, start_time, location, practice_plan, plan').eq('event_date', day).order('start_time'),
        supabase.from('workouts').select('*').eq('workout_date', day).order('sort_order'),
        supabase.from('team_groups').select('id, name'),
      ])
      let wList = (w as Workout[]) || []
      if (!isCoach && wList.some((x) => x.group_id != null)) {
        const { data: gm } = await supabase.from('group_members').select('group_id').eq('athlete_id', athleteId)
        const mine = new Set(((gm as { group_id: number }[]) || []).map((g) => g.group_id))
        wList = wList.filter((x) => x.group_id == null || mine.has(x.group_id))
      }
      const ids = wList.map((x) => x.id)
      const [{ data: it }, { data: ex }, { data: tl }, { data: sc }, { data: bs }] = await Promise.all([
        ids.length ? supabase.from('workout_items').select('*').in('workout_id', ids) : Promise.resolve({ data: [] }),
        supabase.from('exercises').select('*'),
        ids.length ? supabase.from('workout_tools').select('id, workout_id, script_id, notes').in('workout_id', ids).order('sort_order') : Promise.resolve({ data: [] }),
        supabase.from('bullpen_scripts').select('id, title, pitch_count'),
        !isCoach && ids.length
          ? supabase.from('bullpen_sessions').select('workout_id, script_id').eq('player_id', athleteId).in('workout_id', ids)
          : Promise.resolve({ data: [] }),
      ])
      const itemList = (it as WorkoutItem[]) || []
      const itemIds = itemList.map((i) => i.id)
      const [{ data: lg }, { data: pc }, { data: hl }] = await Promise.all([
        !isCoach && itemIds.length
          ? supabase.from('set_logs').select('workout_item_id').eq('athlete_id', athleteId).in('workout_item_id', itemIds)
          : Promise.resolve({ data: [] }),
        !isCoach
          ? supabase.from('plan_checks').select('item_type, item_id').eq('athlete_id', athleteId).eq('check_date', day)
          : Promise.resolve({ data: [] }),
        !isCoach
          ? supabase.from('habit_logs').select('status').eq('athlete_id', athleteId).eq('log_date', day).eq('habit', 'lift').maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (cancelled) return
      const counts = new Map<number, number>()
      for (const l of (lg as { workout_item_id: number }[]) || []) counts.set(l.workout_item_id, (counts.get(l.workout_item_id) || 0) + 1)
      setChecks(new Set(((pc as { item_type: string; item_id: number }[]) || []).map((c) => `${c.item_type}:${c.item_id}`)))
      setLiftDone((hl as { status: string } | null)?.status === 'done')
      setEvents((ev as Event[]) || [])
      setWorkouts(wList)
      setItems(itemList)
      setExercises(new Map(((ex as Exercise[]) || []).map((e) => [e.id, e])))
      setGroups(new Map(((gr as Pick<Group, 'id' | 'name'>[]) || []).map((g) => [g.id, g.name])))
      setLogged(counts)
      setTools((tl as Tool[]) || [])
      setScripts(new Map(((sc as Script[]) || []).map((x) => [x.id, x])))
      setToolDone(new Set(((bs as { workout_id: number; script_id: number }[]) || []).map((b) => `${b.workout_id}:${b.script_id}`)))
      setLoadedFor(day)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [athleteId, day, isCoach, refreshKey])

  // Plays the "+N point" animation only when the check-off actually earned points.
  const celebrate = (key: string, amount: number) => {
    buzz()
    if (amount <= 0) return
    setPop({ key, amount })
    setTimeout(() => setPop((p) => (p?.key === key ? null : p)), 1300)
  }
  const popFor = (key: string) => (pop?.key === key ? pop.amount : 0)

  // Each check-off saves (or removes) just that one record, then refreshes Today's points.
  const toggleCheck = async (type: 'event' | 'workout' | 'class', id: number) => {
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
    onChange?.()
  }

  const toggleLift = async () => {
    if (!interactive) return
    const supabase = createClient()
    setBusy('lift')
    if (liftDone) {
      const { error } = await supabase.from('habit_logs').delete().eq('athlete_id', athleteId).eq('log_date', day).eq('habit', 'lift')
      if (!error) setLiftDone(false)
    } else {
      let failed = false
      const gained = await withPointsDelta(athleteId, day, async () => {
        const { error } = await supabase.from('habit_logs').upsert({ athlete_id: athleteId, log_date: day, habit: 'lift', status: 'done' }, { onConflict: 'athlete_id,log_date,habit' })
        failed = !!error
      })
      if (!failed) {
        setLiftDone(true)
        celebrate('lift', gained)
      }
    }
    setBusy(null)
    onChange?.()
  }

  if (loadedFor !== day) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />

  const toggle = (k: string) => setOpen((o) => (o === k ? null : k))
  const school = isSchoolDay(day)
  const showCheck = !isCoach
  const idleLabel = interactive ? 'Mark complete' : day > today ? 'Upcoming' : 'Not done'

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      {showHeader && (
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Day plan</span>
          <span className="text-[10px] font-bold text-slate-400">{prettyDate(day, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
      )}
      <ul className="divide-y divide-slate-100">
        {/* ---- Games & Practice (indigo) ---- */}
        {events.map((e) => {
          const k = `e${e.id}`
          const isGame = /game/i.test(e.event_type)
          return (
            <li key={k} className={`border-l-4 ${SCHEDULE.stripe}`}>
              <Row
                icon={isGame ? <Trophy className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                tone={SCHEDULE.tone}
                title={e.title}
                subtitle={[e.event_type, e.start_time, e.location].filter(Boolean).join(' · ')}
                open={open === k}
                onClick={() => toggle(k)}
                showCheck={showCheck}
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
                    if (!plan || plan.blocks.length === 0) return <p className="text-xs text-slate-600 whitespace-pre-line">{e.practice_plan || 'No plan posted yet.'}</p>
                    return (
                      <>
                        <PracticePlanView plan={plan} startTime={e.start_time} />
                        <div className="flex gap-2 pt-1">
                          <a href={`/practice-print?event=${e.id}`} className="flex-1 py-2 rounded-xl bg-[#1746b8] text-white text-[11px] font-extrabold flex items-center justify-center gap-1">
                            <FileDown className="w-3.5 h-3.5" /> Export 1-page
                          </a>
                          {isCoach && (
                            <Link href={`/office?tab=practices&event=${e.id}`} className="flex-1 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1">
                              <Pencil className="w-3.5 h-3.5" /> Edit plan
                            </Link>
                          )}
                        </div>
                      </>
                    )
                  })()}
                  {isCoach && !normalizePlan(e.plan)?.blocks.length && (
                    <Link href={`/office?tab=practices&event=${e.id}`} className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#1746b8]">
                      <Pencil className="w-3.5 h-3.5" /> Build a practice plan
                    </Link>
                  )}
                </div>
              )}
            </li>
          )
        })}

        {/* Class attendance on school days (players) */}
        {!isCoach && school && (
          <li className={`border-l-4 ${SCHEDULE.stripe}`}>
            <Row
              icon={<GraduationCap className="w-4 h-4" />}
              tone={SCHEDULE.tone}
              title="Class attendance"
              subtitle="Attended all my classes today"
              open={open === 'class'}
              onClick={() => toggle('class')}
              showCheck={showCheck}
              interactive={interactive}
            idleLabel={idleLabel}
              checked={checks.has('class:0')}
              busy={busy === 'class:0'}
              popping={popFor('class:0')}
              onCheck={() => toggleCheck('class', 0)}
            />
            {open === 'class' && (
              <p className="px-5 pb-4 pl-[4.25rem] text-xs text-slate-600">
                Check this off once your school day is done. Your attendance point counts classes and practice together.
              </p>
            )}
          </li>
        )}

        {/* ---- Training & Workouts (amber) ---- */}
        {workouts.map((w) => {
          const k = `w${w.id}`
          const its = items.filter((i) => i.workout_id === w.id).sort((a, b) => a.block_index - b.block_index || a.item_index - b.item_index)
          const counts = new Map<number, number>()
          its.forEach((i) => counts.set(i.block_index, (counts.get(i.block_index) || 0) + 1))
          const total = its.reduce((n, i) => n + i.sets, 0)
          const done = its.reduce((n, i) => n + Math.min(i.sets, logged.get(i.id) || 0), 0)
          const group = w.group_id ? groups.get(w.group_id) : 'Whole team'
          const wTools = tools.filter((t) => t.workout_id === w.id)
          const toolsDone = wTools.filter((t) => toolDone.has(`${w.id}:${t.script_id}`)).length
          return (
            <li key={k} className={`border-l-4 ${TRAINING.stripe}`}>
              <Row
                icon={<Target className="w-4 h-4" />}
                tone={TRAINING.tone}
                title={w.title}
                subtitle={
                  isCoach
                    ? `${group} · ${phaseLabel(w.phase)}${wTools.length ? ` · ${wTools.length} tool${wTools.length === 1 ? '' : 's'}` : ''}`
                    : [phaseLabel(w.phase), total ? `${done}/${total} sets` : null, wTools.length ? `${toolsDone}/${wTools.length} bullpen` : null].filter(Boolean).join(' · ')
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
                  {renderWorkout ? (
                    its.length > 0 && renderWorkout(w, its)
                  ) : (
                    <div className="pl-[3.25rem] space-y-2">
                      <ul className="space-y-1.5">
                        {its.map((i) => (
                          <li key={i.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <span className="w-7 h-6 rounded-md bg-amber-50 text-amber-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                              {itemLabel(i.block_index, i.item_index, counts.get(i.block_index) || 1)}
                            </span>
                            <span className="flex-1">{exercises.get(i.exercise_id)?.name ?? 'Drill'}</span>
                            <span className="text-slate-400">{i.sets}× {i.reps || ''}</span>
                          </li>
                        ))}
                      </ul>
                      {!isCoach && its.length > 0 && (
                        <Link href="/training" className="block text-center py-2.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold">
                          Log it in Training
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}

        {/* Lift / mobility lives in the Driveline Baseball app */}
        <li className={`border-l-4 ${TRAINING.stripe}`}>
          <Row
            icon={<Dumbbell className="w-4 h-4" />}
            tone={TRAINING.tone}
            title="Lift / workout / mobility"
            subtitle="Driveline Baseball strength & conditioning"
            open={open === 'driveline'}
            onClick={() => toggle('driveline')}
            showCheck={showCheck}
            interactive={interactive}
            idleLabel={idleLabel}
            checked={liftDone}
            busy={busy === 'lift'}
            popping={popFor('lift')}
            onCheck={toggleLift}
          />
          {open === 'driveline' && (
            <div className="px-5 pb-4 pl-[4.25rem] space-y-2">
              <p className="text-xs text-slate-600">
                {isCoach ? 'Players’ lifts and mobility are programmed in the Driveline Baseball app.' : 'Today’s lift and mobility are in the Driveline Baseball app. When you finish, tap the circle to mark it complete.'}
              </p>
              <a href={DRIVELINE_APP_URL} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-extrabold">
                Open Driveline Baseball <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </li>
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
  subtitle: string
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
          <div className="text-[11px] font-semibold text-slate-500 truncate capitalize">{subtitle}</div>
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
