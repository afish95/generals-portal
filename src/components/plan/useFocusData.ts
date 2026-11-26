'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useGcData } from '@/components/stats/useGcData'
import type { DrillOption, TrainingRow } from '@/lib/focus'

/** Everything a plan needs to show "now vs goal": game stats, training bests, and the drill library. */
export function useFocusData() {
  const { lines, ea } = useGcData()
  const [training, setTraining] = useState<TrainingRow[] | null>(null)
  const [drills, setDrills] = useState<DrillOption[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    Promise.all([
      supabase.rpc('position_leaderboard', { p_since: '2000-01-01' }),
      supabase.from('exercises').select('id, name, discipline, category, notes, video_url').eq('is_active', true).order('name'),
      supabase.from('bullpen_scripts').select('id, title, category, description').eq('is_active', true).order('sort_order'),
    ]).then(([t, ex, bp]) => {
      if (cancelled) return
      setTraining(((t.data as TrainingRow[]) || []).map((r) => ({ ...r, value: Number(r.value), sample: Number(r.sample) })))
      setDrills([
        ...((bp.data as { id: number; title: string; category: string | null; description: string | null }[]) || []).map((b) => ({
          kind: 'script' as const,
          id: b.id,
          name: b.title,
          group: 'Bullpen tools',
          notes: b.description,
        })),
        ...((ex.data as { id: number; name: string; discipline: string | null; category: string | null; notes: string | null; video_url: string | null }[]) || []).map((e) => ({
          kind: 'exercise' as const,
          id: e.id,
          name: e.name,
          group: e.discipline === 'hitting' ? 'Hitting Drills' : e.discipline === 'arm_care' ? 'Arm Care' : 'Throwing Drills',
          notes: e.notes,
          video_url: e.video_url,
        })),
      ])
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { lines, ea, training, drills, ready: lines !== null && training !== null }
}
