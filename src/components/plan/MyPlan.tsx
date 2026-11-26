'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, Play, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { currentValue, fmtValue, focusKind, optionFor, type DrillOption, type PlayerFocus } from '@/lib/focus'
import { useFocusData } from './useFocusData'
import VideoEmbed from '@/components/library/VideoEmbed'
import KindBadge from './KindBadge'

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

export default function MyPlan({ athleteId, onStartTool, title = 'My Plan' }: { athleteId: string; onStartTool?: (scriptId: number, title: string) => void; title?: string }) {
  const [focus, setFocus] = useState<PlayerFocus[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [openGoal, setOpenGoal] = useState<number | null>(null)
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
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
        {updated && <div className="text-[10px] font-bold text-slate-400">Updated {new Date(updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {active.slice(0, 4).map((f, i) => {
          const now = lines && training ? currentValue(f, athleteId, lines, ea, training) : null
          const pct = f.metric_key ? progressPct(f, now) : null
          const sel = openGoal === f.id
          return (
            <button key={f.id} type="button" onClick={() => setOpenGoal(sel ? null : f.id)} className={`text-left rounded-2xl border p-3 min-h-[6.5rem] flex flex-col cursor-pointer transition ${sel ? 'border-[#1746b8] bg-blue-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#1746b8] text-white text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                <KindBadge kind={focusKind(f)} />
              </div>
              <div className="text-sm font-extrabold text-slate-900 leading-tight mt-1.5 line-clamp-2 flex-1">{f.title}</div>
              {pct != null ? (
                <div className="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden">
                  <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1746b8]'}`} style={{ width: `${pct}%` }} />
                </div>
              ) : (
                <div className="text-[10px] font-bold text-slate-400 mt-2">{f.drills.length} drill{f.drills.length === 1 ? '' : 's'}</div>
              )}
            </button>
          )
        })}
      </div>
      {active.map((f, i) => {
        if (openGoal !== f.id) return null
        const now = lines && training ? currentValue(f, athleteId, lines, ea, training) : null
        return (
          <div key={f.id} className="rounded-2xl border-2 border-[#1746b8] p-4">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-[#1746b8] text-white text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <KindBadge kind={focusKind(f)} />
                <div className="text-base font-extrabold text-slate-900 leading-tight mt-0.5">{f.title}</div>
                {f.why && <p className="text-xs font-medium text-slate-600 mt-1">{f.why}</p>}
                {f.target_date && (
                  <div className="text-[11px] font-bold text-[#1746b8] mt-1">Goal date: {new Date(f.target_date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                )}
              </div>
            </div>
            {f.metric_key && <FocusProgress f={f} now={now} />}
            {f.drills.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2 space-y-1">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Drills &amp; Videos</div>
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
