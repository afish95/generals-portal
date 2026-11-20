'use client'

import { useEffect, useState } from 'react'
import { Award, Flame, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { localDate } from '@/lib/training'
import { weekStart } from './WeeklyRecap'

type Row = { athlete_id: string; full_name: string; volume: number; sets: number; quality: number | null; prs: number }
const CATS = [
  { key: 'volume', label: 'Volume', icon: Flame, unit: 'throws & swings' },
  { key: 'quality', label: 'Quality', icon: Target, unit: '% of sets done' },
  { key: 'prs', label: 'PRs', icon: Award, unit: 'PRs' },
] as const

export default function Leaderboard({ myId }: { myId: string }) {
  const [period, setPeriod] = useState<'today' | 'week'>('today')
  const [cat, setCat] = useState<(typeof CATS)[number]['key']>('volume')
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const today = localDate()
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    createClient()
      .rpc('leaderboard', { p_from: period === 'today' ? today : weekStart(today), p_to: today, p_tz: tz })
      .then(({ data }) => {
        if (cancelled) return
        setRows(
          ((data as Row[]) || []).map((r) => ({ ...r, volume: Number(r.volume), sets: Number(r.sets), prs: Number(r.prs), quality: r.quality == null ? null : Number(r.quality) }))
        )
      })
    return () => {
      cancelled = true
    }
  }, [period])

  const value = (r: Row) => (cat === 'volume' ? r.volume : cat === 'prs' ? r.prs : r.quality ?? -1)
  const ranked = (rows || []).filter((r) => (cat === 'quality' ? r.quality != null : true)).sort((a, b) => value(b) - value(a) || a.full_name.localeCompare(b.full_name))
  const meta = CATS.find((c) => c.key === cat)!
  const medal = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100">
        {(['today', 'week'] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`py-2 rounded-xl text-xs font-extrabold cursor-pointer ${period === p ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
            {p === 'today' ? 'Today' : 'This week'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CATS.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCat(c.key)}
              className={`py-3 rounded-2xl text-xs font-extrabold flex flex-col items-center gap-1 cursor-pointer ${cat === c.key ? 'bg-amber-500 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              <Icon className="w-4 h-4" />
              {c.label}
            </button>
          )
        })}
      </div>

      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {rows === null ? (
          <div className="h-40 animate-pulse" />
        ) : ranked.length === 0 ? (
          <p className="p-5 text-xs font-medium text-slate-500">No training logged yet {period === 'today' ? 'today' : 'this week'}. Be the first on the board.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {ranked.map((r, i) => (
              <li key={r.athlete_id} className={`flex items-center gap-3 px-5 py-3 ${r.athlete_id === myId ? 'bg-blue-50' : ''}`}>
                <span className="w-7 text-center text-sm font-black text-slate-400">{i < 3 && value(r) > 0 ? medal[i] : i + 1}</span>
                <span className={`flex-1 text-sm truncate ${r.athlete_id === myId ? 'font-black text-[#1746b8]' : 'font-bold text-slate-800'}`}>{r.full_name}</span>
                <span className="text-right">
                  <span className="text-base font-black text-slate-900">{cat === 'quality' ? `${r.quality}%` : value(r)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="text-[11px] font-semibold text-slate-400 px-1">
        {meta.label}: {meta.unit}. {cat === 'quality' ? 'Only athletes with assigned work show up.' : 'Effort counts as much as talent.'}
      </p>
    </div>
  )
}
