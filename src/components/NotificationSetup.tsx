'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Bell, BellOff, BellRing, Share, PlusSquare } from 'lucide-react'

type Status = 'checking' | 'install' | 'unsupported' | 'ready' | 'working' | 'on' | 'blocked' | 'error'

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out.buffer
}

function isIOS() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export default function NotificationSetup({ hideWhenOn = false }: { hideWhenOn?: boolean }) {
  const supabase = createClient()
  const [status, setStatus] = useState<Status>('checking')

  const saveSubscription = useCallback(
    async (sub: PushSubscription) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false
      const json = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          profile_id: user.id,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent.slice(0, 250),
        },
        { onConflict: 'endpoint' }
      )
      return !error
    },
    [supabase]
  )

  const subscribe = useCallback(async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!key) {
      setStatus('error')
      return
    }
    setStatus('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'ready')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      const sub =
        existing ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBuffer(key) }))
      setStatus((await saveSubscription(sub)) ? 'on' : 'error')
    } catch {
      setStatus('error')
    }
  }, [saveSubscription])

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      if (!supported) {
        if (!cancelled) setStatus(isIOS() && !isStandalone() ? 'install' : 'unsupported')
        return
      }
      if (isIOS() && !isStandalone()) {
        if (!cancelled) setStatus('install')
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('blocked')
        return
      }
      if (Notification.permission === 'granted') {
        try {
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            const saved = await saveSubscription(sub)
            if (!cancelled) setStatus(saved ? 'on' : 'ready')
            return
          }
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) setStatus('ready')
    }
    check()
    return () => {
      cancelled = true
    }
  }, [saveSubscription])

  if (status === 'checking') return null

  if (status === 'on') {
    if (hideWhenOn) return null
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
        <BellRing className="w-4 h-4" />
        Notifications are on for this device
      </div>
    )
  }

  if (status === 'install') {
    return (
      <section className="bg-white rounded-3xl border border-blue-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-[#1746b8]">
          <Bell className="w-5 h-5" />
          <h2 className="text-sm font-extrabold">Get team alerts on your phone</h2>
        </div>
        <p className="text-xs text-slate-600 font-medium">
          Add the Generals app to your Home Screen, then open it from there to turn on notifications.
        </p>
        <ol className="text-xs text-slate-700 font-semibold space-y-2">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1746b8] flex items-center justify-center text-[10px]">1</span>
            Tap <Share className="w-4 h-4 inline text-[#1746b8]" /> Share in Safari
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1746b8] flex items-center justify-center text-[10px]">2</span>
            Choose <PlusSquare className="w-4 h-4 inline text-[#1746b8]" /> Add to Home Screen
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1746b8] flex items-center justify-center text-[10px]">3</span>
            Open Generals from your Home Screen and tap Turn on notifications
          </li>
        </ol>
      </section>
    )
  }

  if (status === 'blocked') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
        <BellOff className="w-4 h-4 shrink-0 mt-0.5" />
        Notifications are blocked. Turn them on in your phone&apos;s Settings → Notifications → Generals.
      </div>
    )
  }

  if (status === 'unsupported') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-semibold">
        <BellOff className="w-4 h-4 shrink-0 mt-0.5" />
        This browser can&apos;t receive notifications. Check announcements here in the app.
      </div>
    )
  }

  return (
    <section className="bg-white rounded-3xl border border-blue-200 p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2 text-[#1746b8]">
        <Bell className="w-5 h-5" />
        <h2 className="text-sm font-extrabold">Turn On Team Alerts</h2>
      </div>
      <p className="text-xs text-slate-600 font-medium">
        Get schedule changes and coach announcements right on your phone.
      </p>
      <button
        onClick={subscribe}
        disabled={status === 'working'}
        className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer"
      >
        {status === 'working' ? 'Turning on…' : 'Turn On Notifications'}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-600 font-semibold">Something went wrong. Try again in a moment.</p>
      )}
    </section>
  )
}
