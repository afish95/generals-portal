'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type Opponent = { id: number; name: string; short: string | null; color: string; logo_url: string | null }

let cache: Map<number, Opponent> | null = null
let pending: Promise<Map<number, Opponent>> | null = null
const listeners = new Set<(m: Map<number, Opponent>) => void>()

function load() {
  if (!pending)
    pending = Promise.resolve(createClient().from('opponents').select('id, name, short, color, logo_url').order('name')).then(({ data }) => {
      cache = new Map(((data as Opponent[]) || []).map((o) => [o.id, o]))
      listeners.forEach((l) => l(cache!))
      return cache
    })
  return pending
}

/** All opponents by id (loaded once and shared across the app). */
export function useOpponents() {
  const [map, setMap] = useState<Map<number, Opponent>>(cache || new Map())
  useEffect(() => {
    listeners.add(setMap)
    if (cache) setMap(cache)
    else load()
    return () => {
      listeners.delete(setMap)
    }
  }, [])
  return map
}

/** Force a reload after a coach edits opponents. */
export function refreshOpponents() {
  pending = null
  return load()
}

/** Opponent name from a title like "Varsity @ Barlow" or "Varsity vs Wells". */
export const opponentFromTitle = (title: string) => title.match(/\s(?:@|vs\.?|at)\s+(.+)$/i)?.[1]?.trim() || null
export const isAway = (title: string, location?: string | null) => / @ /.test(title) || location === 'Away'
export const initialsOf = (o: Pick<Opponent, 'name' | 'short'>) => (o.short || o.name.replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3)).toUpperCase()

export async function uploadTeamLogo(opponentId: number, file: File) {
  const sb = createClient()
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${opponentId}/${Date.now()}.${ext}`
  const { error } = await sb.storage.from('team-logos').upload(path, file, { upsert: true, contentType: file.type || 'image/png' })
  if (error) throw new Error(error.message)
  const url = sb.storage.from('team-logos').getPublicUrl(path).data.publicUrl
  const { error: e2 } = await sb.from('opponents').update({ logo_url: url }).eq('id', opponentId)
  if (e2) throw new Error(e2.message)
  return url
}
