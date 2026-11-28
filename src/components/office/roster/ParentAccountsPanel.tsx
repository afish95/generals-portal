'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Mail, MessageCircle, Search, ShieldOff, ShieldCheck, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { callApi } from '@/lib/api'
import { inputSm, SectionLabel } from '@/components/ui'
import type { Profile } from '@/lib/training'

type Parent = { id: string; full_name: string; username: string; contact_email: string | null; is_active: boolean; created_at?: string }
type Link = { guardian_id: string; player_id: string; relationship: string | null }

/** Roster → Parents: every parent account, what they sign in with, who they follow, and access controls. */
export default function ParentAccountsPanel({ players }: { players: Profile[] }) {
  const router = useRouter()
  const [parents, setParents] = useState<Parent[] | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [note, setNote] = useState<{ id: string; text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    const sb = createClient()
    Promise.all([
      sb.from('profiles').select('id, full_name, username, contact_email, is_active').eq('role', 'parent').order('full_name'),
      sb.from('player_guardians').select('guardian_id, player_id, relationship'),
    ]).then(([p, l]) => {
      setParents((p.data as Parent[]) || [])
      setLinks((l.data as Link[]) || [])
    })
  }, [])
  useEffect(load, [load])

  const playerName = (id: string) => players.find((p) => p.id === id)?.full_name || 'Player'
  const kidsOf = (id: string) => links.filter((l) => l.guardian_id === id)
  const say = (id: string, text: string, bad = false) => setNote({ id, text, bad })

  const act = async (p: Parent, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    say(p.id, r.ok ? okText : r.error || 'Something went wrong', !r.ok)
    load()
  }
  const setPassword = (p: Parent) =>
    act(p, async () => {
      const r = await callApi('/api/players', { body: { action: 'reset_password', id: p.id, password: pw } })
      if (r.ok) setPw('')
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    }, 'Password set. Their old password no longer works.')
  const sendReset = (p: Parent) =>
    act(p, async () => {
      if (!p.contact_email) return { ok: false, error: 'No email on file' }
      const { error } = await createClient().auth.resetPasswordForEmail(p.contact_email, { redirectTo: `${window.location.origin}/reset` })
      return error ? { ok: false, error: error.message } : { ok: true }
    }, `Reset email sent to ${p.contact_email}.`)
  const toggleAccess = (p: Parent) =>
    act(p, async () => {
      const r = await callApi('/api/players', { body: { action: 'set_active', id: p.id, is_active: !p.is_active } })
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    }, p.is_active ? 'Access turned off. They can’t sign in.' : 'Access turned back on.')
  const unlink = (p: Parent, playerId: string) => {
    if (!confirm(`Disconnect ${p.full_name} from ${playerName(playerId)}?${kidsOf(p.id).length === 1 ? ' This is their only player, so their account will be deleted.' : ''}`)) return
    act(p, async () => {
      const r = await callApi('/api/players', { body: { action: 'remove_parent', id: p.id, player_id: playerId } })
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    }, 'Disconnected.')
  }
  const remove = (p: Parent) => {
    if (!confirm(`Delete ${p.full_name}’s parent account? This can’t be undone. They can rejoin with a new invite link.`)) return
    act(p, async () => {
      const r = await callApi(`/api/players?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' })
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    }, 'Account deleted.')
  }
  const message = async (p: Parent) => {
    const { data } = await createClient().rpc('get_or_create_direct', { p_other: p.id })
    if (data) router.push(`/messages?c=${data}`)
  }

  if (!parents) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
  const shown = parents.filter((p) => {
    const t = q.trim().toLowerCase()
    if (!t) return true
    return [p.full_name, p.contact_email || '', ...kidsOf(p.id).map((l) => playerName(l.player_id))].some((s) => s.toLowerCase().includes(t))
  })
  const connected = new Set(links.map((l) => l.player_id))
  const activePlayers = players.filter((p) => p.is_active && !p.is_demo)

  return (
    <div className="space-y-3">
      <section className="bg-white rounded-3xl border border-slate-200 p-4 grid grid-cols-3 text-center">
        <div><div className="text-xl font-extrabold text-slate-900">{parents.length}</div><div className="text-[10px] font-bold text-slate-500 uppercase">Parents</div></div>
        <div><div className="text-xl font-extrabold text-slate-900">{activePlayers.filter((p) => connected.has(p.id)).length}</div><div className="text-[10px] font-bold text-slate-500 uppercase">Players Covered</div></div>
        <div><div className="text-xl font-extrabold text-slate-900">{activePlayers.filter((p) => !connected.has(p.id)).length}</div><div className="text-[10px] font-bold text-slate-500 uppercase">No Parent Yet</div></div>
      </section>
      <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2">
        <div className="flex items-center">
          <SectionLabel>Parent Accounts</SectionLabel>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parent, email or player" className={`${inputSm} pl-9`} />
        </div>
        {shown.length === 0 && <p className="text-xs text-slate-500 py-2">{parents.length ? 'No matches.' : 'No parents yet. Send invite links from a player’s roster card.'}</p>}
        <div className="divide-y divide-slate-100">
          {shown.map((p) => {
            const kids = kidsOf(p.id)
            const isOpen = open === p.id
            return (
              <div key={p.id} className="py-2">
                <button type="button" onClick={() => { setOpen(isOpen ? null : p.id); setPw(''); setNote(null) }} className="w-full flex items-center gap-2 text-left cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold text-slate-900 truncate">
                      {p.full_name}
                      {!p.is_active && <span className="ml-1.5 text-[10px] font-extrabold uppercase text-red-600">Access Off</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {kids.map((l) => `${l.relationship || 'Parent'} of ${playerName(l.player_id)}`).join(' · ') || 'No players'}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 truncate max-w-[45%]">{p.contact_email}</span>
                </button>
                {isOpen && (
                  <div className="mt-2 rounded-2xl bg-slate-50 p-3 space-y-2.5">
                    <div className="text-[11px] text-slate-600">
                      Signs in with <b className="font-mono">{p.contact_email}</b> and the password they chose.
                    </div>
                    <div className="space-y-1">
                      {kids.map((l) => (
                        <div key={l.player_id} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 font-bold text-slate-700">{playerName(l.player_id)}</span>
                          <button type="button" onClick={() => unlink(p, l.player_id)} disabled={busy} className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-extrabold text-slate-600 flex items-center gap-1 cursor-pointer">
                            <X className="w-3 h-3" /> Disconnect
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="off" autoCapitalize="none" className={inputSm} aria-label="New password" />
                      <button type="button" onClick={() => setPassword(p)} disabled={busy || pw.length < 8} className="px-3 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold whitespace-nowrap flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                        <KeyRound className="w-3.5 h-3.5" /> Set Password
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => sendReset(p)} disabled={busy} className="py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-extrabold text-slate-700 flex items-center justify-center gap-1 cursor-pointer"><Mail className="w-3.5 h-3.5" /> Email Reset Link</button>
                      <button type="button" onClick={() => message(p)} className="py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-extrabold text-slate-700 flex items-center justify-center gap-1 cursor-pointer"><MessageCircle className="w-3.5 h-3.5" /> Message</button>
                      <button type="button" onClick={() => toggleAccess(p)} disabled={busy} className={`py-2 rounded-xl border text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer ${p.is_active ? 'bg-white border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                        {p.is_active ? <><ShieldOff className="w-3.5 h-3.5" /> Turn Off Access</> : <><ShieldCheck className="w-3.5 h-3.5" /> Turn On Access</>}
                      </button>
                      <button type="button" onClick={() => remove(p)} disabled={busy} className="py-2 rounded-xl bg-white border border-red-200 text-[11px] font-extrabold text-red-600 flex items-center justify-center gap-1 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /> Delete Account</button>
                    </div>
                    {note?.id === p.id && <p className={`text-xs font-bold ${note.bad ? 'text-red-600' : 'text-emerald-700'}`}>{note.text}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-400">Passwords are private: you can set a new one or email a reset link, but no one can see the current one.</p>
      </section>
    </div>
  )
}
