// Practice plans: a calendar event's outline (team_schedule.plan) or a reusable template (practice_templates.plan).

export type PlanBlock = {
  minutes: number
  title: string
  who: string
  details: string
  /** Runs at the same time as the block before it (e.g. pitchers and position players split) */
  with_previous?: boolean
}
export type PracticePlan = { focus: string; equipment: string; blocks: PlanBlock[] }
export type PracticeTemplate = { id: number; name: string; plan: PracticePlan; sort_order: number }

export const emptyPlan = (): PracticePlan => ({ focus: '', equipment: '', blocks: [] })
export const emptyBlock = (): PlanBlock => ({ minutes: 10, title: '', who: 'Team', details: '' })

export function normalizePlan(raw: unknown): PracticePlan | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PracticePlan>
  return {
    focus: r.focus ?? '',
    equipment: r.equipment ?? '',
    blocks: Array.isArray(r.blocks)
      ? r.blocks.map((b) => ({
          minutes: Number(b?.minutes) || 0,
          title: b?.title ?? '',
          who: b?.who ?? '',
          details: b?.details ?? '',
          with_previous: !!b?.with_previous,
        }))
      : [],
  }
}

/** "3:45 PM" → minutes after midnight (null if unparseable) */
export function parseClock(t: string | null | undefined): number | null {
  if (!t) return null
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  const min = Number(m[2] || 0)
  const ap = (m[3] || '').toLowerCase()
  if (ap.startsWith('p')) h += 12
  else if (!ap && h < 7) h += 12 // "3:45" with no AM/PM → afternoon
  return h * 60 + min
}

export function formatClock(mins: number) {
  const h24 = Math.floor(mins / 60) % 24
  const m = mins % 60
  const h = h24 % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Start offset (minutes from practice start) for each block, honoring blocks that run alongside the previous one. */
export function blockTimes(plan: PracticePlan) {
  const out: { start: number; end: number }[] = []
  let cursor = 0
  let groupStart = 0
  let groupEnd = 0
  plan.blocks.forEach((b, i) => {
    if (i > 0 && b.with_previous) {
      out.push({ start: groupStart, end: groupStart + b.minutes })
      groupEnd = Math.max(groupEnd, groupStart + b.minutes)
      cursor = groupEnd
    } else {
      groupStart = cursor
      groupEnd = cursor + b.minutes
      out.push({ start: cursor, end: groupEnd })
      cursor = groupEnd
    }
  })
  return { times: out, total: cursor }
}

/** One-line text version kept in team_schedule.practice_plan for older views and notifications. */
export function planSummary(plan: PracticePlan, startTime: string | null) {
  const start = parseClock(startTime)
  const { times } = blockTimes(plan)
  return plan.blocks
    .map((b, i) => `${start != null ? formatClock(start + times[i].start) + ' ' : ''}${b.title || 'Block'}`)
    .join(' | ')
}

export const plansEqual = (a: PracticePlan | null, b: PracticePlan | null) => JSON.stringify(a) === JSON.stringify(b)
