'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { DateStepper, EmptyState, Pill } from '@/components/ui'
import WorkoutEditor from './WorkoutEditor'
import {
  itemLabel,
  localDate,
  phaseLabel,
  type Exercise,
  type Group,
  type Phase,
  type Workout,
  type WorkoutItem,
} from '@/lib/training'

type Editing = { workout: Workout | null; items: WorkoutItem[] } | null

export default function WorkoutsTab({ groups, exercises }: { groups: Group[]; exercises: Exercise[] }) {
  const [date, setDate] = useState(localDate())
  const [filter, setFilter] = useState<'all' | 'team' | number>('all')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [items, setItems] = useState<WorkoutItem[]>([])
  const [loggedCounts, setLoggedCounts] = useState<Record<number, number>>({})
  const [editing, setEditing] = useState<Editing>(null)
  const [reload, setReload] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [lastPhase, setLastPhase] = useState<Phase>('off_season')

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const load = async () => {
      const { data: w } = await supabase.from('workouts').select('*').eq('workout_date', date).order('sort_order').order('id')
      const list = (w as Workout[]) || []
      const ids = list.map((x) => x.id)
      const { data: it } = ids.length ? await supabase.from('workout_items').select('*').in('workout_id', ids) : { data: [] }
      const itemList = (it as WorkoutItem[]) || []
      const itemIds = itemList.map((i) => i.id)
      const { data: logs } = itemIds.length
        ? await supabase.from('set_logs').select('workout_item_id, athlete_id').in('workout_item_id', itemIds)
        : { data: [] }
      if (cancelled) return
      const byWorkout: Record<number, Set<string>> = {}
      for (const l of (logs as { workout_item_id: number; athlete_id: string }[]) || []) {
        const wid = itemList.find((i) => i.id === l.workout_item_id)?.workout_id
        if (wid) (byWorkout[wid] ||= new Set()).add(l.athlete_id)
      }
      setWorkouts(list)
      setItems(itemList)
      setLoggedCounts(Object.fromEntries(Object.entries(byWorkout).map(([k, v]) => [k, v.size])))
      if (list[0]) setLastPhase(list[0].phase)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date, reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const groupName = (id: number | null) => (id === null ? 'Whole team' : groups.find((g) => g.id === id)?.name ?? 'Group')
  const exName = (id: number) => exercises.find((e) => e.id === id)?.name ?? 'Drill'

  const shown = workouts.filter((w) => filter === 'all' || (filter === 'team' ? w.group_id === null : w.group_id === filter))

  const remove = async (w: Workout) => {
    const athletes = loggedCounts[w.id] || 0
    const warn = athletes
      ? `Delete "${w.title}"? ${athletes} athlete${athletes === 1 ? '' : 's'} logged sets in it, and those logs and any PRs from them will be permanently deleted.`
      : `Delete "${w.title}"? This can't be undone.`
    if (!window.confirm(warn)) return
    const { error } = await createClient().from('workouts').delete().eq('id', w.id)
    setMessage(error ? error.message : 'Workout deleted')
    refresh()
  }

  const duplicate = async (w: Workout) => {
    const target = window.prompt('Copy to which date? (YYYY-MM-DD)', date)
    if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from('workouts')
      .insert({ title: w.title, workout_date: target, group_id: w.group_id, phase: w.phase, notes: w.notes, sort_order: w.sort_order })
      .select('id')
      .single()
    if (error || !data) {
      setMessage(error?.message || 'Could not copy')
      return
    }
    const src = items.filter((i) => i.workout_id === w.id)
    if (src.length) {
      await supabase.from('workout_items').insert(
        src.map((i) => ({
          workout_id: data.id,
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
    }
    setMessage(`Copied to ${target}`)
    if (target === date) refresh()
  }

  return (
    <div>
      <DateStepper value={date} onChange={setDate} />
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
        <Pill active={filter === 'team'} onClick={() => setFilter('team')}>Whole team</Pill>
        {groups.map((g) => (
          <Pill key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)}>{g.name}</Pill>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setEditing({ workout: null, items: [] })}
        className="w-full mb-4 py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus className="w-4 h-4" /> New workout
      </button>

      {message && <p className="text-xs font-bold text-emerald-700 mb-3">{message}</p>}

      {shown.length === 0 ? (
        <EmptyState title="Nothing scheduled" body="Create a workout or step to another day." />
      ) : (
        <div className="space-y-3">
          {shown.map((w) => {
            const its = items
              .filter((i) => i.workout_id === w.id)
              .sort((a, b) => a.block_index - b.block_index || a.item_index - b.item_index)
            const counts = new Map<number, number>()
            its.forEach((i) => counts.set(i.block_index, (counts.get(i.block_index) || 0) + 1))
            return (
              <section key={w.id} className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-extrabold text-slate-900">{w.title}</div>
                    <div className="text-[11px] font-bold text-slate-500">
                      {groupName(w.group_id)} · {phaseLabel(w.phase)} · {loggedCounts[w.id] || 0} logged
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <SmallBtn label="Edit" onClick={() => setEditing({ workout: w, items: its })}><Pencil className="w-4 h-4" /></SmallBtn>
                    <SmallBtn label="Copy to another date" onClick={() => duplicate(w)}><Copy className="w-4 h-4" /></SmallBtn>
                    <SmallBtn label="Delete" onClick={() => remove(w)}><Trash2 className="w-4 h-4" /></SmallBtn>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {its.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <span className="w-7 h-6 rounded-md bg-blue-50 text-[#1746b8] text-[10px] font-extrabold flex items-center justify-center">
                        {itemLabel(i.block_index, i.item_index, counts.get(i.block_index) || 1)}
                      </span>
                      <span className="flex-1">{exName(i.exercise_id)}</span>
                      <span className="text-slate-400">{i.sets}× {i.reps || ''}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {editing && (
        <WorkoutEditor
          workout={editing.workout}
          items={editing.items}
          date={date}
          defaultGroupId={typeof filter === 'number' ? filter : null}
          defaultPhase={lastPhase}
          groups={groups}
          exercises={exercises}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setMessage('Workout saved')
            refresh()
          }}
        />
      )}
    </div>
  )
}

function SmallBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer">
      {children}
    </button>
  )
}
