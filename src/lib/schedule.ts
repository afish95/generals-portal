export type ScheduleEvent = {
  id: number
  title: string
  event_type: string
  event_date: string
  start_time?: string | null
  end_time?: string | null
  location?: string | null
  practice_plan?: string | null
  notes?: string | null
  group_ids?: number[] | null
  series_id?: string | null
  plan?: unknown
  is_cancelled?: boolean | null
}

export type EventKind = 'game' | 'practice' | 'program' | 'deadline'

export const EVENT_KINDS: { key: EventKind; label: string; type: string }[] = [
  { key: 'game', label: 'Game', type: 'Game' },
  { key: 'practice', label: 'Practice', type: 'practice' },
  { key: 'program', label: 'Program Event', type: 'Program event' },
  { key: 'deadline', label: 'Deadline', type: 'Deadline' },
]

export const kindOf = (eventType: string | null | undefined): EventKind => {
  const t = (eventType || '').toLowerCase()
  if (t.includes('game')) return 'game'
  if (t.includes('practice')) return 'practice'
  if (t.includes('deadline') || t.includes('cut off')) return 'deadline'
  return 'program'
}

/** Calendar colors: games red, practices indigo, program events (fundraisers, meetings) violet, deadlines slate, training amber. */
export const KIND_STYLE: Record<EventKind | 'training', { block: string; bar: string; text: string; dot: string; label: string }> = {
  game: { block: 'bg-red-50 border-red-200', bar: 'bg-red-500', text: 'text-red-700', dot: 'bg-red-500', label: 'Game' },
  practice: { block: 'bg-indigo-50 border-indigo-200', bar: 'bg-indigo-600', text: 'text-indigo-700', dot: 'bg-indigo-600', label: 'Practice' },
  program: { block: 'bg-violet-50 border-violet-200', bar: 'bg-violet-500', text: 'text-violet-700', dot: 'bg-violet-500', label: 'Program' },
  deadline: { block: 'bg-slate-50 border-slate-200', bar: 'bg-slate-500', text: 'text-slate-600', dot: 'bg-slate-500', label: 'Deadline' },
  training: { block: 'bg-amber-50 border-amber-200', bar: 'bg-amber-500', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Training' },
}

/** "3:45 PM" / "15:45" → minutes after midnight (null when there's no time). */
export function minutesOf(t: string | null | undefined): number | null {
  if (!t) return null
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/)
  if (!m) return null
  let h = Number(m[1]) % 24
  const min = Number(m[2] || 0)
  const ap = m[3]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + min
}

/** "15:45" (time input) → "3:45 PM" (how times are stored and shown). */
export function to12h(v: string): string {
  const mins = minutesOf(v)
  if (mins == null) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "3:45 PM" → "15:45" for a time input. */
export function to24h(t: string | null | undefined): string {
  const mins = minutesOf(t)
  if (mins == null) return ''
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export const timeRange = (e: Pick<ScheduleEvent, 'start_time' | 'end_time'>) =>
  e.start_time ? (e.end_time ? `${e.start_time} – ${e.end_time}` : e.start_time) : 'All day'

/** Whole-program events (no groups) show for everyone; group events only for members. Coaches see everything. */
export const visibleTo = (e: ScheduleEvent, myGroups: Set<number> | null) =>
  !myGroups || !e.group_ids || e.group_ids.length === 0 || e.group_ids.some((g) => myGroups.has(g))
