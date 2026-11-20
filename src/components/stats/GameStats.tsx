'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Batting = { player_id: string | null; player_name: string; g: number; ab: number; h: number; doubles: number; triples: number; hr: number; rbi: number; sb: number }
type Pitching = { player_id: string | null; player_name: string; g: number; outs: number; pitches: number; strikes: number; k: number; bb: number; h: number; er: number }

const avg = (h: number, ab: number) => (ab ? (h / ab).toFixed(3).replace(/^0/, '') : '.000')
const ip = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`
const era = (er: number, outs: number) => (outs ? ((er * 21) / outs).toFixed(2) : '–')
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '–')

export default function GameStats({ myId }: { myId: string }) {
  const [seasons, setSeasons] = useState<number[]>([])
  const [season, setSeason] = useState<number | 'career' | null>(null)
  const [kind, setKind] = useState<'batting' | 'pitching'>('batting')
  const [batting, setBatting] = useState<Batting[] | null>(null)
  const [pitching, setPitching] = useState<Pitching[] | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .rpc('game_seasons')
      .then(({ data }) => {
        if (cancelled) return
        const list = ((data as number[]) || []).map(Number)
        setSeasons(list)
        setSeason(list[0] ?? 'career')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (season === null) return
    const supabase = createClient()
    let cancelled = false
    const p_season = season === 'career' ? null : season
    Promise.all([supabase.rpc('batting_lines', { p_season }), supabase.rpc('pitching_lines', { p_season })]).then(([b, p]) => {
      if (cancelled) return
      setBatting(((b.data as Batting[]) || []).map((r) => ({ ...r, g: +r.g, ab: +r.ab, h: +r.h, doubles: +r.doubles, triples: +r.triples, hr: +r.hr, rbi: +r.rbi, sb: +r.sb })))
      setPitching(((p.data as Pitching[]) || []).map((r) => ({ ...r, g: +r.g, outs: +r.outs, pitches: +r.pitches, strikes: +r.strikes, k: +r.k, bb: +r.bb, h: +r.h, er: +r.er })))
    })
    return () => {
      cancelled = true
    }
  }, [season])

  const rowClass = (id: string | null) => (id === myId ? 'bg-blue-50 font-extrabold text-[#1746b8]' : '')
  const th = 'px-2 py-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-right first:text-left first:sticky first:left-0 first:bg-white'
  const td = 'px-2 py-2.5 text-xs font-bold text-slate-800 text-right tabular-nums first:text-left first:sticky first:left-0 first:bg-inherit'

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {seasons.map((s) => (
          <SeasonPill key={s} active={season === s} onClick={() => setSeason(s)}>{s}</SeasonPill>
        ))}
        <SeasonPill active={season === 'career'} onClick={() => setSeason('career')}>All-time</SeasonPill>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100">
        {(['batting', 'pitching'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`py-2 rounded-xl text-xs font-extrabold capitalize cursor-pointer ${kind === k ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}
          >
            {k}
          </button>
        ))}
      </div>

      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {kind === 'batting' ? (
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Player', 'G', 'AB', 'H', '2B', 'HR', 'RBI', 'SB', 'AVG', 'SLG'].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(batting || []).map((r) => {
                  const tb = r.h + r.doubles + 2 * r.triples + 3 * r.hr
                  return (
                    <tr key={`${r.player_id}-${r.player_name}`} className={rowClass(r.player_id)}>
                      <td className={`${td} whitespace-nowrap`}>{r.player_name}</td>
                      <td className={td}>{r.g}</td>
                      <td className={td}>{r.ab}</td>
                      <td className={td}>{r.h}</td>
                      <td className={td}>{r.doubles}</td>
                      <td className={td}>{r.hr}</td>
                      <td className={td}>{r.rbi}</td>
                      <td className={td}>{r.sb}</td>
                      <td className={`${td} text-[#1746b8]`}>{avg(r.h, r.ab)}</td>
                      <td className={td}>{avg(tb, r.ab)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Player', 'G', 'IP', 'K', 'BB', 'H', 'ER', 'ERA', 'Strike %'].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(pitching || []).map((r) => (
                  <tr key={`${r.player_id}-${r.player_name}`} className={rowClass(r.player_id)}>
                    <td className={`${td} whitespace-nowrap`}>{r.player_name}</td>
                    <td className={td}>{r.g}</td>
                    <td className={td}>{ip(r.outs)}</td>
                    <td className={td}>{r.k}</td>
                    <td className={td}>{r.bb}</td>
                    <td className={td}>{r.h}</td>
                    <td className={td}>{r.er}</td>
                    <td className={`${td} text-[#1746b8]`}>{era(r.er, r.outs)}</td>
                    <td className={td}>{pct(r.strikes, r.pitches)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {((kind === 'batting' && batting?.length === 0) || (kind === 'pitching' && pitching?.length === 0)) && (
            <p className="p-5 text-xs font-medium text-slate-500">No game stats for this season yet.</p>
          )}
        </div>
      </section>
      <p className="text-[11px] font-semibold text-slate-400 px-1">ERA is per 7 innings. GameChanger imports will land here once your new team is set up.</p>
    </div>
  )
}

function SeasonPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-xs font-extrabold whitespace-nowrap cursor-pointer ${active ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
    >
      {children}
    </button>
  )
}
