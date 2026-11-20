'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { House, MessageCircle, Calendar, Target, Activity, LayoutGrid, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/training'

type ShellContext = { profile: Profile; isCoach: boolean }
const ProfileContext = createContext<ShellContext | null>(null)

export function useProfile(): ShellContext {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside AppShell')
  return ctx
}

const PLAYER_TABS = [
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/training', label: 'Training', icon: Target },
  { href: '/stats', label: 'Stats', icon: Activity },
  { href: '/other', label: 'Other', icon: LayoutGrid },
]
const COACH_TABS = [
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/office', label: 'Coach Office', icon: Shield },
  { href: '/stats', label: 'Stats', icon: Activity },
  { href: '/other', label: 'Other', icon: LayoutGrid },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'inactive'>('loading')

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, username, full_name, role, position_group, grad_year, is_active, is_demo')
        .eq('id', user.id)
        .single()
      if (cancelled) return
      if (!data || !data.is_active) {
        setStatus('inactive')
        return
      }
      setProfile(data as Profile)
      setStatus('ready')
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [router])

  const isCoach = profile?.role === 'coach'
  const tabs = isCoach ? COACH_TABS : PLAYER_TABS

  if (status === 'inactive') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm font-semibold text-slate-600">
        This account is inactive. Check with your coach.
      </div>
    )
  }

  if (status === 'loading' || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-[#1746b8] animate-spin" />
      </div>
    )
  }

  return (
    <ProfileContext.Provider value={{ profile, isCoach }}>
      <div className="min-h-screen bg-[#f3f5f9]">
        {/* Floating header */}
        <header
          className="fixed top-0 inset-x-0 z-40 px-3"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)' }}
        >
          <div className="max-w-xl mx-auto flex items-center justify-between rounded-2xl bg-[#1746b8]/95 backdrop-blur px-2 py-1.5 shadow-lg shadow-blue-900/20">
            <Link
              href="/"
              aria-label="Home"
              className={`w-11 h-11 rounded-xl flex items-center justify-center ${pathname === '/' ? 'bg-white text-[#1746b8]' : 'text-white'}`}
            >
              <House className="w-5 h-5" />
            </Link>
            <div className="text-center leading-tight">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200">Generals</div>
              <div className="text-sm font-extrabold text-white">{isCoach ? 'Coach' : 'Baseball'}</div>
            </div>
            <Link
              href="/messages"
              aria-label="Messages"
              className={`w-11 h-11 rounded-xl flex items-center justify-center ${pathname.startsWith('/messages') ? 'bg-white text-[#1746b8]' : 'text-white'}`}
            >
              <MessageCircle className="w-5 h-5" />
            </Link>
          </div>
        </header>

        <main
          className="max-w-xl mx-auto px-4"
          style={{
            paddingTop: 'calc(max(env(safe-area-inset-top), 10px) + 76px)',
            paddingBottom: 'calc(max(env(safe-area-inset-bottom), 10px) + 96px)',
          }}
        >
          {children}
        </main>

        {/* Floating footer */}
        <nav
          className="fixed bottom-0 inset-x-0 z-40 px-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
        >
          <div className="max-w-xl mx-auto grid grid-cols-4 gap-1 rounded-2xl bg-white/95 backdrop-blur border border-slate-200 p-1.5 shadow-xl shadow-slate-900/10">
            {tabs.map((t) => {
              const active = pathname.startsWith(t.href)
              const Icon = t.icon
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] font-extrabold ${
                    active ? 'bg-[#1746b8] text-white' : 'text-slate-500'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {t.label}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </ProfileContext.Provider>
  )
}
