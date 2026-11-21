'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import WorkoutLogger, { type PrHit } from './WorkoutLogger'
import type { Exercise, SetLog, Workout, WorkoutItem } from '@/lib/training'

/** Loads an athlete's set logs for one workout and shows the compact set logger (used inside the Day plan). */
export default function LoggedWorkout({
  workout,
  items,
  athleteId,
  onPr,
  onChanged,
}: {
  workout: Workout
  items: WorkoutItem[]
  athleteId: string
  onPr: (hit: PrHit) => void
  onChanged?: () => void
}) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [logs, setLogs] = useState<SetLog[] | null>(null)
  const itemKey = items.map((i) => i.id).join(',')

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const ids = itemKey ? itemKey.split(',').map(Number) : []
    Promise.all([
      supabase.from('exercises').select('*'),
      ids.length ? supabase.from('set_logs').select('*').eq('athlete_id', athleteId).in('workout_item_id', ids) : Promise.resolve({ data: [] }),
    ]).then(([e, l]) => {
      if (cancelled) return
      setExercises((e.data as Exercise[]) || [])
      setLogs((l.data as SetLog[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [athleteId, itemKey])

  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])
  if (!logs) return <div className="h-24 rounded-2xl bg-slate-50 animate-pulse" />

  return (
    <WorkoutLogger
      compact
      workout={workout}
      items={items}
      exercises={exMap}
      logs={logs}
      athleteId={athleteId}
      onLogsChange={(next) => {
        setLogs(next)
        onChanged?.()
      }}
      onPr={onPr}
    />
  )
}
