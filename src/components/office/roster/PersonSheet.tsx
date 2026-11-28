'use client'

import { useState } from 'react'
import { AlertTriangle, BarChart3, KeyRound, Target, Trash2, UserCheck, UserX } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { callApi } from '@/lib/api'
import { inputClass, SectionLabel } from '@/components/ui'
import AthleteSheet from '@/components/coach/AthleteSheet'
import PlayerPhoto from '@/components/PlayerPhoto'
import { GROUP_CATEGORIES, type Group, type Profile } from '@/lib/training'
import ParentsPanel from './ParentsPanel'
import { NoLoginBadge, SheetFrame, TagChip, catOf, type Member } from './shared'

const SIZES = ['', 'XS', 'S', 'M', 'L', 'XL', 'XXL']
const POSITIONS = [
  { key: 'pitcher', label: 'PO (Pitcher Only)' },
  { key: 'two_way', label: '2-Way' },
  { key: 'hitter', label: 'Hitter' },
  { key: 'catcher', label: 'Catcher' },
  { key: 'infield', label: 'Infield' },
  { key: 'outfield', label: 'Outfield' },
]

export default function PersonSheet({
  person,
  groups,
  members,
  onClose,
  onChanged,
}: {
  person: Profile
  groups: Group[]
  members: Member[]
  onClose: () => void
  onChanged: () => void
}) {
  const isCoach = person.role === 'coach'
  const [form, setForm] = useState({
    full_name: person.full_name,
    grad_year: person.grad_year ? String(person.grad_year) : '',
    position_group: person.position_group || 'two_way',
    contact_email: person.contact_email || '',
    top_size: person.top_size || '',
    bottom_size: person.bottom_size || '',
    roster_note: person.roster_note || '',
  })
  const [mine, setMine] = useState<Set<number>>(() => new Set(members.filter((m) => m.athlete_id === person.id).map((m) => m.group_id)))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState(person.username)
  const [credential, setCredential] = useState<{ username: string; password: string } | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [stats, setStats] = useState(false)
  const [tagsChanged, setTagsChanged] = useState(false)

  const dirty =
    form.full_name !== person.full_name ||
    form.grad_year !== (person.grad_year ? String(person.grad_year) : '') ||
    form.position_group !== (person.position_group || 'two_way') ||
    form.contact_email !== (person.contact_email || '') ||
    form.top_size !== (person.top_size || '') ||
    form.bottom_size !== (person.bottom_size || '') ||
    form.roster_note !== (person.roster_note || '')

  const save = async () => {
    setSaving(true)
    setError(null)
    const res = await callApi('/api/players', {
      body: {
        action: 'update',
        id: person.id,
        full_name: form.full_name,
        grad_year: isCoach ? undefined : Number(form.grad_year) || null,
        position_group: isCoach ? undefined : form.position_group,
        contact_email: form.contact_email,
        top_size: form.top_size,
        bottom_size: form.bottom_size,
        roster_note: form.roster_note,
      },
    })
    setSaving(false)
    if (!res.ok) return setError(res.error)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    onChanged()
  }

  const toggleTag = async (g: Group) => {
    const on = mine.has(g.id)
    const next = new Set(mine)
    if (on) next.delete(g.id)
    else next.add(g.id)
    setMine(next)
    const supabase = createClient()
    const { error: e } = on
      ? await supabase.from('group_members').delete().eq('group_id', g.id).eq('athlete_id', person.id)
      : await supabase.from('group_members').insert({ group_id: g.id, athlete_id: person.id })
    if (e) {
      setError(e.message)
      setMine(mine)
      return
    }
    setTagsChanged(true)
  }

  const createLogin = async () => {
    setError(null)
    const res = await callApi<{ username: string; password: string }>('/api/players', { body: { action: 'create_login', id: person.id, username } })
    if (!res.ok) return setError(res.error)
    setCredential(res.data)
    onChanged()
  }

  const resetPassword = async () => {
    if (!window.confirm(`Reset ${person.full_name}'s password? Their old password stops working.`)) return
    const res = await callApi<{ password: string }>('/api/players', { body: { action: 'reset_password', id: person.id } })
    if (!res.ok) return setError(res.error)
    setCredential({ username: person.username, password: res.data.password })
  }

  const setPassword = async () => {
    setError(null)
    if (newPw.length < 6) return setError('Password needs at least 6 characters.')
    const res = await callApi('/api/players', { body: { action: 'reset_password', id: person.id, password: newPw } })
    if (!res.ok) return setError(res.error)
    setNewPw('')
    setPwSaved(true)
  }

  const setActive = async (is_active: boolean) => {
    const res = await callApi('/api/players', { body: { action: 'set_active', id: person.id, is_active } })
    if (!res.ok) return setError(res.error)
    onChanged()
    onClose()
  }

  const remove = async () => {
    if (!window.confirm(`Permanently delete ${person.full_name}? Everything they've logged is erased too. To keep their history, deactivate instead.`)) return
    const res = await callApi(`/api/players?id=${encodeURIComponent(person.id)}`, { method: 'DELETE' })
    if (!res.ok) return setError(res.error)
    onChanged()
    onClose()
  }

  const close = () => {
    if (tagsChanged) onChanged()
    onClose()
  }

  const usable = groups.filter((g) => !g.name.startsWith('Demo'))

  return (
    <SheetFrame title={person.full_name} subtitle={isCoach ? 'Coach' : person.grad_year ? `Class of ${person.grad_year}` : 'Player'} onClose={close}>
      {!isCoach && (
        <div className="flex items-center gap-3">
          <PlayerPhoto id={person.id} name={person.full_name} size={64} />
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-slate-900 truncate">{person.full_name}</div>
            <div className="text-xs font-semibold text-slate-500">{person.grad_year ? `Class of ${person.grad_year}` : 'Player'}</div>
          </div>
        </div>
      )}
      {person.roster_note && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {person.roster_note}
        </div>
      )}

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Tags & Groups</SectionLabel>
        <p className="text-[11px] font-semibold text-slate-500 -mt-1">Tap to add or remove. Groups with a chat bubble are message channels, so this also changes which chats they’re in.</p>
        {GROUP_CATEGORIES.map((c) => {
          const list = usable.filter((g) => catOf(g) === c.key)
          if (!list.length) return null
          return (
            <div key={c.key}>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">{c.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((g) => (
                  <TagChip key={g.id} group={g} active={mine.has(g.id)} onClick={() => toggleTag(g)} />
                ))}
              </div>
            </div>
          )
        })}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
        <SectionLabel>Details</SectionLabel>
        <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" className={inputClass} />
        {!isCoach && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-slate-500">
              Class
              <input inputMode="numeric" value={form.grad_year} onChange={(e) => setForm({ ...form, grad_year: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={inputClass} />
            </label>
            <label className="text-[11px] font-bold text-slate-500">
              Position
              <select value={form.position_group} onChange={(e) => setForm({ ...form, position_group: e.target.value })} className={inputClass}>
                {POSITIONS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label className="block text-[11px] font-bold text-slate-500">
          Contact Email
          <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['top_size', 'bottom_size'] as const).map((k) => (
            <label key={k} className="text-[11px] font-bold text-slate-500">
              {k === 'top_size' ? 'Top Size' : 'Bottom Size'}
              <select value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputClass}>
                {SIZES.map((s) => (
                  <option key={s} value={s}>{s || '—'}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="block text-[11px] font-bold text-slate-500">
          Coach note (only coaches see this)
          <input value={form.roster_note} onChange={(e) => setForm({ ...form, roster_note: e.target.value })} className={inputClass} />
        </label>
        <button type="button" onClick={save} disabled={!dirty || saving} className="w-full py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-40 cursor-pointer">
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save details'}
        </button>
      </section>

      {!isCoach && <ParentsPanel playerId={person.id} playerName={person.full_name} />}

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
        <SectionLabel>App Login</SectionLabel>
        {credential ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-1">
            <div className="text-sm font-bold text-emerald-900">Username: {credential.username}</div>
            <div className="text-sm font-bold text-emerald-900">Temporary password: {credential.password}</div>
            <p className="text-[11px] font-semibold text-emerald-800">Send this to them now. It won’t be shown again.</p>
          </div>
        ) : person.has_login === false ? (
          <>
            <p className="text-xs font-semibold text-slate-600 flex items-center gap-2">
              <NoLoginBadge /> On the roster, but can’t sign in yet.
            </p>
            <div className="flex gap-2">
              <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))} autoCapitalize="none" className={inputClass} aria-label="Username" />
              <button type="button" onClick={createLogin} className="px-4 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold whitespace-nowrap cursor-pointer">Create Login</button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">Signs in as <b>{person.username}</b></span>
              <button type="button" onClick={resetPassword} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-extrabold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                <KeyRound className="w-3.5 h-3.5" /> Random Password
              </button>
            </div>
            <div className="flex gap-2">
              <input value={newPw} onChange={(e) => { setNewPw(e.target.value); setPwSaved(false) }} placeholder="New password" autoComplete="off" autoCapitalize="none" className={inputClass} aria-label="New password" />
              <button type="button" onClick={setPassword} disabled={newPw.length < 6} className="px-4 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold whitespace-nowrap disabled:opacity-40 cursor-pointer">Set Password</button>
            </div>
            {pwSaved && <p className="text-xs font-extrabold text-emerald-700">Password updated. Their old password no longer works.</p>}
          </div>
        )}
      </section>

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {!isCoach && (
          <a href={`/office?tab=plans&player=${person.id}`} className="py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-[#1746b8] flex items-center justify-center gap-1.5">
            <Target className="w-4 h-4" /> Player Plan
          </a>
        )}
        {!isCoach && (
          <button type="button" onClick={() => setStats(true)} className="py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-[#1746b8] flex items-center justify-center gap-1.5 cursor-pointer">
            <BarChart3 className="w-4 h-4" /> Training & Flags
          </button>
        )}
        {person.is_active ? (
          <button type="button" onClick={() => setActive(false)} className="py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer">
            <UserX className="w-4 h-4" /> Deactivate
          </button>
        ) : (
          <button type="button" onClick={() => setActive(true)} className="py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer">
            <UserCheck className="w-4 h-4" /> Reactivate
          </button>
        )}
        <button type="button" onClick={remove} className="py-2.5 rounded-xl bg-red-50 text-xs font-extrabold text-red-700 flex items-center justify-center gap-1.5 cursor-pointer">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>

      {stats && <AthleteSheet athlete={person} onClose={() => setStats(false)} onChanged={onChanged} />}
    </SheetFrame>
  )
}
