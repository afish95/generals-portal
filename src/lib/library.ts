// Drill library: folders, drills (the `exercises` table) and progressions (blocks of drills done together).
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCsv } from '@/lib/gcImport'
import type { Exercise } from '@/lib/training'

export type FolderKind = 'drill' | 'progression'
export type Folder = { id: number; kind: FolderKind; parent_id: number | null; name: string; sort_order: number }
export type Drill = Exercise & {
  folder_id: number | null
  tags: string[]
  default_sets: string | null
  default_reps: string | null
  default_seconds: string | null
  source: string | null
  external_id: string | null
}
export type Progression = { id: number; name: string; folder_id: number | null; description: string | null; tags: string[]; is_active: boolean; external_id: string | null }
export type ProgressionItem = {
  id: number
  progression_id: number
  position: number
  block: string | null
  exercise_id: number | null
  label: string | null
  sets: string | null
  reps: string | null
  seconds: string | null
  notes: string | null
}

export const prescription = (x: { sets?: string | null; reps?: string | null; seconds?: string | null; default_sets?: string | null; default_reps?: string | null; default_seconds?: string | null }) => {
  const sets = x.sets ?? x.default_sets
  const reps = x.reps ?? x.default_reps
  const secs = x.seconds ?? x.default_seconds
  return [sets ? `${sets} ${sets === '1' ? 'set' : 'sets'}` : null, reps ? `${reps} reps` : null, secs ? `${secs} sec` : null].filter(Boolean).join(' · ')
}

/** Folder path like "Catchers / Receiving". */
export function folderPath(folders: Folder[], id: number | null): string {
  const parts: string[] = []
  let cur = folders.find((f) => f.id === id)
  for (let guard = 0; cur && guard < 20; guard++) {
    parts.unshift(cur.name)
    cur = folders.find((f) => f.id === cur!.parent_id)
  }
  return parts.join(' / ')
}

/** Every folder under (and including) one folder. */
export function subtree(folders: Folder[], id: number): Set<number> {
  const out = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) if (f.parent_id != null && out.has(f.parent_id) && !out.has(f.id)) (out.add(f.id), (grew = true))
  }
  return out
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
/** Match an uploaded video file to a drill: by the file name we recorded at import, or by drill name. */
export function matchVideo(file: string, drills: Drill[]): Drill | undefined {
  const base = file.replace(/\.[a-z0-9]+$/i, '')
  const bySource = drills.find((d) => d.source?.includes(`video file: ${file}`))
  if (bySource) return bySource
  const s = slug(base.replace(/^\d{10,}_/, ''))
  return drills.find((d) => slug(d.name) === s) || drills.find((d) => slug(d.name.replace(/^20\d\d\s+/, '')) === s.replace(/^20\d\d-/, ''))
}

// ---------- VeloBeam-style CSV import ----------
type Row = Record<string, string>
const rowsOf = (text: string): Row[] => {
  const grid = parseCsv(text.replace(/^﻿/, '')).filter((r) => r.some((c) => c.trim()))
  const head = grid[0]?.map((h) => h.trim()) || []
  return grid.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])))
}
export const csvKind = (text: string): 'drills' | 'progressions' | null => {
  const head = (text.replace(/^﻿/, '').split(/\r?\n/)[0] || '').toLowerCase()
  if (head.includes('progression_name') && head.includes('drill_name')) return 'progressions'
  if (head.includes('demo_video_url') || (head.includes('name') && head.includes('folder') && head.includes('log_type'))) return 'drills'
  return null
}
const pathOf = (f: string) => {
  const parts = f.split(' / ').map((x) => x.trim()).filter(Boolean)
  if (parts[0]?.startsWith('My Library')) parts.shift()
  return parts.length && !parts[0].startsWith('Unfiled') ? parts : []
}
const idFrom = (url: string, key: 'drill' | 'progression', name: string) => {
  try {
    const v = new URL(url).searchParams.get(key)
    if (v) return `velobeam:${v}`
  } catch {}
  return `velobeam:archived:${name}`
}
const tagsOf = (s: string) => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))]
const disc = (tags: string[], path: string[]) => {
  const t = new Set(tags.map((x) => x.toLowerCase()))
  if (path[0] === 'Armored Heat' || t.has('arm care')) return 'arm_care'
  if (['throwing', 'throw', 'pitching', 'weighted ball', 'long toss', 'velocity', 'arm strength', 'bullpen'].some((x) => t.has(x))) return 'throwing'
  if (t.has('hitting') || t.has('bat speed')) return 'hitting'
  return 'other'
}

export type ImportPreview = { drills: number; progressions: number; slots: number; folders: string[] }
export function previewImport(drillsText: string | null, progText: string | null): ImportPreview {
  const d = drillsText ? rowsOf(drillsText) : []
  const p = progText ? rowsOf(progText) : []
  const folders = new Set<string>()
  d.forEach((r) => pathOf(r.folder || '').length && folders.add(pathOf(r.folder).join(' / ')))
  p.forEach((r) => pathOf(r.progression_folder || '').length && folders.add(`Progressions: ${pathOf(r.progression_folder).join(' / ')}`))
  return { drills: d.length, progressions: new Set(p.map((r) => r.progression_name)).size, slots: p.length, folders: [...folders].sort() }
}

