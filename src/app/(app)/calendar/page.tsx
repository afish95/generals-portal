'use client'

import ScheduleCalendarView from '@/components/ScheduleCalendarView'
import { localDate } from '@/lib/training'

export default function CalendarPage() {
  return <ScheduleCalendarView today={localDate()} initialEvents={[]} />
}
