'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, prettyDate, type Profile } from '@/lib/training'

type Sub = 'logs' | 'readiness' | 'weight' | 'daily'
type Ex = { id: number; name: string; unit: string | null; metric_key: string | null }
type Log = { id: number; exercise_id: number; value: number | null; reps: number | null; attempts: number | null; logged_at: string; workout_item_id: number }
type Checkin = { id: number; check_date: string; sleep_hours: number | null; sleep_quality: number | null; soreness: number | null; arm_soreness: number | null; stress: number | null; readiness: number | null }
type Weight = { id: number; measured_on: string; weight_lb: number }

const SUBS: { key: Sub; label: string }[] = [
  { key: 'logs', label: 'Training Logs' },
  { key: 'readiness', label: 'Readiness' },
  { key: 'weight', label: 'Body Weight' },
  { key: 'daily', label: 'Daily Checklist' },
]
const RANGES = [
  { key: 30, label: '30 Days' },
  { key: 90, label: '90 Days' },
  { key: 365, label: '12 Months' },
  { key: 0, label: 'All' },
]
const cell = 'px-2 py-1.5 rounded-lg border border-transparent hover:border-slate-200 focus:border-[#1746b8] bg-transparent text-xs font-semibold text-slate-900 w-full outline-none'
const th = 'px-2 py-2 text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-400 whitespace-nowrap'
const noonIso = (d: string) => new Date(`${d}T12:00:00`).toISOString()
const dayOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

