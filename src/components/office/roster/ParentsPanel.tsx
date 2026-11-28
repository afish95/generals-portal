'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, MessageCircle, RefreshCw, UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { callApi } from '@/lib/api'
import { SectionLabel } from '@/components/ui'
import { shareInvite } from '@/lib/parent'

type Parent = { guardian_id: string; relationship: string | null; parent: { full_name: string; contact_email: string | null } | null }

/** Roster card: a player's connected parents (max 2) and their invite link. */
export default function ParentsPanel({ playerId, playerName }: { playerId: string; playerName: string }) {
  const router = useRouter()
  const [parents, setParents] = useState<Parent[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const first = playerName.split(' ')[0]

  const load = useCallback(() => {
    createClient()
      .from('player_guardians')
      .select('guardian_id, relationship, parent:profiles!player_guardians_guardian_id_fkey(full_name, contact_email)')
      .eq('player_id', playerId)
      .then(({ data }) => setParents((data as unknown as Parent[]) || []))
  }, [playerId])
  useEffect(load, [load])

  const invite = async (fresh: boolean) => {
    const { data, error } = await createClient().rpc('parent_invite_link', { p_player: playerId, p_new: fresh })
    if (error || !data) return setNote(error?.message || 'Could not make a link')
    const r = await shareInvite(`${window.location.origin}/invite/${data}`, first)
    setNote(r === 'copied' ? 'Invite link copied. Good for 7 days.' : r === 'shared' ? 'Invite link shared.' : fresh ? 'New link ready. Old links no longer work.' : null)
  }
  const remove = async (p: Parent) => {
    if (!confirm(`Disconnect ${p.parent?.full_name || 'this parent'} from ${first}?`)) return
    const res = await callApi('/api/players', { body: { action: 'remove_parent', id: p.guardian_id, player_id: playerId } })
    if (!res.ok) setNote(res.error)
    load()
  }
  const message = async (p: Parent) => {
    const { data } = await createClient().rpc('get_or_create_direct', { p_other: p.guardian_id })
    if (data) router.push(`/messages?c=${data}`)
  }

  const full = (parents?.length || 0) >= 2
  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
      <SectionLabel>Parents</SectionLabel>
      {parents?.length === 0 && <p className="text-xs text-slate-500">No parents connected yet. Each player can connect 2.</p>}
      {parents?.map((p) => (
        <div key={p.guardian_id} className="flex items-center gap-2 py-1">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-slate-900 truncate">{p.parent?.full_name || 'Parent'} <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{p.relationship}</span></div>
            <div className="text-[11px] text-slate-500 truncate">{p.parent?.contact_email}</div>
          </div>
          <button type="button" onClick={() => message(p)} aria-label="Message" className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"><MessageCircle className="w-4 h-4" /></button>
          <button type="button" onClick={() => remove(p)} aria-label="Remove" className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center cursor-pointer"><UserMinus className="w-4 h-4" /></button>
        </div>
      ))}
      {!full && (
        <div className="flex gap-2">
          <button type="button" onClick={() => invite(false)} className="flex-1 py-2 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer">
            <Link2 className="w-3.5 h-3.5" /> Copy Parent Invite Link
          </button>
          <button type="button" onClick={() => invite(true)} aria-label="New Link" title="Make a new link (old ones stop working)" className="px-3 rounded-xl bg-slate-100 text-slate-600 cursor-pointer"><RefreshCw className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {note && <p className="text-xs font-bold text-emerald-700">{note}</p>}
    </section>
  )
}
