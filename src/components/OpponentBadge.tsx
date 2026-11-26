'use client'

import { useState } from 'react'
import { initialsOf, type Opponent } from '@/lib/opponents'

/** Small round team badge: the logo, or the team's initials on its color (also if the logo link breaks). */
export default function OpponentBadge({ opp, size = 28, className = '' }: { opp: Opponent | null | undefined; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null)
  if (!opp) return null
  const style = { width: size, height: size }
  if (opp.logo_url && broken !== opp.logo_url)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={opp.logo_url} alt={opp.name} style={style} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(opp.logo_url)} className={`rounded-full object-contain bg-white ring-1 ring-slate-200 shrink-0 ${className}`} />
    )
  const label = initialsOf(opp)
  return (
    <span
      aria-label={opp.name}
      style={{ ...style, background: `linear-gradient(145deg, ${opp.color}, ${opp.color}cc)`, fontSize: Math.max(8, size * (label.length > 2 ? 0.3 : 0.38)) }}
      className={`rounded-full ring-2 ring-white shadow-sm text-white font-black tracking-tight flex items-center justify-center shrink-0 ${className}`}
    >
      {label}
    </span>
  )
}
