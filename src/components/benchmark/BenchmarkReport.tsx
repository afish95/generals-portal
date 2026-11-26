'use client'

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import BenchmarkDetail from './BenchmarkDetail'
import { createClient } from '@/lib/supabase'
import { latestLine } from '@/lib/focus'
import { num, type GcLine } from '@/lib/gcStats'
import { HITTER, LEVEL_LABEL, LEVEL_SHORT, PITCHER, fmtBench, percentile, sourceNote, type BenchMetric, type Level } from '@/lib/benchmarks'

export type Kind = 'hitter' | 'pitcher'
export type BenchValues = { values: Record<string, number | null>; seasons: { batting?: string; pitching?: string }; loaded: boolean }

const TYPE_LABEL: Record<string, string> = { Spring: 'Spring Varsity', JV: 'Spring JV', Summer: 'Summer' }
const ratio = (a: number | null, b: number | null) => (a == null || !b ? null : (100 * a) / b)

/** The player's numbers: training bests from logs/bullpens, game stats from their latest season. */
export function useBenchmarkValues(athleteId: string | null): BenchValues {
  const [state, setState] = useState<BenchValues>({ values: {}, seasons: {}, loaded: false })
  useEffect(() => {
    if (!athleteId) return
    let cancelled = false
    const supabase = createClient()
    setState({ values: {}, seasons: {}, loaded: false })
    Promise.all([
      supabase.rpc('benchmark_inputs', { p_athlete: athleteId }),
      supabase.from('gc_season_stats').select('id, player_id, player_name, season_year, season_type, stat_type, stats').eq('player_id', athleteId),
    ]).then(([t, g]) => {
      if (cancelled) return
      const tr = (Array.isArray(t.data) ? t.data[0] : t.data) as Record<string, number | null> | undefined
      const lines = (g.data as GcLine[]) || []
      const bat = latestLine(lines, athleteId, 'batting')
      const pit = latestLine(lines, athleteId, 'pitching')
      const b = bat?.stats || {}
      const p = pit?.stats || {}
      const avg = num(b.AVG)
      const slg = num(b.SLG)
      const n = (v: unknown) => (v == null ? null : Number(v))
      setState({
        loaded: true,
        seasons: {
          batting: bat ? `${bat.season_year} ${TYPE_LABEL[bat.season_type]} (${num(b.PA) ?? 0} PA)` : undefined,
          pitching: pit ? `${pit.season_year} ${TYPE_LABEL[pit.season_type]} (${num(p.BF) ?? 0} BF)` : undefined,
        },
        values: {
          bat_speed: n(tr?.bat_speed_avg),
          exit_velo: n(tr?.exit_velo_max),
          fb_max: n(tr?.fb_velo_max),
          fb_avg: n(tr?.fb_velo_avg),
          avg,
          obp: num(b.OBP),
          iso: avg != null && slg != null ? slg - avg : null,
          k_pct: ratio(num(b.SO), num(b.PA)),
          bb_pct: ratio(num(b.BB), num(b.PA)),
          p_k_pct: ratio(num(p.SO), num(p.BF)),
          p_bb_pct: ratio(num(p.BB), num(p.BF)),
          strike_pct: num(p['S%']),
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [athleteId])
  return state
}

const ringColor = (p: number) => (p >= 75 ? '#059669' : p >= 50 ? '#1746b8' : p >= 25 ? '#d97706' : '#e11d48')

function Ring({ pctl, label, size = 56 }: { pctl: number | null; label: string; size?: number }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center min-w-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={pctl == null ? `${label}: no benchmark` : `${label}: ${pctl}th percentile`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        {pctl != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor(pctl)}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(pctl / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.3} fontWeight="900" fill={pctl == null ? '#94a3b8' : '#0f172a'}>
          {pctl == null ? '–' : pctl}
        </text>
      </svg>
      <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 text-center leading-tight mt-0.5">{label}</div>
    </div>
  )
}

function Tile({ m, value, mine, vs, print, onOpen }: { m: BenchMetric; value: number | null; mine: Level; vs: Level; print?: boolean; onOpen?: () => void }) {
  const notes = [...new Set([sourceNote(m, mine), sourceNote(m, vs)].filter(Boolean))]
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => onOpen && (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className={`rounded-2xl border border-slate-200 bg-white ${print ? 'p-2.5' : 'p-3.5 cursor-pointer hover:border-[#1746b8]/50'} flex flex-col`}
    >
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{m.label}</div>
      <div className={`${print ? 'text-lg' : 'text-xl'} font-black text-[#1746b8] leading-tight`}>{fmtBench(m, value)}</div>
      {value == null ? (
        <p className="text-[11px] font-semibold text-slate-400 mt-2">No data yet. {m.howTo}</p>
      ) : (
        <div className="flex justify-around gap-2 mt-2">
          <Ring pctl={percentile(m, mine, value)} label={`vs ${LEVEL_SHORT[mine]}`} size={print ? 50 : 56} />
          {vs !== mine && m.levels[vs] !== m.levels[mine] && <Ring pctl={percentile(m, vs, value)} label={`vs ${LEVEL_SHORT[vs]}`} size={print ? 50 : 56} />}
        </div>
      )}
      {notes.length > 0 && <div className="text-[9px] font-semibold text-slate-400 mt-1.5">{notes.join(' · ')}</div>}
      {onOpen && (
        <div className="mt-auto pt-2 text-[10px] font-extrabold text-[#1746b8] flex items-center gap-0.5">
          Full Breakdown <ChevronRight className="w-3 h-3" />
        </div>
      )}
    </div>
  )
}

/** The report body, shared by the in-app page and the 1-page export. */
export default function BenchmarkReport({ kind, data, mine, vs, print = false }: { kind: Kind; data: BenchValues; mine: Level; vs: Level; print?: boolean }) {
  const sections = kind === 'hitter' ? HITTER : PITCHER
  const season = kind === 'hitter' ? data.seasons.batting : data.seasons.pitching
  const [open, setOpen] = useState<{ m: BenchMetric; section: string } | null>(null)
  if (!data.loaded) return <div className="h-60 rounded-3xl bg-white/60 animate-pulse" />
  return (
    <div className={print ? 'space-y-3' : 'space-y-4'}>
      {sections.map((s) => (
        <section key={s.title} className={print ? '' : 'bg-white/60 rounded-3xl'}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-4 rounded-full bg-[#1746b8]" />
            <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-800">{s.title}</h3>
          </div>
          <div className={`grid gap-2.5 ${print ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-3'}`}>
            {s.metrics.map((m) => (
              <Tile key={m.key} m={m} value={data.values[m.key] ?? null} mine={mine} vs={vs} print={print} onOpen={print ? undefined : () => setOpen({ m, section: s.title })} />
            ))}
          </div>
        </section>
      ))}
      <p className="text-[10px] font-semibold text-slate-400 leading-snug">
        Percentile = where your number would rank at that level (50 = average). Training numbers use all your logged sessions; game stats use{' '}
        {season ? <b className="text-slate-500">{season}</b> : 'your latest season'}. Benchmarks: Driveline Baseball Player Benchmark ({LEVEL_LABEL.hs_under} 15–16, {LEVEL_LABEL.hs_upper} 17–18, College) and Generals Spring
        Varsity history where marked.
      </p>
      {open && (
        <BenchmarkDetail m={open.m} value={data.values[open.m.key] ?? null} mine={mine} vs={vs} section={`${kind === 'hitter' ? 'Hitting' : 'Pitching'} · ${open.section}`} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
