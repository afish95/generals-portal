'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronRight, MapPin, Trash2, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import { SheetFrame } from '@/components/office/roster/shared'
import { addDays, localDate, prettyDate, type Group } from '@/lib/training'
import { EVENT_KINDS, KIND_STYLE, kindOf, timeRange, to12h, to24h, type EventKind, type ScheduleEvent } from '@/lib/schedule'

type Row = { key: string; first: ScheduleEvent; days: ScheduleEvent[] }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Coach Office → Schedule: games, practices and program events (fundraisers, meetings, deadlines) for the whole program or chosen groups. */
export default function ScheduleTab({ groups, openEventId }: { groups: Group[]; openEventId?: number | null }) {
  const today = localDate()
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null)
  const [kind, setKind] = useState<EventKind | 'all'>('all')
  const [past, setPast] = useState(false)
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [version, setVersion] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    createClient()
      .from('team_schedule')
      .select('*')
      .gte('event_date', past ? addDays(today, -365) : addDays(today, -1))
      .lte('event_date', past ? addDays(today, -1) : addDays(today, 400))
      .order('event_date', { ascending: !past })
      .then(({ data }) => setEvents((data as ScheduleEvent[]) || []))
  }, [past, today, version])

  // Days created together (a series) show as one row
  const rows = useMemo(() => {
    const out: Row[] = []
    const bySeries = new Map<string, Row>()
    for (const e of events || []) {
      if (kind !== 'all' && kindOf(e.event_type) !== kind) continue
      if (e.series_id) {
        const r = bySeries.get(e.series_id)
        if (r) {
          r.days.push(e)
          continue
        }
        const n = { key: e.series_id, first: e, days: [e] }
        bySeries.set(e.series_id, n)
        out.push(n)
      } else out.push({ key: `e${e.id}`, first: e, days: [e] })
    }
    return out
  }, [events, kind])

  useEffect(() => {
    if (!openEventId || !events) return
    const r = rows.find((x) => x.days.some((d) => d.id === openEventId))
    if (r) setEditing(r)
  }, [openEventId, events, rows])

  const gName = new Map(groups.map((g) => [g.id, g.name]))
  const who = (ids: number[] | null | undefined) => (!ids?.length ? 'Whole program' : ids.map((i) => gName.get(i) || 'Group').join(', '))
  const dateLabel = (r: Row) => {
    const ds = r.days.map((d) => d.event_date).sort()
    if (ds.length === 1) return prettyDate(ds[0], { weekday: 'short', month: 'short', day: 'numeric' })
    return `${prettyDate(ds[0], { month: 'short', day: 'numeric' })} – ${prettyDate(ds[ds.length - 1], { month: 'short', day: 'numeric' })} · ${ds.length} days`
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditing('new')} className="w-full lg:w-auto lg:px-8 py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer">
        <CalendarPlus className="w-4 h-4" /> Add Event
      </button>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(['all', ...EVENT_KINDS.map((k) => k.key)] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold shrink-0 cursor-pointer ${kind === k ? 'bg-[#1746b8] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {k === 'all' ? 'All' : EVENT_KINDS.find((x) => x.key === k)!.label + 's'}
          </button>
        ))}
        <button type="button" onClick={() => setPast((p) => !p)} className={`ml-auto px-3 py-1.5 rounded-full text-[11px] font-extrabold shrink-0 cursor-pointer ${past ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
          {past ? 'Past' : 'Upcoming'}
        </button>
      </div>
      {msg && <p className="text-xs font-extrabold text-emerald-700">{msg}</p>}
      {events === null ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="text-center text-xs font-semibold text-slate-500 py-8">Nothing scheduled.</p>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden lg:grid lg:grid-cols-2 lg:divide-y-0 lg:gap-px lg:bg-slate-100">
          {rows.map((r) => {
            const st = KIND_STYLE[kindOf(r.first.event_type)]
            return (
              <button key={r.key} type="button" onClick={() => setEditing(r)} className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white hover:bg-slate-50 cursor-pointer">
                <span className={`w-1.5 self-stretch rounded-full ${st.bar}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold text-slate-900 truncate">{r.first.title}</div>
                  <div className="text-[11px] font-semibold text-slate-500 truncate">
                    {dateLabel(r)} · {timeRange(r.first)}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-400 truncate">{[r.first.location, who(r.first.group_ids)].filter(Boolean).join(' · ')}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            )
          })}
        </div>
      )}
      {editing && (
        <EventSheet
          row={editing === 'new' ? null : editing}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null)
            setMsg(m)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

function EventSheet({ row, groups, onClose, onSaved }: { row: Row | null; groups: Group[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const first = row?.first
  const today = localDate()
  const [title, setTitle] = useState(first?.title || '')
  const [kind, setKind] = useState<EventKind>(first ? kindOf(first.event_type) : 'program')
  const [start, setStart] = useState(first?.event_date || today)
  const [end, setEnd] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState(to24h(first?.start_time))
  const [endTime, setEndTime] = useState(to24h(first?.end_time))
  const [location, setLocation] = useState(first?.location || '')
  const [groupIds, setGroupIds] = useState<number[]>(first?.group_ids || [])
  const [notes, setNotes] = useState(first?.notes || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickable = groups.filter((g) => !g.name.startsWith('Demo') && !(g.category === 'Workout' && g.name.includes(' · ')))
  const dates = useMemo(() => {
    if (row) return []
    if (!end || end <= start) return [start]
    const out: string[] = []
    for (let d = start; d <= end && out.length < 120; d = addDays(d, 1)) {
      if (weekdays.includes(new Date(`${d}T12:00:00`).getDay())) out.push(d)
    }
    return out
  }, [row, start, end, weekdays])

  const fields = () => ({
    title: title.trim(),
    event_type: first && kindOf(first.event_type) === kind ? first.event_type : EVENT_KINDS.find((k) => k.key === kind)!.type,
    start_time: startTime ? to12h(startTime) : null,
    end_time: endTime ? to12h(endTime) : null,
    location: location.trim() || null,
    group_ids: groupIds.length ? groupIds : null,
    notes: notes.trim() || null,
    updated_at: new Date().toISOString(),
  })

  const save = async () => {
    if (!title.trim()) return setError('Add a title.')
    if (!row && dates.length === 0) return setError('Pick at least one day.')
    setBusy(true)
    setError(null)
    const sb = createClient()
    if (row) {
      const ids = row.days.map((d) => d.id)
      const patch: Record<string, unknown> = fields()
      if (row.days.length === 1) patch.event_date = start
      const { error: e } = await sb.from('team_schedule').update(patch).in('id', ids)
      setBusy(false)
      if (e) return setError(e.message)
      return onSaved(row.days.length > 1 ? `Updated all ${row.days.length} days.` : 'Event saved.')
    }
    const series = dates.length > 1 ? crypto.randomUUID() : null
    const { error: e } = await sb.from('team_schedule').insert(dates.map((d) => ({ ...fields(), event_date: d, series_id: series, source: 'manual' })))
    setBusy(false)
    if (e) return setError(e.message)
    onSaved(dates.length > 1 ? `Added ${dates.length} days.` : 'Event added.')
  }

  const remove = async (all: boolean) => {
    if (!row) return
    const ids = all ? row.days.map((d) => d.id) : [first!.id]
    if (!window.confirm(all && ids.length > 1 ? `Delete all ${ids.length} days of "${title}"?` : `Delete "${title}" on ${prettyDate(first!.event_date)}?`)) return
    const { error: e } = await createClient().from('team_schedule').delete().in('id', ids)
    if (e) return setError(e.message)
    onSaved('Deleted.')
  }

  const toggleGroup = (id: number) => setGroupIds((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))

  return (
    <SheetFrame title={row ? 'Edit Event' : 'New Event'} subtitle={row && row.days.length > 1 ? `${row.days.length} days · changes apply to every day` : undefined} onClose={onClose}>
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Poinsettia sales)" className={inputClass} />
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100">
          {EVENT_KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} className={`py-2 rounded-lg text-[11px] font-extrabold cursor-pointer ${kind === k.key ? 'bg-white shadow-sm ' + KIND_STYLE[k.key].text : 'text-slate-500'}`}>
              {k.label}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>When</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">
            {row ? 'Date' : 'Starts'}
            <input type="date" value={start} disabled={!!row && row.days.length > 1} onChange={(e) => e.target.value && setStart(e.target.value)} className={inputClass} />
          </label>
          {!row && (
            <label className="text-[11px] font-bold text-slate-500">
              Ends (optional)
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </label>
          )}
        </div>
        {!row && end > start && (
          <div className="flex gap-1">
            {DOW.map((d, i) => (
              <button key={d} type="button" onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))} className={`flex-1 py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer ${weekdays.includes(i) ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-500'}`}>
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">
            Start time
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          </label>
          <label className="text-[11px] font-bold text-slate-500">
            End time
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
          </label>
        </div>
        <p className="text-[11px] font-semibold text-slate-400">
          {!row && dates.length > 1 ? `${dates.length} days: ${dates.slice(0, 3).map((d) => prettyDate(d, { month: 'short', day: 'numeric' })).join(', ')}${dates.length > 3 ? '…' : ''}` : 'Leave times blank for an all-day item.'}
        </p>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Where & Who</SectionLabel>
        <div className="relative">
          <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (e.g. Beaumont Hardware & Whole Foods)" className={`${inputClass} pl-9`} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setGroupIds([])} className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 cursor-pointer ${groupIds.length === 0 ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}>
            <Users className="w-3 h-3" /> Whole Program
          </button>
          {pickable.map((g) => (
            <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold cursor-pointer ${groupIds.includes(g.id) ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}>
              {g.name}
            </button>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Details (shifts, what to wear, what to bring)" className={inputClass} />
      </section>

      <button type="button" onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-40 cursor-pointer">
        {busy ? 'Saving…' : row ? 'Save Event' : dates.length > 1 ? `Add ${dates.length} Days` : 'Add Event'}
      </button>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      {row && (
        <div className="flex gap-2">
          {kind === 'practice' && (
            <Link href={`/office?tab=practices&event=${first!.id}`} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-extrabold text-center">
              Practice Plan
            </Link>
          )}
          <button type="button" onClick={() => remove(false)} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-700 text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /> {row.days.length > 1 ? 'Delete First Day' : 'Delete'}
          </button>
          {row.days.length > 1 && (
            <button type="button" onClick={() => remove(true)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-extrabold cursor-pointer">
              Delete All Days
            </button>
          )}
        </div>
      )}
    </SheetFrame>
  )
}
