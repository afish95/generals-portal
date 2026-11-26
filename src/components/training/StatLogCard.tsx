'use client'

import CoachEdit from '@/components/CoachEdit'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { localDate, prettyDate } from '@/lib/training'
import { STAT_EXERCISES } from '@/lib/trainingMetrics'
import LogStat from './LogStat'
import Trend from '@/components/Trend'

type Recent = { id: number; exercise_id: number; value: number; logged_at: string }

/** Overview widget: log any training stat for today, with the latest entries underneath (like the body weight log). */
export default function StatLogCard({ athleteId, interactive = true, onLogged }: { athleteId: string; interactive?: boolean; onLogged?: () => void }) {
  const [recent, setRecent] = useState<Recent[] | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('set_logs')
      .select('id, exercise_id, value, logged_at')
      .eq('athlete_id', athleteId)
      .in('exercise_id', STAT_EXERCISES.map((s) => s.exerciseId))
      .order('logged_at', { ascending: false })
      .limit(60)
      .then(({ data }) => !cancelled && setRecent(((data as Recent[]) || []).map((r) => ({ ...r, value: Number(r.value) }))))
    return () => {
      cancelled = true
    }
  }, [athleteId, version])

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Stat Log</div>
        <CoachEdit href={`/office?tab=data&player=${athleteId}&sub=logs`} label="Edit All" />
      </div>
      <LogStat
        athleteId={athleteId}
        date={localDate()}
        interactive={interactive}
        onLogged={() => {
          setVersion((n) => n + 1)
          onLogged?.()
        }}
      />
      {recent && recent.length > 0 && (
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Recent</div>
          <ul className="divide-y divide-slate-100">
            {recent.slice(0, 6).map((r, i) => {
              const s = STAT_EXERCISES.find((x) => x.exerciseId === r.exercise_id)
              const prev = recent.slice(i + 1).find((x) => x.exercise_id === r.exercise_id)
              return (
                <li key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="font-bold text-slate-700">{s?.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-black text-slate-900">
                      {r.value} <span className="text-[10px] font-bold text-slate-400">{s?.unit}</span>
                    </span>
                    <span className="w-12 text-right text-[10px]">
                      <Trend delta={prev ? r.value - prev.value : null} lowerIsBetter={s?.unit === 'sec'} digits={s?.unit === 'sec' ? 2 : 1} />
                    </span>
                    <span className="w-14 text-right text-[10px] font-semibold text-slate-400">{prettyDate(r.logged_at.slice(0, 10), { month: 'short', day: 'numeric' })}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
