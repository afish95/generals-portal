'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import {
  DISCIPLINES,
  PHASES,
  itemLabel,
  type Exercise,
  type Group,
  type Phase,
  type Workout,
  type WorkoutItem,
} from '@/lib/training'

type DraftItem = {
  key: string
  id?: number
  exercise_id: number
  sets: number
  reps: string
  load: string
  notes: string
}
type DraftWorkout = {
  id?: number
  title: string
  workout_date: string
  group_id: number | null
  phase: Phase
  notes: string
  sort_order: number
}

let keySeq = 0
const newKey = () => `k${Date.now()}-${keySeq++}`

function toBlocks(items: WorkoutItem[]): DraftItem[][] {
  const sorted = [...items].sort((a, b) => a.block_index - b.block_index || a.item_index - b.item_index)
  const blocks: DraftItem[][] = []
  let lastBlock: number | null = null
  for (const i of sorted) {
    if (i.block_index !== lastBlock) {
      blocks.push([])
      lastBlock = i.block_index
    }
    blocks[blocks.length - 1].push({
      key: `i${i.id}`,
      id: i.id,
      exercise_id: i.exercise_id,
      sets: i.sets,
      reps: i.reps ?? '',
      load: i.load ?? '',
      notes: i.notes ?? '',
    })
  }
  return blocks
}

type DraftTool = { id?: number; key: string; script_id: number; notes: string }

const norm = (s: string) => (s.trim() === '' ? null : s.trim())

