'use client'

import { createClient } from '@/lib/supabase'

/** The signed-in athlete's daily points earned on a given date. */
export async function myEarned(athleteId: string, date: string): Promise<number> {
  const { data } = await createClient().rpc('athlete_points', { p_athlete: athleteId, p_from: date, p_to: date })
  const row = ((data as { athlete_id: string; earned: number }[]) || []).find((r) => r.athlete_id === athleteId)
  return Number(row?.earned ?? 0)
}

/**
 * Runs an action and reports how many daily points it added (0 if none).
 * Use it to decide whether to play the "+1 point" animation.
 */
export async function withPointsDelta(athleteId: string, date: string, action: () => Promise<unknown>): Promise<number> {
  const before = await myEarned(athleteId, date)
  await action()
  const after = await myEarned(athleteId, date)
  return Math.max(0, after - before)
}
