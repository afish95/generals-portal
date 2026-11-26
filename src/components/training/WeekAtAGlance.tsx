'use client'

import { useEffect, useState } from 'react'
import { Check, Dumbbell, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate } from '@/lib/training'
import { INTENT_LONG, INTENT_STYLE, INTENTS, type Intent } from '@/lib/programs'
import { sundayOf } from '@/lib/trainingMetrics'

type W = { id: number; title: string; workout_date: string; group_id: number | null; intent: Intent | null; program_assignment_id: number | null }
type Prog = { name: string; phase: string | null; weekly_goals: string[] | null }
const RANK: Record<Intent, number> = { low: 1, med: 2, high: 3 }

/** Sun–Sat strip of training days colored by intent, plus the program's phase and weekly goals. */
export default function WeekAtAGlance({ athleteId, date, onPick, refreshKey = 0, position }: { athleteId: string; date: string; onPick: (d: string) => void; refreshKey?: number; position?: string | null }) {
  const start = sundayOf(date)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const today = localDate()
  const [workouts, setWorkouts] = useState<W[] | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [prog, setProg] = useState<Prog | null>(null)
  const [lifts, setLifts] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    const sb = createClient()
    const end = addDays(start, 6)
    ;(async () => {
      const [{ data: w }, { data: gm }, { data: pts }, { data: ev }] = await Promise.all([
        sb.from('workouts').select('id, title, workout_date, group_id, intent, program_assignment_id').gte('workout_date', start).lte('workout_date', end),
        sb.from('group_members').select('group_id').eq('athlete_id', athleteId),
        sb.rpc('athlete_points', { p_athlete: athleteId, p_from: start, p_to: end }),
        sb.from('team_schedule').select('event_date, event_type, start_time, group_ids, is_cancelled').gte('event_date', start).lte('event_date', end).ilike('event_type', '%lift%'),
      ])
      const mine = new Set(((gm as { group_id: number }[]) || []).map((g) => g.group_id))
      const list = ((w as W[]) || []).filter((x) => x.group_id == null || mine.has(x.group_id))
      const aid = list.find((x) => x.program_assignment_id)?.program_assignment_id
      let p: Prog | null = null
      if (aid) {
        const { data: pa } = await sb.from('program_assignments').select('program:programs(name, phase, weekly_goals)').eq('id', aid).maybeSingle()
        p = ((pa as unknown as { program: Prog | null } | null)?.program) || null
      }
      if (cancelled) return
      setWorkouts(list)
      setDone(new Set(((pts as { d: string; throw_ok: boolean }[]) || []).filter((r) => r.throw_ok).map((r) => String(r.d))))
      setProg(p)
      setLifts(
        new Map(
          ((ev as { event_date: string; start_time: string | null; group_ids: number[] | null; is_cancelled: boolean | null }[]) || [])
            .filter((e) => !e.is_cancelled && (!e.group_ids?.length || e.group_ids.some((g) => mine.has(g))))
            .map((e) => [e.event_date, e.start_time || ''])
        )
      )
    })()
    return () => {
      cancelled = true
    }
  }, [athleteId, start, refreshKey])

  const byDay = (d: string) => (workouts || []).filter((w) => w.workout_date === d)
  const topIntent = (d: string): Intent | null =>
    byDay(d).reduce<Intent | null>((best, w) => (w.intent && (!best || RANK[w.intent] > RANK[best]) ? w.intent : best), null)
  const throwDays = days.filter((d) => topIntent(d))
  const throwDone = throwDays.filter((d) => done.has(d)).length
  const highDays = days.filter((d) => topIntent(d) === 'high').length
  const trainDays = days.filter((d) => byDay(d).length)
  const trainDone = trainDays.filter((d) => done.has(d)).length

  // Built for throwing programs: pitchers and two-way players always see it; position players only when a throwing program is on their week.
  if (workouts !== null && position !== 'pitcher' && position !== 'two_way' && throwDays.length === 0 && lifts.size === 0) return null

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Week at a Glance</span>
        <span className="text-[10px] font-bold text-slate-400">
          {new Date(`${start}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(`${addDays(start, 6)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const it = topIntent(d)
          const hasOther = false
          const sel = d === date
          const dt = new Date(`${d}T12:00:00`)
          return (
            <button key={d} type="button" onClick={() => onPick(d)} className={`flex flex-col items-center gap-1 py-1.5 rounded-xl cursor-pointer ${sel ? 'bg-slate-100' : ''}`}>
              <span className={`text-[10px] font-extrabold ${d === today ? 'text-[#1746b8]' : 'text-slate-400'}`}>{dt.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
              <span
                className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-black ${
                  it ? INTENT_STYLE[it].solid : hasOther ? 'bg-amber-100 text-amber-800' : 'bg-white border border-slate-200 text-slate-400'
                } ${d === today ? 'ring-2 ring-offset-1 ring-[#1746b8]' : ''}`}
              >
                {dt.getDate()}
                {done.has(d) && (it || hasOther) && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" strokeWidth={4} />
                  </span>
                )}
              </span>
              <span className="text-[8px] font-extrabold uppercase text-slate-400 h-2">{it ? (it === 'low' ? 'Rec' : it) : ''}</span>
              <span className="h-3.5 flex items-center" title={lifts.has(d) ? `Team Lift ${lifts.get(d)}` : undefined}>
                {lifts.has(d) && <Dumbbell className="w-3.5 h-3.5 text-teal-600" />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-slate-500">
        {[...INTENTS].reverse().map((i) => (
          <span key={i} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${INTENT_STYLE[i].dot}`} /> {INTENT_LONG[i]}
          </span>
        ))}
        {lifts.size > 0 && (
          <span className="flex items-center gap-1">
            <Dumbbell className="w-3 h-3 text-teal-600" /> Team Lift
          </span>
        )}
      </div>

      {workouts !== null && (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#1746b8] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-slate-900 truncate">{prog?.phase ? `${prog.phase} Phase` : prog?.name || 'This Week'}</div>
              {prog?.phase && <div className="text-[11px] font-semibold text-slate-500 truncate">{prog.name}</div>}
            </div>
          </div>
          <ul className="mt-2 space-y-1">
            {throwDays.length > 0 && <Goal text={`${throwDays.length} throwing day${throwDays.length === 1 ? '' : 's'}`} have={throwDone} need={throwDays.length} />}
            {highDays > 0 && <Goal text={`${highDays} High-intent day${highDays === 1 ? '' : 's'}`} />}
            {lifts.size > 0 && <Goal text={`${lifts.size} Team Lift${lifts.size === 1 ? '' : 's'} (Driveline Baseball)`} />}
            {!throwDays.length && trainDays.length > 0 && <Goal text={`Train ${trainDays.length}x`} have={trainDone} need={trainDays.length} />}
            {(prog?.weekly_goals || []).map((g) => <Goal key={g} text={g} />)}
            {!trainDays.length && !lifts.size && !(prog?.weekly_goals || []).length && <li className="text-xs font-semibold text-slate-400">Nothing assigned this week yet.</li>}
          </ul>
        </div>
      )}
    </section>
  )
}

function Goal({ text, have, need }: { text: string; have?: number; need?: number }) {
  const met = need != null && have != null && have >= need
  return (
    <li className="flex items-center gap-2 text-xs font-bold text-slate-700">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${met ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'}`}>{met && <Check className="w-2.5 h-2.5" strokeWidth={4} />}</span>
      <span className="flex-1">{text}</span>
      {need != null && <span className="text-[10px] font-extrabold text-slate-400">{have}/{need}</span>}
    </li>
  )
}
