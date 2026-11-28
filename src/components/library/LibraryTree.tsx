'use client'

import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Folder as FolderIcon, FolderInput, FolderPlus, Inbox, Layers, Move, Pencil, PlayCircle, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import { folderPath, subtree, type Folder, type FolderKind } from '@/lib/library'
import ActionSheet from './ActionSheet'

export type TreeItem = { id: number; name: string; folder_id: number | null; is_active: boolean; sub: string; video?: boolean }

/** Folder colors coaches can pick (stored by key in library_folders.color) */
export const FOLDER_COLORS: { key: string; label: string; text: string; bg: string }[] = [
  { key: 'red', label: 'Red', text: 'text-red-500', bg: 'bg-red-500' },
  { key: 'orange', label: 'Orange', text: 'text-orange-500', bg: 'bg-orange-500' },
  { key: 'amber', label: 'Yellow', text: 'text-amber-500', bg: 'bg-amber-500' },
  { key: 'green', label: 'Green', text: 'text-emerald-500', bg: 'bg-emerald-500' },
  { key: 'teal', label: 'Teal', text: 'text-teal-500', bg: 'bg-teal-500' },
  { key: 'blue', label: 'Blue', text: 'text-blue-500', bg: 'bg-blue-500' },
  { key: 'indigo', label: 'Indigo', text: 'text-indigo-600', bg: 'bg-indigo-600' },
  { key: 'violet', label: 'Purple', text: 'text-violet-500', bg: 'bg-violet-500' },
  { key: 'pink', label: 'Pink', text: 'text-pink-500', bg: 'bg-pink-500' },
  { key: 'gray', label: 'Gray', text: 'text-slate-400', bg: 'bg-slate-400' },
]
const AUTO = ['red', 'teal', 'pink', 'amber', 'blue', 'violet', 'green', 'gray']

/**
 * VeloBeam-style library list: folders with a chevron to open them in place and a ⋯ menu
 * (Add, New Subfolder, Edit, Move, Delete); every drill/progression has its own ⋯ (Edit, Move to Folder, Archive).
 */