/** Coach Office → Player Data: view, edit, add and delete any player's training logs, check-ins, body weights and daily checklist. */
export default function PlayerDataTab({ players }: { players: Profile[] }) {
  const roster = useMemo(() => players.filter((p) => p.is_active && !p.is_demo).sort((a, b) => a.full_name.localeCompare(b.full_name)), [players])
  const [who, setWho] = useState<string>('')
  const [find, setFind] = useState('')
  const [sub, setSub] = useState<Sub>('logs')
  const player = roster.find((p) => p.id === who)
  const shown = roster.filter((p) => !find || p.full_name.toLowerCase().includes(find.toLowerCase()))

  return (
    <div className="space-y-3 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-4 lg:space-y-0 lg:items-start">
      <aside className="bg-white rounded-3xl border border-slate-200 p-3 space-y-2 lg:sticky lg:top-24">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a player" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm" />
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} className="lg:hidden w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold">
          <option value="">Choose a player…</option>
          {shown.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
        <div className="hidden lg:block max-h-[70vh] overflow-y-auto -mx-1">
          {shown.map((p) => (
            <button key={p.id} type="button" onClick={() => setWho(p.id)} className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${who === p.id ? 'bg-[#1746b8] text-white' : 'text-slate-700 hover:bg-slate-50'}`}>
              {p.full_name}
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-3 min-w-0">
        {!player ? (
          <p className="text-center text-sm font-semibold text-slate-500 py-10 bg-white rounded-3xl border border-slate-200">Pick a player to see and edit their data.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-slate-900 truncate">{player.full_name}</h2>
              <span className="text-[10px] font-bold text-slate-400 shrink-0">Edits save instantly · coach changes override</span>
            </div>
            <div className="flex gap-1 p-1 rounded-2xl bg-white border border-slate-200 overflow-x-auto">
              {SUBS.map((s) => (
                <button key={s.key} type="button" onClick={() => setSub(s.key)} className={`px-3 py-2 rounded-xl text-[11px] font-extrabold whitespace-nowrap cursor-pointer ${sub === s.key ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {sub === 'logs' && <LogsTable athleteId={player.id} key={`l${player.id}`} />}
            {sub === 'readiness' && <ReadinessTable athleteId={player.id} key={`r${player.id}`} />}
            {sub === 'weight' && <WeightTable athleteId={player.id} key={`w${player.id}`} />}
            {sub === 'daily' && <DailyTable athleteId={player.id} key={`d${player.id}`} />}
          </>
        )}
      </div>
    </div>
  )
}

function Card({ children, toolbar }: { children: React.ReactNode; toolbar?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
      {toolbar && <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2">{toolbar}</div>}
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

function Saved({ on }: { on: boolean }) {
  return on ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : null
}

/* ---------------- Training logs ---------------- */
function LogsTable({ athleteId }: { athleteId: string }) {
  const [range, setRange] = useState(0)
  const [exFilter, setExFilter] = useState<number | 0>(0)
  const [logs, setLogs] = useState<Log[] | null>(null)
  const [exercises, setExercises] = useState<Map<number, Ex>>(new Map())
  const [titles, setTitles] = useState<Map<number, string>>(new Map())
  const [saved, setSaved] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  const [add, setAdd] = useState({ date: localDate(), ex: 0, value: '', attempts: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sb = createClient()
    let cancelled = false
    ;(async () => {
      let q = sb.from('set_logs').select('id, exercise_id, value, reps, attempts, logged_at, workout_item_id').eq('athlete_id', athleteId).order('logged_at', { ascending: false }).limit(500)
      if (range) q = q.gte('logged_at', noonIso(addDays(localDate(), -range)))
      if (exFilter) q = q.eq('exercise_id', exFilter)
      const [{ data: l }, { data: ex }] = await Promise.all([q, sb.from('exercises').select('id, name, unit, metric_key').order('name')])
      const list = ((l as Log[]) || []).map((x) => ({ ...x, value: x.value == null ? null : Number(x.value) }))
      const itemIds = [...new Set(list.map((x) => x.workout_item_id))]
      const { data: wi } = itemIds.length ? await sb.from('workout_items').select('id, workouts(title)').in('id', itemIds) : { data: [] }
      if (cancelled) return
      setLogs(list)
      setExercises(new Map(((ex as Ex[]) || []).map((e) => [e.id, e])))
      setTitles(new Map(((wi as unknown as { id: number; workouts: { title: string } | null }[]) || []).map((w) => [w.id, w.workouts?.title || ''])))
    })()
    return () => {
      cancelled = true
    }
  }, [athleteId, range, exFilter, version])

  const update = async (id: number, patch: Partial<Log>) => {
    const { error: e } = await createClient().from('set_logs').update(patch).eq('id', id)
    if (e) return setError(e.message)
    setLogs((ls) => (ls || []).map((l) => (l.id === id ? { ...l, ...patch } : l)))
    setSaved(id)
    setTimeout(() => setSaved((s) => (s === id ? null : s)), 1500)
  }
  const remove = async (l: Log) => {
    if (!window.confirm(`Delete ${exercises.get(l.exercise_id)?.name || 'this entry'} (${l.value ?? '—'}) on ${prettyDate(dayOf(l.logged_at))}?`)) return
    const { error: e } = await createClient().from('set_logs').delete().eq('id', l.id)
    if (e) return setError(e.message)
    setLogs((ls) => (ls || []).filter((x) => x.id !== l.id))
  }
  const addRow = async () => {
    const v = parseFloat(add.value)
    if (!add.ex || !Number.isFinite(v)) return setError('Pick a drill and enter a value.')
    setError(null)
    const { error: e } = await createClient().rpc('coach_log_stat', { p_athlete: athleteId, p_exercise: add.ex, p_value: v, p_date: add.date, p_attempts: numOrNull(add.attempts) })
    if (e) return setError(e.message)
    setAdd((a) => ({ ...a, value: '', attempts: '' }))
    setVersion((n) => n + 1)
  }

  const exList = [...exercises.values()]
  const tracked = exList.filter((e) => e.metric_key)
  const used = new Set((logs || []).map((l) => l.exercise_id))

  return (
    <Card
      toolbar={
        <>
          <select value={range} onChange={(e) => setRange(Number(e.target.value))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <select value={exFilter} onChange={(e) => setExFilter(Number(e.target.value))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold max-w-[12rem]">
            <option value={0}>All drills &amp; stats</option>
            {exList.filter((e) => used.has(e.id) || e.id === exFilter).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <span className="ml-auto text-[10px] font-bold text-slate-400">{logs ? `${logs.length}${logs.length === 500 ? '+' : ''} entries` : ''}</span>
        </>
      }
    >
      <table className="w-full min-w-[640px]">
        <thead className="bg-slate-50">
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Drill / Stat</th>
            <th className={th}>Value</th>
            <th className={th}>Reps</th>
            <th className={th}>Attempts</th>
            <th className={th}>From</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-blue-50/40">
            <td className="px-1 py-1"><input type="date" value={add.date} onChange={(e) => setAdd((a) => ({ ...a, date: e.target.value }))} className={`${cell} border-slate-200 bg-white`} /></td>
            <td className="px-1 py-1">
              <select value={add.ex} onChange={(e) => setAdd((a) => ({ ...a, ex: Number(e.target.value) }))} className={`${cell} border-slate-200 bg-white`}>
                <option value={0}>Add an entry…</option>
                <optgroup label="Tracked stats">
                  {tracked.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Other drills">
                  {exList.filter((e) => !e.metric_key).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </optgroup>
              </select>
            </td>
            <td className="px-1 py-1"><input inputMode="decimal" value={add.value} onChange={(e) => setAdd((a) => ({ ...a, value: e.target.value }))} placeholder="Value" className={`${cell} border-slate-200 bg-white`} /></td>
            <td />
            <td className="px-1 py-1"><input inputMode="numeric" value={add.attempts} onChange={(e) => setAdd((a) => ({ ...a, attempts: e.target.value }))} placeholder="(strike %)" className={`${cell} border-slate-200 bg-white`} /></td>
            <td className="px-2 text-[10px] font-semibold text-slate-400">Coach entry</td>
            <td className="px-1 py-1">
              <button type="button" onClick={addRow} className="w-8 h-8 rounded-lg bg-[#1746b8] text-white flex items-center justify-center cursor-pointer" aria-label="Add entry">
                <Plus className="w-4 h-4" />
              </button>
            </td>
          </tr>
          {logs === null ? (
            <tr><td colSpan={7} className="p-6"><div className="h-20 rounded-xl bg-slate-50 animate-pulse" /></td></tr>
          ) : logs.length === 0 ? (
            <tr><td colSpan={7} className="p-6 text-center text-xs font-semibold text-slate-400">No entries in this range.</td></tr>
          ) : (
            logs.map((l) => {
              const ex = exercises.get(l.exercise_id)
              return (
                <tr key={l.id} className="hover:bg-slate-50/60">
                  <td className="px-1 py-0.5 w-36"><input type="date" defaultValue={dayOf(l.logged_at)} onBlur={(e) => e.target.value && e.target.value !== dayOf(l.logged_at) && update(l.id, { logged_at: noonIso(e.target.value) })} className={cell} /></td>
                  <td className="px-2 py-0.5 text-xs font-bold text-slate-800">{ex?.name || `Drill #${l.exercise_id}`}{ex?.unit ? <span className="text-slate-400 font-semibold"> · {ex.unit}</span> : null}</td>
                  <td className="px-1 py-0.5 w-24"><input inputMode="decimal" defaultValue={l.value ?? ''} onBlur={(e) => numOrNull(e.target.value) !== l.value && update(l.id, { value: numOrNull(e.target.value) })} className={`${cell} font-black`} /></td>
                  <td className="px-1 py-0.5 w-20"><input inputMode="numeric" defaultValue={l.reps ?? ''} onBlur={(e) => numOrNull(e.target.value) !== l.reps && update(l.id, { reps: numOrNull(e.target.value) })} className={cell} /></td>
                  <td className="px-1 py-0.5 w-20"><input inputMode="numeric" defaultValue={l.attempts ?? ''} onBlur={(e) => numOrNull(e.target.value) !== l.attempts && update(l.id, { attempts: numOrNull(e.target.value) })} className={cell} /></td>
                  <td className="px-2 py-0.5 text-[10px] font-semibold text-slate-400 max-w-[10rem] truncate">{titles.get(l.workout_item_id)}</td>
                  <td className="px-1 py-0.5 w-16">
                    <div className="flex items-center gap-1">
                      <Saved on={saved === l.id} />
                      <button type="button" onClick={() => remove(l)} aria-label="Delete" className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
      {error && <p className="px-3 py-2 text-xs font-bold text-red-600">{error}</p>}
    </Card>
  )
}

/* ---------------- Readiness check-ins ---------------- */
function ReadinessTable({ athleteId }: { athleteId: string }) {
  const [rows, setRows] = useState<Checkin[] | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  const [addDate, setAddDate] = useState(localDate())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('daily_checkins')
      .select('id, check_date, sleep_hours, sleep_quality, soreness, arm_soreness, stress, readiness')
      .eq('athlete_id', athleteId)
      .order('check_date', { ascending: false })
      .limit(365)
      .then(({ data }) => !cancelled && setRows((data as Checkin[]) || []))
    return () => {
      cancelled = true
    }
  }, [athleteId, version])

  const update = async (id: number, field: keyof Checkin, raw: string) => {
    const v = numOrNull(raw)
    if (v != null && field !== 'sleep_hours' && (v < 1 || v > 5)) return setError('Scales are 1–5.')
    setError(null)
    const { data, error: e } = await createClient().from('daily_checkins').update({ [field]: v }).eq('id', id).select('readiness').single()
    if (e) return setError(e.message)
    setRows((rs) => (rs || []).map((r) => (r.id === id ? { ...r, [field]: v, readiness: (data as { readiness: number | null }).readiness } : r)))
    setSaved(id)
    setTimeout(() => setSaved((s) => (s === id ? null : s)), 1500)
  }
  const remove = async (r: Checkin) => {
    if (!window.confirm(`Delete the check-in on ${prettyDate(r.check_date)}?`)) return
    const { error: e } = await createClient().from('daily_checkins').delete().eq('id', r.id)
    if (e) return setError(e.message)
    setRows((rs) => (rs || []).filter((x) => x.id !== r.id))
  }
  const addRow = async () => {
    const { error: e } = await createClient().from('daily_checkins').insert({ athlete_id: athleteId, check_date: addDate })
    if (e) return setError(e.message.includes('duplicate') ? 'That day already has a check-in. Edit it below.' : e.message)
    setVersion((n) => n + 1)
  }
  const cols: { key: keyof Checkin; label: string }[] = [
    { key: 'sleep_hours', label: 'Sleep hrs' },
    { key: 'sleep_quality', label: 'Sleep (1–5)' },
    { key: 'soreness', label: 'Body (1–5)' },
    { key: 'arm_soreness', label: 'Arm (1–5)' },
    { key: 'stress', label: 'Stress (1–5)' },
  ]

  return (
    <Card
      toolbar={
        <>
          <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold" />
          <button type="button" onClick={addRow} className="px-3 py-1.5 rounded-lg bg-[#1746b8] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add Day
          </button>
          <span className="ml-auto text-[10px] font-bold text-slate-400">Readiness recalculates when you edit</span>
        </>
      }
    >
      <table className="w-full min-w-[620px]">
        <thead className="bg-slate-50">
          <tr>
            <th className={th}>Date</th>
            {cols.map((c) => <th key={c.key} className={th}>{c.label}</th>)}
            <th className={th}>Readiness</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows === null ? (
            <tr><td colSpan={8} className="p-6"><div className="h-20 rounded-xl bg-slate-50 animate-pulse" /></td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} className="p-6 text-center text-xs font-semibold text-slate-400">No check-ins yet.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-2 py-1 text-xs font-bold text-slate-800 whitespace-nowrap">{prettyDate(r.check_date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                {cols.map((c) => (
                  <td key={c.key} className="px-1 py-0.5 w-20">
                    <input inputMode="decimal" defaultValue={(r[c.key] as number | null) ?? ''} onBlur={(e) => numOrNull(e.target.value) !== r[c.key] && update(r.id, c.key, e.target.value)} className={cell} />
                  </td>
                ))}
                <td className="px-2 py-1 text-xs font-black text-slate-900">{r.readiness ?? '—'}</td>
                <td className="px-1 py-0.5 w-16">
                  <div className="flex items-center gap-1">
                    <Saved on={saved === r.id} />
                    <button type="button" onClick={() => remove(r)} aria-label="Delete" className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {error && <p className="px-3 py-2 text-xs font-bold text-red-600">{error}</p>}
    </Card>
  )
}

/* ---------------- Body weight ---------------- */
function WeightTable({ athleteId }: { athleteId: string }) {
  const [rows, setRows] = useState<Weight[] | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  const [add, setAdd] = useState({ date: localDate(), lb: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('body_weights')
      .select('id, measured_on, weight_lb')
      .eq('athlete_id', athleteId)
      .order('measured_on', { ascending: false })
      .then(({ data }) => !cancelled && setRows(((data as Weight[]) || []).map((w) => ({ ...w, weight_lb: Number(w.weight_lb) }))))
    return () => {
      cancelled = true
    }
  }, [athleteId, version])

  const update = async (id: number, patch: Partial<Weight>) => {
    const { error: e } = await createClient().from('body_weights').update(patch).eq('id', id)
    if (e) return setError(e.message)
    setRows((rs) => (rs || []).map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setSaved(id)
    setTimeout(() => setSaved((s) => (s === id ? null : s)), 1500)
  }
  const remove = async (r: Weight) => {
    if (!window.confirm(`Delete ${r.weight_lb} lb on ${prettyDate(r.measured_on)}?`)) return
    const { error: e } = await createClient().from('body_weights').delete().eq('id', r.id)
    if (e) return setError(e.message)
    setRows((rs) => (rs || []).filter((x) => x.id !== r.id))
  }
  const addRow = async () => {
    const lb = parseFloat(add.lb)
    if (!Number.isFinite(lb) || lb <= 0) return setError('Enter a weight.')
    setError(null)
    const { error: e } = await createClient().from('body_weights').insert({ athlete_id: athleteId, measured_on: add.date, weight_lb: lb })
    if (e) return setError(e.message)
    setAdd((a) => ({ ...a, lb: '' }))
    setVersion((n) => n + 1)
  }

  return (
    <Card>
      <table className="w-full min-w-[360px]">
        <thead className="bg-slate-50">
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Weight (lb)</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-blue-50/40">
            <td className="px-1 py-1"><input type="date" value={add.date} onChange={(e) => setAdd((a) => ({ ...a, date: e.target.value }))} className={`${cell} border-slate-200 bg-white`} /></td>
            <td className="px-1 py-1"><input inputMode="decimal" value={add.lb} onChange={(e) => setAdd((a) => ({ ...a, lb: e.target.value }))} placeholder="lb" className={`${cell} border-slate-200 bg-white`} /></td>
            <td className="px-1 py-1 w-16">
              <button type="button" onClick={addRow} className="w-8 h-8 rounded-lg bg-[#1746b8] text-white flex items-center justify-center cursor-pointer" aria-label="Add weight">
                <Plus className="w-4 h-4" />
              </button>
            </td>
          </tr>
          {rows === null ? (
            <tr><td colSpan={3} className="p-6"><div className="h-16 rounded-xl bg-slate-50 animate-pulse" /></td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-1 py-0.5 w-40"><input type="date" defaultValue={r.measured_on} onBlur={(e) => e.target.value && e.target.value !== r.measured_on && update(r.id, { measured_on: e.target.value })} className={cell} /></td>
                <td className="px-1 py-0.5"><input inputMode="decimal" defaultValue={r.weight_lb} onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== r.weight_lb) update(r.id, { weight_lb: v }) }} className={`${cell} font-black`} /></td>
                <td className="px-1 py-0.5 w-16">
                  <div className="flex items-center gap-1">
                    <Saved on={saved === r.id} />
                    <button type="button" onClick={() => remove(r)} aria-label="Delete" className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {error && <p className="px-3 py-2 text-xs font-bold text-red-600">{error}</p>}
    </Card>
  )
}

/* ---------------- Daily checklist (points) ---------------- */
type DayPts = { d: string; sleep_ok: boolean; readiness_ok: boolean; attend_avail: boolean; attend_ok: boolean; lift_avail: boolean; lift_ok: boolean; throw_avail: boolean; throw_ok: boolean; available: number; earned: number }

function DailyTable({ athleteId }: { athleteId: string }) {
  const [days, setDays] = useState(14)
  const [pts, setPts] = useState<DayPts[] | null>(null)
  const [classOv, setClassOv] = useState<Map<string, string>>(new Map())
  const [classChecks, setClassChecks] = useState<Set<string>>(new Set())
  const [trainChecks, setTrainChecks] = useState<Set<string>>(new Set())
  const [lift, setLift] = useState<Map<string, string>>(new Map())
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const sb = createClient()
    let cancelled = false
    const to = localDate()
    const from = addDays(to, -(days - 1))
    Promise.all([
      sb.rpc('athlete_points', { p_athlete: athleteId, p_from: from, p_to: to }),
      sb.from('class_attendance').select('attend_date, status').eq('athlete_id', athleteId).gte('attend_date', from),
      sb.from('plan_checks').select('check_date, item_type').eq('athlete_id', athleteId).gte('check_date', from).in('item_type', ['class', 'training']),
      sb.from('habit_logs').select('log_date, status').eq('athlete_id', athleteId).eq('habit', 'lift').gte('log_date', from),
    ]).then(([p, c, pc, h]) => {
      if (cancelled) return
      setPts((((p.data as DayPts[]) || []).map((r) => ({ ...r, d: String(r.d), available: Number(r.available), earned: Number(r.earned) }))).sort((a, b) => b.d.localeCompare(a.d)))
      setClassOv(new Map(((c.data as { attend_date: string; status: string }[]) || []).map((x) => [x.attend_date, x.status])))
      const checks = (pc.data as { check_date: string; item_type: string }[]) || []
      setClassChecks(new Set(checks.filter((x) => x.item_type === 'class').map((x) => x.check_date)))
      setTrainChecks(new Set(checks.filter((x) => x.item_type === 'training').map((x) => x.check_date)))
      setLift(new Map(((h.data as { log_date: string; status: string }[]) || []).map((x) => [x.log_date, x.status])))
    })
    return () => {
      cancelled = true
    }
  }, [athleteId, days, version])

  const run = async (key: string, fn: () => PromiseLike<unknown>) => {
    setBusy(key)
    await fn()
    setBusy(null)
    setVersion((n) => n + 1)
  }
  const sb = createClient()
  const setClass = (d: string, status: string) =>
    run(`c${d}`, () =>
      status
        ? sb.from('class_attendance').upsert({ attend_date: d, athlete_id: athleteId, status, updated_at: new Date().toISOString() }, { onConflict: 'attend_date,athlete_id' })
        : sb.from('class_attendance').delete().eq('attend_date', d).eq('athlete_id', athleteId)
    )
  const setLiftStatus = (d: string, status: string) =>
    run(`l${d}`, () =>
      status
        ? sb.from('habit_logs').upsert({ athlete_id: athleteId, log_date: d, habit: 'lift', status }, { onConflict: 'athlete_id,log_date,habit' })
        : sb.from('habit_logs').delete().eq('athlete_id', athleteId).eq('log_date', d).eq('habit', 'lift')
    )
  const toggleTraining = (d: string) =>
    run(`t${d}`, () =>
      trainChecks.has(d)
        ? sb.from('plan_checks').delete().eq('athlete_id', athleteId).eq('check_date', d).eq('item_type', 'training')
        : sb.from('plan_checks').insert({ athlete_id: athleteId, check_date: d, item_type: 'training', item_id: 0 })
    )
  const dot = (ok: boolean, avail = true) => (
    <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center ${!avail ? 'bg-slate-100 text-slate-300' : ok ? 'bg-emerald-500 text-white' : 'bg-red-100 text-red-500'}`}>
      {avail ? (ok ? <Check className="w-3 h-3" strokeWidth={4} /> : '×') : '–'}
    </span>
  )

  return (
    <Card
      toolbar={
        <>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <span className="ml-auto text-[10px] font-bold text-slate-400">Sleep and readiness: edit in the Readiness tab</span>
        </>
      }
    >
      <table className="w-full min-w-[680px]">
        <thead className="bg-slate-50">
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Pts</th>
            <th className={th}>Sleep</th>
            <th className={th}>Class</th>
            <th className={th}>Coach Class Mark</th>
            <th className={th}>Lift</th>
            <th className={th}>Training</th>
            <th className={th}>Readiness</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pts === null ? (
            <tr><td colSpan={8} className="p-6"><div className="h-20 rounded-xl bg-slate-50 animate-pulse" /></td></tr>
          ) : (
            pts.map((r) => (
              <tr key={r.d} className={`hover:bg-slate-50/60 ${busy?.slice(1) === r.d ? 'opacity-50' : ''}`}>
                <td className="px-2 py-1.5 text-xs font-bold text-slate-800 whitespace-nowrap">{prettyDate(r.d, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                <td className="px-2 py-1.5"><span className={`text-xs font-black ${r.earned >= r.available ? 'text-emerald-600' : 'text-slate-900'}`}>{r.earned}/{r.available}</span></td>
                <td className="px-2 py-1.5">{dot(r.sleep_ok)}</td>
                <td className="px-2 py-1.5">
                  {r.attend_avail ? (
                    <span className="flex items-center gap-1.5">{dot(r.attend_ok)}<span className="text-[10px] font-semibold text-slate-400">{classChecks.has(r.d) ? 'Self ✓' : ''}</span></span>
                  ) : (
                    dot(false, false)
                  )}
                </td>
                <td className="px-1 py-1">
                  <select value={classOv.get(r.d) || ''} disabled={!r.attend_avail} onChange={(e) => setClass(r.d, e.target.value)} className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold disabled:opacity-40">
                    <option value="">—</option>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                    <option value="excused">Excused</option>
                  </select>
                </td>
                <td className="px-1 py-1">
                  <select value={lift.get(r.d) || ''} onChange={(e) => setLiftStatus(r.d, e.target.value)} className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold">
                    <option value="">Not done</option>
                    <option value="done">Done</option>
                    <option value="rest">Rest day</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    {dot(r.throw_ok, r.throw_avail)}
                    {r.throw_avail && (
                      <button type="button" onClick={() => toggleTraining(r.d)} className="text-[10px] font-extrabold text-[#1746b8] cursor-pointer">
                        {trainChecks.has(r.d) ? 'Uncheck' : 'Check'}
                      </button>
                    )}
                  </span>
                </td>
                <td className="px-2 py-1.5">{dot(r.readiness_ok)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  )
}
