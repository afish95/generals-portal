'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { visibleTo, type ScheduleEvent } from '@/lib/schedule'

/** The player's groups and the team events they're part of between two dates (cancelled ones dropped). */
export function useChildEvents(childId: string | undefined, from: string, to: string) {
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)
  useEffect(() => {
    if (!childId) return
    let cancelled = false
    const sb = createClient()
    Promise.all([
      sb.from('group_members').select('group_id').eq('athlete_id', childId),
      sb.from('team_schedule').select('*').gte('event_date', from).lte('event_date', to).order('event_date').order('start_time'),
    ]).then(([{ data: gm }, { data: ev }]) => {
      if (cancelled) return
      const mine = new Set(((gm as { group_id: number }[]) || []).map((g) => g.group_id))
      setEvents(((ev as ScheduleEvent[]) || []).filter((e) => !e.is_cancelled && visibleTo(e, mine)))
    })
    return () => {
      cancelled = true
    }
  }, [childId, from, to])
  return events
}
