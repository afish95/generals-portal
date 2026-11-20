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

  // Unread chat count for the Messages badge (refreshed on navigation and every minute)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    const check = () =>
      createClient()
        .rpc('my_conversations')
        .then(({ data }) => {
          if (!cancelled) setUnread(((data as { unread: number }[]) || []).reduce((n, c) => n + Number(c.unread || 0), 0))
        })
    check()
    const t = setInterval(check, 60000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [status, pathname])

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

  const homeActive = pathname === '/'
  const messagesActive = pathname.startsWith('/messages')
  const iconBtn = (active: boolean) =>
    `w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 transition ${
      active ? 'bg-white text-[#1746b8] border-white shadow-sm' : 'bg-white/15 border-white/20 text-white'
    }`

  return (
    <ProfileContext.Provider value={{ profile, isCoach }}>
      <div className="min-h-screen bg-[#f3f5f9] text-slate-900">
        {/* Royal blue header: Home top left, Messages top right */}
        <header
          className="sticky top-0 z-40 bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
            <Link href="/" aria-label="Home" className={iconBtn(homeActive)}>
              <House className="w-5 h-5" />
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">Generals Baseball</span>
                <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-400/25 text-blue-100">
                  {isCoach ? 'Coach' : 'Active'}
                </span>
              </div>
              <div className="text-lg font-extrabold leading-tight tracking-tight truncate">{profile.full_name}</div>
              <div className="text-xs text-blue-100/90 font-medium truncate">
                {isCoach ? 'Coaching staff' : profile.position_group || 'Player'} &bull; #{profile.username}
              </div>
            </div>
            <Link href="/messages" aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} className={`relative ${iconBtn(messagesActive)}`}>
              <MessageCircle className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-[#1746b8]">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main
          className="max-w-xl mx-auto px-4 pt-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 104px)' }}
        >
          {children}
        </main>

        {/* Royal blue footer with the segmented navigation */}
        <nav
          className="fixed bottom-0 inset-x-0 z-40 bg-gradient-to-b from-[#1e54d4] to-[#1746b8] shadow-[0_-4px_12px_rgba(23,70,184,0.25)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-xl mx-auto px-4 py-2.5">
            <div className="grid grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-[#113694]/70 border border-white/15">
              {tabs.map((t) => {
                const active = pathname.startsWith(t.href)
                const Icon = t.icon
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`py-2 px-1 rounded-xl text-[11px] font-extrabold flex flex-col items-center justify-center gap-1 transition ${
                      active ? 'bg-white text-[#1746b8] shadow-sm' : 'text-blue-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="leading-none whitespace-nowrap">{t.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </nav>
      </div>
    </ProfileContext.Provider>
  )
}
