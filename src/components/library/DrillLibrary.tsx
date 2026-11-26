'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Layers, PlayCircle, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import { SubTabs } from '@/components/office/roster/shared'
import { folderPath, subtree, type Drill, type Folder, type Progression } from '@/lib/library'
import FolderTree, { type Place } from './FolderTree'
import DrillSheet from './DrillSheet'
import ProgressionSheet from './ProgressionSheet'
import ImportPanel from './ImportPanel'
import ProgramsPanel from './ProgramsPanel'
import DrillOfWeekPanel from './DrillOfWeekPanel'

export type LibrarySub = 'drills' | 'progressions' | 'programs' | 'dow' | 'import'
type Sub = LibrarySub

/** Coach Office → Drills: folder-based drill and progression library with in-app videos. */
export default function DrillLibrary({ onChanged, initialSub, only }: { onChanged: () => void; initialSub?: string; only?: Sub }) {
  const [subState, setSub] = useState<Sub>((['drills', 'progressions', 'programs', 'dow', 'import'] as string[]).includes(initialSub || '') ? (initialSub as Sub) : 'drills')
  const sub = only || subState
  const [folders, setFolders] = useState<Folder[]>([])
  const [drills, setDrills] = useState<Drill[]>([])
  const [progs, setProgs] = useState<(Progression & { n: number })[]>([])
  const [place, setPlace] = useState<Place>('all')
  const [query, setQuery] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [openDrill, setOpenDrill] = useState<Drill | 'new' | null>(null)
  const [openProg, setOpenProg] = useState<Progression | 'new' | null>(null)
  const [version, setVersion] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const sb = createClient()
    let cancelled = false
    Promise.all([
      sb.from('library_folders').select('*').order('sort_order'),
      sb.from('exercises').select('*').order('name'),
      sb.from('progressions').select('*, progression_items(count)').order('name'),
    ]).then(([f, d, p]) => {
      if (cancelled) return
      setFolders((f.data as Folder[]) || [])
      setDrills(((d.data as Drill[]) || []).map((x) => ({ ...x, tags: x.tags || [] })))
      setProgs(((p.data as (Progression & { progression_items: { count: number }[] })[]) || []).map((x) => ({ ...x, n: x.progression_items?.[0]?.count ?? 0 })))
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const refresh = useCallback(() => {
    setVersion((v) => v + 1)
    onChanged()
  }, [onChanged])

  useEffect(() => setPlace('all'), [sub])

  const kind = sub === 'progressions' ? 'progression' : 'drill'
  const items: { id: number; name: string; folder_id: number | null; is_active: boolean }[] = kind === 'drill' ? drills : progs
  const visible = items.filter((x) => showHidden || x.is_active)
  const counts = useMemo(() => {
    const m = new Map<number | 'unfiled' | 'all', number>()
    visible.forEach((x) => m.set(x.folder_id ?? 'unfiled', (m.get(x.folder_id ?? 'unfiled') || 0) + 1))
    m.set('all', visible.length)
    return m
  }, [visible])

  const inPlace = (x: { folder_id: number | null }) =>
    place === 'all' ? true : place === 'unfiled' ? x.folder_id == null : x.folder_id != null && subtree(folders.filter((f) => f.kind === kind), place).has(x.folder_id)
  const q = query.trim().toLowerCase()
  const list = visible
    .filter((x) => (q ? true : inPlace(x)))
    .filter((x) => !q || x.name.toLowerCase().includes(q) || (kind === 'drill' && (x as Drill).tags.some((t) => t.toLowerCase().includes(q))))
  const childFolders = typeof place === 'number' ? folders.filter((f) => f.kind === kind && f.parent_id === place) : place === 'all' && !q ? folders.filter((f) => f.kind === kind && f.parent_id == null) : []

  const moveItem = async (folderId: number | null, id: number) => {
    const table = kind === 'drill' ? 'exercises' : 'progressions'
    await createClient().from(table).update({ folder_id: folderId }).eq('id', id)
    if (kind === 'drill') setDrills((ds) => ds.map((d) => (d.id === id ? { ...d, folder_id: folderId } : d)))
    else setProgs((ps) => ps.map((p) => (p.id === id ? { ...p, folder_id: folderId } : p)))
  }

  const crumbs = typeof place === 'number' ? folderPath(folders, place).split(' / ') : [place === 'all' ? (kind === 'drill' ? 'All Drills' : 'All Progressions') : 'Unfiled']

  return (
    <div>
      {!only && <SubTabs<Sub>
        tabs={[
          { key: 'drills', label: 'Drills', count: drills.filter((d) => d.is_active).length },
          { key: 'progressions', label: 'Progressions', count: progs.filter((p) => p.is_active).length },
          { key: 'programs', label: 'Programs' },
          { key: 'dow', label: 'Drill of the Week' },
          { key: 'import', label: 'Import & Videos' },
        ]}
        active={sub}
        onChange={setSub}
      />}
      {!loaded ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : sub === 'dow' ? (
        <DrillOfWeekPanel drills={drills.filter((d) => d.is_active !== false).map((d) => ({ id: d.id, name: d.name }))} />
      ) : sub === 'programs' ? (
        <ProgramsPanel progressions={progs.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name }))} onChanged={refresh} />
      ) : sub === 'import' ? (
        <ImportPanel drills={drills} onChanged={refresh} />
      ) : (
        <div className="lg:grid lg:grid-cols-[250px_1fr] lg:gap-4 items-start">
          <aside className="hidden lg:block bg-white rounded-3xl border border-slate-200 p-2 sticky top-4 max-h-[calc(100vh-140px)] overflow-y-auto">
            <FolderTree kind={kind} folders={folders} counts={counts} place={place} onPlace={setPlace} onDrop={moveItem} onChanged={refresh} />
          </aside>

          <div className="space-y-3 min-w-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search all ${kind === 'drill' ? 'drills (name or tag)' : 'progressions'}`} className={`${inputClass} pl-9`} />
              </div>
              <button
                type="button"
                onClick={() => (kind === 'drill' ? setOpenDrill('new') : setOpenProg('new'))}
                className="px-4 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> New
              </button>
            </div>

            {/* Phone: folder path + subfolders as chips */}
            <div className="lg:hidden flex flex-wrap items-center gap-1 text-xs font-extrabold">
              <button type="button" onClick={() => setPlace('all')} className="text-[#1746b8] cursor-pointer">All</button>
              {typeof place === 'number' &&
                folderPath(folders, place)
                  .split(' / ')
                  .map((n, i, arr) => {
                    let f = folders.find((x) => x.id === place)
                    for (let k = arr.length - 1; k > i && f; k--) f = folders.find((x) => x.id === f!.parent_id)
                    return (
                      <span key={i} className="flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 text-slate-400" />
                        <button type="button" onClick={() => f && setPlace(f.id)} className="text-[#1746b8] cursor-pointer">{n}</button>
                      </span>
                    )
                  })}
              {place === 'unfiled' && (
                <span className="flex items-center gap-1">
                  <ChevronRight className="w-3 h-3 text-slate-400" /> Unfiled
                </span>
              )}
            </div>
            {childFolders.length > 0 && (
              <div className="lg:hidden flex flex-wrap gap-1.5">
                {childFolders.map((f) => (
                  <button key={f.id} type="button" onClick={() => setPlace(f.id)} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-extrabold text-slate-700 cursor-pointer">
                    📁 {f.name}
                  </button>
                ))}
                {place === 'all' && (
                  <button type="button" onClick={() => setPlace('unfiled')} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-extrabold text-slate-500 cursor-pointer">Unfiled</button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 px-1">
              <span className="hidden lg:inline">{q ? `Results for "${query}"` : crumbs.join(' / ')}</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-[#1746b8]" /> Show Hidden
              </label>
              <span>{list.length} {kind === 'drill' ? 'drills' : 'progressions'}</span>
            </div>
            <p className="hidden lg:block text-[11px] font-semibold text-slate-400 px-1 -mt-2">Drag a row onto a folder on the left to move it.</p>

            <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {list.slice(0, 300).map((x) => {
                const d = kind === 'drill' ? (x as Drill) : null
                const p = kind === 'progression' ? (x as Progression & { n: number }) : null
                return (
                  <button
                    key={x.id}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(x.id))}
                    onClick={() => (d ? setOpenDrill(d) : setOpenProg(p))}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 cursor-pointer ${x.is_active ? '' : 'opacity-50'}`}
                  >
                    {d ? (
                      <PlayCircle className={`w-5 h-5 shrink-0 ${d.video_url ? 'text-[#1746b8]' : 'text-slate-200'}`} aria-label={d.video_url ? 'Has video' : 'No Video'} />
                    ) : (
                      <Layers className="w-5 h-5 shrink-0 text-[#1746b8]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{x.name}</div>
                      <div className="text-[11px] font-semibold text-slate-400 truncate">
                        {d ? [q || place === 'all' ? folderPath(folders, d.folder_id) : null, d.tags.slice(0, 3).join(', ')].filter(Boolean).join(' · ') : `${p!.n} drills${q || place === 'all' ? ` · ${folderPath(folders, p!.folder_id) || 'Unfiled'}` : ''}`}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                )
              })}
              {list.length > 300 && <p className="px-4 py-3 text-xs font-semibold text-slate-500">Showing 300 of {list.length}. Pick a folder or search to narrow it down.</p>}
              {list.length === 0 && <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500">Nothing here yet.</p>}
            </div>
          </div>
        </div>
      )}

      {openDrill && <DrillSheet drill={openDrill === 'new' ? null : openDrill} folders={folders} onClose={() => setOpenDrill(null)} onChanged={refresh} />}
      {openProg && <ProgressionSheet progression={openProg === 'new' ? null : openProg} drills={drills} folders={folders} onClose={() => setOpenProg(null)} onChanged={refresh} />}
    </div>
  )
}
