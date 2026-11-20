'use client'

import { useEffect } from 'react'
import { Award } from 'lucide-react'
import type { PrHit } from './WorkoutLogger'

export default function PrCelebration({ hit, onDone }: { hit: PrHit | null; onDone: () => void }) {
  useEffect(() => {
    if (!hit) return
    if ('vibrate' in navigator) navigator.vibrate?.([60, 40, 120])
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [hit, onDone])

  if (!hit) return null
  return (
    <button
      type="button"
      onClick={onDone}
      className="fixed inset-x-0 z-50 flex justify-center px-4 cursor-pointer"
      style={{ top: 'calc(max(env(safe-area-inset-top), 10px) + 76px)' }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5 shadow-2xl shadow-orange-500/40 animate-bounce">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/25 flex items-center justify-center">
            <Award className="w-7 h-7" />
          </div>
          <div className="text-left">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-100">New PR</div>
            <div className="text-lg font-extrabold leading-tight">{hit.exercise}</div>
            <div className="text-sm font-bold">
              {hit.text}
              {hit.delta && <span className="ml-2 px-2 py-0.5 rounded-full bg-white/25 text-xs">{hit.delta}</span>}
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}
