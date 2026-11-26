'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileDown, MapPin, Users } from 'lucide-react'
import { KIND_STYLE, kindOf, minutesOf, timeRange, type ScheduleEvent } from '@/lib/schedule'
import { INTENT_LABEL, INTENT_STYLE, type Intent } from '@/lib/programs'

export type AgendaWorkout = { id: number; title: string; workout_date: string; group_id: number | null; intent?: Intent | null }

/** Google Calendar–style week overview: each day lists untimed items (training, deadlines) first, then timed events in order. */
export default function WeekAgenda({
  days,
  today,
  events,
  workouts,
  groups,
  isCoach,
  onPickDay,
}: {
  days: string[]
  today: string
  events: ScheduleEvent[]
  workouts: AgendaWorkout[]
  groups: Map<number, string>
  isCoach: boolean
  onPickDay: (d: string) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const who = (ids: number[] | null | undefined) => (!ids || ids.length === 0 ? 'Whole program' : ids.map((g) => groups.get(g) || 'Group').join(', '))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
      {days.map((d) => {
        const dt = new Date(`${d}T12:00:00`)
        const dayEvents = events
          .filter((e) => e.event_date === d && !e.is_cancelled)
          .sort((a, b) => (minutesOf(a.start_time) ?? -1) - (minutesOf(b.start_time) ?? -1) || a.title.localeCompare(b.title))
        const untimed = dayEvents.filter((e) => minutesOf(e.start_time) == null)
        const timed = dayEvents.filter((e) => minutesOf(e.start_time) != null)
        const dayWorkouts = workouts.filter((w) => w.workout_date === d)
        const empty = !dayEvents.length && !dayWorkouts.length
        const isToday = d === today
        return (
          <section key={d} className="flex gap-3 px-3 py-3">
            <button type="button" onClick={() => onPickDay(d)} className="w-11 shrink-0 flex flex-col items-center pt-0.5 cursor-pointer">
              <span className={`text-[10px] font-extrabold uppercase ${isToday ? 'text-[#1746b8]' : 'text-slate-400'}`}>{dt.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className={`w-8 h-8 mt-0.5 rounded-full flex items-center justify-center text-sm font-black ${isToday ? 'bg-[#1746b8] text-white' : 'text-slate-900'}`}>{dt.getDate()}</span>
            </button>
            <div className="flex-1 min-w-0 space-y-1.5">
              {empty && <p className="text-xs font-semibold text-slate-300 pt-2.5">Nothing scheduled</p>}

              {/* Untimed: training and all-day items */}
              {dayWorkouts.map((w) => {
                const st = w.intent ? INTENT_STYLE[w.intent] : null
                return (
                  <div key={`w${w.id}`} className={`rounded-lg border px-2.5 py-1.5 flex items-center gap-2 ${st ? st.chip : `${KIND_STYLE.training.block} ${KIND_STYLE.training.text}`}`}>
                    <span className={`w-1.5 self-stretch rounded-full ${st ? st.dot : KIND_STYLE.training.bar}`} />
                    <span className="text-xs font-extrabold truncate flex-1">{w.title}</span>
                    <span className="text-[10px] font-bold opacity-80 shrink-0">
                      {w.intent ? `${INTENT_LABEL[w.intent]} intent` : 'Training'}
                      {isCoach && w.group_id ? ` · ${groups.get(w.group_id) || 'Group'}` : ''}
                    </span>
                  </div>
                )
              })}
              {untimed.map((e) => (
                <EventBlock key={e.id} e={e} open={open === `e${e.id}`} onToggle={() => setOpen(open === `e${e.id}` ? null : `e${e.id}`)} who={who(e.group_ids)} isCoach={isCoach} />
              ))}

              {/* Timed events */}
              {timed.map((e) => (
                <EventBlock key={e.id} e={e} open={open === `e${e.id}`} onToggle={() => setOpen(open === `e${e.id}` ? null : `e${e.id}`)} who={who(e.group_ids)} isCoach={isCoach} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function EventBlock({ e, open, onToggle, who, isCoach }: { e: ScheduleEvent; open: boolean; onToggle: () => void; who: string; isCoach: boolean }) {
  const k = kindOf(e.event_type)
  const st = KIND_STYLE[k]
  const hasPlan = !!e.plan && typeof e.plan === 'object' && Array.isArray((e.plan as { blocks?: unknown[] }).blocks) && (e.plan as { blocks: unknown[] }).blocks.length > 0
  return (
    <div className={`rounded-lg border ${st.block} overflow-hidden`}>
      <button type="button" onClick={onToggle} className="w-full flex gap-2 px-2.5 py-2 text-left cursor-pointer">
        <span className={`w-1.5 rounded-full shrink-0 ${st.bar}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-extrabold text-slate-900 truncate flex-1">{e.title}</span>
            <span className={`text-[10px] font-extrabold shrink-0 ${st.text}`}>{timeRange(e)}</span>
          </div>
          {(e.location || who !== 'Whole program') && (
            <div className="text-[11px] font-semibold text-slate-500 truncate">
              {[e.location, who !== 'Whole program' ? who : null].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pl-6 space-y-1.5 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5 font-semibold">
            <span className={`text-[9px] font-extrabold uppercase tracking-wider ${st.text}`}>{st.label}</span>
            <span className="text-slate-300">·</span>
            <Users className="w-3 h-3" /> {who}
          </div>
          {e.location && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(e.location)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-semibold text-[#1746b8]">
              <MapPin className="w-3 h-3" /> {e.location}
            </a>
          )}
          {(e.notes || e.practice_plan) && <p className="whitespace-pre-line">{e.notes || e.practice_plan}</p>}
          <div className="flex gap-3">
            {hasPlan && (
              <a href={`/practice-print?event=${e.id}`} className="inline-flex items-center gap-1 font-extrabold text-[#1746b8]">
                <FileDown className="w-3 h-3" /> Practice Plan
              </a>
            )}
            {isCoach && (
              <Link href={`/office?tab=schedule&event=${e.id}`} className="font-extrabold text-[#1746b8]">
                Edit
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
