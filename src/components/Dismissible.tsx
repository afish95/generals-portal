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

/**
 * iOS-style swipe: drag left to reveal a ✓ button on the trailing side (tap it to clear),
 * or swipe all the way to clear at once. Works with touch and mouse.
 */
export function SwipeRow({ onDismiss, children, dark = false }: { onDismiss: () => void; children: React.ReactNode; dark?: boolean }) {
  const ACTION = 76
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [gone, setGone] = useState(false)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const horizontal = useRef(false)

  const clear = () => {
    setDx(-600)
    setGone(true)
    setTimeout(onDismiss, 200)
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl transition-[max-height,opacity] duration-200 ${gone ? 'max-h-0 opacity-0' : 'max-h-[600px]'}`}>
      <button
        type="button"
        onClick={clear}
        aria-label="Mark read"
        tabIndex={dx < 0 ? 0 : -1}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-emerald-500 text-white cursor-pointer"
        style={{ width: Math.max(ACTION, -dx), opacity: dx < -8 ? 1 : 0 }}
      >
        <Check className="w-5 h-5" strokeWidth={3} />
      </button>
      <div
        className={`relative touch-pan-y select-none ${dark ? 'bg-[#16409f] py-1' : 'bg-white'}`}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1)' }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, base: dx }
          horizontal.current = false
        }}
        onPointerMove={(e) => {
          if (!start.current) return
          const mx = e.clientX - start.current.x
          const my = e.clientY - start.current.y
          if (!horizontal.current) {
            if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
              horizontal.current = true
              setDragging(true)
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            } else return
          }
          setDx(Math.min(0, start.current.base + mx))
        }}
        onPointerUp={() => {
          const was = horizontal.current
          start.current = null
          horizontal.current = false
          setDragging(false)
          if (!was) {
            if (dx < 0) setDx(0)
            return
          }
          if (dx < -180) clear()
          else if (dx < -36) setDx(-ACTION)
          else setDx(0)
        }}
        onPointerCancel={() => {
          start.current = null
          setDragging(false)
          setDx(0)
        }}
      >
        {children}
      </div>
    </div>
  )
}
