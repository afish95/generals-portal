'use client'

import { useEffect, useMemo, useState } from 'react'
import BaseballIcon from '@/components/BaseballIcon'
import { CalendarDays, ChevronRight, Layers, Pencil, Plus, Search, Square, Target, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import type { Exercise, Group, Profile, Workout, WorkoutItem } from '@/lib/training'
import type { Drill, Folder, Progression } from '@/lib/library'
import { KIND_INFO, type Program, type ProgramKind } from '@/lib/programs'
import WorkoutEditor from '@/components/office/WorkoutEditor'
import ProgressionSheet from '@/components/library/ProgressionSheet'
import ProgramSheet from '@/components/library/ProgramSheet'
import { catOf, SheetFrame, TagChip } from '@/components/office/roster/shared'
import { datesFor, patternText } from '@/components/library/AssignPanel'
import SendNotification from '@/components/SendNotification'
import { notifyPlayers } from '@/lib/notify'

type Pattern = 'daily' | 'every_other' | 'weekdays'
type Kind = 'program' | 'progression'
type Row = {
  kind: Kind
  id: number
  itemId: number
  name: string
  groupId: number | null
  label: string
  start: string
  end: string
  status: 'active' | 'stopped'
  weeks?: number
  pattern?: Pattern
  weekdays?: number[]
  freq: string
}
type Item = { id: number; name: string; weeks?: number; kind?: string }
type OneOff = { id: number; title: string; workout_date: string; group_id: number | null }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(`${s}T12:00:00`)
const short = (s: string) => parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const day = (s: string) => parse(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const endOf = (start: string, weeks: number) => {
  const d = parse(start)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weeks * 7 - 1)
  return ymd(d)
}
const ISO_DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const isAdhoc = (g?: Group) => !!g && catOf(g) === 'Workout' && g.name.includes(' · ')
const firstNames = (ids: string[], players: Profile[]) =>
  ids.map((id) => players.find((p) => p.id === id)?.full_name.split(' ')[0]).filter(Boolean).slice(0, 4).join(', ') + (ids.length > 4 ? ` +${ids.length - 4}` : '')

/** Coach Office → Training → Assignments: every program and progression in one list. Tap to change who, what days and dates. */
export default function AssignmentsTab({ exercises, onOpenLibrary }: { exercises: Exercise[]; onOpenLibrary: (sub: 'programs' | 'progressions') => void }) {
  const today = ymd(new Date())
  const [rows, setRows] = useState<Row[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [members, setMembers] = useState<Record<number, string[]>>({})
  const [programs, setPrograms] = useState<Item[]>([])
  const [progressions, setProgressions] = useState<Item[]>([])
  const [oneOffs, setOneOffs] = useState<OneOff[]>([])
  const [view, setView] = useState<'list' | 'players'>('list')
  const [past, setPast] = useState(false)
  const [find, setFind] = useState('')
  const [open, setOpen] = useState<Row | { kind: Kind; id: 0 } | null>(null)
  const [version, setVersion] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [editWorkout, setEditWorkout] = useState<{ workout: Workout; items: WorkoutItem[] } | null>(null)
  const [editItem, setEditItem] = useState<Row | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const openWorkout = async (id: number) => {
    const sb = createClient()
    const [w, it] = await Promise.all([sb.from('workouts').select('*').eq('id', id).single(), sb.from('workout_items').select('*').eq('workout_id', id)])
    if (w.data) setEditWorkout({ workout: w.data as Workout, items: (it.data as WorkoutItem[]) || [] })
  }

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('program_assignments').select('*').order('start_date', { ascending: false }),
      sb.from('progression_assignments').select('id, progression_id, group_id, target_label, pattern, weekdays, start_date, end_date, status').order('start_date', { ascending: false }),
      sb.from('programs').select('id, name, weeks, kind').order('name'),
      sb.from('progressions').select('id, name, is_active').order('name'),
      sb.from('program_days').select('program_id, week, dow'),
      sb.from('team_groups').select('*').order('sort_order').order('name'),
      sb.from('profiles').select('id, username, full_name, role, position_group, grad_year, is_active, is_demo').eq('role', 'player').eq('is_active', true).order('full_name'),
      sb.from('workouts').select('id, title, workout_date, group_id').is('assignment_id', null).is('program_assignment_id', null).gte('workout_date', today).order('workout_date').limit(60),
    ]).then(async ([pa, pr, pg, ps, pd, g, p, w]) => {
      const progs = (pg.data as Item[]) || []
      const prls = ((ps.data as (Item & { is_active: boolean })[]) || [])
      const days = (pd.data as { program_id: number; week: number; dow: number }[]) || []
      const freqOf = (pid: number) => {
        const wk1 = days.filter((d) => d.program_id === pid && d.week === 1).map((d) => d.dow).sort()
        return wk1.length ? `${wk1.length}x / Week · ${wk1.map((d) => ISO_DOW[d]).join(' / ')}` : 'No days set'
      }
      const list: Row[] = [
        ...((pa.data as { id: number; program_id: number; group_id: number | null; target_label: string | null; start_date: string; weeks: number; status: 'active' | 'stopped' }[]) || []).map((a) => ({
          kind: 'program' as const,
          id: a.id,
          itemId: a.program_id,
          name: progs.find((x) => x.id === a.program_id)?.name || 'Program',
          groupId: a.group_id,
          label: a.target_label || '',
          start: a.start_date,
          end: endOf(a.start_date, a.weeks),
          status: a.status,
          weeks: a.weeks,
          freq: `${KIND_INFO[(progs.find((x) => x.id === a.program_id)?.kind || 'throwing') as ProgramKind].label} · ${freqOf(a.program_id)}`,
        })),
        ...((pr.data as { id: number; progression_id: number; group_id: number | null; target_label: string | null; pattern: Pattern; weekdays: number[]; start_date: string; end_date: string; status: 'active' | 'stopped' }[]) || []).map((a) => ({
          kind: 'progression' as const,
          id: a.id,
          itemId: a.progression_id,
          name: prls.find((x) => x.id === a.progression_id)?.name || 'Progression',
          groupId: a.group_id,
          label: a.target_label || '',
          start: a.start_date,
          end: a.end_date,
          status: a.status,
          pattern: a.pattern,
          weekdays: a.weekdays || [],
          freq: patternText(a.pattern, a.weekdays || []),
        })),
      ]
      const gids = [...new Set(list.map((r) => r.groupId).filter((x): x is number => x != null))]
      const gm = gids.length ? await sb.from('group_members').select('group_id, athlete_id').in('group_id', gids) : { data: [] }
      const m: Record<number, string[]> = {}
      for (const r of (gm.data as { group_id: number; athlete_id: string }[]) || []) (m[r.group_id] ||= []).push(r.athlete_id)
      setRows(list)
      setPrograms(progs)
      setProgressions(prls.filter((x) => x.is_active))
      setGroups((g.data as Group[]) || [])
      setPlayers(((p.data as Profile[]) || []).filter((x) => !x.is_demo))
      setMembers(m)
      setOneOffs((w.data as OneOff[]) || [])
      setLoaded(true)
    })
  }, [version, today])

  const isLive = (r: Row) => r.status === 'active' && r.end >= today
  const groupName = (id: number | null) => groups.find((g) => g.id === id)
  const whoText = (r: Row) => {
    const g = groupName(r.groupId)
    const n = r.groupId != null ? members[r.groupId]?.length || 0 : 0
    return `${isAdhoc(g) ? r.label : g?.name || r.label} · ${n} player${n === 1 ? '' : 's'}`
  }
  const q = find.trim().toLowerCase()
  const shown = rows
    .filter((r) => (past ? !isLive(r) : isLive(r)))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || whoText(r).toLowerCase().includes(q) || (r.groupId != null && (members[r.groupId] || []).some((id) => players.find((p) => p.id === id)?.full_name.toLowerCase().includes(q))))

  const byPlayer = useMemo(() => {
    const live = rows.filter((r) => r.status === 'active' && r.end >= today)
    return players
      .filter((p) => !q || p.full_name.toLowerCase().includes(q))
      .map((p) => ({ p, list: live.filter((r) => r.groupId != null && (members[r.groupId] || []).includes(p.id)) }))
  }, [rows, players, members, q, today])

  const oneOffByTitle = useMemo(() => {
    const out: { title: string; group: number | null; dates: { date: string; id: number }[] }[] = []
    for (const w of oneOffs) {
      const hit = out.find((o) => o.title === w.title && o.group === w.group_id)
      if (hit) hit.dates.push({ date: w.workout_date, id: w.id })
      else out.push({ title: w.title, group: w.group_id, dates: [{ date: w.workout_date, id: w.id }] })
    }
    return out
  }, [oneOffs])

  const Badge = ({ kind }: { kind: Kind }) => (
    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${kind === 'program' ? 'bg-sky-50 text-sky-600' : 'bg-indigo-50 text-indigo-600'}`}>
      {kind === 'program' ? <Target className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
    </span>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search programs or players" className={`${inputClass} pl-9`} />
        </div>
        <NewButton onPick={(kind) => setOpen({ kind, id: 0 })} />
      </div>

      <div className="flex items-center gap-2">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-slate-200 flex-1">
          {(['list', 'players'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${view === v ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
              {v === 'list' ? 'By Assignment' : 'By Player'}
            </button>
          ))}
        </div>
        {view === 'list' && (
          <button type="button" onClick={() => setPast((x) => !x)} className={`px-3 py-2 rounded-xl text-xs font-extrabold border cursor-pointer ${past ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
            {past ? 'Past' : 'Active'}
          </button>
        )}
      </div>

      {note && <p className="text-xs font-extrabold text-emerald-700 px-1">{note}</p>}
      {!loaded ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : view === 'list' ? (
        <>
          <section className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {shown.length === 0 && <p className="p-5 text-sm text-slate-500">{past ? 'Nothing finished or stopped yet.' : 'Nothing assigned right now. Tap New to assign a program or progression.'}</p>}
            {shown.map((r) => (
              <button key={`${r.kind}${r.id}`} type="button" onClick={() => setOpen(r)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer">
                <Badge kind={r.kind} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-slate-900 truncate">{r.name}</div>
                  <div className="text-[11px] font-semibold text-slate-500 truncate flex items-center gap-1"><Users className="w-3 h-3 shrink-0" />{whoText(r)}</div>
                  <div className="text-[11px] font-semibold text-slate-400 truncate">{r.freq} · {short(r.start)} – {short(r.end)}{r.status === 'stopped' ? ' · Stopped' : ''}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            ))}
          </section>

          {!past && oneOffByTitle.length > 0 && (
            <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2">
              <SectionLabel>One-Off Workouts</SectionLabel>
              {oneOffByTitle.map((o) => (
                <div key={`${o.title}${o.group}`} className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><BaseballIcon className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => openWorkout(o.dates[0].id)} className="w-full text-left cursor-pointer">
                      <div className="text-sm font-extrabold text-slate-900 truncate flex items-center gap-1.5">{o.title}<Pencil className="w-3 h-3 text-slate-400" /></div>
                      <div className="text-[11px] font-semibold text-slate-500 truncate">{groupName(o.group)?.name || 'Everyone'}</div>
                    </button>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {o.dates.slice(0, 8).map((d) => (
                        <button key={d.id} type="button" onClick={() => openWorkout(d.id)} className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-extrabold text-slate-600 cursor-pointer">{day(d.date)}</button>
                      ))}
                      {o.dates.length > 8 && <span className="text-[10px] font-bold text-slate-400 self-center">+{o.dates.length - 8}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      ) : (
        <section className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {byPlayer.map(({ p, list }) => (
            <div key={p.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-900 flex-1 truncate">{p.full_name}</span>
                <span className="text-[10px] font-extrabold text-slate-400">{p.position_group || ''}</span>
              </div>
              {list.length === 0 ? (
                <p className="text-[11px] text-slate-400">Nothing assigned</p>
              ) : (
                <div className="flex flex-wrap gap-1 mt-1">
                  {list.map((r) => (
                    <button key={`${r.kind}${r.id}`} type="button" onClick={() => setOpen(r)} className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold cursor-pointer ${r.kind === 'program' ? 'bg-sky-50 text-sky-700' : 'bg-indigo-50 text-indigo-700'}`}>
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {open && (
        <AssignmentSheet
          row={open.id ? (open as Row) : null}
          kind={open.kind}
          programs={programs}
          progressions={progressions}
          groups={groups}
          players={players}
          members={members}
          onEditItem={() => setEditItem(open as Row)}
          onOpenLibrary={(s) => {
            setOpen(null)
            onOpenLibrary(s)
          }}
          onClose={(changed) => {
            setOpen(null)
            if (changed) setVersion((v) => v + 1)
          }}
        />
      )}

      {editWorkout && (
        <WorkoutEditor
          workout={editWorkout.workout}
          items={editWorkout.items}
          date={editWorkout.workout.workout_date}
          defaultGroupId={editWorkout.workout.group_id}
          defaultPhase={editWorkout.workout.phase || 'off_season'}
          groups={groups}
          exercises={exercises}
          onClose={() => setEditWorkout(null)}
          onSaved={() => {
            setEditWorkout(null)
            setNote('Workout saved')
            setVersion((v) => v + 1)
          }}
        />
      )}

      {editItem && (
        <ItemEditor
          row={editItem}
          onDone={(msg) => {
            setEditItem(null)
            if (msg) setNote(msg)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

/** Edit the program or progression behind an assignment, then rebuild upcoming days for everyone on it. */
function ItemEditor({ row, onDone }: { row: Row; onDone: (msg: string | null) => void }) {
  const [prog, setProg] = useState<Progression | null>(null)
  const [program, setProgram] = useState<Program | null>(null)
  const [drills, setDrills] = useState<Drill[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [progOpts, setProgOpts] = useState<{ id: number; name: string }[]>([])
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    const sb = createClient()
    if (row.kind === 'progression') {
      Promise.all([
        sb.from('progressions').select('*').eq('id', row.itemId).single(),
        sb.from('exercises').select('*').order('name'),
        sb.from('library_folders').select('*').order('sort_order'),
      ]).then(([p, d, f]) => {
        setDrills(((d.data as Drill[]) || []).map((x) => ({ ...x, tags: x.tags || [] })))
        setFolders((f.data as Folder[]) || [])
        setProg(p.data as Progression)
      })
    } else {
      Promise.all([sb.from('programs').select('*').eq('id', row.itemId).single(), sb.from('progressions').select('id, name, is_active').order('name')]).then(([p, ps]) => {
        setProgOpts(((ps.data as { id: number; name: string; is_active: boolean }[]) || []).filter((x) => x.is_active).map(({ id, name }) => ({ id, name })))
        setProgram(p.data as Program)
      })
    }
  }, [row])

  const close = async () => {
    if (!changed) return onDone(null)
    // Push the edits onto upcoming days for every active assignment of this item (logged days are kept).
    const sb = createClient()
    const today = ymd(new Date())
    let n = 0
    if (row.kind === 'progression') {
      const { data } = await sb.from('progression_assignments').select('id').eq('progression_id', row.itemId).eq('status', 'active').gte('end_date', today)
      for (const a of (data as { id: number }[]) || []) n += Number((await sb.rpc('refresh_assignment', { p_assignment: a.id })).data || 0)
    } else {
      const { data } = await sb.from('program_assignments').select('id').eq('program_id', row.itemId).eq('status', 'active')
      for (const a of (data as { id: number }[]) || []) n += Number((await sb.rpc('refresh_program_assignment', { p_assignment: a.id })).data || 0)
    }
    onDone(`Saved · updated ${n} upcoming day${n === 1 ? '' : 's'}`)
  }

  if (row.kind === 'progression') {
    if (!prog) return <div className="fixed inset-0 z-50 bg-[#f3f5f9]" />
    return <ProgressionSheet progression={prog} drills={drills} folders={folders} onClose={close} onChanged={() => setChanged(true)} />
  }
  if (!program) return <div className="fixed inset-0 z-50 bg-[#f3f5f9]" />
  return <ProgramSheet program={program} progressions={progOpts} onClose={close} onChanged={() => setChanged(true)} />
}

function NewButton({ onPick }: { onPick: (k: Kind) => void }) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setMenu((m) => !m)} className="h-full px-4 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center gap-1.5 cursor-pointer">
        <Plus className="w-4 h-4" /> New
      </button>
      {menu && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-2xl border border-slate-200 shadow-lg p-1">
          {(['program', 'progression'] as const).map((k) => (
            <button key={k} type="button" onClick={() => { setMenu(false); onPick(k) }} className="w-full text-left px-3 py-2 rounded-xl text-sm font-bold text-slate-800 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
              {k === 'program' ? <Target className="w-4 h-4 text-sky-600" /> : <Layers className="w-4 h-4 text-indigo-600" />}
              {k === 'program' ? 'Assign a Program' : 'Assign a Progression'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AssignmentSheet({
  row, kind, programs, progressions, groups, players, members, onClose, onOpenLibrary, onEditItem,
}: {
  row: Row | null
  kind: Kind
  programs: Item[]
  progressions: Item[]
  groups: Group[]
  players: Profile[]
  members: Record<number, string[]>
  onClose: (changed: boolean) => void
  onOpenLibrary: (sub: 'programs' | 'progressions') => void
  onEditItem: () => void
}) {
  const nextMon = new Date()
  nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7 || 7))
  const pickable = groups.filter((g) => !g.name.startsWith('Demo') && !isAdhoc(g))
  const curGroup = groups.find((g) => g.id === row?.groupId)
  const startPlayers = row?.groupId != null && isAdhoc(curGroup) ? members[row.groupId] || [] : []

  const [itemId, setItemId] = useState<number>(row?.itemId || 0)
  const [mode, setMode] = useState<'group' | 'players'>(startPlayers.length ? 'players' : 'group')
  const [groupId, setGroupId] = useState<number | null>(row && !isAdhoc(curGroup) ? row.groupId : null)
  const [picked, setPicked] = useState<Set<string>>(new Set(startPlayers))
  const [findP, setFindP] = useState('')
  const [start, setStart] = useState(row?.start || ymd(nextMon))
  const [weeks, setWeeks] = useState(row?.weeks || 4)
  const [pattern, setPattern] = useState<Pattern>(row?.pattern || 'weekdays')
  const [weekdays, setWeekdays] = useState<number[]>(row?.weekdays?.length ? row.weekdays : [1, 3, 5])
  const [end, setEnd] = useState(row?.kind === 'progression' ? row.end : (() => { const d = parse(ymd(nextMon)); d.setDate(d.getDate() + 27); return ymd(d) })())
  const [notify, setNotify] = useState(!row)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const items = kind === 'program' ? programs : progressions
  const itemName = items.find((x) => x.id === itemId)?.name || row?.name || ''
  const progEnd = endOf(start, weeks)
  const dates = kind === 'progression' ? datesFor(start, end, pattern, weekdays) : []
  const samePlayers = startPlayers.length === picked.size && startPlayers.every((id) => picked.has(id))
  const label = mode === 'group' ? groups.find((g) => g.id === groupId)?.name || '' : firstNames([...picked], players)
  const ready = !!itemId && (mode === 'group' ? groupId != null : picked.size > 0) && (kind === 'program' || dates.length > 0)

  const save = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    const sb = createClient()
    const keepGroup = mode === 'players' && row && samePlayers ? row.groupId : null
    const pGroup = mode === 'group' ? groupId : keepGroup
    const pAthletes = mode === 'players' && !keepGroup ? [...picked] : []
    const pLabel = keepGroup ? row!.label : label
    let res
    if (kind === 'program') {
      res = row
        ? await sb.rpc('update_program_assignment', { p_assignment: row.id, p_group: pGroup, p_athletes: pAthletes, p_label: pLabel, p_start: start, p_weeks: weeks })
        : await sb.rpc('assign_program', { p_program: itemId, p_group: pGroup, p_athletes: pAthletes, p_label: pLabel, p_start: start, p_weeks: weeks })
    } else {
      const args = { p_group: pGroup, p_athletes: pAthletes, p_label: pLabel, p_pattern: pattern, p_weekdays: pattern === 'weekdays' ? weekdays : [], p_start: start, p_end: end, p_dates: dates }
      res = row
        ? await sb.rpc('update_progression_assignment', { p_assignment: row.id, ...args })
        : await sb.rpc('assign_progression', { p_progression: itemId, ...args })
    }
    if (res.error) {
      setBusy(false)
      return setError(res.error.message)
    }
    if (notify) {
      await notifyPlayers({
        title: row ? `${itemName} updated` : itemName,
        body: kind === 'program' ? `${weeks} weeks · starts ${short(start)}` : `${patternText(pattern, weekdays)} · ${short(start)} – ${short(end)}`,
        url: '/',
        groupId: pGroup ?? undefined,
        recipientIds: pGroup ? undefined : pAthletes,
        kind: 'assignment',
      })
    }
    onClose(true)
  }

  const stop = async () => {
    if (!row || !window.confirm(`Stop "${row.name}" for ${row.label}? Upcoming days are removed. Anything logged is kept.`)) return
    setBusy(true)
    const { error: e } = await createClient().rpc(row.kind === 'program' ? 'stop_program_assignment' : 'stop_assignment', { p_assignment: row.id })
    if (e) {
      setBusy(false)
      return setError(e.message)
    }
    onClose(true)
  }

  const shownPlayers = players.filter((p) => !findP || p.full_name.toLowerCase().includes(findP.toLowerCase()))

  return (
    <SheetFrame title={row ? row.name : kind === 'program' ? 'Assign a Program' : 'Assign a Progression'} subtitle={row ? 'Changes apply from tomorrow · logged days are kept' : undefined} onClose={() => onClose(false)}>
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>What</SectionLabel>
        {row ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-slate-900 flex-1">{row.name}</span>
            <button type="button" onClick={onEditItem} className="px-3 py-1.5 rounded-lg bg-blue-50 text-xs font-extrabold text-[#1746b8] flex items-center gap-1 cursor-pointer">
              <Pencil className="w-3 h-3" /> Edit Workout
            </button>
          </div>
        ) : (
          <select value={itemId} onChange={(e) => setItemId(Number(e.target.value))} className={inputClass}>
            <option value={0}>Pick a {kind}…</option>
            {items.map((x) => (
              <option key={x.id} value={x.id}>{x.name}{kind === 'program' && x.kind ? ` (${KIND_INFO[x.kind as ProgramKind].label})` : ''}</option>
            ))}
          </select>
        )}
        {row && <p className="text-[11px] font-semibold text-slate-500">{kind === 'program' ? `${row.freq} · Edit Workout changes the days, intent and drills` : 'Edit Workout changes the drills for every upcoming day'}</p>}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Who</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100">
          {(['group', 'players'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
              {m === 'group' ? 'Group' : 'Pick Players'}
            </button>
          ))}
        </div>
        {mode === 'group' ? (
          <div className="flex flex-wrap gap-1.5">
            {pickable.map((g) => (
              <TagChip key={g.id} group={g} active={groupId === g.id} onClick={() => setGroupId(g.id)} />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={findP} onChange={(e) => setFindP(e.target.value)} placeholder="Find players" className={`${inputClass} pl-9`} />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 p-1 grid grid-cols-1 sm:grid-cols-2">
              {shownPlayers.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                    className="w-4 h-4 accent-[#1746b8]"
                  />
                  <span className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-slate-500">{picked.size} picked</p>
          </div>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>When</SectionLabel>
        {kind === 'program' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-bold text-slate-500">
                Starts
                <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={inputClass} />
              </label>
              <label className="text-[11px] font-bold text-slate-500">
                For
                <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={inputClass}>
                  {[...new Set([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, weeks])].sort((a, b) => a - b).map((w) => (
                    <option key={w} value={w}>{w} week{w === 1 ? '' : 's'}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{short(start)} – {short(progEnd)}</p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100">
              {([['daily', 'Every Day'], ['every_other', 'Every Other'], ['weekdays', 'Pick Days']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setPattern(k)} className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${pattern === k ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            {pattern === 'weekdays' && (
              <div className="grid grid-cols-7 gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                    className={`py-2 rounded-lg text-[11px] font-extrabold cursor-pointer ${weekdays.includes(d) ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {DOW[d]}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-bold text-slate-500">
                Starts
                <input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={inputClass} />
              </label>
              <label className="text-[11px] font-bold text-slate-500">
                Ends
                <input type="date" value={end} min={start} onChange={(e) => e.target.value && setEnd(e.target.value)} className={inputClass} />
              </label>
            </div>
            <p className="text-xs font-semibold text-slate-500">{dates.length} session{dates.length === 1 ? '' : 's'}</p>
          </>
        )}
      </section>

      <SendNotification checked={notify} onChange={setNotify} />
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      <button type="button" onClick={save} disabled={busy || !ready} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold disabled:opacity-40 cursor-pointer">
        {busy ? 'Saving…' : row ? 'Save Changes' : label ? `Assign to ${label}` : 'Assign'}
      </button>
      {row && row.status === 'active' && row.end >= ymd(new Date()) && (
        <button type="button" onClick={stop} disabled={busy} className="w-full py-3 rounded-xl bg-red-50 text-red-700 text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer">
          <Square className="w-4 h-4" /> Stop Assignment
        </button>
      )}
    </SheetFrame>
  )
}
