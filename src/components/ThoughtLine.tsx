'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { localDate } from '@/lib/training'
import { weekStart } from '@/components/stats/WeeklyRecap'

/** Compact Thought of the Week, shown at the top of the Announcements card. */
export default function ThoughtLine() {
  const [t, setT] = useState<{ body: string; attribution: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('thoughts_of_week')
      .select('body, attribution')
      .lte('week_start', weekStart(localDate()))
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setT(data as { body: string; attribution: string | null } | null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!t) return null
  return (
    <div className="rounded-2xl bg-[#0f172a] text-white px-4 py-3">
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">Thought of the week</div>
      <p className="text-sm font-bold leading-snug mt-0.5">{t.body}</p>
      {t.attribution && <p className="text-[11px] font-semibold text-slate-400 mt-1">— {t.attribution}</p>}
    </div>
  )
}
