'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { House, MessageCircle, Calendar, Target, TrendingUp, LayoutGrid, ClipboardList, Eye, X } from 'lucide-react'
import { createClient, READ_ONLY_EVENT, setReadOnlyMode } from '@/lib/supabase'
import type { Profile } from '@/lib/training'
import { PrCelebrationHost } from '@/components/training/PrCelebration'
import PullToRefresh from '@/components/PullToRefresh'

export type ViewAs = {
  /** True while a coach is previewing the app as a player (read-only) */
  active: boolean
  /** The signed-in coach, even while viewing as a player */
  realProfile: Profile
  players: Profile[]
  start: (playerId: string) => void
  exit: () => void
}
/** Sub-page tabs a page shows in the desktop top bar (coach desktop layout) */
export type Subnav = { tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void }
type ShellContext = { profile: Profile; isCoach: boolean; viewAs: ViewAs; setSubnav: (s: Subnav | null) => void }
const VIEW_KEY = 'generals.viewAs'
const PROFILE_COLS = 'id, username, full_name, role, position_group, grad_year, is_active, is_demo, has_login'
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
  { href: '/office', label: 'Coach Office', icon: ClipboardList },
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
  const [subnav, setSubnav] = useState<Subnav | null>(null)

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

  // Header collapses as you scroll: progress (0 → 1 over the first 90px) follows the scroll directly,
  // so a fast flick collapses it fast and a slow scroll collapses it slowly. Written to a CSS variable (no re-renders).
  const headerRef = useRef<HTMLElement>(null)
  const [compact, setCompact] = useState(false)
  const [headH, setHeadH] = useState(92)
  useEffect(() => {
    let frame = 0
    const apply = () => {
      frame = 0
      const p = Math.min(1, Math.max(0, window.scrollY / 90))
      headerRef.current?.style.setProperty('--p', p.toFixed(3))
      setCompact((c) => (c ? p > 0.4 : p > 0.6))
    }
    const on = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      window.removeEventListener('scroll', on)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [status])
  useEffect(() => {
    const el = headerRef.current
    if (!el || window.scrollY > 0) return
    const measure = () => {
      if (window.scrollY === 0) setHeadH(el.offsetHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [status, viewing])

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
    `pointer-events-auto relative w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 gen-head-icon ${
      active ? 'bg-white text-[#1746b8] border-white shadow-sm' : 'bg-white/15 border-white/20 text-white'
    }`

  return (
    <ProfileContext.Provider
      value={{
        profile: viewing && viewed ? viewed : profile,
        isCoach,
        viewAs: { active: viewing, realProfile: profile, players, start: startViewAs, exit: exitViewAs },
        setSubnav,
      }}
    >
      <div className="min-h-screen bg-[#f3f5f9] text-slate-900">
        <PrCelebrationHost />
        <PullToRefresh />
        {isCoach && (
          <DesktopSidebar
            pathname={pathname}
            unread={unread}
            name={profile.full_name}
            onViewAs={() => router.push('/')}
            onSignOut={async () => {
              await createClient().auth.signOut()
              router.replace('/login')
            }}
          />
        )}
        {/* Royal blue header: Calendar top left, Messages top right (phones; coaches on desktop use the sidebar) */}
        <div aria-hidden className={isCoach ? 'lg:hidden' : ''} style={{ height: headH }} />
        <header
          ref={headerRef}
          className={`fixed top-0 inset-x-0 z-40 text-white ${compact ? 'pointer-events-none' : ''} ${isCoach ? 'lg:hidden' : ''}`}
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#1746b8] to-[#1e54d4] shadow-md gen-head-bar" />
          <div className="relative max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
            <Link href="/calendar" aria-label="Calendar" className={iconBtn(calendarActive)}>
              {!calendarActive && <span aria-hidden className="absolute -inset-px rounded-2xl bg-[#1746b8] shadow-lg gen-head-fill" />}
              <Calendar className="relative w-5 h-5" />
            </Link>
            <div className="min-w-0 flex-1 text-center gen-head-text">
              <div className="flex items-center justify-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/logo-512.png?v=2" alt="" className="w-4 h-4 rounded" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">Generals Baseball</span>
                <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-400/25 text-blue-100">
                  {isCoach ? 'Coach' : 'Active'}
                </span>
              </div>
              <div className="text-lg font-extrabold leading-tight tracking-tight truncate">{(viewing && viewed ? viewed : profile).full_name}</div>
              <div className="text-xs text-blue-100/90 font-medium truncate">
                {isCoach ? 'Coaching Staff' : (viewing && viewed ? viewed : profile).position_group || 'Player'} &bull; #{(viewing && viewed ? viewed : profile).username}
              </div>
            </div>
            <Link href="/messages" aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} className={`relative ${iconBtn(messagesActive)}`}>
              {!messagesActive && <span aria-hidden className="absolute -inset-px rounded-2xl bg-[#1746b8] shadow-lg gen-head-fill" />}
              <MessageCircle className="relative w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-[#1746b8]">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          </div>
          {viewing && viewed && (
            <div className="relative bg-amber-400 text-amber-950 pointer-events-auto gen-head-amber">
              <div className="max-w-xl mx-auto px-4 py-2 flex items-center gap-2">
                <Eye className="w-4 h-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider leading-none">Player View · Read-Only</div>
                  <select
                    value={viewed.id}
                    onChange={(e) => startViewAs(e.target.value)}
                    aria-label="Switch Player"
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
          className={isCoach ? 'max-w-xl mx-auto px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+104px)] lg:max-w-none lg:mx-0 lg:ml-[220px] lg:px-0 lg:pt-0 lg:pb-12' : 'max-w-xl mx-auto px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+104px)]'}
        >
          {isCoach && <DesktopTopBar pathname={pathname} subnav={subnav} />}
          <div className={isCoach ? 'lg:px-8 lg:pt-6' : ''}>{children}</div>
        </main>

        {/* Royal blue footer with the segmented navigation */}
        <nav
          className={`fixed bottom-0 inset-x-0 z-40 pointer-events-none ${isCoach ? 'lg:hidden' : ''}`}
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

/**
 * A page calls this to put its sub-page tabs in the desktop top bar.
 * On phones nothing changes: the page keeps showing its own tabs (hide them with `lg:hidden` for coaches).
 */
export function useSubnav(tabs: { key: string; label: string }[], active: string, onChange: (key: string) => void) {
  const ctx = useContext(ProfileContext)
  const cb = useRef(onChange)
  cb.current = onChange
  const sig = tabs.map((t) => `${t.key}:${t.label}`).join('|')
  const set = ctx?.setSubnav
  useEffect(() => {
    set?.({ tabs, active, onChange: (k) => cb.current(k) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, active, set])
  useEffect(() => () => set?.(null), [set])
}

// ---------------------------------------------------------------------------
// Coach desktop layout (screens 1024px and wider): left sidebar + top bar
// ---------------------------------------------------------------------------
const DESK_NAV = [
  { href: '/', label: 'Home', icon: House },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/office', label: 'Coach Office', icon: ClipboardList },
  { href: '/stats', label: 'Stats', icon: TrendingUp },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/other', label: 'Other', icon: LayoutGrid },
]
const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

function DesktopSidebar({ pathname, unread, name, onViewAs, onSignOut }: { pathname: string; unread: number; name: string; onViewAs: () => void; onSignOut: () => void }) {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-[220px] flex-col bg-[#113694] text-white px-3 py-5">
      <div className="flex items-center gap-2.5 px-2 mb-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/logo-512.png?v=2" alt="" className="w-9 h-9 rounded-xl" />
        <div className="leading-tight">
          <div className="text-sm font-extrabold">Generals</div>
          <div className="text-[11px] font-semibold text-blue-200">Coach Portal</div>
        </div>
      </div>
      <nav className="space-y-1">
        {DESK_NAV.map((n) => {
          const Icon = n.icon
          const active = isActive(pathname, n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition ${active ? 'bg-white text-[#1746b8]' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1">{n.label}</span>
              {n.href === '/messages' && unread > 0 && (
                <span className="min-w-5 h-5 px-1 rounded-full bg-amber-400 text-amber-950 text-[10px] font-extrabold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto space-y-3">
        <button type="button" onClick={onViewAs} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-bold cursor-pointer">
          <Eye className="w-4 h-4" /> View as Player
        </button>
        <div className="px-3">
          <div className="text-sm font-extrabold truncate">{name}</div>
          <button type="button" onClick={onSignOut} className="text-xs font-semibold text-blue-200 hover:text-white cursor-pointer">Sign Out</button>
        </div>
      </div>
    </aside>
  )
}

function DesktopTopBar({ pathname, subnav }: { pathname: string; subnav: Subnav | null }) {
  const section = DESK_NAV.find((n) => isActive(pathname, n.href))?.label ?? 'Generals'
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className="hidden lg:block sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="px-8 pt-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-extrabold text-slate-900">{section}</h1>
          <span className="text-xs font-semibold text-slate-500">{date}</span>
        </div>
        <div className="flex gap-6 mt-2 overflow-x-auto">
          {subnav ? (
            subnav.tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => subnav.onChange(t.key)}
                className={`pb-2.5 text-sm font-bold whitespace-nowrap border-b-2 cursor-pointer ${subnav.active === t.key ? 'border-[#1746b8] text-[#1746b8]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {t.label}
              </button>
            ))
          ) : (
            <span className="pb-2.5 text-sm border-b-2 border-transparent">&nbsp;</span>
          )}
        </div>
      </div>
    </div>
  )
}