async function ensureFolder(sb: SupabaseClient, kind: FolderKind, path: string[], cache: Map<string, number>): Promise<number | null> {
  let parent: number | null = null
  for (let i = 0; i < path.length; i++) {
    const key = `${kind}:${path.slice(0, i + 1).join('/')}`
    if (cache.has(key)) {
      parent = cache.get(key)!
      continue
    }
    let q = sb.from('library_folders').select('id').eq('kind', kind).eq('name', path[i])
    q = parent == null ? q.is('parent_id', null) : q.eq('parent_id', parent)
    const found: { data: unknown } = await q.maybeSingle()
    let id: number | undefined = (found.data as { id: number } | null)?.id
    if (!id) {
      const parentId: number | null = parent
      const res: { data: unknown; error: { message: string } | null } = await sb.from('library_folders').insert({ kind, parent_id: parentId, name: path[i], sort_order: cache.size }).select('id').single()
      if (res.error) throw new Error(`Folder "${path[i]}": ${res.error.message}`)
      id = (res.data as { id: number }).id
    }
    cache.set(key, id)
    parent = id
  }
  return parent
}

/** Loads drills and progressions (VeloBeam export format). Safe to run again: rows update by their VeloBeam ID. */
export async function importLibrary(sb: SupabaseClient, drillsText: string | null, progText: string | null, onStep: (msg: string) => void) {
  const cache = new Map<string, number>()
  let drills = 0
  let progs = 0
  let slots = 0
  const warnings: string[] = []
  if (drillsText) {
    const rows = rowsOf(drillsText)
    const payload = []
    for (const r of rows) {
      const name = (r.name || '').trim()
      if (!name) continue
      const path = pathOf(r.folder || '')
      const folder_id = path.length ? await ensureFolder(sb, 'drill', path, cache) : null
      const tags = tagsOf(r.tags || '')
      let video = (r.demo_video_url || '').trim()
      let source = 'VeloBeam'
      if (/r2\.cloudflarestorage\.com/.test(video)) {
        source += `; video file: ${video.split('/').pop()}`
        video = ''
      }
      payload.push({
        name,
        category: path[path.length - 1] || 'Drill',
        tracking: 'reps',
        unit: /second/i.test(r.log_type || '') ? 'sec' : 'reps',
        video_url: video || null,
        notes: (r.description_instructions || '').trim() || null,
        is_active: (r.status || 'active') === 'active',
        is_demo: false,
        discipline: disc(tags, path),
        folder_id,
        tags,
        default_sets: r.default_sets || null,
        default_reps: r.default_reps || null,
        default_seconds: r.default_duration_seconds || null,
        source,
        external_id: idFrom(r.drill_id_or_url || '', 'drill', name),
      })
    }
    for (let i = 0; i < payload.length; i += 100) {
      onStep(`Saving drills ${i + 1}–${Math.min(i + 100, payload.length)} of ${payload.length}…`)
      const { error } = await sb.from('exercises').upsert(payload.slice(i, i + 100), { onConflict: 'external_id' })
      if (error) throw new Error(`Drills: ${error.message}`)
    }
    drills = payload.length
  }
  if (progText) {
    const rows = rowsOf(progText)
    const { data: exData } = await sb.from('exercises').select('id, name, external_id')
    const byExt = new Map((exData || []).filter((e) => e.external_id).map((e) => [e.external_id as string, e.id as number]))
    const byName = new Map((exData || []).map((e) => [String(e.name).toLowerCase(), e.id as number]))
    const groups = new Map<string, Row[]>()
    rows.forEach((r) => groups.set(r.progression_name, [...(groups.get(r.progression_name) || []), r]))
    let n = 0
    for (const [name, list] of groups) {
      n++
      onStep(`Saving progression ${n} of ${groups.size}: ${name}…`)
      const r0 = list[0]
      const path = pathOf(r0.progression_folder || '')
      const folder_id = path.length ? await ensureFolder(sb, 'progression', path, cache) : null
      const { data: prog, error } = await sb
        .from('progressions')
        .upsert(
          {
            name,
            folder_id,
            description: (r0.progression_description || '').trim() || null,
            tags: tagsOf(r0.progression_tags || ''),
            is_active: (r0.progression_status || 'active') === 'active',
            source: 'VeloBeam',
            external_id: idFrom(r0.progression_url_id || '', 'progression', name),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'external_id' }
        )
        .select('id')
        .single()
      if (error || !prog) throw new Error(`Progression "${name}": ${error?.message}`)
      await sb.from('progression_items').delete().eq('progression_id', prog.id)
      const items = list
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map((r) => {
          const ext = r.drill_id_or_url ? idFrom(r.drill_id_or_url, 'drill', r.drill_name.trim()) : null
          const exercise_id = (ext && byExt.get(ext)) || byName.get(r.drill_name.trim().toLowerCase()) || null
          if (!exercise_id) warnings.push(`${name}: "${r.drill_name}" has no matching drill (kept as a label).`)
          return {
            progression_id: prog.id,
            position: Number(r.position) || 0,
            block: r.block_or_superset_letter || null,
            exercise_id,
            label: r.drill_name.trim(),
            sets: r.sets || null,
            reps: r.reps || null,
            seconds: r.duration_seconds || null,
          }
        })
      const { error: ie } = await sb.from('progression_items').insert(items)
      if (ie) throw new Error(`Slots for "${name}": ${ie.message}`)
      progs++
      slots += items.length
    }
  }
  return { drills, progs, slots, warnings }
}
