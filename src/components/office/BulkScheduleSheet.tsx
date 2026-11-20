'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, prettyDate, type Group, type Workout, type WorkoutItem } from '@/lib/training'

/** Copies one workout onto many dates and groups at once. */
export default function BulkScheduleSheet({
  workout,
  items,
  groups,
  onClose,
  onDone,
}: {
  workout: Workout
  items: WorkoutItem[]
  groups: Group[]
  onClose: () => void
  onDone: (created: number) => void
}) {
  const today = localDate()
  // Start on the Sunday of this week; show 3 weeks.
  const start = (() => {
    const [y, m, d] = today.split('-').map(Number)
    return addDays(today, -new Date(y, m - 1, d).getDay())
  })()
  const days = Array.from({ length: 21 }, (_, i) => addDays(start, i))
  const [dates, setDates] = useState<Set<string>>(new Set())
  const [targets, setTargets] = useState<Set<string>>(new Set([workout.group_id === null ? 'team' : String(workout.group_id)]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (set: Set<string>, v: string, update: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    update(next)
  }

  const pickWeekdays = (dows: number[]) =>
    setDates(new Set(days.filter((d) => {
      const [y, m, dd] = d.split('-').map(Number)
      return d >= today && dows.includes(new Date(y, m - 1, dd).getDay())
    })))

  const total = dates.size * targets.size

  const schedule = async () => {
    if (!total) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const rows = [...dates].sort().flatMap((d) =>
      [...targets].map((t) => ({
        title: workout.title,
        workout_date: d,
        group_id: t === 'team' ? null : Number(t),
        phase: workout.phase,
        notes: workout.notes,
        sort_order: workout.sort_order,
        created_by: user?.id,
      }))
    )
    const { data: created, error: e } = await supabase.from('workouts').insert(rows).select('id')
    if (e || !created) {
      setSaving(false)
      setError(e?.message || 'Could not schedule')
      return
    }
    const itemRows = (created as { id: number }[]).flatMap((w) =>
      items.map((i) => ({
        workout_id: w.id,
        exercise_id: i.exercise_id,
        block_index: i.block_index,
        item_index: i.item_index,
        sets: i.sets,
        reps: i.reps,
        load: i.load,
        rest_seconds: i.rest_seconds,
        notes: i.notes,
      }))
    )
    if (itemRows.length) {
      const { error: e2 } = await supabase.from('workout_items').insert(itemRows)
      if (e2) {
        // Roll back the empty workouts so nothing half-made is left behind.
        await supabase.from('workouts').delete().in('id', (created as { id: number }[]).map((w) => w.id))
        setSaving(false)
        setError(e2.message)
        return
      }
    }
    setSaving(false)
    onDone(created.length)
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#f3f5f9] overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 space-y-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}>
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <div className="text-sm font-extrabold text-slate-900">Schedule “{workout.title}”</div>
          <div className="w-10" />
        </div>

        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Who</div>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: 'team', name: 'Whole team' }, ...groups.map((g) => ({ id: String(g.id), name: g.name }))].map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => toggle(targets, g.id, setTargets)}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${targets.has(g.id) ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">When</span>
            <span className="text-[11px] font-bold text-slate-500">{dates.size} day{dates.size === 1 ? '' : 's'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <QuickBtn onClick={() => pickWeekdays([1, 3, 5])}>Mon/Wed/Fri</QuickBtn>
            <QuickBtn onClick={() => pickWeekdays([2, 4])}>Tue/Thu</QuickBtn>
            <QuickBtn onClick={() => pickWeekdays([1, 2, 3, 4, 5])}>Weekdays</QuickBtn>
            <QuickBtn onClick={() => setDates(new Set())}>Clear</QuickBtn>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const on = dates.has(d)
              const isToday = d === today
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggle(dates, d, setDates)}
                  className={`aspect-square rounded-xl text-xs font-extrabold flex flex-col items-center justify-center cursor-pointer ${
                    on ? 'bg-amber-500 text-white' : isToday ? 'bg-blue-50 text-[#1746b8] ring-1 ring-blue-300' : d < today ? 'bg-slate-50 text-slate-300' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {Number(d.slice(8))}
                  <span className="text-[8px] font-bold opacity-80">{prettyDate(d, { month: 'short' })}</span>
                </button>
              )
            })}
          </div>
        </section>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      </div>

      <div className="fixed bottom-0 inset-x-0 px-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={schedule}
            disabled={saving || !total}
            className="w-full py-3.5 rounded-2xl bg-[#1746b8] text-white text-base font-extrabold shadow-lg disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Scheduling…' : total ? `Create ${total} workout${total === 1 ? '' : 's'}` : 'Pick days and groups'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuickBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-blue-50 text-[#1746b8] cursor-pointer">
      {children}
    </button>
  )
}
