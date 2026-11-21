'use client'

import { useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { withPointsDelta } from '@/lib/pointsDelta'
import { PointBubble, buzz } from '@/components/points/PointBurst'
import {
  itemLabel,
  phaseLabel,
  round1,
  type Exercise,
  type SetLog,
  type Workout,
  type WorkoutItem,
} from '@/lib/training'

export type PrHit = { exercise: string; text: string; delta: string | null }

type Draft = { value: string; attempts: string; reps: string; weight: string }

const firstNumber = (s: string | null) => {
  const m = (s || '').match(/\d+(\.\d+)?/)
  return m ? m[0] : ''
}

function draftFromLog(log: SetLog | undefined, item: WorkoutItem, ex: Exercise): Draft {
  const presc = firstNumber(item.reps)
  return {
    value: log?.value != null ? String(log.value) : '',
    attempts: log?.attempts != null ? String(log.attempts) : ex.tracking === 'accuracy' ? presc : '',
    reps: log?.reps != null ? String(log.reps) : ex.tracking === 'reps' || ex.tracking === 'weight_reps' ? presc : '',
    weight: log?.weight != null ? String(log.weight) : '',
  }
}

const num = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export default function WorkoutLogger({
  workout,
  items,
  exercises,
  logs,
  athleteId,
  onLogsChange,
  onPr,
}: {
  workout: Workout
  items: WorkoutItem[]
  exercises: Map<number, Exercise>
  logs: SetLog[]
  athleteId: string
  onLogsChange: (next: SetLog[]) => void
  onPr: (hit: PrHit) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [burst, setBurst] = useState<{ key: string; amount: number } | null>(null)

  const logByKey = new Map(logs.map((l) => [`${l.workout_item_id}:${l.set_number}`, l]))
  const sorted = [...items].sort((a, b) => a.block_index - b.block_index || a.item_index - b.item_index)
  const blockCounts = new Map<number, number>()
  sorted.forEach((i) => blockCounts.set(i.block_index, (blockCounts.get(i.block_index) || 0) + 1))
  const totalSets = sorted.reduce((n, i) => n + i.sets, 0)
  const doneSets = logs.filter((l) => l.completed && sorted.some((i) => i.id === l.workout_item_id)).length

  const getDraft = (key: string, item: WorkoutItem, ex: Exercise) => drafts[key] ?? draftFromLog(logByKey.get(key), item, ex)
  const setField = (key: string, item: WorkoutItem, ex: Exercise, field: keyof Draft, v: string) =>
    setDrafts((d) => ({ ...d, [key]: { ...getDraft(key, item, ex), [field]: v } }))

  const isDirty = (key: string, item: WorkoutItem, ex: Exercise) => {
    if (!drafts[key]) return false
    const a = drafts[key]
    const b = draftFromLog(logByKey.get(key), item, ex)
    return a.value !== b.value || a.attempts !== b.attempts || a.reps !== b.reps || a.weight !== b.weight
  }

  const saveSet = async (item: WorkoutItem, ex: Exercise, setNumber: number) => {
    const key = `${item.id}:${setNumber}`
    const existing = logByKey.get(key)
    const dirty = isDirty(key, item, ex)
    const supabase = createClient()
    setError(null)
    setBusy(key)
    try {
      // Tapping a logged, unchanged set removes it (a real delete).
      if (existing && !dirty) {
        const { error: delErr } = await supabase.from('set_logs').delete().eq('id', existing.id)
        if (delErr) throw delErr
        onLogsChange(logs.filter((l) => l.id !== existing.id))
        setDrafts((d) => {
          const next = { ...d }
          delete next[key]
          return next
        })
        return
      }

      const d = getDraft(key, item, ex)
      const row = {
        workout_item_id: item.id,
        athlete_id: athleteId,
        exercise_id: ex.id,
        set_number: setNumber,
        reps: ex.tracking === 'reps' || ex.tracking === 'weight_reps' ? num(d.reps) : null,
        weight: ex.tracking === 'weight_reps' ? num(d.weight) : null,
        value: ['velocity', 'distance', 'time', 'accuracy'].includes(ex.tracking) ? num(d.value) : null,
        attempts: ex.tracking === 'accuracy' ? num(d.attempts) : null,
        completed: true,
      }
      if (ex.tracking === 'accuracy' && row.value != null && row.attempts != null && row.value > row.attempts) {
        setError('Made can’t be more than attempts.')
        return
      }
      let res: { data: unknown; error: { message: string } | null } = { data: null, error: null }
      const save = async () => {
        res = await supabase.from('set_logs').upsert(row, { onConflict: 'workout_item_id,athlete_id,set_number' }).select('*').single()
      }
      // Throwing sets can complete the day's throwing point, so measure points around the save.
      const counts = ex.discipline === 'throwing' || ex.discipline === 'arm_care'
      let gained = 0
      if (counts) gained = await withPointsDelta(athleteId, workout.workout_date, save)
      else await save()
      const { data, error: upErr } = res
      if (upErr || !data) throw upErr || new Error('Not saved')
      if (gained > 0) {
        buzz()
        setBurst({ key, amount: gained })
        setTimeout(() => setBurst((b) => (b?.key === key ? null : b)), 1400)
      }
      const saved = data as SetLog
      onLogsChange([...logs.filter((l) => l.id !== saved.id), saved])
      setDrafts((dr) => {
        const next = { ...dr }
        delete next[key]
        return next
      })

      const { data: prs } = await supabase
        .from('pr_events')
        .select('pr_type, value, previous_value, reps')
        .eq('set_log_id', saved.id)
      const best = (prs || [])[0]
      if (best) {
        const unit = ex.tracking === 'accuracy' ? '%' : ` ${ex.unit ?? ''}`
        const delta =
          best.previous_value != null
            ? `${ex.tracking === 'time' ? '−' : '+'}${round1(Math.abs(Number(best.value) - Number(best.previous_value)))}${unit}`
            : null
        onPr({ exercise: ex.name, text: `${round1(Number(best.value))}${unit}`, delta })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Check your connection.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-slate-900">{workout.title}</h2>
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full bg-blue-50 text-[#1746b8]">
            {phaseLabel(workout.phase)}
          </span>
        </div>
        {workout.notes && <p className="text-xs text-slate-500 font-medium mt-1">{workout.notes}</p>}
        <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${totalSets ? Math.round((100 * doneSets) / totalSets) : 0}%` }}
          />
        </div>
        <div className="text-[10px] font-bold text-slate-400 mt-1">
          {doneSets} of {totalSets} sets logged
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {sorted.map((item) => {
          const ex = exercises.get(item.exercise_id)
          if (!ex) return null
          const label = itemLabel(item.block_index, item.item_index, blockCounts.get(item.block_index) || 1)
          return (
            <div key={item.id} className="px-4 py-3 space-y-2">
              <div className="flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center justify-center">
                  {label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-slate-900">{ex.name}</div>
                  <div className="text-xs font-semibold text-slate-500">
                    {item.sets} {item.sets === 1 ? 'set' : 'sets'}
                    {item.reps ? ` · ${item.reps}` : ''}
                    {item.load ? ` · ${item.load}` : ''}
                  </div>
                  {item.notes && <div className="text-xs text-slate-500 mt-0.5">{item.notes}</div>}
                  {ex.video_url && (
                    <a href={ex.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#1746b8] mt-1">
                      Watch demo <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {Array.from({ length: item.sets }, (_, i) => i + 1).map((setNumber) => {
                const key = `${item.id}:${setNumber}`
                const logged = logByKey.get(key)
                const d = getDraft(key, item, ex)
                const dirty = isDirty(key, item, ex)
                const done = !!logged && !dirty
                return (
                  <div key={key} className="flex items-center gap-2 pl-12">
                    <span className="w-10 text-[10px] font-extrabold text-slate-400 uppercase">Set {setNumber}</span>
                    <div className="flex-1 flex items-center gap-1.5">
                      {(ex.tracking === 'velocity' || ex.tracking === 'distance' || ex.tracking === 'time') && (
                        <SetInput value={d.value} onChange={(v) => setField(key, item, ex, 'value', v)} suffix={ex.unit || ''} />
                      )}
                      {ex.tracking === 'accuracy' && (
                        <>
                          <SetInput value={d.value} onChange={(v) => setField(key, item, ex, 'value', v)} suffix="made" />
                          <span className="text-xs font-bold text-slate-400">/</span>
                          <SetInput value={d.attempts} onChange={(v) => setField(key, item, ex, 'attempts', v)} suffix="tries" />
                        </>
                      )}
                      {ex.tracking === 'reps' && (
                        <SetInput value={d.reps} onChange={(v) => setField(key, item, ex, 'reps', v)} suffix={ex.unit || 'reps'} />
                      )}
                      {ex.tracking === 'weight_reps' && (
                        <>
                          <SetInput value={d.weight} onChange={(v) => setField(key, item, ex, 'weight', v)} suffix="lb" />
                          <SetInput value={d.reps} onChange={(v) => setField(key, item, ex, 'reps', v)} suffix="reps" />
                        </>
                      )}
                    </div>
                    <span className="relative shrink-0">
                    <PointBubble amount={burst?.key === key ? burst.amount : 0} />
                    <button
                      type="button"
                      aria-label={done ? `Undo set ${setNumber}` : `Log set ${setNumber}`}
                      disabled={busy === key}
                      onClick={() => saveSet(item, ex, setNumber)}
                      className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center cursor-pointer transition ${
                        done
                          ? 'bg-emerald-500 text-white'
                          : dirty && logged
                            ? 'bg-amber-400 text-white'
                            : 'bg-slate-100 text-slate-400'
                      } ${busy === key ? 'opacity-50' : ''}`}
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {error && <p className="px-4 pb-3 text-xs font-bold text-red-600">{error}</p>}
    </section>
  )
}

function SetInput({ value, onChange, suffix }: { value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <label className="flex-1 min-w-0 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-2.5">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        className="w-full min-w-0 py-2 bg-transparent text-base font-bold text-slate-900 outline-none"
        placeholder="–"
      />
      <span className="text-[10px] font-bold text-slate-400 shrink-0">{suffix}</span>
    </label>
  )
}
