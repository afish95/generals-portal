'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { PageTitle } from '@/components/ui'
import TeamPrFeed from '@/components/TeamPrFeed'
import { round1, type Exercise } from '@/lib/training'

type Best = { exercise: Exercise; value: number; who?: string }

export default function StatsPage() {
  const { profile, isCoach } = useProfile()
  const [bests, setBests] = useState<Best[] | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const load = async () => {
      // Calculated in the database so long histories are never cut off.
      const [{ data: exs }, { data: rows }, { data: people }] = await Promise.all([
        supabase.from('exercises').select('*'),
        supabase.rpc('exercise_bests', { p_athlete: isCoach ? null : profile.id }),
        supabase.from('profiles').select('id, full_name'),
      ])
      if (cancelled) return
      const exMap = new Map(((exs as Exercise[]) || []).map((e) => [e.id, e]))
      const names = new Map(((people as { id: string; full_name: string }[]) || []).map((p) => [p.id, p.full_name]))
      const out: Best[] = []
      for (const r of (rows as { exercise_id: number; athlete_id: string; best: number }[]) || []) {
        const ex = exMap.get(r.exercise_id)
        if (ex) out.push({ exercise: ex, value: Number(r.best), who: names.get(r.athlete_id) })
      }
      out.sort((a, b) => a.exercise.discipline.localeCompare(b.exercise.discipline) || a.exercise.name.localeCompare(b.exercise.name))
      setBests(out)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [isCoach, profile.id])

  return (
    <div className="space-y-4">
      <PageTitle title="Stats" subtitle={isCoach ? 'Team bests and PRs. Leaderboards and comparisons are coming in Phase 3.' : 'Your bests and PRs. Leaderboards are coming in Phase 3.'} />
      <section className="bg-white rounded-3xl border border-slate-200 p-4">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">{isCoach ? 'Team bests' : 'My bests'}</div>
        {bests === null ? (
          <div className="h-20 animate-pulse bg-slate-50 rounded-2xl" />
        ) : bests.length === 0 ? (
          <p className="text-xs text-slate-500 font-medium">Log some training to see your bests here.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {bests.map((b) => (
              <div key={b.exercise.id} className="rounded-2xl bg-slate-50 p-3">
                <div className="text-[11px] font-bold text-slate-500 truncate">{b.exercise.name}</div>
                <div className="text-xl font-extrabold text-slate-900">
                  {round1(b.value)}
                  <span className="text-xs font-bold text-slate-400 ml-1">{b.exercise.tracking === 'accuracy' ? '%' : b.exercise.unit}</span>
                </div>
                {isCoach && b.who && <div className="text-[10px] font-bold text-[#1746b8] truncate">{b.who}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
      <TeamPrFeed limit={15} athleteId={isCoach ? undefined : profile.id} />
    </div>
  )
}
