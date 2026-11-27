'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import WorkoutTemplates from './WorkoutTemplates'

/** Loads the progression list for the Workouts library. */
export default function TemplatesTab() {
  const [progs, setProgs] = useState<{ id: number; name: string }[] | null>(null)
  useEffect(() => {
    createClient()
      .from('progressions')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setProgs((data as { id: number; name: string }[]) || []))
  }, [])
  if (!progs) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
  return <WorkoutTemplates progressions={progs} />
}
