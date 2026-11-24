'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const cache = new Map<string, string | null>()

/** The player's most recent photo from the program stats history (GameChanger), if there is one. */
export function usePlayerPhoto(playerId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(playerId ? cache.get(playerId) ?? null : null)
  useEffect(() => {
    if (!playerId) return setUrl(null)
    if (cache.has(playerId)) return setUrl(cache.get(playerId) ?? null)
    let cancelled = false
    createClient()
      .from('gc_season_stats')
      .select('season_year, photo:stats->>photo')
      .eq('player_id', playerId)
      .not('stats->>photo', 'is', null)
      .order('season_year', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const p = (data?.[0] as { photo?: string } | undefined)?.photo
        const ok = typeof p === 'string' && p.startsWith('https://') ? p : null
        cache.set(playerId, ok)
        if (!cancelled) setUrl(ok)
      })
    return () => {
      cancelled = true
    }
  }, [playerId])
  return url
}

const initials = (name: string) =>
  name
    .replace(/^Coach\s+/, '')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

/** Player photo, or their initials when there's no photo. */
export default function PlayerPhoto({ id, name, size = 48, className = '' }: { id: string | null | undefined; name: string; size?: number; className?: string }) {
  const url = usePlayerPhoto(id)
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size }
  if (url && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={name} style={style} onError={() => setBroken(true)} className={`rounded-2xl object-cover bg-slate-100 shrink-0 ${className}`} />
    )
  return (
    <div style={{ ...style, fontSize: size * 0.34 }} className={`rounded-2xl bg-blue-50 text-[#1746b8] font-black flex items-center justify-center shrink-0 ${className}`}>
      {initials(name)}
    </div>
  )
}
