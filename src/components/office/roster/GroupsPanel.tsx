'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, MessageSquare, Plus, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import { GROUP_CATEGORIES, type Group, type GroupCategory, type Profile } from '@/lib/training'
import { Avatar, CAT_STYLE, catOf, type Member } from './shared'

export default function GroupsPanel({ people, groups, members, onChanged }: { people: Profile[]; groups: Group[]; members: Member[]; onChanged: () => void }) {
  const [open, setOpen] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [cat, setCat] = useState<GroupCategory>('Custom')
  const [chat, setChat] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<Member[]>(members)
  const [query, setQuery] = useState('')
  useEffect(() => setLocal(members), [members])

  const create = async () => {
    const n = name.trim()
    if (!n) return
    const { error: e } = await createClient().from('team_groups').insert({ name: n, category: cat, has_chat: chat, sort_order: groups.length + 1 })
    if (e) return setError(e.message.includes('duplicate') ? 'A group with that name already exists.' : e.message)
    setName('')
    setError(null)
    onChanged()
  }

  const patch = async (g: Group, fields: Partial<Group>) => {
    const { error: e } = await createClient().from('team_groups').update(fields).eq('id', g.id)
    if (e) return setError(e.message)
    onChanged()
  }

  const rename = (g: Group) => {
    const n = window.prompt('Rename group', g.name)?.trim()
    if (n && n !== g.name) patch(g, { name: n })
  }

  const remove = async (g: Group) => {
    if (!window.confirm(`Delete "${g.name}"? Its workouts and its chat channel (with all messages) are deleted too. People stay on the roster.`)) return
    const { error: e } = await createClient().from('team_groups').delete().eq('id', g.id)
    if (e) return setError(e.message)
    onChanged()
  }

  const toggle = async (g: Group, id: string, on: boolean) => {
    const supabase = createClient()
    setLocal((l) => (on ? l.filter((m) => !(m.group_id === g.id && m.athlete_id === id)) : [...l, { group_id: g.id, athlete_id: id }]))
    const { error: e } = on
      ? await supabase.from('group_members').delete().eq('group_id', g.id).eq('athlete_id', id)
      : await supabase.from('group_members').insert({ group_id: g.id, athlete_id: id })
    if (e) setError(e.message)
  }

  const active = people.filter((p) => p.is_active && !p.is_demo)
  const roster = [...active.filter((p) => p.role === 'coach'), ...active.filter((p) => p.role === 'player').sort((a, b) => (a.grad_year || 0) - (b.grad_year || 0) || a.full_name.localeCompare(b.full_name))]

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2">
        <div className="text-sm font-extrabold text-slate-900">New group or tag</div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto_auto] gap-2 items-center">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Travel, Bullpen Crew" className={inputClass} />
          <select value={cat} onChange={(e) => setCat(e.target.value as GroupCategory)} className={inputClass}>
            {GROUP_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-600 cursor-pointer px-1">
            <input type="checkbox" checked={chat} onChange={(e) => setChat(e.target.checked)} className="w-4 h-4 accent-[#1746b8]" /> Chat channel
          </label>
          <button type="button" onClick={create} className="px-4 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-1 cursor-pointer">
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      </section>

      {GROUP_CATEGORIES.map((c) => {
        const list = groups.filter((g) => catOf(g) === c.key)
        if (!list.length) return null
        return (
          <div key={c.key}>
            <div className="flex items-baseline gap-2 mb-2 px-1">
              <h3 className="text-sm font-extrabold text-slate-900">{c.label}</h3>
              <span className="text-[11px] font-semibold text-slate-400">{c.hint}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
              {list.map((g) => {
                const ids = new Set(local.filter((m) => m.group_id === g.id).map((m) => m.athlete_id))
                const isOpen = open === g.id
                const shown = roster.filter((p) => !query || p.full_name.toLowerCase().includes(query.toLowerCase()))
                return (
                  <section key={g.id} className={`bg-white rounded-3xl border border-slate-200 overflow-hidden ${isOpen ? 'lg:col-span-2 xl:col-span-3' : ''}`}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : g.id)} className="w-full flex items-center gap-3 p-4 cursor-pointer">
                      <span className={`w-2.5 h-10 rounded-full border ${CAT_STYLE[catOf(g)]}`} />
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-base font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                          {g.name} {g.has_chat && <MessageSquare className="w-3.5 h-3.5 text-[#1746b8]" aria-label="Chat channel" />}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">
                          {[...ids].filter((id) => people.find((p) => p.id === id)?.role === 'player').length} players · {[...ids].filter((id) => people.find((p) => p.id === id)?.role === 'coach').length} coaches
                        </div>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <select value={catOf(g)} onChange={(e) => patch(g, { category: e.target.value as GroupCategory })} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white">
                            {GROUP_CATEGORIES.map((x) => (
                              <option key={x.key} value={x.key}>{x.label}</option>
                            ))}
                          </select>
                          <button type="button" onClick={() => patch(g, { has_chat: !g.has_chat })} className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${g.has_chat ? 'bg-blue-50 text-[#1746b8]' : 'bg-slate-100 text-slate-600'}`}>
                            <MessageSquare className="w-3.5 h-3.5" /> {g.has_chat ? 'Chat channel on' : 'Turn on chat channel'}
                          </button>
                          <button type="button" onClick={() => rename(g)} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700 cursor-pointer">Rename</button>
                          <button type="button" onClick={() => remove(g)} className="px-3 py-2 rounded-xl bg-red-50 text-xs font-extrabold text-red-700 flex items-center gap-1 cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find someone" className={`${inputClass} pl-9`} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 max-h-96 overflow-y-auto rounded-2xl border border-slate-200 p-2">
                          {shown.map((p) => {
                            const on = ids.has(p.id)
                            return (
                              <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 cursor-pointer rounded-lg hover:bg-slate-50">
                                <input type="checkbox" checked={on} onChange={() => toggle(g, p.id, on)} className="w-4 h-4 accent-[#1746b8]" />
                                <Avatar person={p} size="sm" />
                                <span className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</span>
                                {p.grad_year && <span className="text-[10px] font-bold text-slate-400 ml-auto">’{String(p.grad_year).slice(2)}</span>}
                              </label>
                            )
                          })}
                        </div>
                        <button type="button" onClick={onChanged} className="text-[11px] font-extrabold text-[#1746b8] cursor-pointer">Refresh counts</button>
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
