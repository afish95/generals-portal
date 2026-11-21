'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { Pill } from '@/components/ui'
import { DISCIPLINES, prettyDate, round1, type Discipline, type Exercise, type Group } from '@/lib/training'

type Prog = {
  athlete_id: string
  exercise_id: number
  first_value: number
  first_date: string
  latest_value: number
  latest_date: string
  best_value: number
  sessions: number
}
type Sort = 'improved' | 'recent' | 'best' | 'name'

export default function Progressions({ isCoach, athleteId }: { isCoach: boolean; athleteId?: string }) {
  const [rows, setRows] = useState<Prog[] | null>(null)
  const [exercises, setExercises] = useState<Map<number, Exercise>>(new Map())
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<{ group_id: number; athlete_id: string }[]>([])
  const [q, setQ] = useState('')
  const [discipline, setDiscipline] = useState<Discipline | 'all'>('all')
  const [group, setGroup] = useState<number | 'all'>('all')
  const [sort, setSort] = useState<Sort>('improved')

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.rpc('progressions'),
      supabase.from('exercises').select('*'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('team_groups').select('*').order('sort_order'),
      supabase.from('group_members').select('group_id, athlete_id'),
    ]).then(([p, e, n, g, m]) => {
      if (cancelled) return
      setRows(
        ((p.data as Prog[]) || []).filter((r) => isCoach || !athleteId || r.athlete_id === athleteId).map((r) => ({
          ...r,
          first_value: Number(r.first_value),
          latest_value: Number(r.latest_value),
          best_value: Number(r.best_value),
          sessions: Number(r.sessions),
        }))
      )
      setExercises(new Map(((e.data as Exercise[]) || []).map((x) => [x.id, x])))
      setNames(new Map(((n.data as { id: string; full_name: string }[]) || []).map((x) => [x.id, x.full_name])))
      setGroups((g.data as Group[]) || [])
      setMembers((m.data as { group_id: number; athlete_id: string }[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [isCoach, athleteId])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    const improvement = (r: Prog) => {
      const ex = exercises.get(r.exercise_id)
      const raw = r.best_value - r.first_value
      return ex?.tracking === 'time' ? -raw : raw
    }
    return (rows || [])
      .filter((r) => {
        const ex = exercises.get(r.exercise_id)
        if (!ex) return false
        if (discipline !== 'all' && ex.discipline !== discipline) return false
        if (group !== 'all' && !members.some((m) => m.group_id === group && m.athlete_id === r.athlete_id)) return false
        if (term && !ex.name.toLowerCase().includes(term) && !(names.get(r.athlete_id) || '').toLowerCase().includes(term)) return false
        return true
      })
      .map((r) => ({ ...r, improvement: improvement(r) }))
      .sort((a, b) => {
        if (sort === 'improved') return b.improvement - a.improvement
        if (sort === 'recent') return b.latest_date.localeCompare(a.latest_date)
        if (sort === 'best') return b.best_value - a.best_value
        return (names.get(a.athlete_id) || '').localeCompare(names.get(b.athlete_id) || '')
      })
  }, [rows, exercises, names, members, q, discipline, group, sort])

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 px-3 rounded-2xl bg-white border border-slate-200">
        <Search className="w-4 h-4 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isCoach ? 'Search athlete or drill' : 'Search drill'} className="flex-1 py-2.5 bg-transparent text-base outline-none" />
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Pill active={discipline === 'all'} onClick={() => setDiscipline('all')}>All drills</Pill>
        {DISCIPLINES.filter((d) => d.key !== 'other').map((d) => (
          <Pill key={d.key} active={discipline === d.key} onClick={() => setDiscipline(d.key)}>{d.label}</Pill>
        ))}
      </div>
      {isCoach && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Pill active={group === 'all'} onClick={() => setGroup('all')}>All groups</Pill>
          {groups.map((g) => (
            <Pill key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</Pill>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500">{list.length} result{list.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="text-xs font-extrabold text-[#1746b8] bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
          <option value="improved">Most improved</option>
          <option value="recent">Most recent</option>
          <option value="best">Best result</option>
          <option value="name">Name</option>
        </select>
      </div>

      {rows === null ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : list.length === 0 ? (
        <p className="text-center text-xs font-semibold text-slate-500 py-8">Nothing matches yet.</p>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const ex = exercises.get(r.exercise_id)!
            const unit = ex.tracking === 'accuracy' ? '%' : ` ${ex.unit ?? ''}`
            const better = r.improvement > 0
            return (
              <section key={`${r.athlete_id}-${r.exercise_id}`} className="bg-white rounded-2xl border border-slate-200 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900 truncate">{ex.name}</div>
                    {isCoach && <div className="text-[11px] font-bold text-[#1746b8] truncate">{names.get(r.athlete_id)}</div>}
                  </div>
                  <span className={`text-[11px] font-extrabold px-2 py-1 rounded-full shrink-0 ${better ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {better ? '▲ ' : ''}{round1(Math.abs(r.improvement))}{unit}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                  <Stat label={`First · ${prettyDate(r.first_date, { month: 'short', day: 'numeric' })}`} value={`${round1(r.first_value)}${unit}`} />
                  <Stat label="Best" value={`${round1(r.best_value)}${unit}`} strong />
                  <Stat label={`Latest · ${prettyDate(r.latest_date, { month: 'short', day: 'numeric' })}`} value={`${round1(r.latest_value)}${unit}`} />
                </div>
                <div className="text-[10px] font-bold text-slate-400 mt-1.5">{r.sessions} session{r.sessions === 1 ? '' : 's'}</div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl py-2 ${strong ? 'bg-amber-50' : 'bg-slate-50'}`}>
      <div className={`text-sm font-black ${strong ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
      <div className="text-[9px] font-bold text-slate-400 truncate px-1">{label}</div>
    </div>
  )
}
