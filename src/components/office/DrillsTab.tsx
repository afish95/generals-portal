'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import { DISCIPLINES, TRACKING, type Discipline, type Exercise, type Tracking } from '@/lib/training'

export default function DrillsTab({ exercises, onChanged }: { exercises: Exercise[]; onChanged: () => void }) {
  const [form, setForm] = useState({ name: '', discipline: 'throwing' as Discipline, tracking: 'velocity' as Tracking, unit: 'mph', video_url: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!form.name.trim()) return setError('Name the drill.')
    const { error: e } = await createClient().from('exercises').insert({
      name: form.name.trim(),
      discipline: form.discipline,
      category: DISCIPLINES.find((d) => d.key === form.discipline)?.label ?? 'Drill',
      tracking: form.tracking,
      unit: form.unit.trim() || null,
      video_url: form.video_url.trim() || null,
    })
    if (e) return setError(e.message.includes('duplicate') ? 'A drill with that name already exists.' : e.message)
    setError(null)
    setAdding(false)
    setForm({ ...form, name: '', video_url: '' })
    onChanged()
  }

  const toggle = async (ex: Exercise) => {
    await createClient().from('exercises').update({ is_active: !ex.is_active }).eq('id', ex.id)
    onChanged()
  }

  const remove = async (ex: Exercise) => {
    if (!window.confirm(`Delete "${ex.name}" permanently?`)) return
    const { error: e } = await createClient().from('exercises').delete().eq('id', ex.id)
    if (e) {
      setError(
        e.message.includes('foreign key')
          ? `"${ex.name}" is used in workouts, so it can't be deleted. Hide it instead to keep that history.`
          : e.message
      )
      return
    }
    onChanged()
  }

  return (
    <div className="space-y-3 lg:space-y-0 lg:columns-2 xl:columns-3 lg:gap-4 [&>*]:break-inside-avoid [&>*]:mb-4">
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> Add drill
        </button>
      ) : (
        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Drill name (e.g. Crow Hop Velo)" className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value as Discipline })} className={inputClass}>
              {DISCIPLINES.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unit (mph, ft)" className={inputClass} />
          </div>
          <select
            value={form.tracking}
            onChange={(e) => {
              const t = e.target.value as Tracking
              setForm({ ...form, tracking: t, unit: TRACKING.find((x) => x.key === t)?.defaultUnit ?? '' })
            }}
            className={inputClass}
          >
            {TRACKING.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="Demo video link (optional)" inputMode="url" className={inputClass} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-sm font-extrabold text-slate-600 cursor-pointer">Cancel</button>
            <button type="button" onClick={create} className="flex-1 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold cursor-pointer">Save drill</button>
          </div>
        </section>
      )}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      {DISCIPLINES.map((d) => {
        const list = exercises.filter((e) => e.discipline === d.key)
        if (!list.length) return null
        return (
          <section key={d.key} className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-4 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{d.label}</div>
            <div className="divide-y divide-slate-100">
              {list.map((ex) => (
                <div key={ex.id} className={`flex items-center gap-3 px-4 py-2.5 ${ex.is_active ? '' : 'opacity-50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">{ex.name}</div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      {TRACKING.find((t) => t.key === ex.tracking)?.label.split(' (')[0] ?? ex.tracking}
                      {ex.unit ? ` · ${ex.unit}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => toggle(ex)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-[11px] font-extrabold text-slate-600 cursor-pointer">
                    {ex.is_active ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" aria-label="Delete drill" onClick={() => remove(ex)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