export default function LibraryTree({
  kind,
  folders,
  items,
  onOpen,
  onNew,
  onFoldersChanged,
  onItemsChanged,
}: {
  kind: FolderKind
  folders: Folder[]
  items: TreeItem[]
  onOpen: (id: number, edit: boolean) => void
  onNew: (folderId: number | null) => void
  onFoldersChanged: () => void
  onItemsChanged: () => void
}) {
  const noun = kind === 'drill' ? 'Drill' : 'Progression'
  const table = kind === 'drill' ? 'exercises' : 'progressions'
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [folderMenu, setFolderMenu] = useState<Folder | null>(null)
  const [itemMenu, setItemMenu] = useState<TreeItem | null>(null)
  const [moving, setMoving] = useState<{ type: 'folder'; f: Folder } | { type: 'item'; it: TreeItem } | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  // Folder name + color form (new folder, new subfolder, or edit)
  const [form, setForm] = useState<{ id: number | null; parent: number | null; name: string; color: string } | null>(null)
  const sb = () => createClient()

  const mine = useMemo(() => folders.filter((f) => f.kind === kind), [folders, kind])
  const kids = (pid: number | null) => mine.filter((f) => f.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const active = items.filter((x) => x.is_active)
  const countIn = (id: number) => {
    const ids = subtree(mine, id)
    return active.filter((x) => x.folder_id != null && ids.has(x.folder_id)).length
  }
  // A folder's own color, else its parent's, else an automatic one for top-level folders
  const colorKey = (f: Folder): string => {
    let cur: Folder | undefined = f
    for (let g = 0; cur && g < 20; g++) {
      if (cur.color) return cur.color
      if (cur.parent_id == null) break
      cur = mine.find((x) => x.id === cur!.parent_id)
    }
    const i = kids(null).findIndex((x) => x.id === (cur || f).id)
    return AUTO[(i < 0 ? 7 : i) % AUTO.length]
  }
  const topColor = (f: Folder) => (FOLDER_COLORS.find((c) => c.key === colorKey(f)) || FOLDER_COLORS[9]).text
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const expand = (id: number | null) => {
    if (id == null) return
    setOpen((s) => {
      const n = new Set(s)
      let cur: Folder | undefined = mine.find((f) => f.id === id)
      for (let g = 0; cur && g < 20; g++) (n.add(cur.id), (cur = mine.find((f) => f.id === cur!.parent_id)))
      return n
    })
  }

  // ----- Folder actions -----
  const newFolder = (parent: number | null) => {
    const p = parent != null ? mine.find((f) => f.id === parent) : null
    setForm({ id: null, parent, name: '', color: p ? colorKey(p) : AUTO[kids(null).length % AUTO.length] })
  }
  const renameFolder = (f: Folder) => setForm({ id: f.id, parent: f.parent_id, name: f.name, color: colorKey(f) })
  const saveForm = async () => {
    if (!form || !form.name.trim()) return
    const name = form.name.trim()
    if (form.id == null) {
      const { data, error } = await sb().from('library_folders').insert({ kind, parent_id: form.parent, name, color: form.color, sort_order: kids(form.parent).length }).select('id').single()
      if (error) return window.alert(error.message)
      expand(form.parent)
      if (data) setOpen((s) => new Set([...s, (data as { id: number }).id]))
    } else {
      const { error } = await sb().from('library_folders').update({ name, color: form.color }).eq('id', form.id)
      if (error) return window.alert(error.message)
    }
    setForm(null)
    onFoldersChanged()
  }
  const deleteFolder = async (f: Folder) => {
    if (!window.confirm(`Delete "${f.name}"? Its ${noun.toLowerCase()}s and subfolders move up one level. Nothing else is deleted.`)) return
    await sb().from('library_folders').update({ parent_id: f.parent_id }).eq('parent_id', f.id)
    await sb().from(table).update({ folder_id: f.parent_id }).eq('folder_id', f.id)
    await sb().from('library_folders').delete().eq('id', f.id)
    onFoldersChanged()
    onItemsChanged()
  }
  // ----- Item actions -----
  const moveItemTo = async (id: number, folderId: number | null) => {
    await sb().from(table).update({ folder_id: folderId }).eq('id', id)
    expand(folderId)
    onItemsChanged()
  }
  const setItemActive = async (it: TreeItem, on: boolean) => {
    await sb().from(table).update({ is_active: on }).eq('id', it.id)
    onItemsChanged()
  }
  const pickMove = async (dest: number | null) => {
    if (!moving) return
    if (moving.type === 'folder') {
      await sb().from('library_folders').update({ parent_id: dest }).eq('id', moving.f.id)
      expand(dest)
      onFoldersChanged()
    } else await moveItemTo(moving.it.id, dest)
    setMoving(null)
  }

  const q = query.trim().toLowerCase()
  const itemRow = (it: TreeItem, depth: number, showPath = false) => (
    <div
      key={`i${it.id}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(it.id))}
      className={`flex items-center gap-2 pr-1 hover:bg-slate-50 ${it.is_active ? '' : 'opacity-60'}`}
      style={{ paddingLeft: 12 + depth * 18 }}
    >
      <button type="button" onClick={() => onOpen(it.id, false)} className="flex-1 min-w-0 flex items-center gap-2.5 py-1.5 text-left cursor-pointer">
        {kind === 'drill' ? (
          <PlayCircle className={`w-5 h-5 shrink-0 ${it.video ? 'text-[#1746b8]' : 'text-slate-200'}`} aria-label={it.video ? 'Has video' : 'No video'} />
        ) : (
          <Layers className="w-5 h-5 shrink-0 text-[#1746b8]" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{it.name}</div>
          <div className="text-[11px] font-semibold text-slate-400 truncate">{[showPath ? folderPath(folders, it.folder_id) || 'Unfiled' : null, it.sub].filter(Boolean).join(' · ')}</div>
        </div>
      </button>
      <button type="button" onClick={() => setItemMenu(it)} aria-label={`${it.name} options`} className="w-9 h-9 shrink-0 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer text-lg font-black leading-none">
        ⋯
      </button>
    </div>
  )
  const folderRow = (f: Folder, depth: number): React.ReactNode => {
    const isOpen = open.has(f.id)
    const inside = active.filter((x) => x.folder_id === f.id)
    return (
      <div key={`f${f.id}`}>
        <div
          onDragOver={(e) => (e.preventDefault(), setOverId(f.id))}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => {
            setOverId(null)
            const id = Number(e.dataTransfer.getData('text/plain'))
            if (id) moveItemTo(id, f.id)
          }}
          className={`flex items-center gap-1 pr-1 ${overId === f.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
          style={{ paddingLeft: 4 + depth * 18 }}
        >
          <button type="button" onClick={() => toggle(f.id)} className="flex-1 min-w-0 flex items-center gap-2 py-2.5 text-left cursor-pointer">
            {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
            <FolderIcon className={`w-5 h-5 shrink-0 ${topColor(f)}`} />
            <span className="min-w-0 truncate text-sm font-extrabold text-slate-900">
              {f.name} <span className="font-bold text-slate-400">({countIn(f.id)})</span>
            </span>
          </button>
          <button type="button" onClick={() => setFolderMenu(f)} aria-label={`${f.name} options`} className="w-9 h-9 shrink-0 rounded-full text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer text-lg font-black leading-none">
            ⋮
          </button>
        </div>
        {isOpen && (
          <div className="border-l border-slate-100" style={{ marginLeft: 14 + depth * 18 }}>
            {kids(f.id).map((c) => folderRow(c, 0))}
            {inside.map((it) => itemRow(it, 0))}
            {kids(f.id).length === 0 && inside.length === 0 && <p className="px-3 py-2 text-xs font-semibold text-slate-400">Empty folder</p>}
          </div>
        )}
      </div>
    )
  }

  // Folder picker for Move (a folder can't go inside itself)
  const blocked = moving?.type === 'folder' ? subtree(mine, moving.f.id) : new Set<number>()
  const pickRow = (f: Folder, depth: number): React.ReactNode =>
    blocked.has(f.id) ? null : (
      <div key={`p${f.id}`}>
        <button type="button" onClick={() => pickMove(f.id)} className="w-full flex items-center gap-2 py-2 pr-3 text-left text-sm font-bold text-slate-800 hover:bg-white cursor-pointer" style={{ paddingLeft: 12 + depth * 16 }}>
          <FolderIcon className={`w-4 h-4 shrink-0 ${topColor(f)}`} /> <span className="truncate">{f.name}</span>
        </button>
        {kids(f.id).map((c) => pickRow(c, depth + 1))}
      </div>
    )

  const unfiled = active.filter((x) => x.folder_id == null)
  const archivedList = items.filter((x) => !x.is_active)
  const results = q ? (archived ? archivedList : active).filter((x) => x.name.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q)) : []

  const iconBtn = (on = false) => `w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center cursor-pointer ${on ? 'bg-[#1746b8] border-[#1746b8] text-white' : 'bg-white border-slate-200 text-slate-600'}`
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${noun}s`} className={`${inputClass} pl-9`} />
        </div>
        <button type="button" onClick={() => setArchived((a) => !a)} aria-label="Archived" title="Archived" className={iconBtn(archived)}>
          <Archive className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => newFolder(null)} aria-label="New Folder" title="New Folder" className={iconBtn()}>
          <FolderPlus className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => onNew(null)} aria-label={`New ${noun}`} title={`New ${noun}`} className="w-11 h-11 shrink-0 rounded-xl bg-[#1746b8] text-white flex items-center justify-center cursor-pointer">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {archived && (
        <div className="flex items-center justify-between px-1 text-xs font-extrabold text-slate-500">
          <span>Archived {noun}s · {archivedList.length}</span>
          <button type="button" onClick={() => setArchived(false)} className="text-[#1746b8] cursor-pointer">Done</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {q ? (
          <>
            {results.slice(0, 300).map((it) => itemRow(it, 0, true))}
            {results.length === 0 && <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500">No matches.</p>}
          </>
        ) : archived ? (
          <>
            {archivedList.map((it) => itemRow(it, 0, true))}
            {archivedList.length === 0 && <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500">Nothing archived.</p>}
          </>
        ) : (
          <>
            {kids(null).map((f) => folderRow(f, 0))}
            {unfiled.length > 0 && (
              <div>
                <div className="px-3 pt-3 pb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50">
                  <Inbox className="w-3.5 h-3.5" /> Unfiled
                </div>
                {unfiled.map((it) => itemRow(it, 0))}
              </div>
            )}
            {kids(null).length === 0 && unfiled.length === 0 && <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500">No {noun.toLowerCase()}s yet.</p>}
          </>
        )}
      </div>

      {folderMenu && (
        <ActionSheet
          title={folderMenu.name}
          onClose={() => setFolderMenu(null)}
          actions={[
            { label: `Add ${noun}`, icon: Plus, onClick: () => (expand(folderMenu.id), onNew(folderMenu.id)) },
            { label: 'New Subfolder', icon: FolderPlus, onClick: () => newFolder(folderMenu.id) },
            { label: 'Edit Folder', icon: Pencil, onClick: () => renameFolder(folderMenu) },
            { label: 'Move Folder', icon: Move, onClick: () => setMoving({ type: 'folder', f: folderMenu }) },
            { label: 'Delete Folder', icon: Trash2, danger: true, onClick: () => deleteFolder(folderMenu) },
          ]}
        />
      )}
      {itemMenu && (
        <ActionSheet
          title={itemMenu.name}
          onClose={() => setItemMenu(null)}
          actions={[
            { label: 'Edit', icon: Pencil, onClick: () => onOpen(itemMenu.id, true) },
            { label: 'Move to Folder', icon: FolderInput, onClick: () => setMoving({ type: 'item', it: itemMenu }) },
            itemMenu.is_active
              ? { label: 'Archive', icon: Archive, onClick: () => setItemActive(itemMenu, false) }
              : { label: 'Restore', icon: ArchiveRestore, onClick: () => setItemActive(itemMenu, true) },
          ]}
        />
      )}
      {form && (
        <ActionSheet title={form.id == null ? (form.parent != null ? 'New Subfolder' : 'New Folder') : 'Edit Folder'} onClose={() => setForm(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveForm()
            }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <FolderIcon className={`w-7 h-7 shrink-0 ${(FOLDER_COLORS.find((c) => c.key === form.color) || FOLDER_COLORS[9]).text}`} />
              <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Folder name" className={inputClass} />
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Color</div>
              <div className="grid grid-cols-5 gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setForm({ ...form, color: c.key })}
                    aria-label={c.label}
                    aria-pressed={form.color === c.key}
                    className={`h-10 rounded-xl ${c.bg} cursor-pointer ring-offset-2 ${form.color === c.key ? 'ring-2 ring-slate-900' : ''}`}
                  />
                ))}
              </div>
            </div>
            <button type="submit" disabled={!form.name.trim()} className="w-full py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-40 cursor-pointer">
              {form.id == null ? 'Create Folder' : 'Save'}
            </button>
          </form>
        </ActionSheet>
      )}
      {moving && (
        <ActionSheet title={`Move “${moving.type === 'folder' ? moving.f.name : moving.it.name}” to…`} onClose={() => setMoving(null)}>
          <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden py-1">
            <button type="button" onClick={() => pickMove(null)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-extrabold text-slate-800 hover:bg-white cursor-pointer">
              <Inbox className="w-4 h-4 text-slate-400" /> {moving.type === 'folder' ? 'Top Level' : 'Unfiled'}
            </button>
            {kids(null).map((f) => pickRow(f, 0))}
          </div>
        </ActionSheet>
      )}
    </div>
  )
}
