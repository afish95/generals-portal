'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'

/** Where the "reset your password" email lands. The parent picks a new password here. */
export default function ResetPage() {
  const router = useRouter()
  const [ready, setReady] = useState<'wait' | 'ok' | 'bad'>('wait')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const code = new URLSearchParams(window.location.search).get('code')
    const go = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) return setReady('bad')
      }
      const { data } = await supabase.auth.getUser()
      setReady(data.user ? 'ok' : 'bad')
    }
    go()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    router.replace('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 py-12">
      <div className="max-w-md w-full mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h1 className="text-lg font-extrabold text-slate-900">Choose a New Password</h1>
        {ready === 'wait' && <p className="text-sm text-slate-500">Checking your link…</p>}
        {ready === 'bad' && <p className="text-sm text-slate-600">This reset link has expired. Go back to sign in and tap Forgot Password again.</p>}
        {ready === 'ok' && (
          <form onSubmit={save} className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}
            <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl" />
            <button type="submit" disabled={busy} className="w-full py-3 bg-blue-700 text-white font-bold rounded-xl cursor-pointer disabled:bg-blue-400">
              {busy ? 'Saving…' : 'Save Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
