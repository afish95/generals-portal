'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { localDate, prettyDate, round1 } from '@/lib/training'

type Entry = { id: number; measured_on: string; weight_lb: number }

export function WeightSparkline({ entries, height = 44 }: { entries: Entry[]; height?: number }) {
  if (entries.length < 2) return null
  const vals = entries.map((e) => Number(e.weight_lb))
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 200
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${height - 4 - ((v - min) / span) * (height - 8)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#1746b8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function BodyWeightCard({ athleteId, date }: { athleteId: string; date?: string }) {
  const day = date ?? localDate()
  const isToday = day === localDate()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('body_weights')
      .select('id, measured_on, weight_lb')
      .eq('athlete_id', athleteId)
      .order('measured_on', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!cancelled) setEntries(((data as Entry[]) || []).reverse())
      })
    return () => {
      cancelled = true
    }
  }, [athleteId, reload])

  const save = async () => {
    const w = parseFloat(value)
    if (!Number.isFinite(w) || w < 50 || w > 400) {
      setError('Enter your weight in pounds.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: e } = await createClient()
      .from('body_weights')
      .upsert({ athlete_id: athleteId, measured_on: day, weight_lb: w }, { onConflict: 'athlete_id,measured_on' })
    setSaving(false)
    if (e) return setError(e.message)
    setValue('')
    setReload((n) => n + 1)
  }

  const latest = entries?.[entries.length - 1]
  const first = entries?.[0]
  const change = latest && first && entries && entries.length > 1 ? round1(Number(latest.weight_lb) - Number(first.weight_lb)) : null

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Body Weight by Week</span>
        {change != null && (
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${change >= 0 ? 'bg-blue-50 text-[#1746b8]' : 'bg-slate-100 text-slate-600'}`}>
            {change >= 0 ? '+' : ''}{change} lb since {prettyDate(first!.measured_on, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <span className="text-3xl font-black text-slate-900">{latest ? round1(Number(latest.weight_lb)) : '–'}</span>
          <span className="text-xs font-bold text-slate-500 ml-1.5">lb</span>
          {latest && <div className="text-[11px] font-semibold text-slate-400">{latest.measured_on === localDate() ? 'Logged today' : `Last: ${prettyDate(latest.measured_on)}`}</div>}
        </div>
        <div className="flex-1 max-w-[55%]">{entries && <WeightSparkline entries={entries} />}</div>
      </div>
      <div className="flex gap-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder={isToday ? 'Today’s weight (lb)' : `Weight for ${prettyDate(day, { month: 'short', day: 'numeric' })} (lb)`}
          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-slate-900"
        />
        <button type="button" onClick={save} disabled={saving} className="px-4 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
          {saving ? '…' : 'Log'}
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </section>
  )
}
