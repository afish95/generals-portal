'use client'

import { CalendarPlus, MapPin, Navigation } from 'lucide-react'
import OpponentBadge from '@/components/OpponentBadge'
import { useOpponents } from '@/lib/opponents'
import { KIND_STYLE, kindOf, timeRange, type ScheduleEvent } from '@/lib/schedule'
import { addToCalendar, directionsUrl } from '@/lib/parent'

/** One schedule item for parents: what, when, where, with Directions and Add to Calendar. */
export default function ParentEventCard({ e, showDate = false }: { e: ScheduleEvent; showDate?: boolean }) {
  const opps = useOpponents()
  const k = KIND_STYLE[kindOf(e.event_type)]
  const opp = e.opponent_id ? opps.get(e.opponent_id) : null
  const date = new Date(e.event_date + 'T12:00:00')
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex">
      <div className={`w-1.5 shrink-0 ${k.bar}`} />
      <div className="flex-1 min-w-0 p-3 space-y-2">
        <div className="flex items-start gap-2.5">
          {showDate && (
            <div className="w-10 shrink-0 text-center">
              <div className="text-[10px] font-extrabold uppercase text-slate-400 leading-none">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className="text-lg font-extrabold text-slate-900 leading-tight">{date.getDate()}</div>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] font-extrabold uppercase tracking-wider ${k.text}`}>{k.label}</div>
            <div className="text-sm font-extrabold text-slate-900 leading-snug">{e.title}</div>
            <div className="text-xs font-semibold text-slate-500">{timeRange(e)}</div>
            {e.location && (
              <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 min-w-0">
                <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{e.location}</span>
              </div>
            )}
          </div>
          {opp && <OpponentBadge opp={opp} size={34} />}
        </div>
        {e.notes && <p className="text-xs text-slate-600 whitespace-pre-line">{e.notes}</p>}
        <div className="flex gap-1.5">
          <button type="button" onClick={() => addToCalendar(e)} className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer">
            <CalendarPlus className="w-3.5 h-3.5" /> Add to Calendar
          </button>
          {e.location && (
            <a href={directionsUrl(e.location)} target="_blank" rel="noreferrer" className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1">
              <Navigation className="w-3.5 h-3.5" /> Directions
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
