'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { sundayOf } from '@/lib/trainingMetrics'
import { localDate } from '@/lib/training'

export type WeekDrill = { id: number; metric_key: string | null; note: string | null; exercise: { id: number; name: string; video_url: string | null; notes: string | null } | null }

/** This week's Drill of the Week picks: `team` (everyone) and one per training stat. */
export function useDrillsOfWeek(date?: string) {
  const week = sundayOf(date || localDate())
  const [rows, setRows] = useState<WeekDrill[] | null>(null)
  useEffect(() => {
    let cancelled = false
    createClient()
      .from('drills_of_week')
      .select('id, metric_key, note, exercise:exercises(id, name, video_url, notes)')
      .eq('week_start', week)
      .then(({ data }) => !cancelled && setRows((data as unknown as WeekDrill[]) || []))
    return () => {
      cancelled = true
    }
  }, [week])
  return {
    loaded: rows !== null,
    week,
    team: rows?.find((r) => r.metric_key == null) || null,
    byMetric: new Map((rows || []).filter((r) => r.metric_key).map((r) => [r.metric_key as string, r])),
  }
}
