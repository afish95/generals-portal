'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, canLogDay, localDate, LOG_BACK_DAYS, prettyDate } from '@/lib/training'
import { useProfile } from '@/components/shell/AppShell'
import NotificationSetup from '@/components/NotificationSetup'
import AnnouncementsFeed from '@/components/AnnouncementsFeed'
import TeamPrFeed from '@/components/TeamPrFeed'
import CoachDashboard from '@/components/coach/CoachDashboard'
import ReadinessCheckIn from '@/components/wellness/ReadinessCheckIn'
import DayPlan from '@/components/DayPlan'
import DailyPointsCard from '@/components/points/DailyPointsCard'
import ClassStandings from '@/components/points/ClassStandings'
import BodyWeightCard from '@/components/wellness/BodyWeightCard'
import ViewAsPicker from '@/components/shell/ViewAsPicker'
import StreakCard from '@/components/points/StreakCard'
import StreakAlerts from '@/components/coach/StreakAlerts'

export default function HomePage() {
  const { profile, isCoach, viewAs } = useProfile()
  const [pointsKey, setPointsKey] = useState(0)
  const [day, setDay] = useState(localDate())

  if (isCoach) {
    return (
      <div className="space-y-4">
        <div className="lg:hidden">
          <div className="text-xs font-bold text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Welcome back, {profile.full_name.split(' ').slice(-1)[0]}</h1>
        </div>
        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
          <div className="space-y-4 lg:col-span-2">
            <NotificationSetup />
            <StreakAlerts />
            <CoachDashboard />
          </div>
          <div className="space-y-4">
            <ViewAsPicker />
            <ClassStandings />
            <TeamPrFeed limit={6} />
            <AnnouncementsFeed limit={2} />
          </div>
        </div>
      </div>
    )
  }

  // Player Home, in Coach's order: date + greeting → Announcements → Streak → Day plan → points (with readiness) → Class Cup → Body weight
  const today = localDate()
  const isToday = day === today
  const earliest = addDays(today, -LOG_BACK_DAYS)
  const refresh = () => setPointsKey((n) => n + 1)
  return (
    <div className="space-y-4">
      <PlayerGreeting
        name={profile.full_name.split(' ')[0]}
        day={day}
        isToday={isToday}
        canBack={day > earliest}
        onBack={() => setDay((d) => addDays(d, -1))}
        onForward={() => setDay((d) => (d < today ? addDays(d, 1) : d))}
        onToday={() => setDay(today)}
      />
      {!viewAs.active && <NotificationSetup hideWhenOn />}
      <AnnouncementsFeed limit={3} />
      <StreakCard athleteId={profile.id} refreshKey={pointsKey} />
      <DayPlan athleteId={profile.id} date={day} refreshKey={pointsKey} onChange={refresh} />
      <DailyPointsCard
        athleteId={profile.id}
        date={day}
        refreshKey={pointsKey}
        onChange={refresh}
        readiness={canLogDay(day) ? <ReadinessCheckIn athleteId={profile.id} date={day} embedded onSaved={refresh} /> : undefined}
      />
      <ClassStandings myClass={profile.grad_year} />
      <BodyWeightCard athleteId={profile.id} date={day} key={day} />
    </div>
  )
}

/** Player Home header: the day being shown (step back up to a week to catch up on logs) and a short greeting. */
function PlayerGreeting({
  name,
  day,
  isToday,
  canBack,
  onBack,
  onForward,
  onToday,
}: {
  name: string
  day: string
  isToday: boolean
  canBack: boolean
  onBack: () => void
  onForward: () => void
  onToday: () => void
}) {
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return (
    <div>
      <div className="flex items-center gap-1 -ml-1.5">
        <button type="button" onClick={onBack} disabled={!canBack} aria-label="Previous day" className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 disabled:opacity-30 cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className={`text-xs font-bold ${isToday ? 'text-slate-500' : 'text-[#1746b8]'}`}>
          {prettyDate(day, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <button type="button" onClick={onForward} disabled={isToday} aria-label="Next day" className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 disabled:opacity-30 cursor-pointer">
          <ChevronRight className="w-4 h-4" />
        </button>
        {!isToday && (
          <button type="button" onClick={onToday} className="ml-auto px-3 py-1.5 rounded-full bg-[#1746b8] text-white text-[11px] font-extrabold cursor-pointer">
            Back to today
          </button>
        )}
      </div>
      <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{isToday ? `${hello}, ${name}` : 'Catching up?'}</h1>
      <p className="text-sm font-semibold text-slate-500">
        {isToday ? 'Stack your points today and keep the streak alive.' : 'Check off anything you forgot to log for this day. It counts toward your points.'}
      </p>
    </div>
  )
}
