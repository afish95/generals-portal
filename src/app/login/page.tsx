'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Lock, User, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const cleanUser = username.trim().toLowerCase()
    const email = cleanUser.includes('@') ? cleanUser : `${cleanUser}@generalsbaseball.org`

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !data.user) {
      setError('Invalid username or password. Check with Coach Fisher.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_active, role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile || !profile.is_active) {
      await supabase.auth.signOut()
      setError('This account is inactive.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  // Parents sign in with their own email, so they can reset by email. Players and coaches ask a coach.
  const forgot = async () => {
    setError(null)
    const e = username.trim().toLowerCase()
    if (!e.includes('@')) {
      setNotice('Players and coaches: ask Coach Fisher to reset your password. Parents: type your email above, then tap Forgot Password.')
      return
    }
    await supabase.auth.resetPasswordForEmail(e, { redirectTo: `${window.location.origin}/reset` })
    setNotice(`If ${e} has a parent account, a reset link is on its way.`)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="max-w-md w-full mx-auto">
        <div className="text-center mb-8">
          <img src="/icons/icon-512.png?v=3" alt="Generals Baseball" className="inline-block w-24 h-24 rounded-3xl shadow-lg shadow-blue-700/25 mb-4" />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            GENERALS BASEBALL
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Player &amp; Coaching Performance Portal
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Username or Email
              </label>
              <div className="relative">
                <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="first.last, or your email (parents)"
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-bold rounded-xl shadow-sm transition cursor-pointer"
            >
              {loading ? 'Signing In...' : 'Enter Portal'}
            </button>
            <button type="button" onClick={forgot} className="w-full text-xs font-bold text-blue-700 cursor-pointer">
              Forgot Password?
            </button>
            {notice && <p className="text-xs text-slate-500 text-center">{notice}</p>}
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          portal.generalsbaseball.org &bull; Players, Parents &amp; Staff
        </p>
      </div>
    </div>
  )
}
