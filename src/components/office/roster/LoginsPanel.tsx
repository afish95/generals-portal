'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { inputClass, SectionLabel } from '@/components/ui'
import { callApi } from '@/lib/api'
import type { Profile } from '@/lib/training'

/** Roster → Logins: create sign-ins for everyone who doesn't have one, in one go. The coach types the passwords. */
export default function LoginsPanel({ people, onChanged }: { people: Profile[]; onChanged: () => void }) {
  const todo = people.filter((p) => p.is_active && !p.is_demo && p.has_login === false)
  const [picked, setPicked] = useState<Set<string>>(new Set(todo.map((p) => p.id)))
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(todo.map((p) => [p.id, p.username])))
  const [playerPw, setPlayerPw] = useState('')
  const [coachPw, setCoachPw] = useState('')
  const [coachSame, setCoachSame] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; username: string }[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const rows = (role: 'player' | 'coach') => todo.filter((p) => p.role === role)
  const pickedOf = (role: 'player' | 'coach') => rows(role).filter((p) => picked.has(p.id))
  const needPlayer = pickedOf('player').length > 0
  const needCoach = pickedOf('coach').length > 0 && !coachSame
  const ok = picked.size > 0 && (!needPlayer || playerPw.length >= 6) && (!needCoach || coachPw.length >= 6)

  const run = async () => {
    if (!ok) return
    const list = todo.filter((p) => picked.has(p.id))
    const made: { name: string; username: string }[] = []
    const errs: string[] = []
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      setBusy(`Creating ${i + 1} of ${list.length}…`)
      const username = (names[p.id] || p.username).trim()
      const password = p.role === 'coach' ? (coachSame ? username : coachPw) : playerPw
      const res = await callApi<{ username: string }>('/api/players', { body: { action: 'create_login', id: p.id, username, password } })
      if (res.ok) made.push({ name: p.full_name, username: res.data.username })
      else errs.push(`${p.full_name}: ${res.error}`)
    }
    setBusy(null)
    setDone(made)
    setErrors(errs)
    onChanged()
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (done.length || errors.length) {
    return (
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Logins Created · {done.length}</SectionLabel>
        <p className="text-xs text-slate-500">They sign in with their username and the password you set.</p>
        {errors.length > 0 && (
          <div className="rounded-2xl bg-red-50 p-3 space-y-1">
            {errors.map((e) => (
              <p key={e} className="text-xs font-bold text-red-700">{e}</p>
            ))}
          </div>
        )}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
          {done.map((d) => (
            <div key={d.username} className="py-1.5 flex justify-between text-sm">
              <span className="font-semibold text-slate-800">{d.name}</span>
              <span className="font-mono text-slate-500">{d.username}</span>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (todo.length === 0) return <section className="bg-white rounded-3xl border border-slate-200 p-5 text-sm text-slate-500">Everyone has a login.</section>

  const List = ({ role }: { role: 'player' | 'coach' }) => {
    const r = rows(role)
    if (!r.length) return null
    const all = r.every((p) => picked.has(p.id))
    return (
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
        <div className="flex items-center">
          <SectionLabel>{role === 'player' ? 'Players' : 'Coaches'} · {pickedOf(role).length}/{r.length}</SectionLabel>
          <button
            type="button"
            onClick={() => setPicked((s) => { const n = new Set(s); r.forEach((p) => (all ? n.delete(p.id) : n.add(p.id))); return n })}
            className="ml-auto text-xs font-extrabold text-[#1746b8] cursor-pointer"
          >
            {all ? 'Select None' : 'Select All'}
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {r.map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-1.5">
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#1746b8]" />
              <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{p.full_name}</span>
              <input
                value={names[p.id] || ''}
                onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') }))}
                className="w-40 px-2 py-1 rounded-lg border border-slate-200 text-xs font-mono text-slate-700"
              />
            </label>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <List role="player" />
      <List role="coach" />
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Passwords</SectionLabel>
        {needPlayer && (
          <label className="block text-[11px] font-bold text-slate-500">
            Player Password
            <input value={playerPw} onChange={(e) => setPlayerPw(e.target.value)} autoComplete="off" className={inputClass} />
          </label>
        )}
        {pickedOf('coach').length > 0 && (
          <>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={coachSame} onChange={(e) => setCoachSame(e.target.checked)} className="w-4 h-4 accent-[#1746b8]" />
              Coach password is their username
            </label>
            {!coachSame && (
              <label className="block text-[11px] font-bold text-slate-500">
                Coach Password
                <input value={coachPw} onChange={(e) => setCoachPw(e.target.value)} autoComplete="off" className={inputClass} />
              </label>
            )}
          </>
        )}
        <p className="text-[11px] text-slate-400">At least 6 characters. Anyone can change it later with Reset Password on their roster card.</p>
        <button type="button" onClick={run} disabled={!ok || !!busy} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer">
          <KeyRound className="w-4 h-4" /> {busy || `Create ${picked.size} Login${picked.size === 1 ? '' : 's'}`}
        </button>
      </section>
    </div>
  )
}
