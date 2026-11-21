'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { prettyDate } from '@/lib/training'

type Award = { id: number; athlete_id: string; achieved_on: string; days: number; profiles: { full_name: string } | null }

/** Coach Home: players who recently completed a 14-day perfect-points streak. */
export default function StreakAlerts() {
  const [awards, setAwards] = useState<Award[]>([])

  useEffect(() => {
    let cancelled = false
    const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)
    createClient()
      .from('streak_awards')
      .select('id, athlete_id, achieved_on, days, profiles(full_name)')
      .gte('achieved_on', since)
      .order('achieved_on', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setAwards((data as unknown as Award[]) || [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (awards.length === 0) return null
  return (
    <section className="rounded-3xl bg-gradient-to-br from-[#0f2a6e] to-[#1746b8] p-4 text-white shadow-md space-y-2">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-amber-300">Streak alerts</div>
      <ul className="space-y-1.5">
        {awards.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold truncate">{a.profiles?.full_name ?? 'A player'} · {a.days}-day perfect streak</div>
              <div className="text-[10px] font-semibold text-blue-200">{prettyDate(a.achieved_on)} · congrats message sent</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
