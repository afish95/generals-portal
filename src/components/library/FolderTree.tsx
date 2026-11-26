'use client'

import { useState } from 'react'
import { ChevronRight, Folder as FolderIcon, FolderOpen, FolderPlus, Inbox, Layers, MoreHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { subtree, type Folder, type FolderKind } from '@/lib/library'

export type Place = number | 'all' | 'unfiled'

/** Nested folders: pick one, drop items on one, and add / rename / move / delete folders. */
export default function FolderTree({
  kind,
  folders,
  counts,
  place,
  onPlace,
  onDrop,
  onChanged,
}: {
  kind: FolderKind
  folders: Folder[]
  counts: Map<number | 'unfiled' | 'all', number>
  place: Place
  onPlace: (p: Place) => void
  onDrop: (folderId: number | null, itemId: number) => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [over, setOver] = useState<Place | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const mine = folders.filter((f) => f.kind === kind)
  const children = (pid: number | null) => mine.filter((f) => f.parent_id === pid).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  const total = (id: number) => [...subtree(mine, id)].reduce((n, f) => n + (counts.get(f) || 0), 0)

  const sb = () => createClient()
  const add = async (parent: number | null) => {
    const name = window.prompt(parent ? 'New subfolder name' : 'New folder name')?.trim()
    if (!name) return
    const { error } = await sb().from('library_folders').insert({ kind, parent_id: parent, name, sort_order: mine.length })
    if (error) return window.alert(error.message)
    if (parent) setOpen((s) => new Set([...s, parent]))
    onChanged()
  }
  const rename = async (f: Folder) => {
    const name = window.prompt('Rename Folder', f.name)?.trim()
    if (!name || name === f.name) return
    await sb().from('library_folders').update({ name }).eq('id', f.id)
    onChanged()
  }
  const move = async (f: Folder) => {
    const blocked = subtree(mine, f.id)
    const options = mine.filter((x) => !blocked.has(x.id))
    const list = ['0: Top level', ...options.map((x, i) => `${i + 1}: ${pathName(x)}`)].join('\n')
    const pick = window.prompt(`Move "${f.name}" into which folder? Type the number.\n\n${list}`)
    if (pick == null) return
    const n = Number(pick)
    if (!Number.isInteger(n) || n < 0 || n > options.length) return
    await sb().from('library_folders').update({ parent_id: n === 0 ? null : options[n - 1].id }).eq('id', f.id)
    onChanged()
  }
  const remove = async (f: Folder) => {
    if (!window.confirm(`Delete the folder "${f.name}"? Its ${kind === 'drill' ? 'drills' : 'progressions'} and subfolders move up one level. Nothing else is deleted.`)) return
    const table = kind === 'drill' ? 'exercises' : 'progressions'
    await sb().from('library_folders').update({ parent_id: f.parent_id }).eq('parent_id', f.id)
    await sb().from(table).update({ folder_id: f.parent_id }).eq('folder_id', f.id)
    await sb().from('library_folders').delete().eq('id', f.id)
    if (place === f.id) onPlace(f.parent_id ?? 'all')
    onChanged()
  }
  const pathName = (f: Folder) => {
    const parts = [f.name]
    let p = mine.find((x) => x.id === f.parent_id)
    while (p) {
      parts.unshift(p.name)
      p = mine.find((x) => x.id === p!.parent_id)
    }
    return parts.join(' / ')
  }

  const dropProps = (target: number | null, key: Place) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(key)
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(null)
      const id = Number(e.dataTransfer.getData('text/plain'))
      if (id) onDrop(target, id)
    },
  })

  const row = (f: Folder, depth: number): React.ReactNode => {
    const kids = children(f.id)
    const isOpen = open.has(f.id) || (typeof place === 'number' && subtree(mine, f.id).has(place) && place !== f.id)
    const active = place === f.id
    return (
      <div key={f.id}>
        <div
          {...dropProps(f.id, f.id)}
          className={`group flex items-center gap-1 rounded-xl pr-1 ${active ? 'bg-[#1746b8] text-white' : over === f.id ? 'bg-blue-100' : 'hover:bg-slate-100'}`}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            type="button"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            onClick={() => setOpen((s) => (s.has(f.id) ? new Set([...s].filter((x) => x !== f.id)) : new Set([...s, f.id])))}
            className={`w-5 h-7 flex items-center justify-center cursor-pointer ${kids.length ? '' : 'invisible'}`}
          >
            <ChevronRight className={`w-3.5 h-3.5 transition ${isOpen ? 'rotate-90' : ''}`} />
          </button>
          <button type="button" onClick={() => onPlace(f.id)} className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5 text-left cursor-pointer">
            {isOpen || active ? <FolderOpen className="w-4 h-4 shrink-0" /> : <FolderIcon className="w-4 h-4 shrink-0" />}
            <span className="text-sm font-bold truncate">{f.name}</span>
            <span className={`ml-auto text-[10px] font-extrabold ${active ? 'text-blue-100' : 'text-slate-400'}`}>{total(f.id)}</span>
          </button>
          <div className="relative">
            <button type="button" aria-label={`Folder options for ${f.name}`} onClick={() => setMenu(menu === f.id ? null : f.id)} className={`p-1 rounded-lg cursor-pointer ${active ? 'hover:bg-white/20' : 'opacity-60 hover:opacity-100 hover:bg-slate-200'}`}>
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menu === f.id && (
              <div className="absolute right-0 top-7 z-20 w-40 bg-white text-slate-700 rounded-xl border border-slate-200 shadow-lg py-1 text-xs font-bold" onMouseLeave={() => setMenu(null)}>
                {[
                  ['New Subfolder', () => add(f.id)],
                  ['Rename', () => rename(f)],
                  ['Move To…', () => move(f)],
                  ['Delete Folder', () => remove(f)],
                ].map(([l, fn]) => (
                  <button key={l as string} type="button" onClick={() => (setMenu(null), (fn as () => void)())} className={`w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer ${l === 'Delete Folder' ? 'text-red-600' : ''}`}>
                    {l as string}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {isOpen && kids.map((k) => row(k, depth + 1))}
      </div>
    )
  }

  const special = (key: 'all' | 'unfiled', label: string, Icon: typeof Layers) => (
    <button
      type="button"
      {...(key === 'unfiled' ? dropProps(null, 'unfiled') : {})}
      onClick={() => onPlace(key)}
      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-left cursor-pointer ${place === key ? 'bg-[#1746b8] text-white' : over === key ? 'bg-blue-100' : 'hover:bg-slate-100'}`}
    >
      <Icon className="w-4 h-4 shrink-0 ml-5" />
      <span className="text-sm font-bold">{label}</span>
      <span className={`ml-auto text-[10px] font-extrabold ${place === key ? 'text-blue-100' : 'text-slate-400'}`}>{counts.get(key) || 0}</span>
    </button>
  )

  return (
    <nav className="space-y-0.5" aria-label="Folders">
      {special('all', kind === 'drill' ? 'All Drills' : 'All Progressions', Layers)}
      {children(null).map((f) => row(f, 0))}
      {special('unfiled', 'Unfiled', Inbox)}
      <button type="button" onClick={() => add(null)} className="w-full flex items-center gap-1.5 px-2 py-2 mt-1 rounded-xl text-xs font-extrabold text-[#1746b8] hover:bg-blue-50 cursor-pointer">
        <FolderPlus className="w-4 h-4 ml-5" /> New Folder
      </button>
    </nav>
  )
}
