'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputSm, SectionLabel } from '@/components/ui'
import type { Profile } from '@/lib/training'

type Row = { id: string; name: string; role: 'player' | 'coach' | 'parent'; signIn: string; active: boolean; hasLogin: boolean }
const ROLE_STYLE = { coach: 'bg-blue-50 text-[#1746b8]', player: 'bg-slate-100 text-slate-600', parent: 'bg-emerald-50 text-emerald-700' }

/** Roster → Logins: everyone who can sign in and what they type to do it. Passwords are never shown. */
export default function AllSignIns({ people }: { people: Profile[] }) {
  const [parents, setParents] = useState<{ id: string; full_name: string; contact_email: string | null; is_active: boolean }[]>([])
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | Row['role']>('all')
  useEffect(() => {
    createClient()
      .from('profiles')
      .select('id, full_name, contact_email, is_active')
      .eq('role', 'parent')
      .then(({ data }) => setParents((data as typeof parents) || []))
  }, [])

  const rows: Row[] = [
    ...people.filter((p) => !p.is_demo).map((p) => ({ id: p.id, name: p.full_name, role: p.role as Row['role'], signIn: p.username, active: p.is_active, hasLogin: p.has_login !== false })),
    ...parents.map((p) => ({ id: p.id, name: p.full_name, role: 'parent' as const, signIn: p.contact_email || '', active: p.is_active, hasLogin: true })),
  ].sort((a, b) => a.name.localeCompare(b.name))
  const t = q.trim().toLowerCase()
  const shown = rows.filter((r) => (role === 'all' || r.role === role) && (!t || r.name.toLowerCase().includes(t) || r.signIn.toLowerCase().includes(t)))

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2 mt-3">
      <SectionLabel>All Sign-Ins · {rows.filter((r) => r.hasLogin).length}</SectionLabel>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or username" className={`${inputSm} pl-9`} />
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(['all', 'player', 'coach', 'parent'] as const).map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)} className={`py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer ${role === r ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}>
            {r === 'all' ? 'All' : r === 'player' ? 'Players' : r === 'coach' ? 'Coaches' : 'Parents'}
          </button>
        ))}
      </div>
      <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
        {shown.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-1.5">
            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${ROLE_STYLE[r.role]}`}>{r.role}</span>
            <span className={`flex-1 min-w-0 truncate text-sm font-semibold ${r.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span>
            <span className="text-[11px] font-mono text-slate-500 truncate max-w-[50%]">{r.hasLogin ? r.signIn : 'No login yet'}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">Players and coaches sign in with their username; parents with their email. Reset passwords from a roster card or the Parents tab.</p>
    </section>
  )
}
