'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  HITTER_METRICS,
  PITCHER_METRICS,
  SPIDER,
  findMetric,
  formatMetric,
  ipOuts,
  metricPercentile,
  num,
  type EarlyAhead,
  type GcLine,
} from '@/lib/gcStats'

type Kind = 'hitter' | 'pitcher'

/** Baseball Savant-style percentile bars plus a spider chart, ranked against teammates. */
export default function PercentileRankings({ myId, isCoach }: { myId: string; isCoach: boolean }) {
  const [seasons, setSeasons] = useState<number[]>([])
  const [season, setSeason] = useState<number | null>(null)
  const [lines, setLines] = useState<GcLine[] | null>(null)
  const [ea, setEa] = useState<EarlyAhead[]>([])
  const [kind, setKind] = useState<Kind>('hitter')
  const [who, setWho] = useState<number | null>(null)
  const [compare, setCompare] = useState<number | null>(null)

  useEffect(() => {
    createClient()
      .from('gc_season_stats')
      .select('season_year')
      .then(({ data }) => {
        const s = [...new Set(((data as { season_year: number }[]) || []).map((r) => r.season_year))].sort((a, b) => b - a)
        setSeasons(s)
        setSeason(s[0] ?? null)
        if (!s.length) setLines([])
      })
  }, [])

  useEffect(() => {
    if (season == null) return
    let cancelled = false
    const supabase = createClient()
    Promise.all([
      supabase.from('gc_season_stats').select('id, player_id, player_name, season_year, stat_type, stats').eq('season_year', season),
      supabase.from('pitcher_early_ahead').select('player_name, early, ahead').eq('season_year', season),
    ]).then(([g, e]) => {
      if (cancelled) return
      const ls = (g.data as GcLine[]) || []
      setLines(ls)
      setEa((e.data as EarlyAhead[]) || [])
      const mine = ls.filter((l) => l.player_id === myId)
      const startKind: Kind = !isCoach && mine.some((l) => l.stat_type === 'pitching') && !mine.some((l) => l.stat_type === 'batting') ? 'pitcher' : 'hitter'
      setKind(startKind)
    })
    return () => {
      cancelled = true
    }
  }, [season, myId, isCoach])

  const type = kind === 'hitter' ? 'batting' : 'pitching'
  const pool = useMemo(
    () =>
      (lines || [])
        .filter((l) => l.stat_type === type)
        .sort((a, b) => (type === 'batting' ? (num(b.stats.PA) ?? 0) - (num(a.stats.PA) ?? 0) : ipOuts(num(b.stats.IP)) - ipOuts(num(a.stats.IP)))),
    [lines, type]
  )

  // Default to me, else the player with the most playing time
  useEffect(() => {
    if (!pool.length) return
    const mine = pool.find((l) => l.player_id === myId)
    setWho((cur) => (cur != null && pool.some((l) => l.id === cur) ? cur : (mine ?? pool[0]).id))
    setCompare(null)
  }, [pool, myId])

  if (lines === null) return <div className="h-64 rounded-3xl bg-white/60 animate-pulse" />
  if (!seasons.length) return <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs text-sm text-slate-600">No game stats yet.</section>

  const eaFor = (name: string) => ea.find((x) => x.player_name === name)
  const player = pool.find((l) => l.id === who) ?? pool[0]
  const other = pool.find((l) => l.id === compare)
  const groups = kind === 'hitter' ? HITTER_METRICS : PITCHER_METRICS

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex p-1 rounded-xl bg-white border border-slate-200">
          {(['hitter', 'pitcher'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`px-4 py-1.5 rounded-lg text-xs font-extrabold capitalize cursor-pointer ${kind === k ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
              {k}s
            </button>
          ))}
        </div>
        {seasons.length > 1 && (
          <select value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold">
            {seasons.map((s) => <option key={s} value={s}>{s} season</option>)}
          </select>
        )}
        <select value={player?.id ?? ''} onChange={(e) => setWho(Number(e.target.value))} className="flex-1 min-w-[160px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-extrabold text-slate-900">
          {pool.map((l) => <option key={l.id} value={l.id}>{l.player_name}{l.player_id === myId ? ' (you)' : ''}</option>)}
        </select>
      </div>

      {!player ? (
        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs text-sm text-slate-600">No {kind}s in this season.</section>
      ) : (
        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-6 lg:items-start">
          <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Percentile rankings</div>
                <div className="text-lg font-black text-slate-900">{player.player_name}</div>
              </div>
              <div className="text-[10px] font-bold text-slate-400 text-right">
                {kind === 'hitter' ? `${player.stats.PA ?? 0} PA` : `${player.stats.IP ?? 0} IP · ${player.stats.BF ?? 0} BF`}
                <br />vs. teammates
              </div>
            </div>
            <Legend />
            {groups.map((g) => (
              <div key={g.group}>
                <div className="text-xs font-extrabold text-slate-900 border-b-2 border-[#1746b8] pb-1 mb-2">{g.group}</div>
                <div className="space-y-1.5">
                  {g.metrics.map((m) => {
                    const r = metricPercentile(m, lines, player, eaFor)
                    return <Bar key={m.key} label={m.label} pctl={r.pctl} value={formatMetric(m, r.value)} />
                  })}
                </div>
              </div>
            ))}
            {kind === 'pitcher' && !eaFor(player.player_name) && (
              <p className="text-[11px] font-semibold text-amber-700">E+A% and Pitcher Score need Early and Ahead counts. {isCoach ? 'Add them in Coach Office → Game stats.' : 'Your coach adds these.'}</p>
            )}
            <p className="text-[10px] font-semibold text-slate-400">Ranked against teammates with 20+ plate appearances or 5+ innings. 50 is the team middle; 99 is the best.</p>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{kind === 'hitter' ? 'Hitter' : 'Pitcher'} profile</div>
              <select value={compare ?? ''} onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : null)} className="px-2 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold max-w-[55%]">
                <option value="">Compare with…</option>
                {pool.filter((l) => l.id !== player.id).map((l) => <option key={l.id} value={l.id}>{l.player_name}</option>)}
              </select>
            </div>
            <Spider kind={kind} lines={lines} a={player} b={other} eaFor={eaFor} />
            {kind === 'pitcher' && (
              <p className="text-[10px] font-semibold text-slate-400">
                Pitcher Score = (FPS% + TS% + E+A% + K-BB%) ÷ 2. E% = Early ÷ batters faced, A% = Ahead ÷ batters faced.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

/** Savant-style colour: blue (poor) → grey (average) → red (great) */
function heat(p: number) {
  const lerp = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t))
  const blue = [50, 90, 175]
  const grey = [178, 186, 196]
  const red = [214, 39, 40]
  const c = p <= 50 ? lerp(blue, grey, p / 50) : lerp(grey, red, (p - 50) / 50)
  return `rgb(${c.join(',')})`
}

function Legend() {
  return (
    <div className="grid grid-cols-3 text-[10px] font-extrabold">
      <span className="text-[#325aaf]">▼ POOR</span>
      <span className="text-center text-slate-400">AVERAGE</span>
      <span className="text-right text-[#d62728]">GREAT ▼</span>
    </div>
  )
}

function Bar({ label, pctl, value }: { label: string; pctl: number | null; value: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_52px] sm:grid-cols-[140px_minmax(0,1fr)_60px] items-center gap-2">
      <span className="text-[11px] font-bold text-slate-600 text-right truncate">{label}</span>
      <div className="relative h-5">
        <div className="absolute inset-y-1.5 inset-x-0 rounded-full bg-slate-100" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
        {pctl != null && (
          <>
            <div className="absolute inset-y-0.5 left-0 rounded-l-md transition-[width] duration-700" style={{ width: `${pctl}%`, background: heat(pctl) }} />
            <span
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-white text-[10px] font-black text-white flex items-center justify-center shadow"
              style={{ left: `${Math.max(pctl, 6)}%`, background: heat(pctl) }}
            >
              {pctl}
            </span>
          </>
        )}
      </div>
      <span className="text-xs font-bold text-slate-900 tabular-nums">{value}</span>
    </div>
  )
}

function Spider({ kind, lines, a, b, eaFor }: { kind: Kind; lines: GcLine[]; a: GcLine; b?: GcLine; eaFor: (n: string) => EarlyAhead | undefined }) {
  const keys = SPIDER[kind]
  const metrics = keys.map((k) => findMetric(kind, k))
  const size = 300
  const c = size / 2
  const R = 100
  const pt = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length
    return [c + Math.cos(ang) * r, c + Math.sin(ang) * r]
  }
  const series = [a, b].filter(Boolean).map((l) => metrics.map((m) => metricPercentile(m, lines, l!, eaFor)))
  const poly = (vals: { pctl: number | null }[]) => vals.map((v, i) => pt(i, ((v.pctl ?? 0) / 100) * R).join(',')).join(' ')
  const colors = ['#1746b8', '#f59e0b']

  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[340px] mx-auto" role="img" aria-label={`${kind} spider chart`}>
        {[25, 50, 75, 100].map((r) => (
          <polygon key={r} points={keys.map((_, i) => pt(i, (r / 100) * R).join(',')).join(' ')} fill="none" stroke={r === 50 ? '#94a3b8' : '#e2e8f0'} strokeDasharray={r === 50 ? '4 3' : undefined} />
        ))}
        {keys.map((_, i) => {
          const [x, y] = pt(i, R)
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#e2e8f0" />
        })}
        {series.map((s, si) => (
          <g key={si}>
            <polygon points={poly(s)} fill={colors[si]} fillOpacity={0.18} stroke={colors[si]} strokeWidth={2} />
            {s.map((v, i) => {
              const [x, y] = pt(i, ((v.pctl ?? 0) / 100) * R)
              return <circle key={i} cx={x} cy={y} r={4} fill={colors[si]} stroke="#fff" strokeWidth={1.5} />
            })}
          </g>
        ))}
        {metrics.map((m, i) => {
          const [x, y] = pt(i, R + 26)
          const v = series[0][i]
          return (
            <g key={m.key}>
              <text x={x} y={y - 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0f172a">{m.key === 'Score' ? 'Pitcher Score' : m.key}</text>
              <text x={x} y={y + 9} textAnchor="middle" fontSize="10" fill="#64748b">
                {formatMetric(m, v.value)}{v.pctl != null ? ` · ${v.pctl}` : ''}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="flex justify-center gap-4 text-[11px] font-bold mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#1746b8]" />{a.player_name}</span>
        {b && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500" />{b.player_name}</span>}
        <span className="flex items-center gap-1.5 text-slate-400"><span className="w-3 border-t-2 border-dashed border-slate-400" />Team middle</span>
      </div>
      <p className="text-[10px] font-semibold text-slate-400 text-center mt-1">Further out = higher team percentile. {kind === 'hitter' ? 'K% is flipped, so fewer strikeouts reaches further out.' : ''}</p>
    </div>
  )
}
