// Shared types and helpers for the training app.

export type Role = 'coach' | 'player' | 'parent'

export type Profile = {
  id: string
  username: string
  full_name: string
  role: Role
  position_group: string | null
  grad_year: number | null
  is_active: boolean
  is_demo?: boolean
  has_login?: boolean
  contact_email?: string | null
  top_size?: string | null
  bottom_size?: string | null
  roster_note?: string | null
}

export const PROFILE_FIELDS = 'id, username, full_name, role, position_group, grad_year, is_active, is_demo, has_login, contact_email, top_size, bottom_size, roster_note'

export type Tracking = 'velocity' | 'distance' | 'accuracy' | 'reps' | 'time' | 'weight_reps'
export type Discipline = 'throwing' | 'hitting' | 'arm_care' | 'other'

export type Exercise = {
  id: number
  name: string
  discipline: Discipline
  category: string
  tracking: Tracking
  unit: string | null
  video_url: string | null
  notes: string | null
  is_active: boolean
}

export type GroupCategory = 'Team' | 'Trip' | 'Position' | 'Status' | 'Workout' | 'Focus' | 'Custom'
export const GROUP_CATEGORIES: { key: GroupCategory; label: string; hint: string }[] = [
  { key: 'Team', label: 'Teams', hint: 'Varsity, JV, JV2' },
  { key: 'Trip', label: 'Trips & travel', hint: 'Travel rosters and bubbles' },
  { key: 'Position', label: 'Positions', hint: 'Pitchers, catchers, hitters' },
  { key: 'Status', label: 'Status', hint: 'Swing players and other labels' },
  { key: 'Workout', label: 'Workout groups', hint: 'Used to assign training' },
  { key: 'Focus', label: 'Focus groups', hint: 'Automatic, from player plans' },
  { key: 'Custom', label: 'Custom', hint: 'Anything else' },
]
export type Group = {
  id: number
  name: string
  color: string
  sort_order: number
  category?: GroupCategory
  has_chat?: boolean
  description?: string | null
}

export type Phase = 'off_season' | 'preseason' | 'in_season' | 'postseason'
export const PHASES: { key: Phase; label: string }[] = [
  { key: 'off_season', label: 'Off-season' },
  { key: 'preseason', label: 'Preseason' },
  { key: 'in_season', label: 'In-season' },
  { key: 'postseason', label: 'Postseason' },
]
export const phaseLabel = (p: string) => PHASES.find((x) => x.key === p)?.label ?? p

export type Workout = {
  id: number
  title: string
  workout_date: string
  group_id: number | null
  phase: Phase
  notes: string | null
  sort_order: number
  intent?: 'low' | 'med' | 'high' | null
  focus_block?: boolean
  program_assignment_id?: number | null
}

export type WorkoutItem = {
  id: number
  workout_id: number
  exercise_id: number
  block_index: number
  item_index: number
  sets: number
  reps: string | null
  load: string | null
  rest_seconds: number | null
  notes: string | null
}

export type SetLog = {
  id: number
  workout_item_id: number
  athlete_id: string
  exercise_id: number
  set_number: number
  reps: number | null
  weight: number | null
  value: number | null
  attempts: number | null
  completed: boolean
  logged_at: string
}

export type PrEvent = {
  id: number
  athlete_id: string
  exercise_id: number
  set_log_id: number | null
  pr_type: 'rep_max' | 'e1rm' | 'value'
  reps: number | null
  value: number
  previous_value: number | null
  achieved_at: string
}

export const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: 'throwing', label: 'Throwing' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'arm_care', label: 'Arm care' },
  { key: 'other', label: 'Other' },
]

export const TRACKING: { key: Tracking; label: string; defaultUnit: string }[] = [
  { key: 'velocity', label: 'Velocity (higher is better)', defaultUnit: 'mph' },
  { key: 'distance', label: 'Distance (higher is better)', defaultUnit: 'ft' },
  { key: 'accuracy', label: 'Made / attempts (e.g. strikes)', defaultUnit: 'strikes' },
  { key: 'reps', label: 'Count (throws, swings)', defaultUnit: 'reps' },
  { key: 'time', label: 'Time (lower is better)', defaultUnit: 'sec' },
]

/** Superset labels: a block with one item is "A"; with several, "A1", "A2"… */
export function itemLabel(blockIndex: number, itemIndex: number, itemsInBlock: number) {
  const letter = String.fromCharCode(65 + (blockIndex % 26))
  return itemsInBlock > 1 ? `${letter}${itemIndex + 1}` : letter
}

/** Local calendar date as YYYY-MM-DD (avoids UTC shifting the day). */
export function localDate(d: Date = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return localDate(dt)
}

export function prettyDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts)
}

export function round1(n: number) {
  return Math.round(n * 10) / 10
}

export function formatPr(pr: Pick<PrEvent, 'pr_type' | 'value' | 'reps'>, ex?: Pick<Exercise, 'tracking' | 'unit'>) {
  if (pr.pr_type === 'rep_max') return `${round1(pr.value)} lb × ${pr.reps}`
  if (pr.pr_type === 'e1rm') return `${round1(pr.value)} lb est. max`
  if (ex?.tracking === 'accuracy') return `${round1(pr.value)}%`
  return `${round1(pr.value)} ${ex?.unit ?? ''}`.trim()
}

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function firstName(full: string | null | undefined) {
  return (full || '').split(' ')[0] || 'Athlete'
}

/** Players can log today and this many days back (forgotten check-offs, check-ins, weights). */
export const LOG_BACK_DAYS = 7
export function canLogDay(day: string, today = localDate()) {
  return day <= today && day >= addDays(today, -LOG_BACK_DAYS)
}
