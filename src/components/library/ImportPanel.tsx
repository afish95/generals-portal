'use client'

import { useState } from 'react'
import { FileUp, Film, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { SectionLabel } from '@/components/ui'
import { csvKind, importLibrary, matchVideo, previewImport, type Drill } from '@/lib/library'
import { uploadDrillVideo } from './DrillSheet'

/** Load a drill / progression export (VeloBeam format) and bulk-upload drill videos. */
export default function ImportPanel({ drills, onChanged }: { drills: Drill[]; onChanged: () => void }) {
  const [files, setFiles] = useState<{ drills: string | null; progressions: string | null; names: string[] }>({ drills: null, progressions: null, names: [] })
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [videoLog, setVideoLog] = useState<string[]>([])

  const pick = async (list: FileList | null) => {
    if (!list) return
    setError(null)
    setResult(null)
    const next = { ...files, names: [...files.names] }
    for (const f of Array.from(list)) {
      const text = await f.text()
      const k = csvKind(text)
      if (!k) {
        setError(`${f.name} doesn't look like a drill or progression export.`)
        continue
      }
      next[k] = text
      next.names.push(f.name)
    }
    setFiles(next)
  }
  const preview = files.drills || files.progressions ? previewImport(files.drills, files.progressions) : null

  const run = async () => {
    setBusy('Starting…')
    setError(null)
    setWarnings([])
    try {
      const r = await importLibrary(createClient(), files.drills, files.progressions, setBusy)
      setResult(`Loaded ${r.drills} drills and ${r.progs} progressions (${r.slots} drill slots).`)
      setWarnings(r.warnings)
      setFiles({ drills: null, progressions: null, names: [] })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  const missingVideo = drills.filter((d) => d.is_active && !d.video_url)
  const uploadVideos = async (list: FileList | null) => {
    if (!list?.length) return
    const log: string[] = []
    let n = 0
    for (const f of Array.from(list)) {
      n++
      const d = matchVideo(f.name, drills)
      if (!d) {
        log.push(`✗ ${f.name}: no drill with a matching name`)
        continue
      }
      setBusy(`Uploading ${n} of ${list.length}: ${d.name}…`)
      try {
        await uploadDrillVideo(d.id, f)
        log.push(`✓ ${d.name}`)
      } catch (e) {
        log.push(`✗ ${f.name}: ${(e as Error).message}`)
      }
      setVideoLog([...log])
    }
    setBusy(null)
    onChanged()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Import Drills and Progressions</SectionLabel>
        <p className="text-xs font-semibold text-slate-600">Upload the drill export and the progression export (CSV). Folders are created from the file. Running it again updates the same drills instead of making copies.</p>
        <label className="flex items-center justify-center gap-2 py-5 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-extrabold text-[#1746b8] cursor-pointer hover:bg-blue-50/50">
          <FileUp className="w-5 h-5" /> Choose CSV files
          <input type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => (pick(e.target.files), (e.target.value = ''))} />
        </label>
        {preview && (
          <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-700 space-y-1">
            <div>{files.names.join(', ')}</div>
            <div>
              <b>{preview.drills}</b> drills · <b>{preview.progressions}</b> progressions · <b>{preview.slots}</b> slots
            </div>
            {preview.folders.length > 0 && <div className="text-slate-500">Folders: {preview.folders.join(' · ')}</div>}
            {files.progressions && !files.drills && <div className="text-amber-700">Tip: import the drill file first (or together) so progression slots link to drills.</div>}
          </div>
        )}
        <button type="button" onClick={run} disabled={!preview || !!busy} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer">
          <Upload className="w-4 h-4" /> {busy && !videoLog.length ? busy : 'Import'}
        </button>
        {result && <p className="text-sm font-extrabold text-emerald-700">{result}</p>}
        {warnings.length > 0 && (
          <ul className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-[11px] font-semibold text-amber-800 space-y-0.5 max-h-32 overflow-y-auto">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Upload Drill Videos</SectionLabel>
        <p className="text-xs font-semibold text-slate-600">
          Pick video files (you can select many at once). Each file is matched to its drill by file name, stored in the app, and plays inside the app from then on.
        </p>
        <label className="flex items-center justify-center gap-2 py-5 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-extrabold text-[#1746b8] cursor-pointer hover:bg-blue-50/50">
          <Film className="w-5 h-5" /> Choose Video Files
          <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => (uploadVideos(e.target.files), (e.target.value = ''))} />
        </label>
        {busy && videoLog.length > 0 && <p className="text-xs font-extrabold text-[#1746b8]">{busy}</p>}
        {videoLog.length > 0 && (
          <ul className="rounded-2xl bg-slate-50 p-3 text-[11px] font-semibold text-slate-700 space-y-0.5 max-h-48 overflow-y-auto">
            {videoLog.map((l, i) => (
              <li key={i} className={l.startsWith('✗') ? 'text-red-600' : ''}>{l}</li>
            ))}
          </ul>
        )}
        <details className="text-xs font-semibold text-slate-600">
          <summary className="cursor-pointer font-extrabold">{missingVideo.length} active drills have no video</summary>
          <ul className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
            {missingVideo.map((d) => (
              <li key={d.id}>{d.name}</li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  )
}
