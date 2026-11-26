'use client'

import { useEffect, useState } from 'react'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { SheetFrame } from '@/components/office/roster/shared'
import OpponentBadge from '@/components/OpponentBadge'
import { refreshOpponents, uploadTeamLogo, type Opponent } from '@/lib/opponents'

/** Coach Office → Schedule → Opponents: names, short initials, team color and logo upload. */
export default function OpponentsSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Opponent[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    createClient()
      .from('opponents')
      .select('id, name, short, color, logo_url')
      .order('name')
      .then(({ data }) => setList((data as Opponent[]) || []))
  }, [version])

  const patch = async (o: Opponent, p: Partial<Opponent>) => {
    setList((l) => (l || []).map((x) => (x.id === o.id ? { ...x, ...p } : x)))
    const { error: e } = await createClient().from('opponents').update(p).eq('id', o.id)
    if (e) setError(e.message)
    refreshOpponents()
  }
  const upload = async (o: Opponent, file: File | undefined) => {
    if (!file) return
    setBusy(o.id)
    setError(null)
    try {
      const url = await uploadTeamLogo(o.id, file)
      setList((l) => (l || []).map((x) => (x.id === o.id ? { ...x, logo_url: url } : x)))
      refreshOpponents()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }
  const add = async () => {
    const name = newName.trim()
    if (!name) return
    const { error: e } = await createClient().from('opponents').insert({ name, short: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() })
    if (e) return setError(e.message.includes('duplicate') ? `${name} is already on the list.` : e.message)
    setNewName('')
    setVersion((n) => n + 1)
    refreshOpponents()
  }
  const remove = async (o: Opponent) => {
    if (!window.confirm(`Remove ${o.name}? Games stay on the schedule without a badge.`)) return
    await createClient().from('opponents').delete().eq('id', o.id)
    setVersion((n) => n + 1)
    refreshOpponents()
  }

  return (
    <SheetFrame title="Opponents" subtitle="Logos and colors show next to games everywhere" onClose={onClose}>
      <section className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {list === null ? (
          <div className="h-40 m-4 rounded-2xl bg-slate-50 animate-pulse" />
        ) : (
          list.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-4 py-3">
              <label className="relative cursor-pointer" title="Upload logo">
                <OpponentBadge opp={o} size={44} />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#1746b8] text-white flex items-center justify-center ring-2 ring-white">
                  <ImagePlus className="w-3 h-3" />
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(o, e.target.files?.[0])} />
              </label>
              <div className="flex-1 min-w-0 grid grid-cols-[1fr_4rem] gap-1.5">
                <input defaultValue={o.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== o.name && patch(o, { name: e.target.value.trim() })} className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-bold" />
                <input defaultValue={o.short || ''} maxLength={4} onBlur={(e) => e.target.value !== (o.short || '') && patch(o, { short: e.target.value.trim() || null })} placeholder="ABC" className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm font-black text-center uppercase" />
                <div className="col-span-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                  <input type="color" value={o.color} onChange={(e) => patch(o, { color: e.target.value })} className="w-7 h-7 rounded-md border border-slate-200 cursor-pointer" aria-label="Team color" />
                  {busy === o.id ? 'Uploading…' : o.logo_url ? (
                    <button type="button" onClick={() => patch(o, { logo_url: null })} className="font-extrabold text-red-600 cursor-pointer">Remove logo</button>
                  ) : (
                    'Tap the badge to add a logo'
                  )}
                </div>
              </div>
              <button type="button" onClick={() => remove(o)} aria-label={`Remove ${o.name}`} className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add an opponent (e.g. Central Catholic)" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
          <button type="button" onClick={add} className="w-9 h-9 rounded-xl bg-[#1746b8] text-white flex items-center justify-center cursor-pointer" aria-label="Add opponent">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </section>
      <p className="text-[11px] font-semibold text-slate-400 px-1">Square PNGs with a transparent or white background look best.</p>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </SheetFrame>
  )
}
