'use client'

import ParentEventCard from './ParentEventCard'
import { useChildEvents } from './useChild'

/** Calendar day panel for parents: that day's team events for their player. */
export default function ParentDay({ childId, date }: { childId: string; date: string }) {
  const events = useChildEvents(childId, date, date)
  if (events === null) return <div className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse" />
  if (!events.length) return <p className="text-xs text-slate-500 px-1">Nothing scheduled.</p>
  return (
    <div className="space-y-2">
      {events.map((e) => (
        <ParentEventCard key={e.id} e={e} />
      ))}
    </div>
  )
}
