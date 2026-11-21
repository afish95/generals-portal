'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { localDate } from '@/lib/training'
import { readinessMeta, type Checkin } from '@/lib/wellness'
import ReadinessRing from './ReadinessRing'
import { withPointsDelta } from '@/lib/pointsDelta'
import { PointBubble, buzz } from '@/components/points/PointBurst'

const SCALES = [
  { key: 'sleep_quality', label: 'Sleep', low: 'Rough', high: 'Great' },
  { key: 'soreness', label: 'Soreness', low: 'None', high: 'Very sore' },
  { key: 'stress', label: 'Stress', low: 'Calm', high: 'Stressed' },
] as const
type ScaleKey = (typeof SCALES)[number]['key']

export default function ReadinessCheckIn({ athleteId, onSaved, embedded = false }: { athleteId: string; onSaved?: () => void; embedded?: boolean }) {
  const [today, setToday] = useState<Checkin | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<ScaleKey, number | null>>({ sleep_quality: null, soreness: null, stress: null })
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('daily_checkins')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('check_date', localDate())
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const c = (data as Checkin) || null
        setToday(c)
        if (c) {
          setForm({ sleep_quality: c.sleep_quality, soreness: c.soreness, stress: c.stress })
          setHours(c.sleep_hours != null ? String(c.sleep_hours) : '')
        }
      })
    return () => {
      cancelled = true
    }
  }, [athleteId])

  const save = async () => {
    const h = parseFloat(hours)
    if (form.sleep_quality == null || form.soreness == null || form.stress == null) {
      setError('Pick a number for sleep, soreness and stress.')
      return
    }
    if (!Number.isFinite(h) || h < 0 || h > 16) {
      setError('Enter how many hours you slept. It counts toward your daily points.')
      return
    }
    setSaving(true)
    setError(null)
    let result: { data: unknown; error: { message: string } | null } = { data: null, error: null }
    const gained = await withPointsDelta(athleteId, localDate(), async () => {
      result = await createClient()
        .from('daily_checkins')
        .upsert(
          {
            athlete_id: athleteId,
            check_date: localDate(),
            sleep_quality: form.sleep_quality,
            soreness: form.soreness,
            stress: form.stress,
            sleep_hours: h,
          },
          { onConflict: 'athlete_id,check_date' }
        )
        .select('*')
        .single()
    })
    const { data, error: e } = result
    setSaving(false)
    if (e || !data) {
      setError(e?.message || 'Could not save')
      return
    }
    if (gained > 0) {
      buzz()
      setBurst(gained)
      setTimeout(() => setBurst(0), 1400)
    }
    setToday(data as Checkin)
    setEditing(false)
    onSaved?.()
  }

  if (today === undefined) return <div className="h-32 rounded-3xl bg-white/60 animate-pulse" />

  const meta = readinessMeta(today?.readiness)
  const showForm = !today || editing

  return (
    <section className={embedded ? 'space-y-4' : 'bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4'}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{embedded ? 'Readiness score' : 'Daily readiness'}</span>
        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${meta.chip}`}>{meta.label}</span>
      </div>

      {!showForm && today && (
        <div className="flex items-center gap-4">
          <span key={burst > 0 ? 'pop' : 'still'} className={`relative inline-flex ${burst > 0 ? 'animate-gen-pop' : ''}`}>
            <ReadinessRing score={today.readiness} color={meta.ring} />
            <PointBubble amount={burst} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-slate-900">{meta.headline}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sleep {today.sleep_quality}/5{today.sleep_hours != null ? ` (${today.sleep_hours}h)` : ''} · Soreness {today.soreness}/5 · Stress {today.stress}/5
            </p>
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-extrabold text-[#1746b8] mt-1 cursor-pointer">
              Update check-in
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="space-y-3">
          {!today && <p className="text-sm font-bold text-slate-700">How are you feeling today?</p>}
          {SCALES.map((s) => (
            <div key={s.key}>
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 mb-1.5">
                <span>{s.label}</span>
                <span className="text-[10px] font-bold text-slate-400">1 = {s.low} · 5 = {s.high}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, [s.key]: n }))}
                    className={`py-2.5 rounded-xl text-sm font-extrabold cursor-pointer transition ${
                      form[s.key] === n ? 'bg-[#1746b8] text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="flex items-center justify-between gap-3 text-xs font-extrabold text-slate-700">
            Hours of sleep last night
            <input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="8"
              className="w-20 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-slate-900 text-center"
            />
          </label>
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <div className="flex gap-2">
            {today && (
              <button type="button" onClick={() => setEditing(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-extrabold text-slate-600 cursor-pointer">
                Cancel
              </button>
            )}
            <button type="button" onClick={save} disabled={saving} className="flex-1 py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
              {saving ? 'Saving…' : 'Save check-in'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
