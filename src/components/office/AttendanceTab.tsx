'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { DateStepper, Pill } from '@/components/ui'
import { localDate, type Group, type Profile } from '@/lib/training'
import { ATTENDANCE, type AttendanceStatus } from '@/lib/wellness'

type Mark = { athlete_id: string; status: AttendanceStatus; note: string | null }

export default function AttendanceTab({ players, groups }: { players: Profile[]; groups: Group[] }) {
  const [date, setDate] = useState(localDate())
  const [filter, setFilter] = useState<'all' | number>('all')
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map())
  const [members, setMembers] = useState<{ group_id: number; athlete_id: string }[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Class = school attendance for daily points (players check it off; a coach mark overrides). Practice = practice/game attendance.
  const [mode, setMode] = useState<'class' | 'practice'>('class')
  const [selfChecked, setSelfChecked] = useState<Set<string>>(new Set())
  const [offLabel, setOffLabel] = useState<string | null>(null)
  const table = mode === 'class' ? 'class_attendance' : 'attendance'

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from(table).select('athlete_id, status, note').eq('attend_date', date),
      supabase.from('group_members').select('group_id, athlete_id'),
      supabase.from('plan_checks').select('athlete_id').eq('check_date', date).eq('item_type', 'class'),
      supabase.from('school_days_off').select('label').eq('day', date).maybeSingle(),
    ]).then(([a, m, pc, off]) => {
      if (cancelled) return
      setMarks(new Map(((a.data as Mark[]) || []).map((x) => [x.athlete_id, x])))
      setMembers((m.data as { group_id: number; athlete_id: string }[]) || [])
      setSelfChecked(new Set(((pc.data as { athlete_id: string }[]) || []).map((x) => x.athlete_id)))
      setOffLabel(off.data ? (off.data as { label: string | null }).label || 'No school' : null)
    })
    return () => {
      cancelled = true
    }
  }, [date, table])

  const [y, mo, d] = date.split('-').map(Number)
  const weekday = new Date(y, mo - 1, d).getDay()
  const weekend = weekday === 0 || weekday === 6
  const toggleSchoolDay = async () => {
    const sb = createClient()
    if (offLabel) {
      await sb.from('school_days_off').delete().eq('day', date)
      setOffLabel(null)
    } else {
      const label = window.prompt('Why is there no school? (e.g. Teacher planning day)', 'No school')
      if (label === null) return
      await sb.from('school_days_off').insert({ day: date, label: label.trim() || 'No school' })
      setOffLabel(label.trim() || 'No school')
    }
  }

  const active = players.filter((p) => p.is_active && (filter === 'all' || members.some((m) => m.group_id === filter && m.athlete_id === p.id)))

  // Each tap saves just that one athlete's record; tapping the current status clears it (real delete).
  const setStatus = async (athleteId: string, status: AttendanceStatus) => {
    const supabase = createClient()
    const current = marks.get(athleteId)
    setBusy(athleteId)
    setError(null)
    if (current?.status === status) {
      const { error: e } = await supabase.from(table).delete().eq('attend_date', date).eq('athlete_id', athleteId)
      if (e) setError(e.message)
      else setMarks((m) => {
        const next = new Map(m)
        next.delete(athleteId)
        return next
      })
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: e } = await supabase
        .from(table)
        .upsert(
          { attend_date: date, athlete_id: athleteId, status, note: current?.note ?? null, recorded_by: user?.id, updated_at: new Date().toISOString() },
          { onConflict: 'attend_date,athlete_id' }
        )
      if (e) setError(e.message)
      else setMarks((m) => new Map(m).set(athleteId, { athlete_id: athleteId, status, note: current?.note ?? null }))
    }
    setBusy(null)
  }

  const saveNote = async (athleteId: string, note: string) => {
    const current = marks.get(athleteId)
    if (!current || (current.note ?? '') === note.trim()) return
    await createClient().from(table).update({ note: note.trim() || null }).eq('attend_date', date).eq('athlete_id', athleteId)
    setMarks((m) => new Map(m).set(athleteId, { ...current, note: note.trim() || null }))
  }

  const markAllPresent = async () => {
    const unmarked = active.filter((p) => !marks.has(p.id))
    if (!unmarked.length) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error: e } = await supabase
      .from(table)
      .insert(unmarked.map((p) => ({ attend_date: date, athlete_id: p.id, status: 'present', recorded_by: user?.id })))
    if (e) return setError(e.message)
    setMarks((m) => {
      const next = new Map(m)
      unmarked.forEach((p) => next.set(p.id, { athlete_id: p.id, status: 'present', note: null }))
      return next
    })
  }

  const counts = ATTENDANCE.map((s) => ({ ...s, n: active.filter((p) => marks.get(p.id)?.status === s.key).length }))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 lg:max-w-xs">
        {(['class', 'practice'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`py-2 rounded-xl text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
            {m === 'class' ? 'Class' : 'Practice'}
          </button>
        ))}
      </div>
      <DateStepper value={date} onChange={setDate} />
      {mode === 'class' && (
        <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${offLabel || weekend ? 'bg-slate-100' : 'bg-indigo-50'}`}>
          <span className="flex-1 text-xs font-bold text-slate-700">
            {weekend ? 'Weekend · no class point' : offLabel ? `No school · ${offLabel}` : 'School day · players check off class; your mark overrides'}
          </span>
          {!weekend && (
            <button type="button" onClick={toggleSchoolDay} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-extrabold text-slate-700 cursor-pointer">
              {offLabel ? 'Make it a school day' : 'No school'}
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>Everyone</Pill>
        {groups.map((g) => (
          <Pill key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>{g.name}</Pill>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5 lg:max-w-xl">
        {counts.map((c) => (
          <div key={c.key} className="rounded-2xl bg-white border border-slate-200 py-2 text-center">
            <div className="text-lg font-black text-slate-900">{c.n}</div>
            <div className="text-[10px] font-bold text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>
      <button type="button" onClick={markAllPresent} className="w-full lg:w-auto lg:px-8 py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold cursor-pointer">
        {mode === 'class' ? 'Mark everyone else present (class)' : 'Mark everyone else present'}
      </button>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 lg:divide-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-px lg:bg-slate-100 lg:overflow-hidden">
        {active.map((p) => {
          const mark = marks.get(p.id)
          return (
            <div key={`${date}-${p.id}`} className={`px-4 py-3 space-y-2 lg:bg-white ${busy === p.id ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-slate-900 flex-1">{p.full_name}</span>
                {mode === 'class' && selfChecked.has(p.id) && <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Checked in</span>}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {ATTENDANCE.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatus(p.id, s.key)}
                    className={`py-2 rounded-xl text-[11px] font-extrabold cursor-pointer ${mark?.status === s.key ? s.on : 'bg-slate-100 text-slate-500'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {mark && mark.status !== 'present' && (
                <input
                  defaultValue={mark.note ?? ''}
                  onBlur={(e) => saveNote(p.id, e.target.value)}
                  placeholder={mark.status === 'excused' ? 'Reason (e.g. doctor appt)' : 'Note (optional)'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
