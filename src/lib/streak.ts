// Perfect-day streak: consecutive days where a player earned every available daily point.
// Today counts once it's perfect; until then the streak runs through yesterday (today can still be saved).

export const STREAK_GOAL = 14

export type DayScore = { d: string; earned: number; available: number }

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

export const isPerfect = (s?: DayScore) => !!s && s.available > 0 && s.earned >= s.available

export function computeStreak(days: DayScore[], today: string) {
  const byDay = new Map(days.map((s) => [s.d, s]))
  const todayScore = byDay.get(today)
  const todayPerfect = isPerfect(todayScore)
  const lastDay = todayPerfect ? today : addDays(today, -1)
  let streak = 0
  let cursor = lastDay
  while (isPerfect(byDay.get(cursor))) {
    streak++
    cursor = addDays(cursor, -1)
  }
  const completions = Math.floor(streak / STREAK_GOAL)
  // Day the latest 14-day milestone was reached (for the award record)
  const milestoneDay = completions > 0 ? addDays(lastDay, -(streak - completions * STREAK_GOAL)) : null
  return {
    streak,
    todayPerfect,
    todayEarned: todayScore?.earned ?? 0,
    todayAvailable: todayScore?.available ?? 0,
    completions,
    /** Progress inside the current 14-day run (a finished run shows full) */
    progress: streak > 0 && streak % STREAK_GOAL === 0 ? STREAK_GOAL : streak % STREAK_GOAL,
    milestoneDay,
    lastDay,
  }
}

export { addDays as streakAddDays }
