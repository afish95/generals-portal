'use client'

import { useEffect, useState } from 'react'
import { Award } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatPr, round1, timeAgo, type Exercise, type PrEvent } from '@/lib/training'

type Row = PrEvent & { name: string; exercise?: Exercise }

export default function TeamPrFeed({ limit = 8, athleteId }: { limit?: number; athleteId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const load = async () => {
      let q = supabase.from('pr_events').select('*').neq('pr_type', 'e1rm').order('achieved_at', { ascending: false }).limit(limit)
      if (athleteId) q = q.eq('athlete_id', athleteId)
      const { data: prs } = await q
      const list = (prs as PrEvent[]) || []
      const athleteIds = [...new Set(list.map((p) => p.athlete_id))]
      const exIds = [...new Set(list.map((p) => p.exercise_id))]
      const [{ data: people }, { data: exs }] = await Promise.all([
        athleteIds.length ? supabase.from('profiles').select('id, full_name').in('id', athleteIds) : Promise.resolve({ data: [] }),
        exIds.length ? supabase.from('exercises').select('*').in('id', exIds) : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const names = new Map(((people as { id: string; full_name: string }[]) || []).map((p) => [p.id, p.full_name]))
      const exMap = new Map(((exs as Exercise[]) || []).map((e) => [e.id, e]))
      setRows(list.map((p) => ({ ...p, name: names.get(p.athlete_id) ?? 'Teammate', exercise: exMap.get(p.exercise_id) })))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [limit, athleteId])

  if (rows === null) return <div className="h-24 rounded-3xl bg-white/60 animate-pulse" />

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-2">
        <Award className="w-4 h-4 text-amber-500" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{athleteId ? 'My PRs' : 'Team PR feed'}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs font-medium text-slate-500">No PRs yet. Go get the first one.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const unit = r.exercise?.tracking === 'accuracy' ? '%' : ` ${r.exercise?.unit ?? ''}`
            const delta =
              r.previous_value != null
                ? `${r.exercise?.tracking === 'time' ? '−' : '+'}${round1(Math.abs(Number(r.value) - Number(r.previous_value)))}${unit}`
                : null
            return (
              <li key={r.id} className="py-2.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 text-xs font-extrabold flex items-center justify-center shrink-0">
                  {r.name.split(' ').map((s) => s[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {athleteId ? r.exercise?.name : `${r.name.split(' ')[0]} · ${r.exercise?.name ?? 'Drill'}`}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">
                    {formatPr(r, r.exercise)}
                    {delta && <span className="ml-1.5 text-emerald-600 font-extrabold">{delta}</span>}
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{timeAgo(r.achieved_at)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
