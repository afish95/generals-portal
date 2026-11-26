'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Pencil, Plus, RotateCcw, Search, Send, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import { GROUP_CATEGORIES, type Group, type GroupCategory, type Profile } from '@/lib/training'
import { POSITION_LABEL, TagChip, catOf, type Member } from './shared'

type Board = { id: number; name: string; group_ids: (number | string)[]; draft: Record<string, string[]>; sort_order: number }
const POOL = 'pool'

/**
 * Sandbox: drag players between groups (teams, travel rosters…) without touching the real roster.
 * Nothing changes for players until the coach presses Publish; then the groups, and their chat channels, update.
 */
export default function SandboxPanel({ people, groups, members, onChanged }: { people: Profile[]; groups: Group[]; members: Member[]; onChanged: () => void }) {
  const [boards, setBoards] = useState<Board[] | null>(null)
  const [boardId, setBoardId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [picked, setPicked] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [poolFilter, setPoolFilter] = useState<number[]>([])
  const [editing, setEditing] = useState<Board | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('roster_sandboxes')
      .select('*')
      .order('sort_order')
      .order('id')
      .then(({ data }) => {
        if (cancelled) return
        const list = (data as Board[]) || []
        setBoards(list)
        setBoardId((cur) => (cur && list.some((b) => b.id === cur) ? cur : list[0]?.id ?? null))
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const board = boards?.find((b) => b.id === boardId) || null
  useEffect(() => {
    setDraft(board?.draft || {})
    setPicked(null)
  }, [board])

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const players = useMemo(() => people.filter((p) => p.is_active && !p.is_demo), [people])
  const playerIds = useMemo(() => new Set(players.map((p) => p.id)), [players])
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const tagsOf = useMemo(() => {
    const m = new Map<string, Group[]>()
    members.forEach((x) => {
      const g = groupById.get(x.group_id)
      if (!g) return
      if (!m.has(x.athlete_id)) m.set(x.athlete_id, [])
      m.get(x.athlete_id)!.push(g)
    })
    return m
  }, [members, groupById])

  const cols = (board?.group_ids || []).map(Number).filter((id) => groupById.has(id))
  const live = (gid: number) => members.filter((m) => m.group_id === gid && playerIds.has(m.athlete_id)).map((m) => m.athlete_id)
  const working = (gid: number) => (draft[String(gid)] ?? live(gid)).filter((id) => playerIds.has(id))
  const liveCol = (id: string) => cols.find((g) => live(g).includes(id))
  const workCol = (id: string) => cols.find((g) => working(g).includes(id))

  const changes = cols.reduce((n, g) => {
    const a = new Set(live(g))
    const b = new Set(working(g))
    return n + [...b].filter((x) => !a.has(x)).length + [...a].filter((x) => !b.has(x)).length
  }, 0)
  const moved = new Set(players.filter((p) => liveCol(p.id) !== workCol(p.id)).map((p) => p.id))

  const persist = (next: Record<string, string[]>) => {
    setDraft(next)
    if (!board) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const id = board.id
    saveTimer.current = setTimeout(() => {
      createClient().from('roster_sandboxes').update({ draft: next, updated_at: new Date().toISOString() }).eq('id', id).then(({ error: e }) => e && setError(e.message))
      setBoards((bs) => bs?.map((b) => (b.id === id ? { ...b, draft: next } : b)) ?? bs)
    }, 500)
  }

  const move = (id: string, to: string) => {
    const next: Record<string, string[]> = {}
    cols.forEach((g) => {
      const list = working(g).filter((x) => x !== id)
      if (String(g) === to) list.push(id)
      next[String(g)] = list
    })
    persist(next)
    setPicked(null)
  }

  const publish = async () => {
    if (!board || !changes) return
    if (!window.confirm(`Publish ${changes} change${changes === 1 ? '' : 's'} to ${cols.map((g) => groupById.get(g)?.name).join(', ')}? Their chat channels update right away.`)) return
    setBusy(true)
    setError(null)
    const payload: Record<string, string[]> = {}
    cols.forEach((g) => (payload[String(g)] = working(g)))
    const { error: e } = await createClient().rpc('publish_sandbox', { p_members: payload })
    if (e) {
      setBusy(false)
      return setError(e.message)
    }
    await createClient().from('roster_sandboxes').update({ draft: {}, updated_at: new Date().toISOString() }).eq('id', board.id)
    setBusy(false)
    setNotice('Published. Groups and chats are updated.')
    setTimeout(() => setNotice(null), 3000)
    setReload((n) => n + 1)
    onChanged()
  }

  const discard = async () => {
    if (!board || !window.confirm('Throw away your sandbox changes and go back to the live roster?')) return
    persist({})
  }

  const pool = players.filter((p) => {
    if (workCol(p.id) !== undefined) return false
    if (query && !p.full_name.toLowerCase().includes(query.toLowerCase())) return false
    const mine = new Set((tagsOf.get(p.id) || []).map((g) => g.id))
    return poolFilter.every((f) => mine.has(f))
  })
  const sortPlayers = (ids: string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((p): p is Profile => !!p)
      .sort((a, b) => (a.grad_year || 0) - (b.grad_year || 0) || a.full_name.localeCompare(b.full_name))

  const card = (p: Profile) => {
    const from = liveCol(p.id)
    const hint = moved.has(p.id) ? (from ? `was ${groupById.get(from)?.name}` : 'new') : null
    const chips = (tagsOf.get(p.id) || []).filter((g) => !cols.includes(g.id) && (catOf(g) === 'Team' || catOf(g) === 'Status'))
    return (
      <button
        key={p.id}
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', p.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => setPicked(picked === p.id ? null : p.id)}
        className={`w-full text-left px-3 py-2 rounded-xl border bg-white cursor-grab active:cursor-grabbing ${
          picked === p.id ? 'border-[#1746b8] ring-2 ring-[#1746b8]/30' : moved.has(p.id) ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-slate-900 truncate flex-1">{p.full_name}</span>
          <span className="text-[10px] font-bold text-slate-400 shrink-0">{p.grad_year ? `’${String(p.grad_year).slice(2)}` : ''} {POSITION_LABEL[p.position_group || ''] || ''}</span>
        </div>
        {(chips.length > 0 || hint) && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {chips.map((g) => (
              <TagChip key={g.id} group={g} small />
            ))}
            {hint && <span className="text-[10px] font-extrabold text-amber-700">{hint}</span>}
          </div>
        )}
      </button>
    )
  }

  const column = (key: string, title: React.ReactNode, ids: string[], footer?: React.ReactNode) => (
    <div
      key={key}
      onDragOver={(e) => {
        e.preventDefault()
        setOverCol(key)
      }}
      onDragLeave={() => setOverCol((c) => (c === key ? null : c))}
      onDrop={(e) => {
        e.preventDefault()
        setOverCol(null)
        const id = e.dataTransfer.getData('text/plain')
        if (id) move(id, key)
      }}
      className={`rounded-3xl border-2 p-3 flex flex-col min-h-[220px] transition ${overCol === key ? 'border-[#1746b8] bg-blue-50/60' : key === POOL ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="min-w-0">{title}</div>
        <span className="text-xs font-extrabold text-slate-500 shrink-0">{ids.length}</span>
      </div>
      {picked && workCol(picked) !== (key === POOL ? undefined : Number(key)) && (
        <button type="button" onClick={() => move(picked, key)} className="mb-2 py-2 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold cursor-pointer">
          Move {byId.get(picked)?.full_name.split(' ')[0]} here
        </button>
      )}
      {footer}
      <div className="space-y-1.5 flex-1">{sortPlayers(ids).map(card)}</div>
    </div>
  )

  if (boards === null) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {boards.map((b) => {
          const pending = Object.keys(b.draft || {}).length > 0
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBoardId(b.id)}
              className={`px-3.5 py-2 rounded-full text-xs font-extrabold cursor-pointer flex items-center gap-1.5 ${b.id === boardId ? 'bg-[#1746b8] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {b.name}
              {pending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label="Unpublished Changes" />}
            </button>
          )
        })}
        <button type="button" onClick={() => setEditing('new')} className="px-3 py-2 rounded-full text-xs font-extrabold text-[#1746b8] bg-blue-50 flex items-center gap-1 cursor-pointer">
          <Plus className="w-3.5 h-3.5" /> New Board
        </button>
      </div>

      <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-2.5 text-[11px] font-semibold text-[#113694]">
        Sandbox: drag players between columns (or tap a player, then <b>Move Here</b>). Nothing changes for players until you press <b>Publish</b>. Then the groups and their chats update.
      </div>

      {board && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-slate-900 mr-1">{board.name}</h3>
            <button type="button" onClick={() => setEditing(board)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 cursor-pointer" aria-label="Edit Board">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              {changes > 0 && <span className="text-xs font-extrabold text-amber-700">{changes} unpublished change{changes === 1 ? '' : 's'}</span>}
              <button type="button" onClick={discard} disabled={!changes} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-600 flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
              <button type="button" onClick={publish} disabled={!changes || busy} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer">
                <Send className="w-3.5 h-3.5" /> {busy ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>
          {notice && <p className="text-xs font-extrabold text-emerald-700">{notice}</p>}
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}

          {cols.length === 0 ? (
            <p className="text-sm font-semibold text-slate-500 py-6 text-center">This board has no groups yet. Tap the pencil to add some.</p>
          ) : (
            <div className="grid gap-3 items-start" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))` }}>
              {cols.map((g) => {
                const grp = groupById.get(g)!
                return column(
                  String(g),
                  <div className="text-sm font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                    {grp.name} {grp.has_chat && <MessageSquare className="w-3.5 h-3.5 text-[#1746b8]" aria-label="Chat Channel" />}
                  </div>,
                  working(g)
                )
              })}
              {column(
                POOL,
                <div className="text-sm font-extrabold text-slate-600">Not on This Board</div>,
                pool.map((p) => p.id),
                <div className="space-y-1.5 mb-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 text-sm bg-white" />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {groups
                      .filter((g) => !cols.includes(g.id) && ['Team', 'Status', 'Position'].includes(catOf(g)))
                      .map((g) => (
                        <TagChip key={g.id} group={g} small active={poolFilter.includes(g.id)} onClick={() => setPoolFilter((f) => (f.includes(g.id) ? f.filter((x) => x !== g.id) : [...f, g.id]))} />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <BoardEditor
          board={editing === 'new' ? null : editing}
          groups={groups}
          count={boards.length}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null)
            if (id) setBoardId(id)
            setReload((n) => n + 1)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function BoardEditor({ board, groups, count, onClose, onSaved }: { board: Board | null; groups: Group[]; count: number; onClose: () => void; onSaved: (id: number | null) => void }) {
  const [name, setName] = useState(board?.name || '')
  const [ids, setIds] = useState<number[]>((board?.group_ids || []).map(Number))
  const [newGroup, setNewGroup] = useState('')
  const [newCat, setNewCat] = useState<GroupCategory>('Trip')
  const [newChat, setNewChat] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const addGroup = async () => {
    const n = newGroup.trim()
    if (!n) return
    const { data, error: e } = await createClient().from('team_groups').insert({ name: n, category: newCat, has_chat: newChat, sort_order: 50 + groups.length }).select('id').single()
    if (e || !data) return setError(e?.message.includes('duplicate') ? 'A group with that name already exists.' : e?.message || 'Could not create group')
    groups.push({ id: data.id, name: n, color: 'blue', sort_order: 50, category: newCat, has_chat: newChat })
    setIds((x) => [...x, data.id])
    setNewGroup('')
  }

  const save = async () => {
    if (!name.trim()) return setError('Give the board a name.')
    const supabase = createClient()
    if (board) {
      const { error: e } = await supabase.from('roster_sandboxes').update({ name: name.trim(), group_ids: ids }).eq('id', board.id)
      if (e) return setError(e.message)
      onSaved(board.id)
    } else {
      const { data, error: e } = await supabase.from('roster_sandboxes').insert({ name: name.trim(), group_ids: ids, sort_order: count + 1 }).select('id').single()
      if (e || !data) return setError(e?.message || 'Could not save')
      onSaved(data.id)
    }
  }

  const remove = async () => {
    if (!board || !window.confirm(`Delete the "${board.name}" board? Groups and their members stay as they are.`)) return
    await createClient().from('roster_sandboxes').delete().eq('id', board.id)
    onSaved(null)
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0b1f55]/40 flex items-end sm:items-center justify-center p-0 sm:p-6 lg:left-[220px]" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-base font-extrabold text-slate-900">{board ? 'Edit Board' : 'New Sandbox Board'}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Board name (e.g. Summer travel)" className={inputClass} />
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Columns (Groups on This Board)</div>
          {GROUP_CATEGORIES.map((c) => {
            const list = groups.filter((g) => catOf(g) === c.key && !g.name.startsWith('Demo'))
            if (!list.length) return null
            return (
              <div key={c.key} className="flex flex-wrap gap-1.5 mb-1.5">
                {list.map((g) => (
                  <TagChip key={g.id} group={g} active={ids.includes(g.id)} onClick={() => setIds((x) => (x.includes(g.id) ? x.filter((y) => y !== g.id) : [...x, g.id]))} />
                ))}
              </div>
            )
          })}
        </div>
        <div className="rounded-2xl border border-slate-200 p-3 space-y-2">
          <div className="text-xs font-extrabold text-slate-700">Or make a new group for it</div>
          <div className="flex gap-2">
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Tournament Roster" className={inputClass} />
            <select value={newCat} onChange={(e) => setNewCat(e.target.value as GroupCategory)} className="px-2 rounded-xl border border-slate-200 text-xs font-bold bg-white">
              {GROUP_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={newChat} onChange={(e) => setNewChat(e.target.checked)} className="accent-[#1746b8]" /> Give it a chat channel
            </label>
            <button type="button" onClick={addGroup} className="px-3 py-1.5 rounded-xl bg-blue-50 text-[#1746b8] text-xs font-extrabold cursor-pointer">Add Group</button>
          </div>
        </div>
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        <div className="flex gap-2">
          {board && (
            <button type="button" onClick={remove} className="px-3 py-2.5 rounded-xl bg-red-50 text-red-700 text-xs font-extrabold flex items-center gap-1 cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" /> Delete Board
            </button>
          )}
          <button type="button" onClick={save} className="flex-1 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold cursor-pointer">Save Board</button>
        </div>
      </div>
    </div>
  )
}
