export type DayPoints = {
  athlete_id: string
  full_name: string
  grad_year: number | null
  d: string
  sleep_ok: boolean
  readiness_ok: boolean
  attend_avail: boolean
  attend_ok: boolean
  lift_avail: boolean
  lift_ok: boolean
  throw_avail: boolean
  throw_ok: boolean
  available: number
  earned: number
}

export const normalizePoints = (rows: unknown): DayPoints[] =>
  ((rows as DayPoints[]) || []).map((r) => ({ ...r, d: String(r.d), available: Number(r.available), earned: Number(r.earned) }))

export const pct = (earned: number, available: number) => (available ? Math.round((100 * earned) / available) : 0)

/** Start of the school-year season: Aug 1 of the current school year. */
export function seasonStart(today: string) {
  const [y, m] = today.split('-').map(Number)
  return `${m >= 8 ? y : y - 1}-08-01`
}

export const className = (grad: number | null) => (grad ? `Class of ${grad}` : 'No class set')
