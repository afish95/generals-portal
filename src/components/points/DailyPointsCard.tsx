'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Minus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, prettyDate } from '@/lib/training'
import { normalizePoints, pct, type DayPoints } from '@/lib/points'
import ReadinessRing from '@/components/wellness/ReadinessRing'

type State = 'earned' | 'missed' | 'open' | 'off'

export default function DailyPointsCard({ athleteId, refreshKey = 0, readiness, onChange, date }: { athleteId: string; refreshKey?: number; readiness?: React.ReactNode; onChange?: () => void; date?: string }) {
  const day = date ?? localDate()
  const isToday = day === localDate()
  const [week, setWeek] = useState<DayPoints[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [readinessOpen, setReadinessOpen] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('daily_points', { p_from: addDays(day, -6), p_to: day })
      .then(({ data }) => {
        if (!cancelled) setWeek(normalizePoints(data).filter((r) => r.athlete_id === athleteId).sort((a, b) => a.d.localeCompare(b.d)))
      })
    return () => {
      cancelled = true
    }
  }, [athleteId, refreshKey, reload, day])

  const setLift = async (status: 'done' | 'rest') => {
    const supabase = createClient()
    const today = day
    setBusy(true)
    const t = week?.find((r) => r.d === today)
    const current = t ? (t.lift_ok ? 'done' : !t.lift_avail ? 'rest' : null) : null
    if (current === status) {
      await supabase.from('habit_logs').delete().eq('athlete_id', athleteId).eq('log_date', today).eq('habit', 'lift')
    } else {
      await supabase.from('habit_logs').upsert({ athlete_id: athleteId, log_date: today, habit: 'lift', status }, { onConflict: 'athlete_id,log_date,habit' })
    }
    setBusy(false)
    setReload((n) => n + 1)
    onChange?.()
  }

  if (!week) return <div className="h-64 rounded-3xl bg-white/60 animate-pulse" />

  const today = week.find((r) => r.d === day)
  const earned = today?.earned ?? 0
  const available = today?.available ?? 5
  const score = pct(earned, available)
  const ring = score === 100 ? '#10b981' : score >= 60 ? '#1746b8' : '#f59e0b'
  const weekEarned = week.reduce((n, r) => n + r.earned, 0)
  const weekAvail = week.reduce((n, r) => n + r.available, 0)

  const rows: { label: string; state: State; hint: string; action?: React.ReactNode }[] = [
    {
      label: '8+ hours of sleep',
      state: today?.sleep_ok ? 'earned' : today?.readiness_ok ? 'missed' : 'open',
      hint: today?.sleep_ok ? 'Locked in' : today?.readiness_ok ? 'Under 8 hours last night' : 'Enter your hours in the readiness check-in',
    },
    {
      label: 'Attendance',
      state: !today?.attend_avail ? 'off' : today.attend_ok ? 'earned' : 'missed',
      hint: !today?.attend_avail ? 'No school or practice today' : today.attend_ok ? 'Classes and practice done' : 'Check off classes and practice in your Day plan',
    },
    {
      label: 'Lift / workout / mobility',
      state: today?.lift_ok ? 'earned' : today && !today.lift_avail ? 'off' : 'open',
      hint: today?.lift_ok ? 'Done in Driveline Baseball' : today && !today.lift_avail ? 'Rest day' : 'Check it off in your Day plan',
      action: (
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => setLift('rest')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer ${today && !today.lift_avail ? 'bg-slate-500 text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {today && !today.lift_avail ? 'Rest day' : 'Rest'}
          </button>
        </div>
      ),
    },
    {
      label: 'Throwing',
      state: !today?.throw_avail ? 'off' : today.throw_ok ? 'earned' : 'open',
      hint: !today?.throw_avail ? 'No throwing assigned today' : today.throw_ok ? 'Complete' : 'Check it off in your Day plan',
      action:
        today?.throw_avail && !today.throw_ok ? (
          <Link href="/training" className="px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold bg-blue-50 text-[#1746b8]">Go</Link>
        ) : undefined,
    },
    {
      label: 'Arm readiness check-in',
      state: today?.readiness_ok ? 'earned' : 'open',
      hint: today?.readiness_ok ? 'Checked in · tap to see your score' : 'Tap to check in',
    },
  ]

  const icon = (s: State) =>
    s === 'earned' ? (
      <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center"><Check className="w-4 h-4" /></span>
    ) : s === 'missed' ? (
      <span className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center"><X className="w-4 h-4" /></span>
    ) : s === 'off' ? (
      <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><Minus className="w-4 h-4" /></span>
    ) : (
      <span className="w-8 h-8 rounded-xl border-2 border-dashed border-slate-300" />
    )

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{isToday ? 'Today’s points' : `Points · ${prettyDate(day, { weekday: 'short', month: 'short', day: 'numeric' })}`}</span>
        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          {earned}/{available} {isToday ? 'today' : 'that day'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ReadinessRing score={score} color={ring} display={String(earned)} suffix={`/${available} pts`} />
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-900">
            {score === 100 ? 'Perfect day! 🔥' : earned === 0 ? 'Start stacking points' : `${available - earned} to go for a perfect day`}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">This week: {weekEarned}/{weekAvail} points ({pct(weekEarned, weekAvail)}%)</p>
          <div className="flex gap-1 mt-2">
            {week.map((r) => {
              const p = pct(r.earned, r.available)
              return (
                <div key={r.d} className="flex flex-col items-center gap-0.5" title={`${prettyDate(r.d)}: ${r.earned}/${r.available}`}>
                  <div className={`w-6 h-6 rounded-lg text-[9px] font-black flex items-center justify-center ${p === 100 ? 'bg-emerald-500 text-white' : p >= 60 ? 'bg-blue-100 text-[#1746b8]' : p > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                    {r.earned}
                  </div>
                  <span className="text-[8px] font-bold text-slate-400">{prettyDate(r.d, { weekday: 'narrow' })}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => {
          const isReadiness = r.label === 'Arm readiness check-in' && !!readiness
          // Open the check-in automatically until it's done; after that, tap to expand.
          const expanded = isReadiness && (readinessOpen ?? !today?.readiness_ok)
          return (
            <li key={r.label}>
              <div
                className={`flex items-center gap-3 ${isReadiness ? 'cursor-pointer' : ''}`}
                onClick={isReadiness ? () => setReadinessOpen(!expanded) : undefined}
              >
                {icon(r.state)}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-extrabold ${r.state === 'off' ? 'text-slate-400' : 'text-slate-900'}`}>{r.label}</div>
                  <div className="text-[11px] font-semibold text-slate-500 truncate">{r.hint}</div>
                </div>
                {r.action}
                {isReadiness && <span className={`text-slate-400 text-lg leading-none transition ${expanded ? 'rotate-180' : ''}`}>⌄</span>}
              </div>
              {expanded && <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200 p-4">{readiness}</div>}
            </li>
          )
        })}
      </ul>
      <p className="text-[10px] font-semibold text-slate-400">Score is points earned out of what’s scheduled for you today. A dash means it doesn’t count today.</p>
    </section>
  )
}
