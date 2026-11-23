'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import type { Group, Profile } from '@/lib/training'

export default function GroupsTab({
  groups,
  players,
  onChanged,
}: {
  groups: Group[]
  players: Profile[]
  onChanged: () => void
}) {
  const [members, setMembers] = useState<{ group_id: number; athlete_id: string }[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('group_members')
      .select('group_id, athlete_id')
      .then(({ data }) => {
        if (!cancelled) setMembers(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [reload, groups])

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    const { error: e } = await createClient().from('team_groups').insert({ name, sort_order: groups.length + 1 })
    if (e) {
      setError(e.message.includes('duplicate') ? 'A group with that name already exists.' : e.message)
      return
    }
    setNewName('')
    setError(null)
    onChanged()
  }

  const toggle = async (groupId: number, athleteId: string, isMember: boolean) => {
    const supabase = createClient()
    const { error: e } = isMember
      ? await supabase.from('group_members').delete().eq('group_id', groupId).eq('athlete_id', athleteId)
      : await supabase.from('group_members').insert({ group_id: groupId, athlete_id: athleteId })
    if (e) setError(e.message)
    setReload((n) => n + 1)
  }

  const rename = async (g: Group) => {
    const name = window.prompt('Rename group', g.name)?.trim()
    if (!name || name === g.name) return
    const { error: e } = await createClient().from('team_groups').update({ name }).eq('id', g.id)
    if (e) setError(e.message)
    onChanged()
  }

  const remove = async (g: Group) => {
    if (!window.confirm(`Delete the "${g.name}" group? Its workouts will be permanently deleted too. Players stay on the roster.`)) return
    const { error: e } = await createClient().from('team_groups').delete().eq('id', g.id)
    if (e) setError(e.message)
    onChanged()
  }

  const activePlayers = players.filter((p) => p.is_active)

  return (
    <div className="space-y-3 lg:space-y-0 lg:columns-2 xl:columns-3 lg:gap-4 [&>*]:break-inside-avoid [&>*]:mb-4">
      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group (e.g. Varsity Pitchers)" className={inputClass} />
        <button type="button" onClick={create} className="px-4 rounded-xl bg-[#1746b8] text-white cursor-pointer" aria-label="Create group">
          <Plus className="w-5 h-5" />
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      {groups.map((g) => {
        const ids = new Set(members.filter((m) => m.group_id === g.id).map((m) => m.athlete_id))
        const isOpen = open === g.id
        return (
          <section key={g.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <button type="button" onClick={() => setOpen(isOpen ? null : g.id)} className="w-full flex items-center justify-between p-4 cursor-pointer">
              <div className="text-left">
                <div className="text-base font-extrabold text-slate-900">{g.name}</div>
                <div className="text-[11px] font-bold text-slate-500">{ids.size} athlete{ids.size === 1 ? '' : 's'}</div>
              </div>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-2">
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {activePlayers.map((p) => {
                    const on = ids.has(p.id)
                    return (
                      <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => toggle(g.id, p.id, on)} className="w-5 h-5 accent-[#1746b8]" />
                        <span className="text-sm font-semibold text-slate-800 flex-1">{p.full_name}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{p.position_group}</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => rename(g)} className="flex-1 py-2 rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700 cursor-pointer">Rename</button>
                  <button type="button" onClick={() => remove(g)} className="flex-1 py-2 rounded-xl bg-red-50 text-xs font-extrabold text-red-700 flex items-center justify-center gap-1 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /> Delete group
                  </button>
                </div>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
