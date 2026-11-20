'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, round1, type Exercise, type Profile } from '@/lib/training'

type Prog = { athlete_id: string; exercise_id: number; best_value: number; first_value: number }
type Extra = { readiness: number | null; attendance: number | null; volume: number }
const MAX = 3
const COLORS = ['text-[#1746b8]', 'text-amber-600', 'text-emerald-600']

export default function CompareAthletes() {
  const [players, setPlayers] = useState<Profile[]>([])
  const [prog, setProg] = useState<Prog[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [extras, setExtras] = useState<Record<string, Extra>>({})

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select('id, username, full_name, role, position_group, grad_year, is_active').eq('role', 'player').eq('is_active', true).order('full_name'),
      supabase.rpc('progressions'),
      supabase.from('exercises').select('*').in('tracking', ['velocity', 'distance', 'accuracy', 'time']).order('name'),
    ]).then(([p, g, e]) => {
      if (cancelled) return
      const list = (p.data as Profile[]) || []
      setPlayers(list)
      setProg(((g.data as Prog[]) || []).map((r) => ({ ...r, best_value: Number(r.best_value), first_value: Number(r.first_value) })))
      setExercises((e.data as Exercise[]) || [])
      setPicked(list.slice(0, 2).map((x) => x.id))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    const today = localDate()
    Promise.all(
      picked.map(async (id) => {
        const [{ data: r14 }, { data: r30 }] = await Promise.all([
          supabase.rpc('recap', { p_athlete: id, p_from: addDays(today, -13), p_to: today, p_tz: tz }),
          supabase.rpc('recap', { p_athlete: id, p_from: addDays(today, -29), p_to: today, p_tz: tz }),
        ])
        const a = (r14 as Record<string, unknown>[] | null)?.[0]
        const b = (r30 as Record<string, unknown>[] | null)?.[0]
        return [
          id,
          {
            readiness: a?.avg_readiness == null ? null : Number(a.avg_readiness),
            attendance: b && Number(b.marked) ? Math.round((100 * Number(b.present)) / Number(b.marked)) : null,
            volume: Number(b?.volume ?? 0),
          },
        ] as const
      })
    ).then((pairs) => {
      if (!cancelled) setExtras(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [picked])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? [...p.slice(1), id] : [...p, id]))

  const best = (athlete: string, ex: number) => prog.find((r) => r.athlete_id === athlete && r.exercise_id === ex)?.best_value
  const shownExercises = exercises.filter((e) => picked.some((a) => best(a, e.id) != null))
  const name = (id: string) => players.find((p) => p.id === id)?.full_name.split(' ')[0] ?? ''

  const leaderOf = (vals: (number | null | undefined)[], lowerBetter = false) => {
    const nums = vals.map((v) => (v == null ? null : v))
    const valid = nums.filter((v): v is number => v != null)
    if (valid.length < 2) return -1
    const target = lowerBetter ? Math.min(...valid) : Math.max(...valid)
    return nums.indexOf(target)
  }

  const rows: { label: string; vals: (number | null | undefined)[]; fmt: (v: number) => string; lower?: boolean }[] = [
    ...shownExercises.map((e) => ({
      label: e.name,
      vals: picked.map((a) => best(a, e.id)),
      fmt: (v: number) => `${round1(v)}${e.tracking === 'accuracy' ? '%' : ` ${e.unit ?? ''}`}`,
      lower: e.tracking === 'time',
    })),
    { label: 'Avg readiness (14d)', vals: picked.map((a) => extras[a]?.readiness), fmt: (v: number) => `${v}` },
    { label: 'Attendance (30d)', vals: picked.map((a) => extras[a]?.attendance), fmt: (v: number) => `${v}%` },
    { label: 'Throws & swings (30d)', vals: picked.map((a) => extras[a]?.volume), fmt: (v: number) => `${v}` },
  ]

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-slate-500 px-1">Pick up to {MAX} athletes.</p>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => {
          const idx = picked.indexOf(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${idx >= 0 ? 'bg-[#1746b8] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              {p.full_name}
            </button>
          )
        })}
      </div>

      {picked.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-x-auto">
          <table className="w-full min-w-[340px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-3 py-2.5 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Metric</th>
                {picked.map((id, i) => (
                  <th key={id} className={`px-3 py-2.5 text-right text-xs font-black ${COLORS[i]}`}>{name(id)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const lead = leaderOf(r.vals, r.lower)
                return (
                  <tr key={r.label}>
                    <td className="px-3 py-2.5 text-xs font-bold text-slate-700">{r.label}</td>
                    {r.vals.map((v, i) => (
                      <td key={i} className={`px-3 py-2.5 text-right text-xs tabular-nums ${i === lead ? 'font-black text-emerald-700' : 'font-bold text-slate-800'}`}>
                        {v == null ? '–' : r.fmt(v)}
                        {i === lead && ' ★'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
