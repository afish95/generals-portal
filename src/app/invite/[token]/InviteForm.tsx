'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Info = { player_first: string; team: string; spots_left: number; valid: boolean }
const field = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white'

export default function InviteForm() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [info, setInfo] = useState<Info | null | 'missing'>(null)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('Mother')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    createClient()
      .rpc('parent_invite_info', { p_token: token })
      .then(({ data }) => setInfo(((data as Info[]) || [])[0] || 'missing'))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await fetch('/api/parent-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name, email, password, relationship }),
    })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(out.error || 'Something went wrong. Try again.')
      if (res.status === 409 && /already has an account/.test(out.error || '')) setMode('existing')
      setBusy(false)
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    const { error: se } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (se) {
      router.replace('/login')
      return
    }
    router.replace('/')
  }

  const first = info && info !== 'missing' ? info.player_first : ''
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-10">
      <div className="max-w-md w-full mx-auto">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png?v=3" alt="Generals Baseball" className="inline-block w-20 h-20 rounded-3xl shadow-lg shadow-blue-700/25 mb-3" />
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{first ? `Join as ${first}’s Parent` : 'Parent Invite'}</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Follow the schedule, game stats and progress, and message coaches.</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {info === null ? (
            <div className="py-8 flex justify-center"><div className="w-8 h-8 rounded-full border-4 border-blue-200 border-t-[#1746b8] animate-spin" /></div>
          ) : info === 'missing' || !info.valid ? (
            <div className="text-center space-y-2 py-4">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <div className="text-sm font-extrabold text-slate-900">{info !== 'missing' && info.spots_left === 0 ? 'Both Parent Spots Are Taken' : 'This Link Has Expired'}</div>
              <p className="text-xs text-slate-500">
                {info !== 'missing' && info.spots_left === 0 ? 'Each player can connect 2 parents. A coach can remove one if needed.' : 'Ask your player or a coach to send a new invite link.'}
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100">
                {(['new', 'existing'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={`py-2 rounded-lg text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
                    {m === 'new' ? 'New Account' : 'I Have an Account'}
                  </button>
                ))}
              </div>
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
              )}
              {mode === 'new' && (
                <>
                  <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" className={field} />
                  <div className="grid grid-cols-3 gap-1.5">
                    {['Mother', 'Father', 'Guardian'].map((r) => (
                      <button key={r} type="button" onClick={() => setRelationship(r)} className={`py-2 rounded-xl text-xs font-extrabold border cursor-pointer ${relationship === r ? 'bg-[#1746b8] text-white border-[#1746b8]' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoComplete="email" className={field} />
              <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'new' ? 'Create a password (8+ characters)' : 'Your password'} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} className={field} />
              <button type="submit" disabled={busy} className="w-full py-3 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-bold rounded-xl cursor-pointer">
                {busy ? 'Joining…' : mode === 'new' ? 'Create Account' : `Add ${first}`}
              </button>
              <p className="text-[11px] text-slate-400 text-center">You’ll sign in with this email and password.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
