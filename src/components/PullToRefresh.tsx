'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const TRIGGER = 72

/** Is this touch inside something that should keep its own scroll (a sheet, a scrolled list)? Then don't refresh. */
function blocked(target: EventTarget | null) {
  let el = target instanceof Element ? target : null
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      if (el.scrollTop > 0) return true
      const cs = getComputedStyle(el)
      // full-screen sheets and editors: pulling there must never reload and lose edits
      if (cs.position === 'fixed' && el.offsetHeight > window.innerHeight * 0.6) return true
    }
    el = el.parentElement
  }
  return false
}

/** Pull down at the top of any screen to reload the app (phones and tablets). */
export default function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<number | null>(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1 || blocked(e.target)) return (start.current = null)
      start.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0
        setPull(0)
        return
      }
      const d = Math.min(120, dy * 0.5)
      pullRef.current = d
      setPull(d)
    }
    const onEnd = () => {
      if (start.current == null) return
      start.current = null
      if (pullRef.current >= TRIGGER) {
        setRefreshing(true)
        setPull(TRIGGER)
        window.location.reload()
      } else {
        pullRef.current = 0
        setPull(0)
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (pull <= 0 && !refreshing) return null
  const ready = pull >= TRIGGER
  return (
    <div className="fixed left-0 right-0 z-[60] flex justify-center pointer-events-none" style={{ top: `calc(env(safe-area-inset-top) + ${Math.max(8, pull - 24)}px)` }}>
      <div className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-colors ${ready ? 'bg-[#1746b8] text-white' : 'bg-white text-[#1746b8]'}`}>
        <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
      </div>
    </div>
  )
}
