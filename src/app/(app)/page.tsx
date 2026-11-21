'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Flame, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import NotificationSetup from '@/components/NotificationSetup'
import AnnouncementsFeed from '@/components/AnnouncementsFeed'
import TeamPrFeed from '@/components/TeamPrFeed'
import CoachDashboard from '@/components/coach/CoachDashboard'
import ReadinessCheckIn from '@/components/wellness/ReadinessCheckIn'
import BodyWeightCard from '@/components/wellness/BodyWeightCard'
import ThoughtOfWeek from '@/components/ThoughtOfWeek'
import DailyPointsCard from '@/components/points/DailyPointsCard'
import ClassStandings from '@/components/points/ClassStandings'
import { addDays, firstName, localDate, type Group, type Workout, type WorkoutItem } from '@/lib/training'

type TodayRow = { workout: Workout; total: number; done: number }
type CoachRow = { workout: Workout; groupName: string; logged: number; expected: number }

export default function HomePage() {
  const { profile, isCoach } = useProfile()
  const [streak, setStreak] = useState<number | null>(null)
  const [weekSets, setWeekSets] = useState(0)
  const [today, setToday] = useState<TodayRow[]>([])
  const [coachToday, setCoachToday] = useState<CoachRow[]>([])
  const [pointsKey, setPointsKey] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const date = localDate()
    const load = async () => {
      if (isCoach) return // the coach dashboard loads its own data
      const { data: w } = await supabase.from('workouts').select('*').eq('workout_date', date).order('sort_order')
      const workouts = (w as Workout[]) || []
      const ids = workouts.map((x) => x.id)
      const { data: it } = ids.length ? await supabase.from('workout_items').select('*').in('workout_id', ids) : { data: [] }
      const items = (it as WorkoutItem[]) || []

      if (isCoach) {
        const itemIds = items.map((i) => i.id)
        const [{ data: logs }, { data: groups }, { data: members }, { data: players }] = await Promise.all([
          itemIds.length ? supabase.from('set_logs').select('workout_item_id, athlete_id').in('workout_item_id', itemIds) : Promise.resolve({ data: [] }),
          supabase.from('team_groups').select('*'),
          supabase.from('group_members').select('group_id, athlete_id'),
          supabase.from('profiles').select('id').eq('role', 'player').eq('is_active', true),
        ])
        if (cancelled) return
        const gList = (groups as Group[]) || []
        const mem = (members as { group_id: number; athlete_id: string }[]) || []
        setCoachToday(
          workouts.map((wk) => {
            const mine = new Set(items.filter((i) => i.workout_id === wk.id).map((i) => i.id))
            const athletes = new Set(((logs as { workout_item_id: number; athlete_id: string }[]) || []).filter((l) => mine.has(l.workout_item_id)).map((l) => l.athlete_id))
            return {
              workout: wk,
              groupName: wk.group_id === null ? 'Whole team' : gList.find((g) => g.id === wk.group_id)?.name ?? 'Group',
              logged: athletes.size,
              expected: wk.group_id === null ? (players || []).length : mem.filter((m) => m.group_id === wk.group_id).length,
            }
          })
        )
        return
      }

      // Player: streak and weekly volume come from the database (no row cap), today's progress from today's items.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
      const weekStart = addDays(date, -6)
      const itemIds = items.map((i) => i.id)
      const [{ data: dayRows }, { count }, { data: todayLogs }] = await Promise.all([
        supabase.rpc('training_days', { p_athlete: profile.id, p_since: addDays(date, -400), p_tz: tz }),
        supabase
          .from('set_logs')
          .select('id', { count: 'exact', head: true })
          .eq('athlete_id', profile.id)
          .gte('logged_at', new Date(`${weekStart}T00:00:00`).toISOString()),
        itemIds.length
          ? supabase.from('set_logs').select('workout_item_id').eq('athlete_id', profile.id).in('workout_item_id', itemIds)
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const days = new Set(((dayRows as string[]) || []).map(String))
      let s = 0
      let cursor = days.has(date) ? date : addDays(date, -1)
      while (days.has(cursor)) {
        s++
        cursor = addDays(cursor, -1)
      }
      setStreak(s)
      setWeekSets(count || 0)
      const logs = (todayLogs as { workout_item_id: number }[]) || []
      setToday(
        workouts.map((wk) => {
          const its = items.filter((i) => i.workout_id === wk.id)
          const ids2 = new Set(its.map((i) => i.id))
          return { workout: wk, total: its.reduce((n, i) => n + i.sets, 0), done: logs.filter((l) => ids2.has(l.workout_item_id)).length }
        })
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isCoach, profile.id])

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-bold text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          {isCoach ? `Welcome back, ${profile.full_name.split(' ').slice(-1)[0]}` : `Let’s work, ${firstName(profile.full_name)}`}
        </h1>
      </div>

      <NotificationSetup />
      <ThoughtOfWeek />

      {isCoach ? (
        <>
          <CoachDashboard />
          <ClassStandings />
        </>
      ) : (
        <>
          <ReadinessCheckIn athleteId={profile.id} onSaved={() => setPointsKey((n) => n + 1)} />
          <DailyPointsCard athleteId={profile.id} refreshKey={pointsKey} />
          <ClassStandings myClass={profile.grad_year} />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-gradient-to-br from-orange-400 to-rose-500 text-white p-4">
              <Flame className="w-5 h-5" />
              <div className="text-3xl font-black mt-1">{streak ?? '–'}</div>
              <div className="text-[11px] font-bold text-orange-50">day streak</div>
            </div>
            <div className="rounded-3xl bg-gradient-to-br from-[#1746b8] to-indigo-600 text-white p-4">
              <Target className="w-5 h-5" />
              <div className="text-3xl font-black mt-1">{weekSets}</div>
              <div className="text-[11px] font-bold text-blue-100">sets this week</div>
            </div>
          </div>

          <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Today</div>
            {today.length === 0 ? (
              <p className="text-xs font-medium text-slate-500">Recovery day. Nothing scheduled.</p>
            ) : (
              <div className="space-y-3">
                {today.map((r) => (
                  <div key={r.workout.id}>
                    <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                      <span>{r.workout.title}</span>
                      <span className="text-xs text-slate-500">{r.done}/{r.total} sets</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${r.total ? Math.round((100 * r.done) / r.total) : 0}%` }} />
                    </div>
                  </div>
                ))}
                <Link href="/training" className="block text-center py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold">
                  Start training
                </Link>
              </div>
            )}
          </section>
          <BodyWeightCard athleteId={profile.id} />
        </>
      )}

      <TeamPrFeed limit={6} />
      <AnnouncementsFeed limit={2} />
    </div>
  )
}
