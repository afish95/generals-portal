'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { callApi } from '@/lib/api'
import { useProfile } from '@/components/shell/AppShell'
import { localDate } from '@/lib/training'
import { computeStreak, streakAddDays, STREAK_GOAL, type DayScore } from '@/lib/streak'
import { buzz } from './PointBurst'

type Streak = ReturnType<typeof computeStreak>

/** Home: compact, game-style progress toward a 14-day perfect-points streak. */
export default function StreakCard({ athleteId, refreshKey = 0 }: { athleteId: string; refreshKey?: number }) {
  const { viewAs } = useProfile()
  const [s, setS] = useState<Streak | null>(null)
  const [shown, setShown] = useState(0) // pips filled on screen (animates toward s.progress)
  const [plusOne, setPlusOne] = useState(0)
  const [resetNote, setResetNote] = useState(false)
  const [celebrate, setCelebrate] = useState<number | null>(null)
  const awardChecked = useRef(false)

  useEffect(() => {
    let cancelled = false
    const today = localDate()
    createClient()
      .rpc('athlete_points', { p_athlete: athleteId, p_from: streakAddDays(today, -119), p_to: today })
      .then(({ data }) => {
        if (cancelled) return
        const mine: DayScore[] = ((data as { athlete_id: string; d: string; earned: number; available: number }[]) || [])
          .filter((r) => r.athlete_id === athleteId)
          .map((r) => ({ d: String(r.d), earned: Number(r.earned), available: Number(r.available) }))
        const next = computeStreak(mine, today)
        setS(next)

        // Compare with what this device last showed, to animate gains and flag resets
        const key = `generals.streak.${viewAs.active ? 'preview.' : ''}${athleteId}`
        let prev: number | null = null
        try {
          const raw = localStorage.getItem(key)
          prev = raw == null ? null : Number(raw)
          localStorage.setItem(key, String(next.streak))
        } catch {}
        if (prev != null && next.streak > prev) {
          const prevProgress = Math.floor(prev / STREAK_GOAL) < Math.floor(next.streak / STREAK_GOAL) ? Math.max(0, next.progress - (next.streak - prev)) : prev % STREAK_GOAL
          setShown(prevProgress)
          setTimeout(() => {
            if (cancelled) return
            setShown(next.progress)
            setPlusOne(next.streak - prev!)
            buzz()
            setTimeout(() => setPlusOne(0), 1500)
            if (Math.floor(next.streak / STREAK_GOAL) > Math.floor(prev! / STREAK_GOAL)) setTimeout(() => setCelebrate(next.streak), 700)
          }, 250)
        } else {
          setShown(next.progress)
          if (prev != null && prev > 0 && next.streak < prev) setResetNote(true)
        }

        // Server double-checks and sends the congrats + coach alert once per milestone
        if (next.completions >= 1 && !viewAs.active && !awardChecked.current) {
          awardChecked.current = true
          callApi('/api/streak', { body: { today } })
        }
      })
    return () => {
      cancelled = true
    }
  }, [athleteId, refreshKey, viewAs.active])

  useEffect(() => {
    if (celebrate == null) return
    const t = setTimeout(() => setCelebrate(null), 5000)
    return () => clearTimeout(t)
  }, [celebrate])

  if (!s) return <div className="h-[92px] rounded-3xl bg-white/60 animate-pulse" />

  const done = s.progress >= STREAK_GOAL && s.streak > 0
  const left = Math.max(0, s.todayAvailable - s.todayEarned)
  const nextDay = s.streak + 1
  const status = s.todayPerfect
    ? done
      ? `Streak complete! Keep it going for the next ${STREAK_GOAL}.`
      : `Today locked in ✓ Come back tomorrow for day ${Math.min(nextDay, s.completions * STREAK_GOAL + STREAK_GOAL)}.`
    : s.streak === 0
      ? `Earn all ${s.todayAvailable} points today to start your streak.`
      : `Today ${s.todayEarned}/${s.todayAvailable}: ${left} more point${left === 1 ? '' : 's'} to make it day ${nextDay}.`

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f2a6e] via-[#1746b8] to-[#1e54d4] p-3.5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${s.streak > 0 ? 'bg-gradient-to-br from-amber-300 to-orange-500 shadow-lg shadow-orange-500/40' : 'bg-white/15'}`}>
              <Flame className={`w-6 h-6 ${s.streak > 0 ? 'text-white animate-gen-flame' : 'text-blue-200'}`} />
            </div>
            <span key={s.streak} className="absolute -bottom-1.5 -right-1.5 min-w-6 h-6 px-1 rounded-full bg-white text-[#1746b8] text-xs font-black flex items-center justify-center shadow animate-gen-pop">
              {s.streak}
            </span>
            {plusOne > 0 && (
              <span className="pointer-events-none absolute left-1/2 -top-2 z-10 whitespace-nowrap rounded-full bg-amber-400 text-white text-[10px] font-black px-2 py-0.5 shadow animate-gen-float">
                +{plusOne} day
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-blue-200">Perfect-Day Streak</span>
              <span className="text-[11px] font-black text-amber-300 tabular-nums">
                {Math.min(shown, STREAK_GOAL)}/{STREAK_GOAL}
              </span>
            </div>
            <Pips filled={shown} pulseIndex={!s.todayPerfect && s.progress < STREAK_GOAL ? s.progress : -1} />
          </div>

          <div className="relative shrink-0 flex flex-col items-center">
            <Trophy className={`w-7 h-7 ${done || s.completions > 0 ? 'text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.8)]' : 'text-white/30'}`} />
            {s.completions > 0 && <span className="text-[9px] font-black text-amber-300 leading-none mt-0.5">×{s.completions}</span>}
          </div>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-blue-100/90 truncate">
          {resetNote && !s.todayPerfect ? 'Streak reset. A perfect day today starts a new one.' : status}
        </p>
      </section>

      {celebrate != null && <Celebration days={Math.floor(celebrate / STREAK_GOAL) * STREAK_GOAL} onClose={() => setCelebrate(null)} />}
    </>
  )
}

function Pips({ filled, pulseIndex }: { filled: number; pulseIndex: number }) {
  return (
    <div className="mt-1.5 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${STREAK_GOAL}, minmax(0, 1fr))` }}>
      {Array.from({ length: STREAK_GOAL }, (_, i) => {
        const on = i < filled
        return (
          <span
            key={i}
            className={`relative h-2.5 rounded-full overflow-hidden ${on ? '' : 'bg-white/15'} ${i === pulseIndex ? 'ring-1 ring-amber-300/80 animate-gen-pip' : ''}`}
          >
            <span
              className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500 transition-transform duration-500 ease-out origin-left"
              style={{ transform: on ? 'scaleX(1)' : 'scaleX(0)', transitionDelay: on ? `${i * 40}ms` : '0ms' }}
            />
            {on && <span className="absolute inset-0 gen-shimmer" />}
          </span>
        )
      })}
    </div>
  )
}

function Celebration({ days, onClose }: { days: number; onClose: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 53) % 100,
        delay: (i % 9) * 0.12,
        duration: 2.2 + ((i * 7) % 10) / 10,
        color: ['#fbbf24', '#f97316', '#ffffff', '#60a5fa', '#34d399'][i % 5],
        size: 6 + (i % 3) * 3,
      })),
    []
  )
  return (
    <button type="button" onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b1f55]/70 backdrop-blur-[2px] px-6 cursor-pointer">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 animate-gen-confetti rounded-sm"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
        />
      ))}
      <div className="relative w-full max-w-xs rounded-3xl bg-gradient-to-br from-[#0f2a6e] to-[#1746b8] border border-amber-300/50 p-6 text-center text-white shadow-2xl animate-gen-burst">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/50">
          <Trophy className="w-9 h-9 text-white" />
        </div>
        <div className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-300">Achievement Unlocked</div>
        <div className="text-2xl font-black leading-tight mt-1">{days}-day streak!</div>
        <div className="text-lg font-extrabold mt-1">Congratulations!</div>
        <p className="text-xs text-blue-100 mt-2">Every point, every day. Your coach has been notified. Check your messages.</p>
        <div className="mt-4 text-[10px] font-bold text-blue-200">Tap to Continue</div>
      </div>
    </button>
  )
}