export default function WorkoutEditor({
  workout,
  items,
  date,
  defaultGroupId,
  defaultPhase,
  groups,
  exercises,
  onClose,
  onSaved,
}: {
  workout: Workout | null
  items: WorkoutItem[]
  date: string
  defaultGroupId: number | null
  defaultPhase: Phase
  groups: Group[]
  exercises: Exercise[]
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<DraftWorkout>(() =>
    workout
      ? {
          id: workout.id,
          title: workout.title,
          workout_date: workout.workout_date,
          group_id: workout.group_id,
          phase: workout.phase,
          notes: workout.notes ?? '',
          sort_order: workout.sort_order,
        }
      : { title: '', workout_date: date, group_id: defaultGroupId, phase: defaultPhase, notes: '', sort_order: 0 }
  )
  const [blocks, setBlocks] = useState<DraftItem[][]>(() => (workout ? toBlocks(items) : [[]]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Prescribed training tools (bullpen games / command drills)
  const [scripts, setScripts] = useState<{ id: number; title: string; pitch_count: number }[]>([])
  const [origTools, setOrigTools] = useState<DraftTool[]>([])
  const [tools, setTools] = useState<DraftTool[]>([])
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('bullpen_scripts').select('id, title, pitch_count').eq('is_active', true).order('sort_order'),
      workout ? supabase.from('workout_tools').select('id, script_id, notes').eq('workout_id', workout.id).order('sort_order') : Promise.resolve({ data: [] }),
    ]).then(([sc, wt]) => {
      if (cancelled) return
      setScripts((sc.data as { id: number; title: string; pitch_count: number }[]) || [])
      const loaded = ((wt.data as { id: number; script_id: number; notes: string | null }[]) || []).map((t) => ({ id: t.id, key: newKey(), script_id: t.script_id, notes: t.notes ?? '' }))
      setOrigTools(loaded)
      setTools(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [workout])

  const activeExercises = exercises.filter((e) => e.is_active)
  const exName = (id: number) => exercises.find((e) => e.id === id)?.name ?? 'Exercise'

  const updateItem = (b: number, i: number, patch: Partial<DraftItem>) =>
    setBlocks((bl) => bl.map((blk, bi) => (bi !== b ? blk : blk.map((it, ii) => (ii === i ? { ...it, ...patch } : it)))))

  const addItem = (b: number, exercise_id: number) =>
    setBlocks((bl) =>
      bl.map((blk, bi) =>
        bi !== b ? blk : [...blk, { key: newKey(), exercise_id, sets: 3, reps: '', load: '', notes: '' }]
      )
    )

  const removeItem = (b: number, i: number) =>
    setBlocks((bl) => bl.map((blk, bi) => (bi !== b ? blk : blk.filter((_, ii) => ii !== i))))

  const moveBlock = (b: number, dir: -1 | 1) =>
    setBlocks((bl) => {
      const t = b + dir
      if (t < 0 || t >= bl.length) return bl
      const next = [...bl]
      ;[next[b], next[t]] = [next[t], next[b]]
      return next
    })

  const save = async () => {
    if (!draft.title.trim()) {
      setError('Give the workout a title.')
      return
    }
    const flat = blocks
      .filter((blk) => blk.length > 0)
      .flatMap((blk, bi) => blk.map((it, ii) => ({ ...it, block_index: bi, item_index: ii })))
    if (flat.length === 0 && tools.length === 0) {
      setError('Add at least one drill or training tool.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    try {
      const fields = {
        title: draft.title.trim(),
        workout_date: draft.workout_date,
        group_id: draft.group_id,
        phase: draft.phase,
        notes: norm(draft.notes),
        sort_order: draft.sort_order,
      }
      let workoutId = draft.id
      if (!workoutId) {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error: e } = await supabase
          .from('workouts')
          .insert({ ...fields, created_by: user?.id })
          .select('id')
          .single()
        if (e || !data) throw e || new Error('Could not create workout')
        workoutId = data.id as number
      } else if (workout) {
        // Only update the workout row if something about it changed.
        const changed =
          fields.title !== workout.title ||
          fields.workout_date !== workout.workout_date ||
          fields.group_id !== workout.group_id ||
          fields.phase !== workout.phase ||
          fields.notes !== (workout.notes ?? null)
        if (changed) {
          const { error: e } = await supabase
            .from('workouts')
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq('id', workoutId)
          if (e) throw e
        }
      }

      // Items: delete removed, update only changed, insert new.
      const originalById = new Map(items.map((i) => [i.id, i]))
      const keptIds = new Set(flat.filter((f) => f.id).map((f) => f.id as number))
      const removed = items.filter((i) => !keptIds.has(i.id)).map((i) => i.id)
      if (removed.length) {
        const { error: e } = await supabase.from('workout_items').delete().in('id', removed)
        if (e) throw e
      }
      const toRow = (f: (typeof flat)[number]) => ({
        workout_id: workoutId,
        exercise_id: f.exercise_id,
        block_index: f.block_index,
        item_index: f.item_index,
        sets: Math.max(1, Math.min(20, Number(f.sets) || 1)),
        reps: norm(f.reps),
        load: norm(f.load),
        notes: norm(f.notes),
      })
      for (const f of flat.filter((x) => x.id)) {
        const o = originalById.get(f.id as number)!
        const r = toRow(f)
        const changed =
          r.exercise_id !== o.exercise_id ||
          r.block_index !== o.block_index ||
          r.item_index !== o.item_index ||
          r.sets !== o.sets ||
          r.reps !== (o.reps ?? null) ||
          r.load !== (o.load ?? null) ||
          r.notes !== (o.notes ?? null)
        if (changed) {
          const { error: e } = await supabase.from('workout_items').update(r).eq('id', f.id as number)
          if (e) throw e
        }
      }
      const inserts = flat.filter((x) => !x.id).map(toRow)
      if (inserts.length) {
        const { error: e } = await supabase.from('workout_items').insert(inserts)
        if (e) throw e
      }

      // Tools: delete removed, update changed, insert new.
      const keptTools = new Set(tools.filter((t) => t.id).map((t) => t.id as number))
      const removedTools = origTools.filter((t) => !keptTools.has(t.id as number)).map((t) => t.id as number)
      if (removedTools.length) {
        const { error: e } = await supabase.from('workout_tools').delete().in('id', removedTools)
        if (e) throw e
      }
      const origById = new Map(origTools.map((t, i) => [t.id as number, { ...t, sort_order: i }]))
      for (const [i, t] of tools.entries()) {
        const row = { workout_id: workoutId, script_id: t.script_id, notes: norm(t.notes), sort_order: i }
        if (!t.id) {
          const { error: e } = await supabase.from('workout_tools').insert(row)
          if (e) throw e
        } else {
          const o = origById.get(t.id)!
          if (o.script_id !== row.script_id || norm(o.notes) !== row.notes || o.sort_order !== i) {
            const { error: e } = await supabase.from('workout_tools').update(row).eq('id', t.id)
            if (e) throw e
          }
        }
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 lg:left-[220px] z-50 bg-[#f3f5f9] overflow-y-auto">
      <div
        className="max-w-xl lg:max-w-3xl mx-auto px-4 space-y-4"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 'calc(max(env(safe-area-inset-bottom), 12px) + 90px)' }}
      >
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
          <div className="text-sm font-extrabold text-slate-900">{draft.id ? 'Edit workout' : 'New workout'}</div>
          <div className="w-10" />
        </div>

        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title (e.g. Throwing Day)" className={`${inputClass} font-bold`} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-extrabold uppercase text-slate-400">
              Date
              <input type="date" value={draft.workout_date} onChange={(e) => setDraft({ ...draft, workout_date: e.target.value })} className={`${inputClass} mt-1`} />
            </label>
            <label className="text-[10px] font-extrabold uppercase text-slate-400">
              Group
              <select
                value={draft.group_id ?? ''}
                onChange={(e) => setDraft({ ...draft, group_id: e.target.value ? Number(e.target.value) : null })}
                className={`${inputClass} mt-1`}
              >
                <option value="">Whole team</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PHASES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setDraft({ ...draft, phase: p.key })}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap cursor-pointer ${draft.phase === p.key ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} placeholder="Notes for athletes (optional)" className={inputClass} />
        </section>

        {blocks.map((blk, b) => (
          <section key={b} className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Block {String.fromCharCode(65 + b)} {blk.length > 1 && <span className="text-[#1746b8]">· superset</span>}
              </div>
              <div className="flex gap-1">
                <IconBtn label="Move block up" onClick={() => moveBlock(b, -1)}><ArrowUp className="w-4 h-4" /></IconBtn>
                <IconBtn label="Move block down" onClick={() => moveBlock(b, 1)}><ArrowDown className="w-4 h-4" /></IconBtn>
                <IconBtn label="Delete block" onClick={() => setBlocks((bl) => bl.filter((_, i) => i !== b))}><Trash2 className="w-4 h-4" /></IconBtn>
              </div>
            </div>

            {blk.map((it, i) => (
              <div key={it.key} className="rounded-2xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 shrink-0 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center justify-center">
                    {itemLabel(b, i, blk.length)}
                  </span>
                  <div className="flex-1 text-sm font-extrabold text-slate-900">{exName(it.exercise_id)}</div>
                  <IconBtn label="Remove drill" onClick={() => removeItem(b, i)}><X className="w-4 h-4" /></IconBtn>
                </div>
                <div className="grid grid-cols-[70px_1fr_1fr] gap-2">
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">
                    Sets
                    <input inputMode="numeric" value={it.sets} onChange={(e) => updateItem(b, i, { sets: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${inputClass} mt-1`} />
                  </label>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">
                    Reps / volume
                    <input value={it.reps} onChange={(e) => updateItem(b, i, { reps: e.target.value })} placeholder="25 pitches" className={`${inputClass} mt-1`} />
                  </label>
                  <label className="text-[10px] font-extrabold uppercase text-slate-400">
                    Intensity
                    <input value={it.load} onChange={(e) => updateItem(b, i, { load: e.target.value })} placeholder="80%, max" className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <input value={it.notes} onChange={(e) => updateItem(b, i, { notes: e.target.value })} placeholder="Coaching cue (optional)" className={inputClass} />
              </div>
            ))}

            <select
              value=""
              onChange={(e) => e.target.value && addItem(b, Number(e.target.value))}
              className={`${inputClass} text-[#1746b8] font-bold`}
            >
              <option value="">{blk.length ? '+ Add to superset' : '+ Add drill'}</option>
              {DISCIPLINES.map((d) => {
                const list = activeExercises.filter((e) => e.discipline === d.key)
                if (!list.length) return null
                return (
                  <optgroup key={d.key} label={d.label}>
                    {list.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </section>
        ))}

        <section className="bg-white rounded-3xl border border-amber-200 p-5 shadow-xs space-y-3">
          <div className="text-xs font-extrabold uppercase tracking-wider text-amber-700">Training tools · bullpens</div>
          {tools.map((t, i) => (
            <div key={t.key} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 text-sm font-extrabold text-slate-900">{scripts.find((x) => x.id === t.script_id)?.title ?? 'Bullpen'}</div>
                <IconBtn label="Remove tool" onClick={() => setTools((ts) => ts.filter((_, ii) => ii !== i))}><X className="w-4 h-4" /></IconBtn>
              </div>
              <input
                value={t.notes}
                onChange={(e) => setTools((ts) => ts.map((x, ii) => (ii === i ? { ...x, notes: e.target.value } : x)))}
                placeholder="Note for athletes (optional)"
                className={inputClass}
              />
            </div>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && setTools((ts) => [...ts, { key: newKey(), script_id: Number(e.target.value), notes: '' }])}
            className={`${inputClass} text-amber-700 font-bold`}
          >
            <option value="">+ Prescribe a bullpen game or drill</option>
            {scripts.map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.title} ({sc.pitch_count} pitches)</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">Players start it from their Day plan. Finishing it checks off this workout.</p>
        </section>

        <button
          type="button"
          onClick={() => setBlocks((bl) => [...bl, []])}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-extrabold text-slate-500 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add block
        </button>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      </div>

      <div className="fixed bottom-0 inset-x-0 lg:left-[220px] px-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div className="max-w-xl lg:max-w-3xl mx-auto">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-[#1746b8] text-white text-base font-extrabold shadow-lg disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving…' : 'Save workout'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
      {children}
    </button>
  )
}
