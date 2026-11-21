'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { localDate, round1, type Exercise } from '@/lib/training'
import { ordinal, percentileRank, rankOf } from '@/lib/rank'
import { weekStart } from '@/components/stats/WeeklyRecap'

type Rank = { label: string; detail: string; rank: number; n: number; pctl: number }

/** "Where you stand": your percentile on this week's leaderboards and on every drill best. */
export default function MyRanks({ athleteId }: { athleteId: string }) {
  const [week, setWeek] = useState<Rank[] | null>(null)
  const [drills, setDrills] = useState<Rank[]>([])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const today = localDate()
    const from = weekStart(today)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    Promise.all([
      supabase.rpc('leaderboard', { p_from: from, p_to: today, p_tz: tz }),
      supabase.rpc('daily_points', { p_from: from, p_to: today }),
      supabase.rpc('drill_ranks', { p_athlete: athleteId }),
      supabase.from('exercises').select('*'),
    ]).then(([lb, dp, dr, ex]) => {
      if (cancelled) return
      const rows = (lb.data as { athlete_id: string; volume: number; quality: number | null; prs: number }[]) || []
      const pts = new Map<string, { e: number; a: number }>()
      for (const r of (dp.data as { athlete_id: string; earned: number; available: number }[]) || []) {
        const c = pts.get(r.athlete_id) || { e: 0, a: 0 }
        pts.set(r.athlete_id, { e: c.e + Number(r.earned), a: c.a + Number(r.available) })
      }
      const me = rows.find((r) => r.athlete_id === athleteId)
      const out: Rank[] = []
      const add = (label: string, values: number[], mine: number | null | undefined, detail: string) => {
        if (mine == null || values.length === 0) return
        const rank = rankOf(values, mine)
        out.push({ label, detail, rank, n: values.length, pctl: percentileRank(rank, values.length) })
      }
      const ptsPct = (id: string) => {
        const p = pts.get(id)
        return p && p.a ? Math.round((100 * p.e) / p.a) : 0
      }
      add('Daily points', rows.map((r) => ptsPct(r.athlete_id)), ptsPct(athleteId), `${ptsPct(athleteId)}% of points`)
      add('Volume', rows.map((r) => Number(r.volume)), me ? Number(me.volume) : 0, `${me ? Number(me.volume) : 0} throws & swings`)
      const q = rows.filter((r) => r.quality != null)
      if (me?.quality != null) add('Quality', q.map((r) => Number(r.quality)), Number(me.quality), `${me.quality}% of sets done`)
      add('PRs', rows.map((r) => Number(r.prs)), me ? Number(me.prs) : 0, `${me ? Number(me.prs) : 0} this week`)
      setWeek(out)

      const exMap = new Map(((ex.data as Exercise[]) || []).map((e) => [e.id, e]))
      setDrills(
        ((dr.data as { exercise_id: number; my_best: number; rank: number; athletes: number; percentile: number }[]) || [])
          .map((r) => {
            const e = exMap.get(r.exercise_id)
            return {
              label: e?.name ?? 'Drill',
              detail: `Best ${round1(Number(r.my_best))}${e?.tracking === 'accuracy' ? '%' : ` ${e?.unit ?? ''}`}`,
              rank: Number(r.rank),
              n: Number(r.athletes),
              pctl: Number(r.percentile),
            }
          })
          .sort((a, b) => b.pctl - a.pctl)
      )
    })
    return () => {
      cancelled = true
    }
  }, [athleteId])

  if (!week) return <div className="h-32 rounded-3xl bg-white/60 animate-pulse" />

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Your percentile ranks</div>
      <div className="grid grid-cols-2 gap-2">
        {week.map((r) => (
          <RankTile key={r.label} r={r} sub="This week" />
        ))}
      </div>
      {drills.length > 0 && (
        <>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pt-1">Drill bests vs. team</div>
          <ul className="space-y-2">
            {drills.map((r) => (
              <li key={r.label} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold text-slate-900 truncate">{r.label}</div>
                  <div className="text-[11px] font-semibold text-slate-500">{r.detail} · #{r.rank} of {r.n}</div>
                </div>
                <PctlBadge p={r.pctl} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-[10px] font-semibold text-slate-400">Percentile = how you compare with teammates (99th is the top).</p>
    </section>
  )
}

function RankTile({ r, sub }: { r: Rank; sub: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500">{r.label}</span>
        <PctlBadge p={r.pctl} />
      </div>
      <div className="text-lg font-black text-slate-900 mt-1">#{r.rank} <span className="text-xs font-bold text-slate-400">of {r.n}</span></div>
      <div className="text-[10px] font-semibold text-slate-500 truncate">{r.detail} · {sub}</div>
    </div>
  )
}

function PctlBadge({ p }: { p: number }) {
  const tone = p >= 75 ? 'bg-emerald-100 text-emerald-700' : p >= 50 ? 'bg-blue-100 text-[#1746b8]' : 'bg-amber-100 text-amber-700'
  return <span className={`text-[10px] font-extrabold px-2 py-1 rounded-full whitespace-nowrap ${tone}`}>{ordinal(p)} %ile</span>
}
