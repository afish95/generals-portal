'use client'

import { useState } from 'react'
import ScheduleCalendarView from '@/components/ScheduleCalendarView'
import DayPlan from '@/components/DayPlan'
import { useProfile } from '@/components/shell/AppShell'
import { localDate } from '@/lib/training'

export default function CalendarPage() {
  const { profile, isCoach } = useProfile()
  const [refreshKey, setRefreshKey] = useState(0)
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
