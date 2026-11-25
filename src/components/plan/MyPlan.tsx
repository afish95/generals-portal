'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, Play, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { currentValue, fmtValue, optionFor, type DrillOption, type PlayerFocus } from '@/lib/focus'
import { useFocusData } from './useFocusData'
import VideoEmbed from '@/components/library/VideoEmbed'

/** Progress from where the player started toward the goal, 0–100. */
export function progressPct(f: Pick<PlayerFocus, 'baseline' | 'goal' | 'lower_is_better'>, now: number | null) {
  if (f.baseline == null || f.goal == null || now == null || f.goal === f.baseline) return null
  const p = ((now - f.baseline) / (f.goal - f.baseline)) * 100
  return Math.max(0, Math.min(100, Math.round(p)))
}

export function FocusProgress({ f, now }: { f: PlayerFocus; now: number | null }) {
  const o = optionFor(f.metric_source, f.metric_key)
  if (!o) return null
  const pct = progressPct(f, now)
  return (
    <div className="mt-3">
      <div className="flex items-end justify-between text-[11px] font-bold text-slate-500">
        <span>Start {fmtValue(o, f.baseline)}</span>
        <span className="text-center">
          <span className="block text-[10px] uppercase tracking-wide text-slate-400">Now</span>
          <span className="text-base font-black text-slate-900">{fmtValue(o, now)}</span>
        </span>
        <span>Goal {fmtValue(o, f.goal)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1746b8]'}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <div className="text-[10px] font-semibold text-slate-400 mt-1">{o.label}</div>
    </div>
  )
}

export default function MyPlan({ athleteId, onStartTool }: { athleteId: string; onStartTool?: (scriptId: number, title: string) => void }) {
  const [focus, setFocus] = useState<PlayerFocus[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const { lines, ea, training, drills } = useFocusData()

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('player_focus')
      .select('*')
      .eq('athlete_id', athleteId)
      .in('status', ['published', 'done'])
      .order('sort_order')
      .then(({ data }) => !cancelled && setFocus((data as PlayerFocus[]) || []))
    return () => {
      cancelled = true
    }
  }, [athleteId])

  if (focus === null) return <div className="h-32 rounded-3xl bg-white/60 animate-pulse" />

  if (!focus.length)
    return (
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1746b8] flex items-center justify-center shrink-0">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <div className="text-sm font-extrabold text-slate-900">Your plan is on the way</div>
          <div className="text-xs font-medium text-slate-500">Your coach is setting your focus areas. Keep logging so your goals are based on real numbers.</div>
        </div>
      </section>
    )

  const drillInfo = (d: { kind: string; id: number }): DrillOption | undefined => drills.find((x) => x.kind === d.kind && x.id === d.id)
  const active = focus.filter((f) => f.status === 'published')
  const done = focus.filter((f) => f.status === 'done')
  const updated = focus.reduce((m, f) => (f.updated_at > m ? f.updated_at : m), '')

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">My plan</div>
        {updated && <div className="text-[10px] font-bold text-slate-400">Updated {new Date(updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>}
      </div>
      {active.map((f, i) => {
        const now = lines && training ? currentValue(f, athleteId, lines, ea, training) : null
        return (
          <div key={f.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-[#1746b8] text-white text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-extrabold text-slate-900 leading-tight">{f.title}</div>
                {f.why && <p className="text-xs font-medium text-slate-600 mt-1">{f.why}</p>}
                {f.target_date && (
                  <div className="text-[11px] font-bold text-[#1746b8] mt-1">Goal date: {new Date(f.target_date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                )}
              </div>
            </div>
            {f.metric_key && <FocusProgress f={f} now={now} />}
            {f.drills.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2 space-y-1">
                {f.drills.map((d) => {
                  const info = drillInfo(d)
                  const key = `${f.id}-${d.kind}-${d.id}`
                  const isOpen = open === key
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="flex-1 flex items-center gap-2 py-1.5 text-left cursor-pointer">
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                          <span className="text-sm font-bold text-slate-800 truncate">{d.name}</span>
                          {d.freq && <span className="text-[10px] font-extrabold text-slate-400 shrink-0">{d.freq}</span>}
                        </button>
                        {d.kind === 'script' && onStartTool && (
                          <button type="button" onClick={() => onStartTool(d.id, d.name)} className="px-3 py-1.5 rounded-xl bg-[#1746b8] text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer">
                            <Play className="w-3 h-3" /> Start
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <div className="ml-6 mb-2 text-xs font-medium text-slate-600 space-y-1.5">
                          <VideoEmbed url={info?.video_url} title={d.name} />
                          <p className="whitespace-pre-line">{(info?.notes || (d.kind === 'script' ? 'A guided bullpen. Tap Start and follow each pitch.' : 'Log it in your workouts so your coach can see your progress.')).replace(/; (?=\d\)|Heat Zone|\*\*)/g, '\n')}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {done.length > 0 && (
        <div className="space-y-1">
          {done.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> {f.title}: done
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
