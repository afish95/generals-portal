'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, RefreshCw, Search, Square, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import type { Group, Profile } from '@/lib/training'
import { catOf, TagChip } from '@/components/office/roster/shared'
import { notifyPlayers } from '@/lib/notify'

type Pattern = 'daily' | 'every_other' | 'weekdays'
type Assignment = { id: number; target_label: string; pattern: Pattern; weekdays: number[]; start_date: string; end_date: string; dates: string[]; status: 'active' | 'stopped' }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(`${s}T12:00:00`)
const nice = (s: string) => parse(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const short = (s: string) => parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function datesFor(start: string, end: string, pattern: Pattern, weekdays: number[]) {
  const out: string[] = []
  const s = parse(start)
  const e = parse(end)
  for (let d = new Date(s), i = 0; d <= e && out.length < 400; d.setDate(d.getDate() + 1), i++) {
    if (pattern === 'daily' || (pattern === 'every_other' && i % 2 === 0) || (pattern === 'weekdays' && weekdays.includes(d.getDay()))) out.push(ymd(d))
  }
  return out
}
export const patternText = (p: Pattern, w: number[]) =>
  p === 'daily' ? 'Every day' : p === 'every_other' ? 'Every other day' : w.length ? [...w].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DOW[d]).join(' / ') : 'No days picked'

