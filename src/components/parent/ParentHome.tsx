'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Flame, MessageCircle, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import AnnouncementsFeed from '@/components/AnnouncementsFeed'
import NotificationSetup from '@/components/NotificationSetup'
import { addDays, localDate } from '@/lib/training'
import { computeStreak, isPerfect, streakAddDays, STREAK_GOAL, type DayScore } from '@/lib/streak'
import { minutesOf } from '@/lib/schedule'
import ParentEventCard from './ParentEventCard'
import { useChildEvents } from './useChild'

type Pr = { id: number; value: number; pr_type: string; reps: number | null; achieved_at: string; exercise: { name: string } | null }

export function NoPlayer() {
  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-6 text-center space-y-1">
      <div className="text-sm font-extrabold text-slate-900">No Player Connected</div>
      <p className="text-xs text-slate-500">Ask your player or a coach for a parent invite link.</p>
    </section>
  )
}

/** Parent Home: what's next, how the week is going, and team news. No health data. */
export default function ParentHome() {
  const { profile, family, viewAs } = useProfile()
  const child = family.child
  const today = localDate()
  const events = useChildEvents(child?.id, today, addDays(today, 21))
  const [days, setDays] = useState<DayScore[]>([])
  const [prs, setPrs] = useState<Pr[]>([])

  useEffect(() => {
    if (!child) return
    let cancelled = false
    const sb = createClient()
    Promise.all([
      sb.rpc('athlete_points', { p_athlete: child.id, p_from: streakAddDays(today, -119), p_to: today }),
      sb.from('pr_events').select('id, value, pr_type, reps, achieved_at, exercise:exercises(name)').eq('athlete_id', child.id).gte('achieved_at', addDays(today, -14)).order('achieved_at', { ascending: false }).limit(5),
    ]).then(([{ data: pts }, { data: pr }]) => {
      if (cancelled) return
      setDays(((pts as { athlete_id: string; d: string; earned: number; available: number }[]) || []).filter((r) => r.athlete_id === child.id).map((r) => ({ d: String(r.d), earned: Number(r.earned), available: Number(r.available) })))
      setPrs((pr as unknown as Pr[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [child, today])

  if (!child) return <NoPlayer />
  const first = child.full_name.split(' ')[0]
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const upcoming = (events || []).filter((e) => e.event_date > today || (minutesOf(e.end_time) ?? minutesOf(e.start_time) ?? 24 * 60) >= nowMins)
  const next = upcoming[0]
  const after = upcoming.slice(1, 4)
  const byDay = new Map(days.map((d) => [d.d, d]))
  const weekStart = addDays(today, -new Date(today + 'T12:00:00').getDay())
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const perfect = week.filter((d) => d <= today && isPerfect(byDay.get(d))).length
  const streak = computeStreak(days, today).streak

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-bold text-slate-500">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Hi, {viewAs.active ? profile.full_name : profile.full_name.split(' ')[0]}</h1>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Next Up</h2>
          <Link href="/calendar" className="text-xs font-extrabold text-[#1746b8] flex items-center">Full Schedule <ChevronRight className="w-3.5 h-3.5" /></Link>
        </div>
        {events === null ? (
          <div className="h-24 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        ) : next ? (
          <>
            <ParentEventCard e={next} showDate />
            {after.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100">
                {after.map((e) => (
                  <Link key={e.id} href="/calendar" className="flex items-center gap-3 px-3 py-2">
                    <div className="w-12 text-[11px] font-extrabold text-slate-500">{new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</div>
                    <div className="flex-1 min-w-0 text-xs font-bold text-slate-800 truncate">{e.title}</div>
                    <div className="text-[11px] font-semibold text-slate-500">{e.start_time || 'TBA'}</div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500 px-1">Nothing on the schedule for the next 3 weeks.</p>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900">{first}’s Week</h2>
          <div className="flex items-center gap-1 text-xs font-extrabold text-orange-600">
            <Flame className="w-4 h-4" /> {streak} Day Streak
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {week.map((d) => {
            const s = byDay.get(d)
            const ok = isPerfect(s)
            const future = d > today
            return (
              <div key={d} className="text-center">
                <div className="text-[10px] font-bold text-slate-400">{'SMTWTFS'[new Date(d + 'T12:00:00').getDay()]}</div>
                <div className={`mx-auto mt-1 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold ${ok ? 'bg-green-500 text-white' : future ? 'border border-dashed border-slate-200 text-slate-300' : d === today ? 'border-2 border-[#1746b8] text-[#1746b8]' : 'bg-slate-100 text-slate-400'}`}>
                  {ok ? '✓' : new Date(d + 'T12:00:00').getDate()}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-slate-500">
          {perfect} perfect {perfect === 1 ? 'day' : 'days'} this week. A perfect day means {first} did everything on the daily plan; {STREAK_GOAL} in a row earns a streak award.
        </p>
        {prs.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            {prs.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="font-extrabold text-amber-700 text-[10px] uppercase">New PR</span>
                <span className="flex-1 min-w-0 truncate font-bold text-slate-800">{p.exercise?.name || 'Lift'}</span>
                <span className="font-extrabold text-slate-900">{Number(p.value)}{p.reps ? ` × ${p.reps}` : ''}</span>
              </div>
            ))}
          </div>
        )}
        <Link href="/family" className="flex items-center justify-center gap-1 text-xs font-extrabold text-[#1746b8]">See {first}’s Stats & Progress <ChevronRight className="w-3.5 h-3.5" /></Link>
      </section>

      <Link href="/messages" className="flex items-center gap-3 bg-[#1746b8] text-white rounded-2xl px-4 py-3 shadow-sm">
        <MessageCircle className="w-5 h-5" />
        <div className="flex-1">
          <div className="text-sm font-extrabold">Message a Coach</div>
          <div className="text-[11px] text-blue-100">Questions for the coaching staff.</div>
        </div>
        <ChevronRight className="w-4 h-4" />
      </Link>

      <NotificationSetup />
      <AnnouncementsFeed limit={5} />
    </div>
  )
}
