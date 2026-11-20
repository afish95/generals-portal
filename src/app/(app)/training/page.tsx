'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { DateStepper, EmptyState, PageTitle } from '@/components/ui'
import WorkoutLogger, { type PrHit } from '@/components/training/WorkoutLogger'
import PrCelebration from '@/components/training/PrCelebration'
import { localDate, type Exercise, type SetLog, type Workout, type WorkoutItem } from '@/lib/training'

export default function TrainingPage() {
  const { profile, isCoach } = useProfile()
  const [date, setDate] = useState(localDate())
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [items, setItems] = useState<WorkoutItem[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [logs, setLogs] = useState<SetLog[]>([])
  const [loading, setLoading] = useState(true)
  const [pr, setPr] = useState<PrHit | null>(null)
  const clearPr = useCallback(() => setPr(null), [])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const [{ data: w }, { data: ex }] = await Promise.all([
        supabase.from('workouts').select('*').eq('workout_date', date).order('sort_order').order('id'),
        supabase.from('exercises').select('*'),
      ])
      // Coaches see every group; players only theirs (enforced by RLS).
      let visible = (w as Workout[]) || []
      if (isCoach) visible = visible.filter((x) => x.group_id === null)
      const ids = visible.map((x) => x.id)
      const { data: it } = ids.length
        ? await supabase.from('workout_items').select('*').in('workout_id', ids)
        : { data: [] as WorkoutItem[] }
      const itemIds = ((it as WorkoutItem[]) || []).map((x) => x.id)
      const { data: lg } = itemIds.length
        ? await supabase.from('set_logs').select('*').eq('athlete_id', profile.id).in('workout_item_id', itemIds)
        : { data: [] as SetLog[] }
      if (cancelled) return
      setWorkouts(visible)
      setItems((it as WorkoutItem[]) || [])
      setExercises((ex as Exercise[]) || [])
      setLogs((lg as SetLog[]) || [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date, profile.id, isCoach])

  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  return (
    <div>
      <PrCelebration hit={pr} onDone={clearPr} />
      <PageTitle title="Training" subtitle="Log every set. PRs get celebrated automatically." />
      <DateStepper value={date} onChange={setDate} />
      {loading ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : workouts.length === 0 ? (
        <EmptyState title="No training scheduled" body="Enjoy the recovery day, or check the next day." />
      ) : (
        <div className="space-y-4">
          {workouts.map((w) => (
            <WorkoutLogger
              key={w.id}
              workout={w}
              items={items.filter((i) => i.workout_id === w.id)}
              exercises={exMap}
              logs={logs.filter((l) => items.some((i) => i.id === l.workout_item_id && i.workout_id === w.id))}
              athleteId={profile.id}
              onLogsChange={(next) =>
                setLogs((all) => {
                  const mine = new Set(items.filter((i) => i.workout_id === w.id).map((i) => i.id))
                  return [...all.filter((l) => !mine.has(l.workout_item_id)), ...next]
                })
              }
              onPr={setPr}
            />
          ))}
        </div>
      )}
    </div>
  )
}