/** Assign a progression to a group or to hand-picked players, on chosen days. Creates their sessions on the calendar. */
export default function AssignPanel({ progressionId, progressionName }: { progressionId: number; progressionName: string }) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const [mode, setMode] = useState<'group' | 'players'>('group')
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [groupId, setGroupId] = useState<number | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [find, setFind] = useState('')
  const [pattern, setPattern] = useState<Pattern>('weekdays')
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5])
  const [start, setStart] = useState(ymd(tomorrow))
  const [weeks, setWeeks] = useState(4)
  const [list, setList] = useState<Assignment[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('team_groups').select('*').order('sort_order'),
      sb.from('profiles').select('id, username, full_name, role, position_group, grad_year, is_active, is_demo').eq('role', 'player').eq('is_active', true).order('full_name'),
      sb.from('progression_assignments').select('*').eq('progression_id', progressionId).order('created_at', { ascending: false }),
    ]).then(([g, p, a]) => {
      setGroups(((g.data as Group[]) || []).filter((x) => !x.name.startsWith('Demo') && !(catOf(x) === 'Workout' && x.name.includes(' · '))))
      setPlayers(((p.data as Profile[]) || []).filter((x) => !x.is_demo))
      setList((a.data as Assignment[]) || [])
    })
  }, [progressionId, version])

  const end = useMemo(() => {
    const d = parse(start)
    d.setDate(d.getDate() + weeks * 7 - 1)
    return ymd(d)
  }, [start, weeks])
  const dates = datesFor(start, end, pattern, weekdays)
  const target = mode === 'group' ? groups.find((g) => g.id === groupId)?.name : picked.size ? `${picked.size} player${picked.size === 1 ? '' : 's'}` : null

  const assign = async () => {
    if (!target) return setError(mode === 'group' ? 'Pick a group.' : 'Pick at least one player.')
    if (!dates.length) return setError('Pick at least one day.')
    const label = mode === 'group' ? target : [...picked].map((id) => players.find((p) => p.id === id)?.full_name.split(' ')[0]).filter(Boolean).slice(0, 4).join(', ') + (picked.size > 4 ? ` +${picked.size - 4}` : '')
    setBusy('Assigning…')
    setError(null)
    const { error: e } = await createClient().rpc('assign_progression', {
      p_progression: progressionId,
      p_group: mode === 'group' ? groupId : null,
      p_athletes: mode === 'players' ? [...picked] : [],
      p_label: label,
      p_pattern: pattern,
      p_weekdays: pattern === 'weekdays' ? weekdays : [],
      p_start: start,
      p_end: end,
      p_dates: dates,
    })
    if (e) {
      setBusy(null)
      return setError(e.message)
    }
    setBusy('Notifying players…')
    const n = await notifyPlayers({
      title: progressionName,
      body: `${patternText(pattern, weekdays)} · starts ${short(start)}`,
      url: '/',
      groupId: mode === 'group' ? groupId : undefined,
      recipientIds: mode === 'players' ? [...picked] : undefined,
      kind: 'assignment',
    })
    setBusy(null)
    setMsg(`Assigned to ${label}${n.ok ? ' · notified' : ''}`)
    setPicked(new Set())
    setVersion((v) => v + 1)
  }

  const refresh = async (a: Assignment) => {
    setBusy('Updating…')
    const { data, error: e } = await createClient().rpc('refresh_assignment', { p_assignment: a.id })
    setBusy(null)
    if (e) return setError(e.message)
    setMsg(`Updated ${data} upcoming sessions with the current drills.`)
  }
  const stop = async (a: Assignment) => {
    if (!window.confirm(`Stop "${progressionName}" for ${a.target_label}? Sessions after today are removed. Anything already logged is kept.`)) return
    const { data, error: e } = await createClient().rpc('stop_assignment', { p_assignment: a.id })
    if (e) return setError(e.message)
    setMsg(`Stopped. Removed ${data} upcoming sessions.`)
    setVersion((v) => v + 1)
  }

  const shownPlayers = players.filter((p) => !find || p.full_name.toLowerCase().includes(find.toLowerCase()))
  const today = ymd(new Date())

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
        <SectionLabel>Assign this progression</SectionLabel>

        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Who</div>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 mb-2">
            {(['group', 'players'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
                {m === 'group' ? 'A group' : 'Pick players'}
              </button>
            ))}
          </div>
          {mode === 'group' ? (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <TagChip key={g.id} group={g} active={groupId === g.id} onClick={() => setGroupId(groupId === g.id ? null : g.id)} />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find players" className={`${inputClass} pl-9`} />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 p-1 grid grid-cols-1 sm:grid-cols-2">
                {shownPlayers.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} className="w-4 h-4 accent-[#1746b8]" />
                    <span className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</span>
                    {p.grad_year && <span className="ml-auto text-[10px] font-bold text-slate-400">’{String(p.grad_year).slice(2)}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">How often</div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['daily', 'Every day'],
                ['every_other', 'Every other day'],
                ['weekdays', 'Pick days'],
              ] as [Pattern, string][]
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPattern(k)} className={`px-3 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${pattern === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                {l}
              </button>
            ))}
          </div>
          {pattern === 'weekdays' && (
            <div className="mt-2 space-y-1.5">
              <div className="grid grid-cols-7 gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} type="button" onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))} className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${weekdays.includes(d) ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {DOW[d]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['Mon / Wed / Fri', [1, 3, 5]],
                    ['Tue / Thu', [2, 4]],
                    ['Weekdays', [1, 2, 3, 4, 5]],
                  ] as [string, number[]][]
                ).map(([l, w]) => (
                  <button key={l} type="button" onClick={() => setWeekdays(w)} className="px-2.5 py-1 rounded-full bg-blue-50 text-[#1746b8] text-[11px] font-extrabold cursor-pointer">
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">
            Starts
            <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={inputClass} />
          </label>
          <label className="text-[11px] font-bold text-slate-500">
            For
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={inputClass}>
              {[1, 2, 3, 4, 6, 8, 10, 12, 16].map((w) => (
                <option key={w} value={w}>{w} week{w === 1 ? '' : 's'}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
          <b className="text-slate-900">{dates.length} sessions</b> · {patternText(pattern, weekdays)} · {short(start)} – {short(end)}
          {dates.length > 0 && <div className="text-[11px] text-slate-400 mt-0.5">First: {dates.slice(0, 3).map(nice).join(', ')}{dates.length > 3 ? '…' : ''}</div>}
        </div>

        <button type="button" onClick={assign} disabled={!!busy || !target || !dates.length} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer">
          <CalendarCheck className="w-4 h-4" /> {busy || (target ? `Assign to ${target}` : 'Assign')}
        </button>
        {msg && <p className="text-xs font-extrabold text-emerald-700">{msg}</p>}
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      </section>

      {list.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
          <SectionLabel>Assigned</SectionLabel>
          {list.map((a) => {
            const left = a.dates.filter((d) => d > today).length
            const active = a.status === 'active' && left > 0
            return (
              <div key={a.id} className={`rounded-2xl border border-slate-200 p-3 ${active ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#1746b8] shrink-0" />
                  <span className="text-sm font-extrabold text-slate-900 flex-1 min-w-0 truncate">{a.target_label}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.status === 'stopped' ? 'Stopped' : active ? `${left} to go` : 'Finished'}</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-500 mt-0.5 ml-6">
                  {patternText(a.pattern, a.weekdays)} · {short(a.start_date)} – {short(a.end_date)} · {a.dates.length} sessions
                </div>
                {active && (
                  <div className="flex gap-1.5 mt-2 ml-6">
                    <button type="button" onClick={() => refresh(a)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-[11px] font-extrabold text-slate-700 flex items-center gap-1 cursor-pointer">
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                    <button type="button" onClick={() => stop(a)} className="px-2.5 py-1.5 rounded-lg bg-red-50 text-[11px] font-extrabold text-red-700 flex items-center gap-1 cursor-pointer">
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
