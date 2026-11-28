'use client'

import { useEffect, useMemo, useState } from 'react'
import { Target, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { NoPlayer } from './ParentHome'
import { STAT_EXERCISES } from '@/lib/trainingMetrics'
import { POSITION_LABEL } from '@/components/office/roster/shared'

type Gc = { stat_type: string; season_year: number; season_type: string | null; stats: Record<string, number | string> }
type Log = { exercise_id: number; value: number | null; logged_at: string }
type Best = { id: number; label: string; unit: string; value: number; date: string }
const LOWER_BETTER = new Set(['time_to_first', 'pop_time'])
const SEASON_LABEL: Record<string, string> = { Spring: 'Spring Varsity', JV: 'Spring JV', Summer: 'Summer' }
type Focus = { id: number; title: string; metric_label: string | null; baseline: number | null; goal: number | null; status: string; target_date: string | null }

const BAT: [string, string][] = [['AVG', 'AVG'], ['OBP', 'OBP'], ['OPS', 'OPS'], ['H', 'Hits'], ['RBI', 'RBI'], ['SB', 'SB']]
const PIT: [string, string][] = [['ERA', 'ERA'], ['IP', 'IP'], ['SO', 'K'], ['WHIP', 'WHIP'], ['W', 'W'], ['BB', 'BB']]
const fmt = (k: string, v: number | string | undefined) => {
  if (v == null || v === '') return '–'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  if (['AVG', 'OBP', 'OPS', 'SLG'].includes(k)) return n.toFixed(3).replace(/^0/, '')
  if (['ERA', 'WHIP'].includes(k)) return n.toFixed(2)
  return String(n)
}

/** My Player: game stats, training bests (all-time best per stat) and what coaches have them working on. No health or check-in data. */
export default function MyPlayer() {
  const { family } = useProfile()
  const child = family.child
  const [gc, setGc] = useState<Gc[] | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [focus, setFocus] = useState<Focus[]>([])

  useEffect(() => {
    if (!child) return
    let cancelled = false
    const sb = createClient()
    Promise.all([
      sb.from('gc_season_stats').select('stat_type, season_year, season_type, stats').eq('player_id', child.id).order('season_year', { ascending: false }),
      sb.from('set_logs').select('exercise_id, value, logged_at').eq('athlete_id', child.id).in('exercise_id', STAT_EXERCISES.map((x) => x.exerciseId)).not('value', 'is', null).limit(2000),
      sb.from('player_focus').select('id, title, metric_label, baseline, goal, status, target_date').eq('athlete_id', child.id).order('sort_order'),
    ]).then(([{ data: g }, { data: p }, { data: f }]) => {
      if (cancelled) return
      setGc((g as Gc[]) || [])
      setLogs((p as Log[]) || [])
      setFocus((f as Focus[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [child])

  // Newest season first; one best per exercise (latest PR is the current best)
  const season = useMemo(() => {
    if (!gc?.length) return null
    const top = gc[0]
    const rows = gc.filter((r) => r.season_year === top.season_year && r.season_type === top.season_type)
    return { label: `${SEASON_LABEL[top.season_type || ''] || top.season_type || ''} ${top.season_year}`.trim(), bat: rows.find((r) => r.stat_type === 'batting')?.stats, pit: rows.find((r) => r.stat_type === 'pitching')?.stats }
  }, [gc])
  // All-time best per training stat (fastest for times)
  const bests = useMemo(() => {
    const out: Best[] = []
    for (const x of STAT_EXERCISES) {
      const mine = logs.filter((l) => l.exercise_id === x.exerciseId && l.value != null && Number(l.value) > 0)
      if (!mine.length) continue
      const low = LOWER_BETTER.has(x.metric)
      const b = mine.reduce((a, c) => (low ? Number(c.value) < Number(a.value) : Number(c.value) > Number(a.value)) ? c : a)
      out.push({ id: x.exerciseId, label: x.label, unit: x.unit, value: Number(b.value), date: b.logged_at })
    }
    return out
  }, [logs])

  if (!child) return <NoPlayer />
  const first = child.full_name.split(' ')[0]
  const statGrid = (title: string, keys: [string, string][], s: Record<string, number | string>) => (
    <div>
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">{title}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map(([k, label]) => (
          <div key={k} className="rounded-xl bg-slate-50 py-2 text-center">
            <div className="text-base font-extrabold text-slate-900 leading-none">{fmt(k, s[k])}</div>
            <div className="text-[10px] font-bold text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <section className="bg-gradient-to-br from-[#1746b8] to-[#1e54d4] text-white rounded-3xl p-5 shadow-sm">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">My Player</div>
        <div className="text-2xl font-extrabold tracking-tight">{child.full_name}</div>
        <div className="text-xs text-blue-100 font-medium">
          {[POSITION_LABEL[child.position_group || ''] || child.position_group, child.grad_year ? `Class of ${child.grad_year}` : null].filter(Boolean).join(' · ') || 'Generals Baseball'}
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900">Game Stats</h2>
          {season && <span className="text-[11px] font-bold text-slate-400">{season.label}</span>}
        </div>
        {gc === null ? (
          <div className="h-20 rounded-xl bg-slate-50 animate-pulse" />
        ) : !season || (!season.bat && !season.pit) ? (
          <p className="text-xs text-slate-500">Game stats show here once the season starts.</p>
        ) : (
          <>
            {season.bat && statGrid('Hitting', BAT, season.bat)}
            {season.pit && statGrid('Pitching', PIT, season.pit)}
          </>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs space-y-2">
        <h2 className="text-sm font-extrabold text-slate-900">Working On</h2>
        {focus.length === 0 ? (
          <p className="text-xs text-slate-500">Coaches haven’t posted {first}’s goals yet.</p>
        ) : (
          focus.map((f) => (
            <div key={f.id} className="flex items-start gap-2.5 py-1">
              <Target className={`w-4 h-4 mt-0.5 shrink-0 ${f.status === 'done' ? 'text-green-600' : 'text-[#1746b8]'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-extrabold text-slate-900">{f.title}{f.status === 'done' && <span className="ml-1.5 text-[10px] text-green-700 uppercase">Done</span>}</div>
                {f.metric_label && f.goal != null && (
                  <div className="text-[11px] text-slate-500">
                    {f.metric_label}: {f.baseline ?? '–'} → Goal {f.goal}
                    {f.target_date ? ` by ${new Date(f.target_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs space-y-2">
        <h2 className="text-sm font-extrabold text-slate-900">Training Bests</h2>
        {bests.length === 0 ? (
          <p className="text-xs text-slate-500">Best velo, exit velo and other training numbers show up here once logged.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {bests.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-xs font-bold text-slate-800">{p.label}</span>
                <span className="text-xs font-extrabold text-slate-900">{p.value} <span className="text-[10px] font-bold text-slate-500">{p.unit}</span></span>
                <span className="text-[10px] text-slate-400 w-16 text-right">{new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
