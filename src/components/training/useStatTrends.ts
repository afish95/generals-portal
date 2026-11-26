'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { STAT_EXERCISES } from '@/lib/trainingMetrics'

export type StatTrend = { last: number; prev: number | null; delta: number | null; best: number; isPR: boolean; sessions: number }
const LOWER = new Set(['time_to_first', 'pop_time'])

/** Per training stat: latest session best vs the session before, and whether the latest is an all-time best. */
export function useStatTrends(athleteId: string, refreshKey = 0) {
  const [trends, setTrends] = useState<Map<string, StatTrend>>(new Map())
  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('drill_trends', { p_athlete: athleteId, p_since: '2000-01-01' })
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data as { exercise_id: number; d: string; best: number }[]) || []
        const out = new Map<string, StatTrend>()
        for (const metric of new Set(STAT_EXERCISES.map((s) => s.metric))) {
          const ids = new Set(STAT_EXERCISES.filter((s) => s.metric === metric).map((s) => s.exerciseId))
          const lower = LOWER.has(metric)
          const byDay = new Map<string, number>()
          for (const r of rows) {
            if (!ids.has(r.exercise_id)) continue
            const v = Number(r.best)
            const d = String(r.d)
            const cur = byDay.get(d)
            byDay.set(d, cur == null ? v : lower ? Math.min(cur, v) : Math.max(cur, v))
          }
          const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
          if (!days.length) continue
          const vals = days.map(([, v]) => v)
          const last = vals[vals.length - 1]
          const prev = vals.length > 1 ? vals[vals.length - 2] : null
          const best = lower ? Math.min(...vals) : Math.max(...vals)
          const priorBest = vals.length > 1 ? (lower ? Math.min(...vals.slice(0, -1)) : Math.max(...vals.slice(0, -1))) : null
          out.set(metric, {
            last,
            prev,
            delta: prev == null ? null : last - prev,
            best,
            isPR: priorBest != null && (lower ? last < priorBest : last > priorBest),
            sessions: vals.length,
          })
        }
        setTrends(out)
      })
    return () => {
      cancelled = true
    }
  }, [athleteId, refreshKey])
  return trends
}

export const metricLowerIsBetter = (metric: string) => LOWER.has(metric) || metric === 'miss_in'
