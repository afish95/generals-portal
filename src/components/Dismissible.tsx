'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export type DismissKind = 'announcement' | 'streak_award'

/** Which items this person has already swiped away / marked read. */
export function useDismissals(kind: DismissKind, profileId: string | null | undefined) {
  const [ids, setIds] = useState<Set<number> | null>(null)
  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    createClient()
      .from('dismissals')
      .select('item_id')
      .eq('profile_id', profileId)
      .eq('kind', kind)
      .then(({ data }) => !cancelled && setIds(new Set((data || []).map((r) => Number(r.item_id)))))
    return () => {
      cancelled = true
    }
  }, [kind, profileId])

  const dismiss = useCallback(
    async (itemIds: number[]) => {
      if (!profileId || !itemIds.length) return
      setIds((s) => new Set([...(s || []), ...itemIds]))
      await createClient()
        .from('dismissals')
        .upsert(itemIds.map((item_id) => ({ profile_id: profileId, kind, item_id })), { onConflict: 'profile_id,kind,item_id', ignoreDuplicates: true })
    },
    [kind, profileId]
  )
  return { dismissed: ids, dismiss }
}

/** A row you can swipe left or right to clear, with a "Mark read" button for mouse users. */
export function SwipeRow({ onDismiss, children, dark = false }: { onDismiss: () => void; children: React.ReactNode; dark?: boolean }) {
  const [dx, setDx] = useState(0)
  const [gone, setGone] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const horizontal = useRef(false)

  const finish = () => {
    if (Math.abs(dx) > 90) {
      setGone(true)
      setDx(dx > 0 ? 500 : -500)
      setTimeout(onDismiss, 180)
    } else setDx(0)
    start.current = null
    horizontal.current = false
  }

  return (
    <div className={`relative overflow-hidden transition-[max-height,opacity] duration-200 ${gone ? 'max-h-0 opacity-0' : 'max-h-[600px]'}`}>
      <div className={`absolute inset-0 flex items-center ${dx > 0 ? 'justify-start pl-4' : 'justify-end pr-4'} ${dark ? 'text-emerald-300' : 'text-emerald-600'} text-xs font-extrabold`}>
        <Check className="w-4 h-4" />
      </div>
      <div
        className="relative flex items-start gap-2 touch-pan-y"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform 180ms ease-out' }}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }}
        onTouchMove={(e) => {
          if (!start.current) return
          const mx = e.touches[0].clientX - start.current.x
          const my = e.touches[0].clientY - start.current.y
          if (!horizontal.current && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) horizontal.current = true
          if (horizontal.current) setDx(mx)
        }}
        onTouchEnd={finish}
      >
        <div className="flex-1 min-w-0">{children}</div>
        <button
          type="button"
          onClick={() => {
            setGone(true)
            setTimeout(onDismiss, 180)
          }}
          aria-label="Mark read"
          title="Mark read"
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer ${dark ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`}
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
