'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { SubTabs } from '@/components/office/roster/shared'
import type { Drill, Folder, Progression } from '@/lib/library'
import LibraryTree, { type TreeItem } from './LibraryTree'
import DrillSheet from './DrillSheet'
import ProgressionSheet from './ProgressionSheet'
import ImportPanel from './ImportPanel'
import ProgramsPanel from './ProgramsPanel'
import DrillOfWeekPanel from './DrillOfWeekPanel'

export type LibrarySub = 'drills' | 'progressions' | 'programs' | 'dow' | 'import'
type Sub = LibrarySub

/** Coach Office → Drills: folder-based drill and progression library with in-app videos. */
export default function DrillLibrary({ onChanged, initialSub, only, openProgramId }: { onChanged: () => void; initialSub?: string; only?: Sub; openProgramId?: number }) {
  const [subState, setSub] = useState<Sub>((['drills', 'progressions', 'programs', 'dow', 'import'] as string[]).includes(initialSub || '') ? (initialSub as Sub) : 'drills')
  const sub = only || subState
  const [folders, setFolders] = useState<Folder[]>([])
  const [drills, setDrills] = useState<Drill[]>([])
  const [progs, setProgs] = useState<(Progression & { n: number })[]>([])
  const [newFolderId, setNewFolderId] = useState<number | null>(null)
  const [startEdit, setStartEdit] = useState(false)
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


  const kind = sub === 'progressions' ? 'progression' : 'drill'
  const treeItems: TreeItem[] = kind === 'drill'
    ? drills.map((d) => ({ id: d.id, name: d.name, folder_id: d.folder_id, is_active: d.is_active !== false, sub: d.tags.slice(0, 3).join(', '), video: !!d.video_url }))
    : progs.map((p) => ({ id: p.id, name: p.name, folder_id: p.folder_id, is_active: p.is_active, sub: `${p.n} drills` }))

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
        <ProgramsPanel progressions={progs.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name }))} onChanged={refresh} openProgramId={openProgramId} />
      ) : sub === 'import' ? (
        <ImportPanel drills={drills} onChanged={refresh} />
      ) : (
        <LibraryTree
          key={kind}
          kind={kind}
          folders={folders}
          items={treeItems}
          onOpen={(id, edit) => {
            setStartEdit(edit)
            if (kind === 'drill') setOpenDrill(drills.find((d) => d.id === id) || null)
            else setOpenProg(progs.find((p) => p.id === id) || null)
          }}
          onNew={(folderId) => {
            setNewFolderId(folderId)
            setStartEdit(true)
            if (kind === 'drill') setOpenDrill('new')
            else setOpenProg('new')
          }}
          onFoldersChanged={refresh}
          onItemsChanged={refresh}
        />
      )}

      {openDrill && <DrillSheet key={openDrill === 'new' ? 'new' : openDrill.id} drill={openDrill === 'new' ? null : openDrill} defaultFolder={newFolderId} startEditing={startEdit} folders={folders} onClose={() => setOpenDrill(null)} onChanged={refresh} />}
      {openProg && <ProgressionSheet key={openProg === 'new' ? 'new' : openProg.id} progression={openProg === 'new' ? null : openProg} defaultFolder={newFolderId} startEditing={startEdit} drills={drills} folders={folders} onClose={() => setOpenProg(null)} onChanged={refresh} />}
    </div>
  )
}
