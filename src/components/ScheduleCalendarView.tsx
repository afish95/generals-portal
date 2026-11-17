'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Clock, CheckCircle2 } from 'lucide-react'

type CalendarDrill = {
  id: number
  phase: string
  drill_name: string
  sets: string | number | null
  reps: string | number | null
  scheduled_date: string
  notes?: string | null
  is_completed?: boolean
}

type CalendarEvent = {
  id: number
  title: string
  event_type: string
  event_date: string
  start_time?: string | null
  location?: string | null
  practice_plan?: string | null
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function ScheduleCalendarView({
  today,
  initialEvents,
}: {
  today: string
  initialEvents: CalendarEvent[]
}) {
  const supabase = createClient()
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const [selectedDate, setSelectedDate] = useState<string>(today || formatDateKey(new Date()))
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const base = today ? new Date(today + 'T12:00:00') : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const [monthDrills, setMonthDrills] = useState<CalendarDrill[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents || [])
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (initialEvents?.length) setEvents(initialEvents)
  }, [initialEvents])

  const loadRangeData = useCallback(async () => {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const start = formatDateKey(new Date(y, m, -7))
    const end = formatDateKey(new Date(y, m + 1, 14))

    const { data: drillRows } = await supabase
      .from('throwing_program')
      .select('*')
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('sort_order', { ascending: true })
    if (drillRows) setMonthDrills(drillRows)

    const { data: eventRows } = await supabase
      .from('team_schedule')
      .select('*')
      .gte('event_date', start)
      .lte('event_date', end)
      .order('event_date', { ascending: true })
    if (eventRows) setEvents(eventRows)
  }, [currentMonth, supabase])

  useEffect(() => {
    loadRangeData()
  }, [loadRangeData])

  const toggleCard = (key: string) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const navigatePrev = () => {
    if (viewMode === 'month') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
    } else {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() - 7)
      setSelectedDate(formatDateKey(d))
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    }
  }

  const navigateNext = () => {
    if (viewMode === 'month') {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
    } else {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() + 7)
      setSelectedDate(formatDateKey(d))
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    }
  }

  const visibleDays: { date: Date; inCurrentMonth: boolean }[] = []
  if (viewMode === 'month') {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const firstDow = new Date(y, m, 1).getDay()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    for (let i = firstDow - 1; i >= 0; i--) {
      visibleDays.push({ date: new Date(y, m, -i), inCurrentMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      visibleDays.push({ date: new Date(y, m, d), inCurrentMonth: true })
    }
    while (visibleDays.length % 7 !== 0) {
      const nextOffset = visibleDays.length - (firstDow + daysInMonth) + 1
      visibleDays.push({ date: new Date(y, m + 1, nextOffset), inCurrentMonth: false })
    }
  } else {
    const sel = new Date(selectedDate + 'T12:00:00')
    const startOfWeek = new Date(sel)
    startOfWeek.setDate(sel.getDate() - sel.getDay())
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      visibleDays.push({ date: d, inCurrentMonth: d.getMonth() === currentMonth.getMonth() })
    }
  }

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const selectedDayEvents = events.filter((e) => e.event_date === selectedDate)
  const selectedDayDrills = monthDrills.filter((d) => d.scheduled_date === selectedDate)
  const groupedPhases = Array.from(new Set(selectedDayDrills.map((d) => d.phase))).map((phase) => ({
    phase,
    items: selectedDayDrills.filter((d) => d.phase === phase),
  }))

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={navigatePrev} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-extrabold text-slate-900 min-w-[135px] text-center">{monthLabel}</h2>
            <button type="button" onClick={navigateNext} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                viewMode === 'month' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                viewMode === 'week' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 text-[11px] font-bold text-slate-500 mb-3 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
            Games &amp; Practices
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Throwing &amp; Workouts
          </span>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 pb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {visibleDays.map(({ date, inCurrentMonth }) => {
            const key = formatDateKey(date)
            const isSelected = key === selectedDate
            const isToday = key === today
            const hasTeamEvent = events.some((e) => e.event_date === key)
            const hasWorkout = monthDrills.some((d) => d.scheduled_date === key)

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className="flex flex-col items-center justify-center py-1.5 rounded-xl hover:bg-slate-50 transition cursor-pointer"
              >
                <span
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-extrabold transition ${
                    isSelected
                      ? 'bg-amber-500 text-white shadow-sm'
                      : isToday
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                      : inCurrentMonth
                      ? 'text-slate-900'
                      : 'text-slate-300'
                  }`}
                >
                  {date.getDate()}
                </span>
                <div className="flex items-center justify-center gap-1 h-2 mt-1">
                  {hasTeamEvent && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                  {hasWorkout && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
            Schedule for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </h3>
          <span className="text-[11px] font-bold text-slate-400">
            {selectedDayEvents.length + groupedPhases.length} Items
          </span>
        </div>

        {selectedDayEvents.length === 0 && groupedPhases.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs font-semibold text-slate-500">
            No games, practices, or throwing blocks scheduled for this day.
          </div>
        )}

        {selectedDayEvents.map((ev) => {
          const cardKey = `ev-${ev.id}`
          const isOpen = !!expandedCards[cardKey]
          return (
            <div key={cardKey} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="h-1.5 w-full bg-indigo-600" />
              <button
                type="button"
                onClick={() => toggleCard(cardKey)}
                className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/70 transition"
              >
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">{ev.event_type}</span>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">{ev.title}</div>
                </div>
                <div className="flex items-center gap-2.5">
                  {ev.start_time && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {ev.start_time}
                    </span>
                  )}
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                  {ev.start_time && (
                    <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      Start Time: {ev.start_time}
                    </div>
                  )}
                  {ev.location && (
                    <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                      Location: {ev.location}
                    </div>
                  )}
                  {ev.practice_plan ? (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 whitespace-pre-line">
                      <span className="font-extrabold text-slate-900 block mb-1">Itinerary / Notes:</span>
                      {ev.practice_plan}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">No additional notes listed.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {groupedPhases.map((group) => {
          const cardKey = `phase-${group.phase}`
          const isOpen = !!expandedCards[cardKey]
          const phaseTitle = group.phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          return (
            <div key={cardKey} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="h-1.5 w-full bg-amber-500" />
              <button
                type="button"
                onClick={() => toggleCard(cardKey)}
                className="w-full p-4 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/70 transition"
              >
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">Throwing &amp; Workout Block</span>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">{phaseTitle}</div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {group.items.filter((d) => d.is_completed).length}/{group.items.length} Drills
                  </span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-2">
                  {group.items.map((drill) => (
                    <div key={drill.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900">{drill.drill_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {drill.sets ? `${drill.sets} sets` : ''} {drill.reps ? `• ${drill.reps}` : ''}
                        </div>
                        {drill.notes && <div className="text-[11px] text-slate-600 mt-1">{drill.notes}</div>}
                      </div>
                      {drill.is_completed && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
