'use client'

import { useState } from 'react'
import ScheduleCalendarView from '@/components/ScheduleCalendarView'
import DayPlan from '@/components/DayPlan'
import ParentDay from '@/components/parent/ParentDay'
import { NoPlayer } from '@/components/parent/ParentHome'
import { useProfile } from '@/components/shell/AppShell'
import { localDate } from '@/lib/training'

export default function CalendarPage() {
  const { profile, isCoach, isParent, family } = useProfile()
  const [refreshKey, setRefreshKey] = useState(0)
  if (isParent) {
    if (!family.child) return <NoPlayer />
    return (
      <ScheduleCalendarView
        key={family.child.id}
        today={localDate()}
        initialEvents={[]}
        athleteId={family.child.id}
        eventsOnly
        renderDay={(date) => <ParentDay childId={family.child!.id} date={date} />}
      />
    )
  }
  return (
    <ScheduleCalendarView
      today={localDate()}
      initialEvents={[]}
      athleteId={isCoach ? undefined : profile.id}
      renderDay={(date) => (
        <DayPlan
          athleteId={profile.id}
          date={date}
          isCoach={isCoach}
          showHeader={false}
          refreshKey={refreshKey}
          onChange={() => setRefreshKey((n) => n + 1)}
        />
      )}
    />
  )
}
