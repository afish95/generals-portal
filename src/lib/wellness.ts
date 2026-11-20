export type Checkin = {
  id: number
  athlete_id: string
  check_date: string
  sleep_quality: number
  soreness: number
  stress: number
  sleep_hours: number | null
  note: string | null
  readiness: number
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'

export const ATTENDANCE: { key: AttendanceStatus; label: string; on: string }[] = [
  { key: 'present', label: 'Present', on: 'bg-emerald-500 text-white' },
  { key: 'late', label: 'Late', on: 'bg-amber-500 text-white' },
  { key: 'absent', label: 'Absent', on: 'bg-red-500 text-white' },
  { key: 'excused', label: 'Excused', on: 'bg-slate-500 text-white' },
]

export function readinessMeta(score: number | null | undefined) {
  if (score == null) return { label: 'No check-in', chip: 'bg-slate-100 text-slate-500', ring: '#cbd5e1', headline: 'Check in to see your readiness' }
  if (score >= 75) return { label: 'Green', chip: 'bg-emerald-50 text-emerald-700', ring: '#10b981', headline: 'Ready to go. Full intent today.' }
  if (score >= 50) return { label: 'Yellow', chip: 'bg-amber-50 text-amber-700', ring: '#f59e0b', headline: 'Moderate. Stay sharp, manage volume.' }
  return { label: 'Red', chip: 'bg-red-50 text-red-700', ring: '#ef4444', headline: 'Low readiness. Talk to Coach before high intent.' }
}

/** A check-in that should catch the coach's eye. */
export function needsAttention(c: Pick<Checkin, 'readiness' | 'soreness'> | undefined) {
  return !!c && (c.readiness < 50 || c.soreness >= 4)
}
