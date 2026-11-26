'use client'

import { useEffect, useState } from 'react'
import { Quote } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { localDate } from '@/lib/training'
import { weekStart } from '@/components/stats/WeeklyRecap'

type Thought = { id: number; week_start: string; body: string; attribution: string | null }

export default function ThoughtOfWeek() {
  const [thought, setThought] = useState<Thought | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    // The newest thought dated on or before this week
    createClient()
      .from('thoughts_of_week')
      .select('id, week_start, body, attribution')
      .lte('week_start', weekStart(localDate()))
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setThought((data as Thought) || null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!thought) return null
  return (
    <section className="rounded-3xl bg-[#0f172a] text-white p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-2">
        <Quote className="w-4 h-4 text-amber-400" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Thought of the Week</span>
      </div>
      <p className="text-base font-bold leading-snug">{thought.body}</p>
      {thought.attribution && <p className="text-xs font-semibold text-slate-400 mt-2">— {thought.attribution}</p>}
    </section>
  )
}
