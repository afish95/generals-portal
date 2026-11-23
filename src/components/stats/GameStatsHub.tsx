'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ordinal } from '@/lib/rank'
import { COLS, LABELS, LOWER_BETTER, fmt, ipOuts, leaders, num, rankIn, type GcLine, type GcType } from '@/lib/gcStats'

/** Game stats from GameChanger: my season (players), team leaders, and the full team table. */
export default function GameStatsHub({ myId, isCoach }: { myId: string; isCoach: boolean }) {
  const [seasons, setSeasons] = useState<number[] | null>(null)
  const [season, setSeason] = useState<number | null>(null)
  const [lines, setLines] = useState<GcLine[] | null>(null)

  useEffect(() => {
    createClient()
      .from('gc_season_stats')
      .select('season_year')
      .then(({ data }) => {
        const s = [...new Set(((data as { season_year: number }[]) || []).map((r) => r.season_year))].sort((a, b) => b - a)
        setSeasons(s)
        setSeason((cur) => cur ?? s[0] ?? null)
      })
  }, [])

  useEffect(() => {
    if (season == null) return
    let cancelled = false
    setLines(null)
    createClient()
      .from('gc_season_stats')
      .select('id, player_id, player_name, season_year, stat_type, stats')
      .eq('season_year', season)
      .then(({ data }) => {
        if (!cancelled) setLines((data as GcLine[]) || [])
      })
    return () => {
      cancelled = true
    }
  }, [season])

  if (seasons === null) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
  if (seasons.length === 0)
    return (
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs text-sm text-slate-600">
        No game stats yet. {isCoach ? 'Import a GameChanger season export in Coach Office → Game stats.' : 'Your coach will add them after the season.'}
      </section>
    )

  const mine = lines?.filter((l) => l.player_id === myId) ?? []
  const myName = mine[0]?.player_name

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto">
        {seasons.map((s) => (
          <button key={s} type="button" onClick={() => setSeason(s)} className={`px-3 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${season === s ? 'bg-[#1746b8] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {s} season
          </button>
        ))}
      </div>
      {!lines ? (
        <div className="h-64 rounded-3xl bg-white/60 animate-pulse" />
      ) : (
        <>
          <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
            {!isCoach && (myName ? <MySeason lines={lines} mine={mine} name={myName} /> : <NotLinked />)}
            <TeamLeaders lines={lines} />
          </div>
          <TeamTable lines={lines} myName={myName} />
        </>
      )}
    </div>
  )
}

function NotLinked() {
  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs text-sm text-slate-600">
      Your game stats show here once the name on your GameChanger line matches your name in this app. Ask your coach if they’re missing.
    </section>
  )
}

function Tile({ k, v, type, lines, name, big = false }: { k: string; v: number | string | null | undefined; type: GcType; lines: GcLine[]; name: string; big?: boolean }) {
  const r = rankIn(lines, type, k, name)
  const tone = !r ? '' : r.pctl >= 75 ? 'bg-emerald-100 text-emerald-700' : r.pctl >= 50 ? 'bg-blue-100 text-[#1746b8]' : 'bg-amber-100 text-amber-700'
  return (
    <div className="rounded-2xl bg-slate-50 p-3" title={LABELS[k]}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold text-slate-500">{k}</span>
        {r && <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${tone}`}>{ordinal(r.pctl)}</span>}
      </div>
      <div className={`${big ? 'text-2xl' : 'text-lg'} font-black text-slate-900`}>{fmt(k, v)}</div>
      <div className="text-[10px] font-semibold text-slate-400 truncate">{LABELS[k]}</div>
    </div>
  )
}

function MySeason({ lines, mine, name }: { lines: GcLine[]; mine: GcLine[]; name: string }) {
  const bat = mine.find((l) => l.stat_type === 'batting')?.stats
  const pit = mine.find((l) => l.stat_type === 'pitching')?.stats
  const fld = mine.find((l) => l.stat_type === 'fielding')?.stats
  const positions = fld ? (['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const).map((p) => ({ p, inn: num(fld[p]) ?? 0 })).filter((x) => x.inn > 0).sort((a, b) => b.inn - a.inn) : []
  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">My season</div>
        <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Badges show your percentile on the team (99th is the top).</p>
      </div>
      {bat && (
        <div className="space-y-2">
          <div className="text-xs font-extrabold text-slate-900">Hitting</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {['AVG', 'OBP', 'SLG', 'OPS'].map((k) => <Tile key={k} k={k} v={bat[k]} type="batting" lines={lines} name={name} big />)}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {['H', '2B', 'HR', 'RBI', 'R', 'SB'].map((k) => <Tile key={k} k={k} v={bat[k]} type="batting" lines={lines} name={name} />)}
          </div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pt-1">Approach</div>
          <div className="grid grid-cols-3 gap-2">
            {['QAB%', 'C%', 'BB/K', 'PS/PA', 'HHB', 'BA/RISP'].map((k) => <Tile key={k} k={k} v={bat[k]} type="batting" lines={lines} name={name} />)}
          </div>
        </div>
      )}
      {pit && (
        <div className="space-y-2">
          <div className="text-xs font-extrabold text-slate-900">Pitching</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {['ERA', 'WHIP', 'IP', 'SO'].map((k) => <Tile key={k} k={k} v={pit[k]} type="pitching" lines={lines} name={name} big />)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['S%', 'FPS%', 'K/BB', 'BAA', 'BB/INN', 'FIP'].map((k) => <Tile key={k} k={k} v={pit[k]} type="pitching" lines={lines} name={name} />)}
          </div>
        </div>
      )}
      {fld && (
        <div className="space-y-2">
          <div className="text-xs font-extrabold text-slate-900">Fielding</div>
          <div className="grid grid-cols-3 gap-2">
            {['FPCT', 'TC', 'E'].map((k) => <Tile key={k} k={k} v={fld[k]} type="fielding" lines={lines} name={name} />)}
          </div>
          {positions.length > 0 && (
            <p className="text-[11px] font-semibold text-slate-500">Innings by position: {positions.map((x) => `${x.p} ${x.inn}`).join(' · ')}</p>
          )}
        </div>
      )}
    </section>
  )
}

const LEADER_STATS: { type: GcType; key: string }[] = [
  { type: 'batting', key: 'AVG' },
  { type: 'batting', key: 'OBP' },
  { type: 'batting', key: 'OPS' },
  { type: 'batting', key: 'QAB%' },
  { type: 'batting', key: 'RBI' },
  { type: 'batting', key: 'SB' },
  { type: 'pitching', key: 'ERA' },
  { type: 'pitching', key: 'WHIP' },
  { type: 'pitching', key: 'SO' },
  { type: 'pitching', key: 'FPS%' },
]

function TeamLeaders({ lines }: { lines: GcLine[] }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Team leaders</div>
        <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Rates need 20+ plate appearances or 5+ innings.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {LEADER_STATS.map(({ type, key }) => {
          const top = leaders(lines, type, key)
          return (
            <div key={`${type}-${key}`} className="rounded-2xl border border-slate-200 p-3" title={LABELS[key]}>
              <div className="text-[11px] font-extrabold text-[#1746b8]">{key} <span className="font-semibold text-slate-400">· {type === 'batting' ? 'Hitting' : 'Pitching'}</span></div>
              <ol className="mt-1 space-y-0.5">
                {top.map((l, i) => (
                  <li key={l.id} className="flex justify-between gap-2 text-xs">
                    <span className={`truncate ${i === 0 ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-600'}`}>{i + 1}. {l.player_name}</span>
                    <span className="font-bold text-slate-900">{fmt(key, l.stats[key])}</span>
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TeamTable({ lines, myName }: { lines: GcLine[]; myName?: string }) {
  const [type, setType] = useState<GcType>('batting')
  const [view, setView] = useState<'standard' | 'advanced'>('standard')
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: 'PA', desc: true })
  const cols = COLS[type][view] as readonly string[]

  const pick = (t: GcType) => {
    setType(t)
    setView('standard')
    setSort({ key: t === 'batting' ? 'PA' : t === 'pitching' ? 'IP' : 'Total', desc: true })
  }
  const rows = useMemo(() => {
    const val = (l: GcLine) => (sort.key === 'IP' ? ipOuts(num(l.stats.IP)) : num(l.stats[sort.key]))
    return lines
      .filter((l) => l.stat_type === type)
      .sort((a, b) => {
        const x = val(a)
        const y = val(b)
        if (x == null && y == null) return a.player_name.localeCompare(b.player_name)
        if (x == null) return 1
        if (y == null) return -1
        return sort.desc ? y - x : x - y
      })
  }, [lines, type, sort])

  const clickHeader = (k: string) =>
    setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: !LOWER_BETTER[type].has(k) }))

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="p-4 flex flex-wrap items-center gap-2 border-b border-slate-100">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mr-auto">Team stats</div>
        <div className="flex p-1 rounded-xl bg-slate-100">
          {(['batting', 'pitching', 'fielding'] as const).map((t) => (
            <button key={t} type="button" onClick={() => pick(t)} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold capitalize cursor-pointer ${type === t ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
              {t === 'batting' ? 'Hitting' : t}
            </button>
          ))}
        </div>
        <div className="flex p-1 rounded-xl bg-slate-100">
          {(['standard', 'advanced'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${view === v ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
              {type === 'fielding' ? (v === 'standard' ? 'Fielding' : 'Innings by position') : v === 'standard' ? 'Standard' : 'Advanced'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 font-extrabold">Player</th>
              {cols.map((k) => (
                <th key={k} title={LABELS[k]} className="px-2.5 py-2 font-extrabold text-right whitespace-nowrap">
                  <button type="button" onClick={() => clickHeader(k)} className={`inline-flex items-center gap-0.5 cursor-pointer ${sort.key === k ? 'text-[#1746b8]' : ''}`}>
                    {k}
                    {sort.key === k && (sort.desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((l) => {
              const me = l.player_name === myName
              return (
                <tr key={l.id} className={me ? 'bg-blue-50' : ''}>
                  <td className={`sticky left-0 z-10 px-3 py-2 whitespace-nowrap font-bold ${me ? 'bg-blue-50 text-[#1746b8]' : 'bg-white text-slate-900'}`}>
                    <span className="text-slate-400 font-semibold mr-1.5">{l.stats.number ?? ''}</span>
                    {l.player_name}
                  </td>
                  {cols.map((k) => (
                    <td key={k} className={`px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${sort.key === k ? 'font-extrabold text-slate-900' : 'text-slate-700'}`}>
                      {fmt(k, l.stats[k])}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 border-t border-slate-100">Tap a column to sort. Hold or hover a column name to see what it means.</p>
    </section>
  )
}
