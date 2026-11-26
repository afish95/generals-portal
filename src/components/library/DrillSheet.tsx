'use client'

import { useState } from 'react'
import { Eye, EyeOff, Trash2, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import { SheetFrame } from '@/components/office/roster/shared'
import { DISCIPLINES, TRACKING, type Discipline, type Tracking } from '@/lib/training'
import { folderPath, type Drill, type Folder } from '@/lib/library'
import VideoEmbed from './VideoEmbed'

export async function uploadDrillVideo(drillId: number, file: File) {
  const sb = createClient()
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const safe = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
  const path = `${drillId}/${Date.now()}-${safe}.${ext}`
  const { error } = await sb.storage.from('drill-videos').upload(path, file, { upsert: true, contentType: file.type || 'video/mp4' })
  if (error) throw new Error(error.message.includes('exceeded') || error.message.includes('size') ? `${file.name} is too big to upload.` : error.message)
  const url = sb.storage.from('drill-videos').getPublicUrl(path).data.publicUrl
  const { error: e2 } = await sb.from('exercises').update({ video_url: url }).eq('id', drillId)
  if (e2) throw new Error(e2.message)
  return url
}

/** One drill: its video plays right here, plus how-to, defaults and editing. */
export default function DrillSheet({ drill, folders, onClose, onChanged }: { drill: Drill | null; folders: Folder[]; onClose: () => void; onChanged: () => void }) {
  const isNew = !drill
  const [f, setF] = useState({
    name: drill?.name || '',
    folder_id: drill?.folder_id ?? null,
    video_url: drill?.video_url || '',
    notes: drill?.notes || '',
    tags: (drill?.tags || []).join(', '),
    default_sets: drill?.default_sets || '',
    default_reps: drill?.default_reps || '',
    default_seconds: drill?.default_seconds || '',
    discipline: (drill?.discipline || 'other') as Discipline,
    tracking: (drill?.tracking || 'reps') as Tracking,
    unit: drill?.unit || 'reps',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(isNew)
  const drillFolders = folders.filter((x) => x.kind === 'drill').map((x) => ({ id: x.id, label: folderPath(folders, x.id) })).sort((a, b) => a.label.localeCompare(b.label))

  const save = async () => {
    if (!f.name.trim()) return setError('Name the drill.')
    setBusy('Saving…')
    setError(null)
    const row = {
      name: f.name.trim(),
      folder_id: f.folder_id,
      video_url: f.video_url.trim() || null,
      notes: f.notes.trim() || null,
      tags: [...new Set(f.tags.split(',').map((t) => t.trim()).filter(Boolean))],
      default_sets: f.default_sets.trim() || null,
      default_reps: f.default_reps.trim() || null,
      default_seconds: f.default_seconds.trim() || null,
      discipline: f.discipline,
      tracking: f.tracking,
      unit: f.unit.trim() || null,
      category: folders.find((x) => x.id === f.folder_id)?.name || drill?.category || 'Drill',
    }
    const sb = createClient()
    const { error: e } = isNew ? await sb.from('exercises').insert(row) : await sb.from('exercises').update(row).eq('id', drill!.id)
    setBusy(null)
    if (e) return setError(e.message)
    onChanged()
    onClose()
  }

  const upload = async (file: File) => {
    if (!drill) return setError('Save the drill first, then upload its video.')
    setBusy(`Uploading ${file.name}…`)
    setError(null)
    try {
      const url = await uploadDrillVideo(drill.id, file)
      setF((x) => ({ ...x, video_url: url }))
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  const toggleHidden = async () => {
    if (!drill) return
    await createClient().from('exercises').update({ is_active: !drill.is_active }).eq('id', drill.id)
    onChanged()
    onClose()
  }
  const remove = async () => {
    if (!drill || !window.confirm(`Delete "${drill.name}" permanently?`)) return
    const { error: e } = await createClient().from('exercises').delete().eq('id', drill.id)
    if (e) return setError(e.message.includes('foreign key') ? `"${drill.name}" is used in workouts or logs, so it can't be deleted. Hide it instead.` : e.message)
    onChanged()
    onClose()
  }

  const fmtNotes = (s: string) => s.replace(/; (?=\d\)|Heat Zone|\*\*)/g, '\n')

  return (
    <SheetFrame title={isNew ? 'New Drill' : drill!.name} subtitle={folderPath(folders, f.folder_id) || 'Unfiled'} onClose={onClose}>
      {!isNew && <VideoEmbed url={f.video_url} title={f.name} />}
      {!isNew && !f.video_url && <p className="text-xs font-semibold text-slate-500">No video yet. Paste a YouTube or Vimeo link, or upload a video file below.</p>}

      {!editing && drill && (
        <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {drill.tags.map((t) => (
              <span key={t} className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>
            ))}
          </div>
          {(drill.default_sets || drill.default_reps || drill.default_seconds) && (
            <div className="text-sm font-extrabold text-[#1746b8]">
              {[drill.default_sets && `${drill.default_sets} sets`, drill.default_reps && `${drill.default_reps} reps`, drill.default_seconds && `${drill.default_seconds} sec`].filter(Boolean).join(' · ')}
            </div>
          )}
          {drill.notes ? <p className="text-sm text-slate-700 whitespace-pre-line">{fmtNotes(drill.notes)}</p> : <p className="text-xs text-slate-400">No instructions yet.</p>}
          <button type="button" onClick={() => setEditing(true)} className="w-full py-2.5 rounded-xl bg-slate-100 text-sm font-extrabold text-slate-700 cursor-pointer">Edit Drill</button>
        </section>
      )}

      {editing && (
        <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
          <SectionLabel>Drill</SectionLabel>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Drill name" className={inputClass} />
          <label className="block text-[11px] font-bold text-slate-500">
            Folder
            <select value={f.folder_id ?? ''} onChange={(e) => setF({ ...f, folder_id: e.target.value ? Number(e.target.value) : null })} className={inputClass}>
              <option value="">Unfiled</option>
              {drillFolders.map((x) => (
                <option key={x.id} value={x.id}>{x.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-bold text-slate-500">
            Video link (YouTube, Vimeo, Google Drive or a video file)
            <input value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=…" className={inputClass} />
          </label>
          {!isNew && (
            <label className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-xs font-extrabold text-[#1746b8] cursor-pointer">
              <Upload className="w-4 h-4" /> Upload a Video File
              <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          )}
          <label className="block text-[11px] font-bold text-slate-500">
            Instructions
            <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={5} className={inputClass} />
          </label>
          <label className="block text-[11px] font-bold text-slate-500">
            Tags (comma separated)
            <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="Arm Care, Scapula" className={inputClass} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['default_sets', 'default_reps', 'default_seconds'] as const).map((k) => (
              <label key={k} className="text-[11px] font-bold text-slate-500">
                {k === 'default_sets' ? 'Sets' : k === 'default_reps' ? 'Reps' : 'Seconds'}
                <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inputClass} />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-slate-500">
              Type
              <select value={f.discipline} onChange={(e) => setF({ ...f, discipline: e.target.value as Discipline })} className={inputClass}>
                {DISCIPLINES.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-500">
              Players Log
              <select
                value={f.tracking}
                onChange={(e) => {
                  const t = e.target.value as Tracking
                  setF({ ...f, tracking: t, unit: TRACKING.find((x) => x.key === t)?.defaultUnit || f.unit })
                }}
                className={inputClass}
              >
                {TRACKING.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={save} disabled={!!busy} className="w-full py-3 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-50 cursor-pointer">
            {busy || (isNew ? 'Create Drill' : 'Save Drill')}
          </button>
        </section>
      )}

      {busy && !editing && <p className="text-xs font-extrabold text-[#1746b8]">{busy}</p>}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      {drill && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={toggleHidden} className="py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer">
            {drill.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {drill.is_active ? 'Hide Drill' : 'Show Drill'}
          </button>
          <button type="button" onClick={remove} className="py-2.5 rounded-xl bg-red-50 text-xs font-extrabold text-red-700 flex items-center justify-center gap-1.5 cursor-pointer">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      )}
    </SheetFrame>
  )
}
