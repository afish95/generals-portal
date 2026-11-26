'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarPlus, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import { SheetFrame } from '@/components/office/roster/shared'
import { folderPath, prescription, type Drill, type Folder, type Progression, type ProgressionItem } from '@/lib/library'
import { DrillReveal } from './VideoEmbed'
import AssignPanel from './AssignPanel'

type Slot = Omit<ProgressionItem, 'id' | 'progression_id'> & { key: string }
let seq = 0

/** One progression: its drills in order (tap a drill to watch it), and editing. */
export default function ProgressionSheet({
  progression,
  drills,
  folders,
  onClose,
  onChanged,
}: {
  progression: Progression | null
  drills: Drill[]
  folders: Folder[]
  onClose: () => void
  onChanged: () => void
}) {
  const isNew = !progression
  const [slots, setSlots] = useState<Slot[] | null>(isNew ? [] : null)
  const [name, setName] = useState(progression?.name || '')
  const [desc, setDesc] = useState(progression?.description || '')
  const [folderId, setFolderId] = useState<number | null>(progression?.folder_id ?? null)
  const [editing, setEditing] = useState(isNew)
  const [assigning, setAssigning] = useState(false)
  const [find, setFind] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const byId = useMemo(() => new Map(drills.map((d) => [d.id, d])), [drills])

  useEffect(() => {
    if (!progression) return
    createClient()
      .from('progression_items')
      .select('*')
      .eq('progression_id', progression.id)
      .order('position')
      .then(({ data }) => setSlots(((data as ProgressionItem[]) || []).map((i) => ({ ...i, key: `s${i.id}` }))))
  }, [progression])

  const patch = (key: string, p: Partial<Slot>) => setSlots((s) => s!.map((x) => (x.key === key ? { ...x, ...p } : x)))
  const move = (i: number, d: -1 | 1) =>
    setSlots((s) => {
      const n = [...s!]
      const j = i + d
      if (j < 0 || j >= n.length) return s
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  const addDrill = (d: Drill) => {
    setSlots((s) => [...(s || []), { key: `n${++seq}`, position: (s?.length || 0) + 1, block: null, exercise_id: d.id, label: d.name, sets: d.default_sets, reps: d.default_reps, seconds: d.default_seconds, notes: null }])
    setFind('')
  }

  const save = async () => {
    if (!name.trim()) return setError('Name the progression.')
    setBusy(true)
    setError(null)
    const sb = createClient()
    const row = { name: name.trim(), description: desc.trim() || null, folder_id: folderId, updated_at: new Date().toISOString() }
    let id = progression?.id
    if (isNew) {
      const { data, error: e } = await sb.from('progressions').insert(row).select('id').single()
      if (e || !data) {
        setBusy(false)
        return setError(e?.message || 'Could not save')
      }
      id = data.id
    } else {
      const { error: e } = await sb.from('progressions').update(row).eq('id', id!)
      if (e) {
        setBusy(false)
        return setError(e.message)
      }
      await sb.from('progression_items').delete().eq('progression_id', id!)
    }
    const items = (slots || []).map((s, i) => ({
      progression_id: id,
      position: i + 1,
      block: s.block?.trim() || null,
      exercise_id: s.exercise_id,
      label: s.label,
      sets: s.sets?.trim() || null,
      reps: s.reps?.trim() || null,
      seconds: s.seconds?.trim() || null,
      notes: s.notes?.trim() || null,
    }))
    if (items.length) {
      const { error: e } = await sb.from('progression_items').insert(items)
      if (e) {
        setBusy(false)
        return setError(e.message)
      }
    }
    setBusy(false)
    onChanged()
    onClose()
  }

  const toggleHidden = async () => {
    if (!progression) return
    await createClient().from('progressions').update({ is_active: !progression.is_active }).eq('id', progression.id)
    onChanged()
    onClose()
  }
  const remove = async () => {
    if (!progression || !window.confirm(`Delete the progression "${progression.name}"? The drills stay in the library.`)) return
    await createClient().from('progressions').delete().eq('id', progression.id)
    onChanged()
    onClose()
  }

  const matches = find.trim().length > 1 ? drills.filter((d) => d.is_active && d.name.toLowerCase().includes(find.toLowerCase())).slice(0, 12) : []
  const progFolders = folders.filter((x) => x.kind === 'progression').map((x) => ({ id: x.id, label: folderPath(folders, x.id) })).sort((a, b) => a.label.localeCompare(b.label))

  return (
    <SheetFrame title={isNew ? 'New Progression' : progression!.name} subtitle={`${folderPath(folders, folderId) || 'Unfiled'}${slots ? ` · ${slots.length} drills` : ''}`} onClose={onClose}>
      {!editing && progression && (
        <button type="button" onClick={() => setAssigning((a) => !a)} className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer">
          <CalendarPlus className="w-4 h-4" /> {assigning ? 'Hide Assigning' : 'Assign to players or a group'}
        </button>
      )}
      {!editing && progression && assigning && <AssignPanel progressionId={progression.id} progressionName={progression.name} />}
      {!editing && progression?.description && <p className="text-sm text-slate-700 bg-white rounded-2xl border border-slate-200 p-4 whitespace-pre-line">{progression.description}</p>}

      {editing && (
        <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
          <SectionLabel>Progression</SectionLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Catcher Daily - Throwing)" className={inputClass} />
          <select value={folderId ?? ''} onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)} className={inputClass} aria-label="Folder">
            <option value="">Unfiled</option>
            {progFolders.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Description or coaching notes" className={inputClass} />
        </section>
      )}

      <section className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {slots === null && <div className="h-24 animate-pulse bg-slate-50" />}
        {slots?.map((s, i) => {
          const d = s.exercise_id ? byId.get(s.exercise_id) : undefined
          return (
            <div key={s.key} className="px-4 py-3 flex gap-3">
              <span className="shrink-0 min-w-9 h-9 px-1.5 rounded-xl bg-[#1746b8] text-white text-[11px] font-extrabold flex items-center justify-center">{s.block?.split(/\s/)[0] || i + 1}</span>
              <div className="flex-1 min-w-0">
                <DrillReveal name={d?.name || s.label || 'Drill'} videoUrl={d?.video_url} notes={d?.notes} meta={[prescription(s), s.block && s.block.includes(' ') ? s.block.split(/\s(.+)/)[1] : null, !d ? 'Not in the drill library' : null].filter(Boolean).join(' · ')} />
                {editing && (
                  <div className="mt-2 grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-1.5 items-center">
                    {(['block', 'sets', 'reps', 'seconds'] as const).map((k) => (
                      <input key={k} value={s[k] || ''} onChange={(e) => patch(s.key, { [k]: e.target.value })} placeholder={k === 'block' ? 'Block (A1)' : k} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs" aria-label={k} />
                    ))}
                    <div className="flex gap-1">
                      <button type="button" onClick={() => move(i, -1)} aria-label="Move Up" className="p-1.5 rounded-lg bg-slate-100 cursor-pointer"><ArrowUp className="w-3 h-3" /></button>
                      <button type="button" onClick={() => move(i, 1)} aria-label="Move Down" className="p-1.5 rounded-lg bg-slate-100 cursor-pointer"><ArrowDown className="w-3 h-3" /></button>
                      <button type="button" onClick={() => setSlots((x) => x!.filter((y) => y.key !== s.key))} aria-label="Remove" className="p-1.5 rounded-lg bg-red-50 text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {slots?.length === 0 && <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500">No drills yet.</p>}
        {editing && (
          <div className="p-3 relative">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#1746b8]" />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Add a drill: type to search" className="flex-1 px-2 py-2 text-sm outline-none" />
            </div>
            {matches.length > 0 && (
              <div className="mt-1 rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {matches.map((d) => (
                  <button key={d.id} type="button" onClick={() => addDrill(d)} className="w-full text-left px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer">
                    {d.name} <span className="text-[10px] text-slate-400 font-semibold">{folderPath(folders, d.folder_id)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      {editing ? (
        <button type="button" onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-50 cursor-pointer">
          {busy ? 'Saving…' : isNew ? 'Create Progression' : 'Save Progression'}
        </button>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="w-full py-2.5 rounded-xl bg-slate-100 text-sm font-extrabold text-slate-700 cursor-pointer">Edit Progression</button>
      )}
      {progression && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={toggleHidden} className="py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer">
            {progression.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {progression.is_active ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={remove} className="py-2.5 rounded-xl bg-red-50 text-xs font-extrabold text-red-700 flex items-center justify-center gap-1.5 cursor-pointer">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      )}
    </SheetFrame>
  )
}
