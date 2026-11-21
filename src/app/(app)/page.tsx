'use client'

import { useState } from 'react'
import { useProfile } from '@/components/shell/AppShell'
import NotificationSetup from '@/components/NotificationSetup'
import AnnouncementsFeed from '@/components/AnnouncementsFeed'
import TeamPrFeed from '@/components/TeamPrFeed'
import CoachDashboard from '@/components/coach/CoachDashboard'
import ReadinessCheckIn from '@/components/wellness/ReadinessCheckIn'
import ThoughtOfWeek from '@/components/ThoughtOfWeek'
import ThoughtLine from '@/components/ThoughtLine'
import DayPlan from '@/components/DayPlan'
import DailyPointsCard from '@/components/points/DailyPointsCard'
import ClassStandings from '@/components/points/ClassStandings'

export default function HomePage() {
  const { profile, isCoach } = useProfile()
  const [pointsKey, setPointsKey] = useState(0)

  if (isCoach) {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-xs font-bold text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Welcome back, {profile.full_name.split(' ').slice(-1)[0]}</h1>
        </div>
        <NotificationSetup />
        <ThoughtOfWeek />
        <CoachDashboard />
        <ClassStandings />
        <TeamPrFeed limit={6} />
        <AnnouncementsFeed limit={2} />
      </div>
    )
  }

  // Player Home, in Coach's order: Announcements → Day plan → Today's points (with readiness) → Class Cup
  return (
    <div className="space-y-4">
      <NotificationSetup hideWhenOn />
      <AnnouncementsFeed limit={3} topSlot={<ThoughtLine />} />
      <DayPlan athleteId={profile.id} refreshKey={pointsKey} onChange={() => setPointsKey((n) => n + 1)} />
      <DailyPointsCard
        athleteId={profile.id}
        refreshKey={pointsKey}
        onChange={() => setPointsKey((n) => n + 1)}
        readiness={<ReadinessCheckIn athleteId={profile.id} embedded onSaved={() => setPointsKey((n) => n + 1)} />}
      />
      <ClassStandings myClass={profile.grad_year} />
    </div>
  )
}
