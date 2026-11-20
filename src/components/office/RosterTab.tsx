'use client'

import { useState } from 'react'
import { KeyRound, Plus, Trash2, UserX, UserCheck } from 'lucide-react'
import { callApi } from '@/lib/api'
import { inputClass } from '@/components/ui'
import type { Group, Profile } from '@/lib/training'

const POSITIONS = [
  { key: 'pitcher', label: 'Pitcher' },
  { key: 'catcher', label: 'Catcher' },
  { key: 'infield', label: 'Infield' },
  { key: 'outfield', label: 'Outfield' },
  { key: 'two_way', label: 'Two-way' },
]

const suggestUsername = (name: string) => {
  const parts = name.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return parts.length === 1 ? parts[0] : `${parts[0][0]}${parts[parts.length - 1]}`
}

export default function RosterTab({ players, groups, onChanged }: { players: Profile[]; groups: Group[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ full_name: '', username: '', position_group: 'pitcher', grad_year: '', group_ids: [] as number[] })
  const [usernameTouched, setUsernameTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credential, setCredential] = useState<{ name: string; username: string; password: string } | null>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    const res = await callApi<{ username: string; password: string }>('/api/players', {
      body: { action: 'create', ...form, grad_year: Number(form.grad_year) || null },
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setCredential({ name: form.full_name, username: res.data.username, password: res.data.password })
    setForm({ full_name: '', username: '', position_group: 'pitcher', grad_year: '', group_ids: [] })
    setUsernameTouched(false)
    setAdding(false)
    onChanged()
  }

  const resetPassword = async (p: Profile) => {
    if (!window.confirm(`Reset ${p.full_name}'s password? Their old password stops working.`)) return
    const res = await callApi<{ password: string }>('/api/players', { body: { action: 'reset_password', id: p.id } })
    if (!res.ok) return setError(res.error)
    setCredential({ name: p.full_name, username: p.username, password: res.data.password })
  }

  const setActive = async (p: Profile, is_active: boolean) => {
    const res = await callApi('/api/players', { body: { action: 'set_active', id: p.id, is_active } })
    if (!res.ok) return setError(res.error)
    onChanged()
  }

  const remove = async (p: Profile) => {
    if (!window.confirm(`Permanently delete ${p.full_name}? Their login and every set, PR and check-in they've logged will be erased. To keep their history, deactivate instead.`)) return
    const res = await callApi(`/api/players?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' })
    if (!res.ok) return setError(res.error)
    onChanged()
  }

  return (
    <div className="space-y-3">
      {credential && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 space-y-1">
          <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Login for {credential.name}</div>
          <div className="text-sm font-bold text-emerald-900">Username: {credential.username}</div>
          <div className="text-sm font-bold text-emerald-900">Temporary password: {credential.password}</div>
          <p className="text-[11px] font-semibold text-emerald-800">Write this down or send it to them now. It won’t be shown again.</p>
          <button type="button" onClick={() => setCredential(null)} className="text-xs font-extrabold text-emerald-700 underline cursor-pointer">Done</button>
        </section>
      )}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer">
          <Plus className="w-4 h-4" /> Add player
        </button>
      ) : (
        <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2">
          <input
            value={form.full_name}
            onChange={(e) => {
              const full_name = e.target.value
              setForm((f) => ({ ...f, full_name, username: usernameTouched ? f.username : suggestUsername(full_name) }))
            }}
            placeholder="Full name"
            className={inputClass}
          />
          <input
            value={form.username}
            onChange={(e) => {
              setUsernameTouched(true)
              setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') })
            }}
            placeholder="Username"
            autoCapitalize="none"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.position_group} onChange={(e) => setForm({ ...form, position_group: e.target.value })} className={inputClass}>
              {POSITIONS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <input inputMode="numeric" value={form.grad_year} onChange={(e) => setForm({ ...form, grad_year: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="Grad year" className={inputClass} />
          </div>
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const on = form.group_ids.includes(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setForm({ ...form, group_ids: on ? form.group_ids.filter((x) => x !== g.id) : [...form.group_ids, g.id] })}
                    className={`px-3 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${on ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {g.name}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setAdding(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-sm font-extrabold text-slate-600 cursor-pointer">Cancel</button>
            <button type="button" onClick={create} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
              {busy ? 'Creating…' : 'Create login'}
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100">
        {players.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.is_active ? '' : 'opacity-50'}`}>
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1746b8] text-sm font-extrabold flex items-center justify-center shrink-0">
              {p.full_name.split(' ').map((s) => s[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-extrabold text-slate-900 truncate">
                {p.full_name} {p.is_demo && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">DEMO</span>}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                @{p.username} · {p.position_group}{p.grad_year ? ` · ’${String(p.grad_year).slice(2)}` : ''}
              </div>
            </div>
            <div className="flex gap-1">
              <RowBtn label="Reset password" onClick={() => resetPassword(p)}><KeyRound className="w-4 h-4" /></RowBtn>
              {p.is_active ? (
                <RowBtn label="Deactivate" onClick={() => setActive(p, false)}><UserX className="w-4 h-4" /></RowBtn>
              ) : (
                <RowBtn label="Reactivate" onClick={() => setActive(p, true)}><UserCheck className="w-4 h-4" /></RowBtn>
              )}
              <RowBtn label="Delete permanently" onClick={() => remove(p)}><Trash2 className="w-4 h-4" /></RowBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RowBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer">
      {children}
    </button>
  )
}
