'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { House, MessageCircle, Calendar, Target, TrendingUp, LayoutGrid, Shield, Eye, X } from 'lucide-react'
import { createClient, READ_ONLY_EVENT, setReadOnlyMode } from '@/lib/supabase'
import type { Profile } from '@/lib/training'

export type ViewAs = {
  /** True while a coach is previewing the app as a player (read-only) */
  active: boolean
  /** The signed-in coach, even while viewing as a player */
  realProfile: Profile
  players: Profile[]
  start: (playerId: string) => void
  exit: () => void
}
type ShellContext = { profile: Profile; isCoach: boolean; viewAs: ViewAs }
const VIEW_KEY = 'generals.viewAs'
const PROFILE_COLS = 'id, username, full_name, role, position_group, grad_year, is_active, is_demo'
const ProfileContext = createContext<ShellContext | null>(null)

export function useProfile(): ShellContext {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside AppShell')
  return ctx
}

const PLAYER_TABS = [
  { href: '/', label: 'Home', icon: House },
  { href: '/training', label: 'Training', icon: Target },
  { href: '/stats', label: 'Stats', icon: TrendingUp },
  { href: '/other', label: 'Other', icon: LayoutGrid },
]
const COACH_TABS = [
  { href: '/', label: 'Home', icon: House },
  { href: '/office', label: 'Coach Office', icon: Shield },
  { href: '/stats', label: 'Stats', icon: TrendingUp },
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
        .select(PROFILE_COLS)
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

  // ----- Coach "view as player" (read-only preview) -----
  const realIsCoach = profile?.role === 'coach'
  const [viewAsId, setViewAsId] = useState<string | null>(null)
  const [viewed, setViewed] = useState<Profile | null>(null)
  const [players, setPlayers] = useState<Profile[]>([])
  const [toast, setToast] = useState(false)

  useEffect(() => {
    if (!realIsCoach) return
    try {
      setViewAsId(sessionStorage.getItem(VIEW_KEY))
    } catch {}
    createClient()
      .from('profiles')
      .select(PROFILE_COLS)
      .eq('role', 'player')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setPlayers((data as Profile[]) || []))
  }, [realIsCoach])

  useEffect(() => {
    if (!viewAsId) {
      setViewed(null)
      return
    }
    const found = players.find((p) => p.id === viewAsId)
    if (found) setViewed(found)
    else if (players.length) {
      // That player is gone or inactive: fall back to the coach view
      setViewAsId(null)
      try {
        sessionStorage.removeItem(VIEW_KEY)
      } catch {}
    }
  }, [viewAsId, players])

  const viewing = !!(realIsCoach && viewAsId && viewed)
  // Must be set before any child creates a database client
  setReadOnlyMode(viewing)

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const onBlocked = () => {
      setToast(true)
      clearTimeout(t)
      t = setTimeout(() => setToast(false), 2200)
    }
    window.addEventListener(READ_ONLY_EVENT, onBlocked)
    return () => {
      window.removeEventListener(READ_ONLY_EVENT, onBlocked)
      clearTimeout(t)
    }
  }, [])

  const startViewAs = useCallback(
    (id: string) => {
      try {
        sessionStorage.setItem(VIEW_KEY, id)
      } catch {}
      setViewAsId(id)
      router.push('/')
    },
    [router]
  )
  const exitViewAs = useCallback(() => {
    try {
      sessionStorage.removeItem(VIEW_KEY)
    } catch {}
    setViewAsId(null)
    setReadOnlyMode(false)
    router.push('/')
  }, [router])

  // Unread chat count for the Messages badge (refreshed on navigation and every minute)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (status !== 'ready') return
    let cancelled = false
    const check = () =>
      (viewing && viewAsId ? createClient().rpc('conversations_for', { p_user: viewAsId }) : createClient().rpc('my_conversations'))
        .then(({ data }) => {
          if (!cancelled) setUnread(((data as { unread: number }[]) || []).reduce((n, c) => n + Number(c.unread || 0), 0))
        })
    check()
    const t = setInterval(check, 60000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [status, pathname, viewing, viewAsId])

  const isCoach = realIsCoach && !viewing
  const tabs = isCoach ? COACH_TABS : PLAYER_TABS

  if (status === 'inactive') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm font-semibold text-slate-600">
        This account is inactive. Check with your coach.
      </div>
    )
  }

  if (status === 'loading' || !profile || (realIsCoach && viewAsId && !viewed && players.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-[#1746b8] animate-spin" />
      </div>
    )
  }

  const calendarActive = pathname.startsWith('/calendar')
  const messagesActive = pathname.startsWith('/messages')
  const iconBtn = (active: boolean) =>
    `w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 transition ${
      active ? 'bg-white text-[#1746b8] border-white shadow-sm' : 'bg-white/15 border-white/20 text-white'
    }`

  return (
    <ProfileContext.Provider
      value={{
        profile: viewing && viewed ? viewed : profile,
        isCoach,
        viewAs: { active: viewing, realProfile: profile, players, start: startViewAs, exit: exitViewAs },
      }}
    >
      <div className="min-h-screen bg-[#f3f5f9] text-slate-900">
        {/* Royal blue header: Home top left, Messages top right */}
        <header
          className="sticky top-0 z-40 bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
            <Link href="/calendar" aria-label="Calendar" className={iconBtn(calendarActive)}>
              <Calendar className="w-5 h-5" />
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">Generals Baseball</span>
                <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-400/25 text-blue-100">
                  {isCoach ? 'Coach' : 'Active'}
                </span>
              </div>
              <div className="text-lg font-extrabold leading-tight tracking-tight truncate">{(viewing && viewed ? viewed : profile).full_name}</div>
              <div className="text-xs text-blue-100/90 font-medium truncate">
                {isCoach ? 'Coaching staff' : (viewing && viewed ? viewed : profile).position_group || 'Player'} &bull; #{(viewing && viewed ? viewed : profile).username}
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
          {viewing && viewed && (
            <div className="bg-amber-400 text-amber-950">
              <div className="max-w-xl mx-auto px-4 py-2 flex items-center gap-2">
                <Eye className="w-4 h-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider leading-none">Player view · read-only</div>
                  <select
                    value={viewed.id}
                    onChange={(e) => startViewAs(e.target.value)}
                    aria-label="Switch player"
                    className="mt-0.5 max-w-full bg-transparent text-sm font-extrabold truncate cursor-pointer outline-none"
                  >
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={exitViewAs} className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-950 text-amber-50 text-xs font-extrabold flex items-center gap-1 cursor-pointer">
                  <X className="w-3.5 h-3.5" /> Exit
                </button>
              </div>
            </div>
          )}
        </header>
        {toast && (
          <div className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 130px)' }}>
            <div className="rounded-2xl bg-slate-900 text-white px-4 py-2.5 text-xs font-extrabold shadow-xl animate-gen-pop">Preview only: nothing was saved</div>
          </div>
        )}

        <main
          key={viewing && viewed ? `view-${viewed.id}` : 'self'}
          className="max-w-xl mx-auto px-4 pt-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 104px)' }}
        >
          {children}
        </main>

        {/* Royal blue footer with the segmented navigation */}
        <nav
          className="fixed bottom-0 inset-x-0 z-40 pointer-events-none"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
        >
          <div className="max-w-xl mx-auto px-4 pt-2.5">
            <div className="pointer-events-auto grid grid-cols-4 gap-1.5 p-1.5 rounded-2xl bg-[#113694] border border-white/15 shadow-[0_10px_28px_rgba(17,54,148,0.45)]">
              {tabs.map((t) => {
                const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href)
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
