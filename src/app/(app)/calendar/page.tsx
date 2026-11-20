'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { PageTitle, Pill } from '@/components/ui'
import { addDays, localDate, phaseLabel, prettyDate, type Group, type Workout } from '@/lib/training'

type Event = { id: number; title: string; event_type: string; event_date: string; start_time: string | null; location: string | null }

export default function CalendarPage() {
  const { isCoach } = useProfile()
  const [range, setRange] = useState<'upcoming' | 'past'>('upcoming')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const today = localDate()
  const from = range === 'upcoming' ? today : addDays(today, -14)
  const to = range === 'upcoming' ? addDays(today, 14) : addDays(today, -1)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('workouts').select('*').gte('workout_date', from).lte('workout_date', to).order('workout_date').order('sort_order'),
      supabase.from('team_schedule').select('id, title, event_type, event_date, start_time, location').gte('event_date', from).lte('event_date', to),
      supabase.from('team_groups').select('*'),
    ]).then(([w, e, g]) => {
      if (cancelled) return
      setWorkouts((w.data as Workout[]) || [])
      setEvents((e.data as Event[]) || [])
      setGroups((g.data as Group[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [from, to])

  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  if (range === 'past') days.reverse()
  const groupName = (id: number | null) => (id === null ? 'Whole team' : groups.find((g) => g.id === id)?.name ?? '')

  return (
    <div>
      <PageTitle title="Calendar" subtitle={isCoach ? 'Every group’s training and team events' : 'Your training and team events'} />
      <div className="flex gap-2 mb-4">
        <Pill active={range === 'upcoming'} onClick={() => setRange('upcoming')}>Next 2 weeks</Pill>
        <Pill active={range === 'past'} onClick={() => setRange('past')}>Past 2 weeks</Pill>
      </div>
      <div className="space-y-2">
        {days.map((d) => {
          const w = workouts.filter((x) => x.workout_date === d)
          const e = events.filter((x) => x.event_date === d)
          return (
            <div key={d} className={`rounded-2xl border p-3 ${d === today ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
              <div className="text-xs font-extrabold text-slate-900">
                {prettyDate(d)} {d === today && <span className="text-[#1746b8]">· Today</span>}
              </div>
              {w.length === 0 && e.length === 0 ? (
                <div className="text-[11px] font-semibold text-slate-400 mt-0.5">Rest day</div>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {e.map((ev) => (
                    <li key={`e${ev.id}`} className="text-xs font-bold text-amber-800 bg-amber-50 rounded-lg px-2 py-1">
                      {ev.title}{ev.start_time ? ` · ${ev.start_time}` : ''}{ev.location ? ` · ${ev.location}` : ''}
                    </li>
                  ))}
                  {w.map((wk) => (
                    <li key={`w${wk.id}`} className="text-xs font-bold text-slate-700 bg-slate-50 rounded-lg px-2 py-1">
                      {wk.title}
                      <span className="text-slate-400 font-semibold"> · {isCoach ? `${groupName(wk.group_id)} · ` : ''}{phaseLabel(wk.phase)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
