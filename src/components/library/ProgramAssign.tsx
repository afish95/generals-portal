'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, RefreshCw, Search, Square, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import type { Group, Profile } from '@/lib/training'
import { catOf, TagChip } from '@/components/office/roster/shared'
import { notifyPlayers } from '@/lib/notify'
import type { ProgramAssignment } from '@/lib/programs'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(`${s}T12:00:00`)
const short = (s: string) => parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const endOf = (start: string, weeks: number) => {
  const d = parse(start)
  const dow = (d.getDay() + 6) % 7 // days since Monday
  d.setDate(d.getDate() - dow + weeks * 7 - 1)
  return ymd(d)
}

/** Assign a program to groups (in bulk) or hand-picked players, from a start date for N weeks. */
export default function ProgramAssign({ programId, programName, programWeeks }: { programId: number; programName: string; programWeeks: number }) {
  const nextMon = new Date()
  nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7 || 7))
  const [mode, setMode] = useState<'groups' | 'players'>('groups')
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [groupIds, setGroupIds] = useState<Set<number>>(new Set())
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [find, setFind] = useState('')
  const [start, setStart] = useState(ymd(nextMon))
  const [weeks, setWeeks] = useState(Math.max(programWeeks, 4))
  const [list, setList] = useState<ProgramAssignment[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('team_groups').select('*').order('sort_order'),
      sb.from('profiles').select('id, username, full_name, role, position_group, grad_year, is_active, is_demo').eq('role', 'player').eq('is_active', true).order('full_name'),
      sb.from('program_assignments').select('*').eq('program_id', programId).order('created_at', { ascending: false }),
    ]).then(([g, p, a]) => {
      setGroups(((g.data as Group[]) || []).filter((x) => !x.name.startsWith('Demo') && !(catOf(x) === 'Workout' && x.name.includes(' · '))))
      setPlayers(((p.data as Profile[]) || []).filter((x) => !x.is_demo))
      setList((a.data as ProgramAssignment[]) || [])
    })
  }, [programId, version])

  const end = endOf(start, weeks)
  const target = mode === 'groups' ? (groupIds.size ? groups.filter((g) => groupIds.has(g.id)).map((g) => g.name).join(', ') : null) : picked.size ? `${picked.size} player${picked.size === 1 ? '' : 's'}` : null

  const assign = async () => {
    if (!target) return setError(mode === 'groups' ? 'Pick a group.' : 'Pick at least one player.')
    setError(null)
    const sb = createClient()
    const jobs: { group: number | null; athletes: string[]; label: string }[] =
      mode === 'groups'
        ? [...groupIds].map((id) => ({ group: id, athletes: [], label: groups.find((g) => g.id === id)?.name || 'Group' }))
        : [{ group: null, athletes: [...picked], label: [...picked].map((id) => players.find((p) => p.id === id)?.full_name.split(' ')[0]).filter(Boolean).slice(0, 4).join(', ') + (picked.size > 4 ? ` +${picked.size - 4}` : '') }]
    for (const j of jobs) {
      setBusy(`Assigning ${j.label}…`)
      const { error: e } = await sb.rpc('assign_program', { p_program: programId, p_group: j.group, p_athletes: j.athletes, p_label: j.label, p_start: start, p_weeks: weeks })
      if (e) {
        setBusy(null)
        return setError(e.message)
      }
      await notifyPlayers({
        title: programName,
        body: `${weeks} weeks · starts ${short(start)}`,
        url: '/',
        groupId: j.group ?? undefined,
        recipientIds: j.group ? undefined : j.athletes,
        kind: 'assignment',
      })
    }
    setBusy(null)
    setMsg(`Assigned to ${target} · notified`)
    setGroupIds(new Set())
    setPicked(new Set())
    setVersion((v) => v + 1)
  }

  const refresh = async (a: ProgramAssignment) => {
    setBusy('Updating…')
    const { data, error: e } = await createClient().rpc('refresh_program_assignment', { p_assignment: a.id })
    setBusy(null)
    if (e) return setError(e.message)
    setMsg(`Updated ${data} upcoming days.`)
  }
  const stop = async (a: ProgramAssignment) => {
    if (!window.confirm(`Stop "${programName}" for ${a.target_label}? Days after today are removed. Anything logged is kept.`)) return
    const { data, error: e } = await createClient().rpc('stop_program_assignment', { p_assignment: a.id })
    if (e) return setError(e.message)
    setMsg(`Stopped. Removed ${data} upcoming days.`)
    setVersion((v) => v + 1)
  }

  const toggleSet = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }
  const shown = players.filter((p) => !find || p.full_name.toLowerCase().includes(find.toLowerCase()))
  const today = ymd(new Date())

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4">
        <SectionLabel>Assign</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100">
          {(['groups', 'players'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
              {m === 'groups' ? 'Groups' : 'Pick Players'}
            </button>
          ))}
        </div>
        {mode === 'groups' ? (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <TagChip key={g.id} group={g} active={groupIds.has(g.id)} onClick={() => setGroupIds((s) => toggleSet(s, g.id))} />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find players" className={`${inputClass} pl-9`} />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 p-1 grid grid-cols-1 sm:grid-cols-2">
              {shown.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => toggleSet(s, p.id))} className="w-4 h-4 accent-[#1746b8]" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">
            Starts
            <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={inputClass} />
          </label>
          <label className="text-[11px] font-bold text-slate-500">
            For
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={inputClass}>
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map((w) => (
                <option key={w} value={w}>{w} week{w === 1 ? '' : 's'}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs font-semibold text-slate-500">{short(start)} – {short(end)}</p>
        <button type="button" onClick={assign} disabled={!!busy || !target} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer">
          <CalendarCheck className="w-4 h-4" /> {busy || (target ? `Assign to ${target}` : 'Assign')}
        </button>
        {msg && <p className="text-xs font-extrabold text-emerald-700">{msg}</p>}
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      </section>

      {list.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
          <SectionLabel>Assigned</SectionLabel>
          {list.map((a) => {
            const e = endOf(a.start_date, a.weeks)
            const active = a.status === 'active' && e >= today
            return (
              <div key={a.id} className={`rounded-2xl border border-slate-200 p-3 ${active ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#1746b8] shrink-0" />
                  <span className="text-sm font-extrabold text-slate-900 flex-1 min-w-0 truncate">{a.target_label}</span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.status === 'stopped' ? 'Stopped' : active ? 'Active' : 'Finished'}</span>
                </div>
                <div className="text-[11px] font-semibold text-slate-500 mt-0.5 ml-6">{short(a.start_date)} – {short(e)} · {a.weeks} wk</div>
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
