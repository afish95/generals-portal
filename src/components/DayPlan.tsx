'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Dumbbell, ExternalLink, MapPin, Target, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { itemLabel, localDate, phaseLabel, type Exercise, type Workout, type WorkoutItem } from '@/lib/training'

const DRIVELINE_APP_URL = 'https://apps.apple.com/us/app/driveline-training/id6445937141'

type Event = { id: number; title: string; event_type: string; start_time: string | null; location: string | null; practice_plan: string | null }

export default function DayPlan({ athleteId, onChange, refreshKey = 0 }: { athleteId: string; onChange?: () => void; refreshKey?: number }) {
  const [events, setEvents] = useState<Event[]>([])
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [items, setItems] = useState<WorkoutItem[]>([])
  const [exercises, setExercises] = useState<Map<number, Exercise>>(new Map())
  const [logged, setLogged] = useState<Map<number, number>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [checks, setChecks] = useState<Set<string>>(new Set())
  const [liftDone, setLiftDone] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pop, setPop] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const today = localDate()
    const load = async () => {
      const [{ data: ev }, { data: w }] = await Promise.all([
        supabase.from('team_schedule').select('id, title, event_type, start_time, location, practice_plan').eq('event_date', today).order('start_time'),
        supabase.from('workouts').select('*').eq('workout_date', today).order('sort_order'),
      ])
      const wList = (w as Workout[]) || []
      const ids = wList.map((x) => x.id)
      const [{ data: it }, { data: ex }] = await Promise.all([
        ids.length ? supabase.from('workout_items').select('*').in('workout_id', ids) : Promise.resolve({ data: [] }),
        supabase.from('exercises').select('*'),
      ])
      const itemList = (it as WorkoutItem[]) || []
      const itemIds = itemList.map((i) => i.id)
      const [{ data: lg }, { data: pc }, { data: hl }] = await Promise.all([
        itemIds.length
          ? supabase.from('set_logs').select('workout_item_id').eq('athlete_id', athleteId).in('workout_item_id', itemIds)
          : Promise.resolve({ data: [] }),
        supabase.from('plan_checks').select('item_type, item_id').eq('athlete_id', athleteId).eq('check_date', today),
        supabase.from('habit_logs').select('status').eq('athlete_id', athleteId).eq('log_date', today).eq('habit', 'lift').maybeSingle(),
      ])
      if (cancelled) return
      setChecks(new Set(((pc as { item_type: string; item_id: number }[]) || []).map((c) => `${c.item_type}:${c.item_id}`)))
      setLiftDone((hl as { status: string } | null)?.status === 'done')
      const counts = new Map<number, number>()
      for (const l of (lg as { workout_item_id: number }[]) || []) counts.set(l.workout_item_id, (counts.get(l.workout_item_id) || 0) + 1)
      setEvents((ev as Event[]) || [])
      setWorkouts(wList)
      setItems(itemList)
      setExercises(new Map(((ex as Exercise[]) || []).map((e) => [e.id, e])))
      setLogged(counts)
      setLoaded(true)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [athleteId, refreshKey])

  const celebrate = (key: string) => {
    setPop(key)
    if ('vibrate' in navigator) navigator.vibrate?.(40)
    setTimeout(() => setPop((p) => (p === key ? null : p)), 1300)
  }

  // Each check-off saves (or removes) just that one record, then refreshes Today's points.
  const toggleCheck = async (type: 'event' | 'workout', id: number) => {
    const key = `${type}:${id}`
    const supabase = createClient()
    const today = localDate()
    setBusy(key)
    if (checks.has(key)) {
      await supabase.from('plan_checks').delete().eq('athlete_id', athleteId).eq('check_date', today).eq('item_type', type).eq('item_id', id)
      setChecks((c) => {
        const n = new Set(c)
        n.delete(key)
        return n
      })
    } else {
      await supabase.from('plan_checks').insert({ athlete_id: athleteId, check_date: today, item_type: type, item_id: id })
      setChecks((c) => new Set(c).add(key))
      celebrate(key)
    }
    setBusy(null)
    onChange?.()
  }
  const toggleLift = async () => {
    const supabase = createClient()
    const today = localDate()
    setBusy('lift')
    if (liftDone) {
      await supabase.from('habit_logs').delete().eq('athlete_id', athleteId).eq('log_date', today).eq('habit', 'lift')
      setLiftDone(false)
    } else {
      await supabase.from('habit_logs').upsert({ athlete_id: athleteId, log_date: today, habit: 'lift', status: 'done' }, { onConflict: 'athlete_id,log_date,habit' })
      setLiftDone(true)
      celebrate('lift')
    }
    setBusy(null)
    onChange?.()
  }

  if (!loaded) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />

  const toggle = (k: string) => setOpen((o) => (o === k ? null : k))

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Day plan</span>
        <span className="text-[10px] font-bold text-slate-400">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {/* Practice and team events from the calendar */}
        {events.map((e) => {
          const k = `e${e.id}`
          return (
            <li key={k}>
              <Row
                icon={<Users className="w-4 h-4" />}
                tone="bg-purple-100 text-purple-700"
                title={e.title}
                subtitle={[e.event_type, e.start_time, e.location].filter(Boolean).join(' · ')}
                open={open === k}
                onClick={() => toggle(k)}
                checked={checks.has(`event:${e.id}`)}
                busy={busy === `event:${e.id}`}
                popping={pop === `event:${e.id}`}
                onCheck={() => toggleCheck('event', e.id)}
              />
              {open === k && (
                <div className="px-5 pb-4 pl-[4.25rem] space-y-1.5">
                  {e.location && (
                    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {e.location}
                    </div>
                  )}
                  <p className="text-xs text-slate-600 whitespace-pre-line">{e.practice_plan || 'No practice plan posted yet.'}</p>
                </div>
              )}
            </li>
          )
        })}

        {/* Throwing / hitting programmed in this app */}
        {workouts.map((w) => {
          const k = `w${w.id}`
          const its = items.filter((i) => i.workout_id === w.id).sort((a, b) => a.block_index - b.block_index || a.item_index - b.item_index)
          const counts = new Map<number, number>()
          its.forEach((i) => counts.set(i.block_index, (counts.get(i.block_index) || 0) + 1))
          const total = its.reduce((n, i) => n + i.sets, 0)
          const done = its.reduce((n, i) => n + Math.min(i.sets, logged.get(i.id) || 0), 0)
          return (
            <li key={k}>
              <Row
                icon={<Target className="w-4 h-4" />}
                tone="bg-amber-100 text-amber-700"
                title={w.title}
                subtitle={`${phaseLabel(w.phase)} · ${done}/${total} sets logged`}
                open={open === k}
                onClick={() => toggle(k)}
                checked={checks.has(`workout:${w.id}`) || (total > 0 && done >= total)}
                busy={busy === `workout:${w.id}`}
                popping={pop === `workout:${w.id}`}
                onCheck={() => toggleCheck('workout', w.id)}
              />
              {open === k && (
                <div className="px-5 pb-4 pl-[4.25rem] space-y-2">
                  <ul className="space-y-1.5">
                    {its.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <span className="w-7 h-6 rounded-md bg-blue-50 text-[#1746b8] text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {itemLabel(i.block_index, i.item_index, counts.get(i.block_index) || 1)}
                        </span>
                        <span className="flex-1">{exercises.get(i.exercise_id)?.name ?? 'Drill'}</span>
                        <span className="text-slate-400">{i.sets}× {i.reps || ''}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/training" className="block text-center py-2.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold">
                    Log it in Training
                  </Link>
                </div>
              )}
            </li>
          )
        })}

        {/* Lift / mobility lives in Driveline */}
        <li>
          <Row
            icon={<Dumbbell className="w-4 h-4" />}
            tone="bg-slate-900 text-white"
            title="Lift / workout / mobility"
            subtitle="Driveline Baseball strength & conditioning"
            open={open === 'driveline'}
            onClick={() => toggle('driveline')}
            checked={liftDone}
            busy={busy === 'lift'}
            popping={pop === 'lift'}
            onCheck={toggleLift}
          />
          {open === 'driveline' && (
            <div className="px-5 pb-4 pl-[4.25rem] space-y-2">
              <p className="text-xs text-slate-600">Today’s lift and mobility are in the Driveline Baseball app. When you finish, tap the circle to mark it complete.</p>
              <a href={DRIVELINE_APP_URL} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-extrabold">
                Open Driveline Baseball <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </li>
      </ul>
      {events.length === 0 && workouts.length === 0 && (
        <p className="px-5 pb-4 text-xs font-medium text-slate-500">No practice or throwing on the calendar today.</p>
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
  checked,
  busy,
  onCheck,
  popping = false,
}: {
  icon: React.ReactNode
  tone: string
  title: string
  subtitle: string
  open: boolean
  onClick: () => void
  checked: boolean
  busy: boolean
  onCheck: () => void
  popping?: boolean
}) {
  return (
    <div className="flex items-center gap-1 pr-2">
      <button type="button" onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 pl-5 py-3 text-left cursor-pointer">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-extrabold truncate ${checked ? 'text-slate-400 line-through decoration-2' : 'text-slate-900'}`}>{title}</div>
          <div className="text-[11px] font-semibold text-slate-500 truncate capitalize">{subtitle}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <button
        type="button"
        onClick={onCheck}
        disabled={busy}
        aria-label={checked ? `Mark ${title} not done` : `Mark ${title} complete`}
        aria-pressed={checked}
        className={`shrink-0 w-[4.5rem] flex flex-col items-center gap-1 py-2 cursor-pointer ${busy ? 'opacity-60' : ''}`}
      >
        <span className="relative">
          <span
            key={popping ? 'pop' : checked ? 'on' : 'off'}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 ${
              checked ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 animate-gen-pop' : 'bg-white border-[2.5px] border-slate-300 text-slate-300'
            }`}
          >
            {popping ? <span className="text-sm font-black leading-none">+1</span> : <Check className="w-5 h-5" strokeWidth={3} />}
          </span>
          {popping && (
            <span className="pointer-events-none absolute left-1/2 -top-2 whitespace-nowrap rounded-full bg-amber-400 text-white text-[10px] font-black px-2 py-0.5 shadow animate-gen-float">
              +1 point
            </span>
          )}
        </span>
        <span className={`text-[9px] font-extrabold uppercase tracking-wide leading-none ${checked ? 'text-emerald-600' : 'text-slate-400'}`}>
          {checked ? 'Complete' : 'Mark complete'}
        </span>
      </button>
    </div>
  )
}
