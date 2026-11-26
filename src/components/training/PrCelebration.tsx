'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import type { PrHit } from './WorkoutLogger'
import { PR_EVENT } from '@/lib/celebrate'

const COLORS = ['#f59e0b', '#1746b8', '#10b981', '#ef4444', '#a855f7', '#fde047', '#ffffff']

/** Full-screen "New PR!" celebration with confetti. Tap anywhere (or wait) to close. */
export default function PrCelebration({ hit, onDone }: { hit: PrHit | null; onDone: () => void }) {
  useEffect(() => {
    if (!hit) return
    if ('vibrate' in navigator) navigator.vibrate?.([80, 50, 80, 50, 200])
    const t = setTimeout(onDone, 4500)
    return () => clearTimeout(t)
  }, [hit, onDone])

  if (!hit) return null
  const pieces = Array.from({ length: 70 }, (_, i) => i)
  return (
    <button type="button" onClick={onDone} aria-label="Close celebration" className="fixed inset-0 z-[70] flex items-center justify-center px-6 bg-[#0f2a6e]/80 backdrop-blur-sm cursor-pointer animate-gen-fade">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((i) => (
          <span
            key={i}
            className="absolute top-[-5%] block rounded-sm animate-gen-confetti"
            style={{
              left: `${(i * 37) % 100}%`,
              width: `${6 + (i % 4) * 2}px`,
              height: `${10 + (i % 3) * 4}px`,
              background: COLORS[i % COLORS.length],
              animationDelay: `${(i % 14) * 0.08}s`,
              animationDuration: `${2.2 + (i % 5) * 0.35}s`,
              transform: `rotate(${i * 29}deg)`,
            }}
          />
        ))}
      </div>
      <div className="relative w-full max-w-xs rounded-[2rem] bg-gradient-to-br from-amber-300 via-amber-400 to-orange-500 text-white p-6 text-center shadow-2xl shadow-orange-500/50 animate-gen-pr-pop">
        <div className="mx-auto -mt-14 w-20 h-20 rounded-full bg-gradient-to-br from-yellow-200 to-amber-500 border-4 border-white flex items-center justify-center shadow-xl">
          <Trophy className="w-10 h-10 text-white drop-shadow" />
        </div>
        <div className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.3em] text-amber-50">New Personal Record</div>
        <div className="text-4xl font-black leading-none mt-1 drop-shadow-sm">NEW PR!</div>
        <div className="mt-3 text-base font-extrabold">{hit.exercise}</div>
        <div className="text-3xl font-black tabular-nums">{hit.text}</div>
        {hit.delta && <div className="inline-block mt-2 px-3 py-1 rounded-full bg-white/25 text-sm font-black">Better by {hit.delta.replace(/^[+-]/, "")}</div>}
        <div className="mt-3 text-xs font-bold text-amber-50">Leveled up. Keep stacking reps! 🔥</div>
        <div className="mt-3 text-[10px] font-semibold text-white/70">Tap to close</div>
      </div>
    </button>
  )
}

/** Mounted once in the app shell: shows the celebration whenever any screen fires celebratePr(). */
export function PrCelebrationHost() {
  const [hit, setHit] = useState<PrHit | null>(null)
  useEffect(() => {
    const on = (e: Event) => setHit((e as CustomEvent<PrHit>).detail)
    window.addEventListener(PR_EVENT, on)
    return () => window.removeEventListener(PR_EVENT, on)
  }, [])
  const done = useCallback(() => setHit(null), [])
  return <PrCelebration hit={hit} onDone={done} />
}
