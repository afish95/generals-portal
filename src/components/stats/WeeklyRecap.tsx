'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate } from '@/lib/training'

type Recap = { sets: number; volume: number; days: number; prs: number; avg_readiness: number | null; present: number; marked: number }

/** Monday of the week containing `iso`. */
export function weekStart(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return addDays(iso, dow === 0 ? -6 : 1 - dow)
}

export default function WeeklyRecap({ athleteId }: { athleteId: string }) {
  const [thisWeek, setThisWeek] = useState<Recap | null>(null)
  const [lastWeek, setLastWeek] = useState<Recap | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    const start = weekStart(localDate())
    Promise.all([
      supabase.rpc('recap', { p_athlete: athleteId, p_from: start, p_to: localDate(), p_tz: tz }),
      supabase.rpc('recap', { p_athlete: athleteId, p_from: addDays(start, -7), p_to: addDays(start, -1), p_tz: tz }),
    ]).then(([a, b]) => {
      if (cancelled) return
      const norm = (r: unknown): Recap | null => {
        const row = Array.isArray(r) ? (r[0] as Record<string, unknown>) : null
        if (!row) return null
        return {
          sets: Number(row.sets),
          volume: Number(row.volume),
          days: Number(row.days),
          prs: Number(row.prs),
          avg_readiness: row.avg_readiness == null ? null : Number(row.avg_readiness),
          present: Number(row.present),
          marked: Number(row.marked),
        }
      }
      setThisWeek(norm(a.data))
      setLastWeek(norm(b.data))
    })
    return () => {
      cancelled = true
    }
  }, [athleteId])

  if (!thisWeek) return <div className="h-36 rounded-3xl bg-white/60 animate-pulse" />

  const items: { label: string; now: number | null; prev: number | null; suffix?: string }[] = [
    { label: 'Days Trained', now: thisWeek.days, prev: lastWeek?.days ?? null },
    { label: 'Throws & Swings', now: thisWeek.volume, prev: lastWeek?.volume ?? null },
    { label: 'PRs', now: thisWeek.prs, prev: lastWeek?.prs ?? null },
    { label: 'Avg Readiness', now: thisWeek.avg_readiness, prev: lastWeek?.avg_readiness ?? null },
  ]
  const attendance = thisWeek.marked ? Math.round((100 * thisWeek.present) / thisWeek.marked) : null

  return (
    <section className="rounded-3xl bg-gradient-to-br from-[#1746b8] to-[#1e54d4] text-white p-5 shadow-md space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-200">Weekly Recap</span>
        {attendance != null && <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-white/15">{attendance}% attendance</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => {
          const diff = it.now != null && it.prev != null ? it.now - it.prev : null
          return (
            <div key={it.label} className="rounded-2xl bg-white/10 border border-white/15 p-3">
              <div className="text-2xl font-black leading-none">{it.now ?? '–'}</div>
              <div className="text-[11px] font-bold text-blue-100 mt-1">{it.label}</div>
              {diff != null && (
                <div className={`text-[10px] font-extrabold mt-0.5 ${diff > 0 ? 'text-emerald-300' : diff < 0 ? 'text-amber-200' : 'text-blue-200'}`}>
                  {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)} vs last week
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
