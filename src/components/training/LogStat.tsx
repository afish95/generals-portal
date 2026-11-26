'use client'

import { useEffect, useState } from 'react'
import { Gauge, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { STAT_EXERCISES, sidesFor } from '@/lib/trainingMetrics'
import { celebratePr } from '@/lib/celebrate'

type Logged = { id: number; exercise_id: number; value: number }

/** "Log a Stat": a player records bat speed, exit velo, velo, etc. on any training day. Counts toward leaderboards and PRs. */
export default function LogStat({ athleteId, date, interactive, onLogged }: { athleteId: string; date: string; interactive: boolean; onLogged?: () => void }) {
  const [position, setPosition] = useState<string | null>(null)
  const [ex, setEx] = useState<number | null>(null)
  const [value, setValue] = useState('')
  const [logged, setLogged] = useState<Logged[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const sb = createClient()
    let cancelled = false
    const from = new Date(`${date}T00:00:00`).toISOString()
    const to = new Date(`${date}T23:59:59`).toISOString()
    Promise.all([
      sb.from('profiles').select('position_group').eq('id', athleteId).maybeSingle(),
      sb.from('set_logs').select('id, exercise_id, value').eq('athlete_id', athleteId).in('exercise_id', STAT_EXERCISES.map((s) => s.exerciseId)).gte('logged_at', from).lte('logged_at', to).order('logged_at'),
    ]).then(([p, l]) => {
      if (cancelled) return
      const pos = (p.data as { position_group: string | null } | null)?.position_group ?? null
      setPosition(pos)
      setLogged(((l.data as Logged[]) || []).map((x) => ({ ...x, value: Number(x.value) })))
      setEx((cur) => cur ?? STAT_EXERCISES.find((s) => sidesFor(pos).includes(s.side))?.exerciseId ?? 22)
    })
    return () => {
      cancelled = true
    }
  }, [athleteId, date, version])

  const sides = sidesFor(position)
  const options = [...STAT_EXERCISES].sort((a, b) => Number(sides.includes(b.side)) - Number(sides.includes(a.side)))
  const label = (id: number) => STAT_EXERCISES.find((s) => s.exerciseId === id)

  const save = async () => {
    const v = parseFloat(value)
    if (!ex || !Number.isFinite(v) || v <= 0) return setError('Enter a number.')
    setBusy(true)
    setError(null)
    const sb = createClient()
    const { data: lid, error: e } = await sb.rpc('log_stat', { p_exercise: ex, p_value: v, p_date: date })
    setBusy(false)
    if (e) return setError(e.message)
    // New personal record? The database flags it as the set is saved.
    const { data: pr } = await sb.from('pr_events').select('value, previous_value, pr_type').eq('set_log_id', lid as number).neq('pr_type', 'e1rm').limit(1).maybeSingle()
    if (pr) {
      const s = label(ex)
      const prev = (pr as { previous_value: number | null }).previous_value
      const d = prev != null ? Math.abs(v - Number(prev)) : null
      celebratePr({ exercise: s?.label || 'Personal record', text: `${v} ${s?.unit ?? ''}`.trim(), delta: d != null && d > 0 ? `${s?.unit === 'sec' ? d.toFixed(2) : Math.round(d * 10) / 10} ${s?.unit ?? ''}`.trim() : null })
    }
    setValue('')
    setVersion((n) => n + 1)
    onLogged?.()
  }
  const remove = async (id: number) => {
    await createClient().from('set_logs').delete().eq('id', id).eq('athlete_id', athleteId)
    setVersion((n) => n + 1)
    onLogged?.()
  }

  if (!interactive && !logged.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
        <Gauge className="w-3.5 h-3.5" /> Log a Stat
      </div>
      {logged.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {logged.map((l) => {
            const s = label(l.exercise_id)
            return (
              <span key={l.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-extrabold">
                {s?.label} {l.value} {s?.unit}
                {interactive && (
                  <button type="button" onClick={() => remove(l.id)} aria-label="Remove" className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-emerald-100 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
      {interactive && (
        <div className="flex gap-1.5">
          <select value={ex ?? ''} onChange={(e) => setEx(Number(e.target.value))} className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800">
            {options.map((s) => (
              <option key={s.exerciseId} value={s.exerciseId}>{s.label} ({s.unit})</option>
            ))}
          </select>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" className="w-16 px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-center" />
          <button type="button" onClick={save} disabled={busy || !value} className="px-3 rounded-lg bg-[#1746b8] text-white text-xs font-extrabold disabled:opacity-40 cursor-pointer">
            Save
          </button>
        </div>
      )}
      {error && <p className="text-[11px] font-bold text-red-600">{error}</p>}
    </div>
  )
}
