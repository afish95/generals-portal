'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Pill } from '@/components/ui'
import AthleteSheet from './AthleteSheet'
import { localDate, type Group, type Profile, type Workout, type WorkoutItem } from '@/lib/training'
import { needsAttention, type AttendanceStatus, type Checkin } from '@/lib/wellness'

type Row = {
  athlete: Profile
  checkin?: Checkin
  sets: number
  attendance?: AttendanceStatus
  flagged: boolean
  flagReason: string | null
  points?: { earned: number; available: number }
}

export default function CoachDashboard() {
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<{ group_id: number; athlete_id: string }[]>([])
  const [rows, setRows] = useState<Row[] | null>(null)
  const [workouts, setWorkouts] = useState<{ workout: Workout; logged: number; expected: number; groupName: string }[]>([])
  const [filter, setFilter] = useState<'all' | 'flagged' | number>('all')
  const [open, setOpen] = useState<Profile | null>(null)
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const today = localDate()
    const dayStart = new Date(`${today}T00:00:00`).toISOString()
    const load = async () => {
      const [p, g, m, c, a, f, w, dp] = await Promise.all([
        supabase.from('profiles').select('id, username, full_name, role, position_group, grad_year, is_active, is_demo').eq('role', 'player').eq('is_active', true).eq('has_login', true).order('full_name'),
        supabase.from('team_groups').select('*').order('sort_order'),
        supabase.from('group_members').select('group_id, athlete_id'),
        supabase.from('daily_checkins').select('*').eq('check_date', today),
        supabase.from('attendance').select('athlete_id, status').eq('attend_date', today),
        supabase.from('athlete_flags').select('athlete_id, reason'),
        supabase.from('workouts').select('*').eq('workout_date', today).order('sort_order'),
        supabase.rpc('daily_points', { p_from: today, p_to: today }),
      ])
      const wList = (w.data as Workout[]) || []
      const wIds = wList.map((x) => x.id)
      const { data: it } = wIds.length ? await supabase.from('workout_items').select('id, workout_id').in('workout_id', wIds) : { data: [] }
      const items = (it as Pick<WorkoutItem, 'id' | 'workout_id'>[]) || []
      const { data: logs } = await supabase.from('set_logs').select('athlete_id, workout_item_id').gte('logged_at', dayStart)
      if (cancelled) return

      const players = (p.data as Profile[]) || []
      const gList = (g.data as Group[]) || []
      const mem = (m.data as { group_id: number; athlete_id: string }[]) || []
      const logList = (logs as { athlete_id: string; workout_item_id: number }[]) || []
      const checkins = new Map(((c.data as Checkin[]) || []).filter((x) => x.readiness != null).map((x) => [x.athlete_id, x]))
      const att = new Map(((a.data as { athlete_id: string; status: AttendanceStatus }[]) || []).map((x) => [x.athlete_id, x.status]))
      const flags = new Map(((f.data as { athlete_id: string; reason: string | null }[]) || []).map((x) => [x.athlete_id, x.reason]))
      const pts = new Map(((dp.data as { athlete_id: string; earned: number; available: number }[]) || []).map((x) => [x.athlete_id, { earned: Number(x.earned), available: Number(x.available) }]))
      const sets = new Map<string, number>()
      logList.forEach((l) => sets.set(l.athlete_id, (sets.get(l.athlete_id) || 0) + 1))

      setGroups(gList)
      setMembers(mem)
      setRows(
        players.map((athlete) => ({
          athlete,
          checkin: checkins.get(athlete.id),
          sets: sets.get(athlete.id) || 0,
          attendance: att.get(athlete.id),
          flagged: flags.has(athlete.id),
          flagReason: flags.get(athlete.id) ?? null,
          points: pts.get(athlete.id),
        }))
      )
      setWorkouts(
        wList.map((wk) => {
          const mine = new Set(items.filter((i) => i.workout_id === wk.id).map((i) => i.id))
          const athletes = new Set(logList.filter((l) => mine.has(l.workout_item_id)).map((l) => l.athlete_id))
          return {
            workout: wk,
            logged: athletes.size,
            expected: wk.group_id === null ? players.length : mem.filter((x) => x.group_id === wk.group_id).length,
            groupName: wk.group_id === null ? 'Whole Team' : gList.find((x) => x.id === wk.group_id)?.name ?? 'Group',
          }
        })
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reload])

  if (!rows) return <div className="h-48 rounded-3xl bg-white/60 animate-pulse" />

  const inGroup = (id: string, gid: number) => members.some((x) => x.group_id === gid && x.athlete_id === id)
  const shown = rows
    .filter((r) => (filter === 'all' ? true : filter === 'flagged' ? r.flagged : inGroup(r.athlete.id, filter)))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || Number(needsAttention(b.checkin)) - Number(needsAttention(a.checkin)) || a.athlete.full_name.localeCompare(b.athlete.full_name))

  const total = shown.length
  const checkedIn = shown.filter((r) => r.checkin).length
  const trained = shown.filter((r) => r.sets > 0).length
  const present = shown.filter((r) => r.attendance === 'present' || r.attendance === 'late').length
  const flagged = shown.filter((r) => r.flagged).length
  const alerts = shown.filter((r) => needsAttention(r.checkin))

  return (
    <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      <div className="flex gap-2 overflow-x-auto pb-1 lg:col-span-2">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>Everyone</Pill>
        {groups.map((g) => (
          <Pill key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>{g.name}</Pill>
        ))}
        <Pill active={filter === 'flagged'} onClick={() => setFilter('flagged')}>🚩 Flagged</Pill>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:col-span-2">
        <Tile label="Checked in" value={checkedIn} of={total} tone="from-[#1746b8] to-indigo-600" />
        <Tile label="Trained" value={trained} of={total} tone="from-emerald-500 to-teal-600" />
        <Tile label="Present" value={present} of={total} tone="from-amber-400 to-orange-500" />
        <Tile label="Flagged" value={flagged} tone="from-rose-500 to-red-600" />
      </div>

      {alerts.length > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 mb-1.5">Needs a Look Today</div>
          <ul className="space-y-1">
            {alerts.map((r) => (
              <li key={r.athlete.id}>
                <button type="button" onClick={() => setOpen(r.athlete)} className="text-sm font-bold text-amber-900 cursor-pointer text-left">
                  {r.athlete.full_name} · readiness {r.checkin!.readiness}, body {r.checkin!.soreness}/5{r.checkin!.arm_soreness != null ? `, arm ${r.checkin!.arm_soreness}/5` : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Today’s Training</div>
        {workouts.length === 0 ? (
          <p className="text-xs font-medium text-slate-500">Nothing scheduled today. <Link href="/office" className="font-bold text-[#1746b8]">Build a Workout</Link></p>
        ) : (
          <ul className="space-y-2.5">
            {workouts.map((r) => (
              <li key={r.workout.id}>
                <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                  <span>{r.workout.title} <span className="text-xs text-slate-400">· {r.groupName}</span></span>
                  <span className="text-xs text-slate-500">{r.logged}/{r.expected}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-[#1746b8]" style={{ width: `${r.expected ? Math.min(100, Math.round((100 * r.logged) / r.expected)) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <AthleteSheet athlete={open} onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  )
}

function Tile({ label, value, of, tone }: { label: string; value: number; of?: number; tone: string }) {
  return (
    <div className={`rounded-3xl bg-gradient-to-br ${tone} text-white p-4`}>
      <div className="text-3xl font-black leading-none">
        {value}
        {of != null && <span className="text-base font-extrabold opacity-70">/{of}</span>}
      </div>
      <div className="text-[11px] font-bold mt-1 opacity-90">{label}</div>
    </div>
  )
}
