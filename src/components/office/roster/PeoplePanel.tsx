'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, Search, X } from 'lucide-react'
import { callApi } from '@/lib/api'
import { inputClass } from '@/components/ui'
import { GROUP_CATEGORIES, type Group, type Profile } from '@/lib/training'
import { Avatar, NoLoginBadge, POSITION_LABEL, TagChip, catOf, type Member } from './shared'
import PersonSheet from './PersonSheet'

const usernameFor = (name: string, role: 'player' | 'coach') => {
  const parts = name.trim().toLowerCase().replace(/[^a-z\s-]/g, '').replace(/-/g, '').split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (role === 'coach') return `coach.${parts[parts.length - 1]}`
  return parts.length === 1 ? parts[0] : `${parts[0]}.${parts.slice(1).join('')}`
}

export default function PeoplePanel({
  role,
  people,
  groups,
  members,
  onChanged,
}: {
  role: 'player' | 'coach'
  people: Profile[]
  groups: Group[]
  members: Member[]
  onChanged: () => void
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<number[]>([])
  const [noLoginOnly, setNoLoginOnly] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGrad, setNewGrad] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const tagsOf = useMemo(() => {
    const m = new Map<string, Group[]>()
    members.forEach((x) => {
      const g = groupById.get(x.group_id)
      if (!g) return
      if (!m.has(x.athlete_id)) m.set(x.athlete_id, [])
      m.get(x.athlete_id)!.push(g)
    })
    m.forEach((list) => list.sort((a, b) => GROUP_CATEGORIES.findIndex((c) => c.key === catOf(a)) - GROUP_CATEGORIES.findIndex((c) => c.key === catOf(b)) || a.sort_order - b.sort_order))
    return m
  }, [members, groupById])

  const filterGroups = groups.filter((g) => !g.name.startsWith('Demo') && ['Team', 'Trip', 'Position', 'Status', 'Custom'].includes(catOf(g)))

  const list = people.filter((p) => {
    if (!showDemo && p.is_demo) return false
    if (!showInactive && !p.is_active) return false
    if (noLoginOnly && p.has_login !== false) return false
    if (query && !p.full_name.toLowerCase().includes(query.toLowerCase())) return false
    const mine = new Set((tagsOf.get(p.id) || []).map((g) => g.id))
    return filters.every((f) => mine.has(f))
  })
  const sorted = [...list].sort((a, b) => (role === 'player' ? (a.grad_year || 9999) - (b.grad_year || 9999) : 0) || a.full_name.localeCompare(b.full_name))
  const noLogin = people.filter((p) => p.has_login === false && !p.is_demo).length
  const open = people.find((p) => p.id === openId) || null

  const add = async () => {
    const full_name = (role === 'coach' && !/^coach\s/i.test(newName.trim()) ? `Coach ${newName.trim()}` : newName.trim())
    if (!newName.trim()) return
    setBusy(true)
    setError(null)
    const res = await callApi<{ id: string }>('/api/players', {
      body: {
        action: 'create',
        with_login: false,
        role,
        full_name,
        username: usernameFor(full_name, role),
        position_group: role === 'coach' ? 'coach' : 'two_way',
        grad_year: Number(newGrad) || null,
        group_ids: filters,
      },
    })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setNewName('')
    setNewGrad('')
    setAdding(false)
    setOpenId(res.data.id)
    onChanged()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${role === 'coach' ? 'coaches' : 'players'}`} className={`${inputClass} pl-9`} />
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)} className="px-4 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer">
          <Plus className="w-4 h-4" /> Add {role === 'coach' ? 'coach' : 'player'}
        </button>
      </div>

      {adding && (
        <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={role === 'coach' ? 'Last name (e.g. Kabza)' : 'Full name'} className={inputClass} />
            {role === 'player' && (
              <input value={newGrad} inputMode="numeric" onChange={(e) => setNewGrad(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Class" className={inputClass} />
            )}
            <button type="button" onClick={add} disabled={busy} className="px-4 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
              {busy ? 'Adding…' : 'Add to Roster'}
            </button>
          </div>
          <p className="text-[11px] font-semibold text-slate-500">
            Adds them without a login. {filters.length > 0 && 'They’ll get the tags you have filtered on. '}You can create a login later.
          </p>
        </section>
      )}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-1.5 items-center">
        {filterGroups.map((g) => (
          <TagChip key={g.id} group={g} small active={filters.includes(g.id)} onClick={() => setFilters((f) => (f.includes(g.id) ? f.filter((x) => x !== g.id) : [...f, g.id]))} />
        ))}
        {filters.length > 0 && (
          <button type="button" onClick={() => setFilters([])} className="text-[11px] font-extrabold text-slate-500 flex items-center gap-0.5 cursor-pointer">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={noLoginOnly} onChange={(e) => setNoLoginOnly(e.target.checked)} className="accent-[#1746b8]" /> No login yet ({noLogin})
        </label>
        {role === 'player' && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showDemo} onChange={(e) => setShowDemo(e.target.checked)} className="accent-[#1746b8]" /> Show Demo Players
          </label>
        )}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-[#1746b8]" /> Show Inactive
        </label>
        <span className="ml-auto">{sorted.length} shown</span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden lg:grid lg:grid-cols-2 lg:divide-y-0 lg:gap-px lg:bg-slate-100">
        {sorted.map((p) => (
          <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className={`w-full flex items-start gap-3 px-4 py-3 text-left bg-white cursor-pointer hover:bg-slate-50 ${p.is_active ? '' : 'opacity-50'}`}>
            <Avatar person={p} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-extrabold text-slate-900 truncate flex items-center gap-1.5">
                {p.full_name}
                {p.has_login === false && <NoLoginBadge />}
                {p.is_demo && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">DEMO</span>}
                {p.roster_note && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-label={p.roster_note} />}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                {[p.grad_year ? `Class of ${p.grad_year}` : null, role === 'player' ? POSITION_LABEL[p.position_group || ''] : null].filter(Boolean).join(' · ') || '@' + p.username}
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(tagsOf.get(p.id) || [])
                  .filter((g) => catOf(g) !== 'Workout' || !g.name.startsWith('Demo'))
                  .map((g) => (
                    <TagChip key={g.id} group={g} small />
                  ))}
              </div>
            </div>
          </button>
        ))}
        {sorted.length === 0 && <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500 bg-white">No one matches.</p>}
      </div>

      {open && <PersonSheet person={open} groups={groups} members={members} onClose={() => setOpenId(null)} onChanged={onChanged} />}
    </div>
  )
}
