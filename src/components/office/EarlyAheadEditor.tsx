'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { num, pitcherCalc, type GcLine } from '@/lib/gcStats'

type Row = { name: string; bf: number | null; early: string; ahead: string; origEarly: string; origAhead: string }

/** Coach enters Early and Ahead counts per pitcher (GameChanger's export doesn't include them). */
export default function EarlyAheadEditor() {
  const [seasons, setSeasons] = useState<number[]>([])
  const [season, setSeason] = useState<number | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [pitch, setPitch] = useState<GcLine[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    createClient()
      .from('gc_season_stats')
      .select('season_year')
      .eq('stat_type', 'pitching')
      .then(({ data }) => {
        const s = [...new Set(((data as { season_year: number }[]) || []).map((r) => r.season_year))].sort((a, b) => b - a)
        setSeasons(s)
        setSeason((c) => c ?? s[0] ?? null)
        if (!s.length) setRows([])
      })
  }, [])

  useEffect(() => {
    if (season == null) return
    const supabase = createClient()
    Promise.all([
      supabase.from('gc_season_stats').select('id, player_id, player_name, season_year, stat_type, stats').eq('season_year', season).eq('stat_type', 'pitching'),
      supabase.from('pitcher_early_ahead').select('player_name, early, ahead').eq('season_year', season),
    ]).then(([g, e]) => {
      const lines = ((g.data as GcLine[]) || []).sort((a, b) => (num(b.stats.BF) ?? 0) - (num(a.stats.BF) ?? 0))
      const saved = new Map(((e.data as { player_name: string; early: number | null; ahead: number | null }[]) || []).map((x) => [x.player_name, x]))
      setPitch(lines)
      setRows(
        lines.map((l) => {
          const s = saved.get(l.player_name)
          const early = s?.early != null ? String(s.early) : ''
          const ahead = s?.ahead != null ? String(s.ahead) : ''
          return { name: l.player_name, bf: num(l.stats.BF), early, ahead, origEarly: early, origAhead: ahead }
        })
      )
    })
  }, [season, reload])

  const set = (i: number, k: 'early' | 'ahead', v: string) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, [k]: v.replace(/\D/g, '') } : r)))

  const save = async () => {
    if (!rows || season == null) return
    const bad = rows.find((r) => r.bf != null && ((r.early && Number(r.early) > r.bf) || (r.ahead && Number(r.ahead) > r.bf)))
    if (bad) return setMsg(`${bad.name}: Early and Ahead can't be more than batters faced (${bad.bf}).`)
    // Only write rows that changed
    const changed = rows.filter((r) => r.early !== r.origEarly || r.ahead !== r.origAhead)
    if (!changed.length) return setMsg('Nothing changed.')
    setSaving(true)
    const { error } = await createClient()
      .from('pitcher_early_ahead')
      .upsert(
        changed.map((r) => ({ season_year: season, player_name: r.name, early: r.early === '' ? null : Number(r.early), ahead: r.ahead === '' ? null : Number(r.ahead), updated_at: new Date().toISOString() })),
        { onConflict: 'season_year,player_name' }
      )
    setSaving(false)
    setMsg(error ? error.message : `Saved ${changed.length} pitcher${changed.length === 1 ? '' : 's'}.`)
    if (!error) setReload((n) => n + 1)
  }

  if (rows === null) return <div className="h-32 rounded-3xl bg-white/60 animate-pulse" />
  if (!seasons.length) return null

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Early and Ahead (pitchers)</div>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Enter counts. E% = Early ÷ BF, A% = Ahead ÷ BF. These feed E+A% and Pitcher Score.</p>
        </div>
        {seasons.length > 1 && (
          <select value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="py-1.5 font-extrabold">Pitcher</th>
              <th className="py-1.5 font-extrabold text-right">BF</th>
              <th className="py-1.5 font-extrabold text-center">Early</th>
              <th className="py-1.5 font-extrabold text-center">Ahead</th>
              <th className="py-1.5 font-extrabold text-right">E+A%</th>
              <th className="py-1.5 font-extrabold text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const ea = r.early !== '' && r.ahead !== '' ? { player_name: r.name, early: Number(r.early), ahead: Number(r.ahead) } : undefined
              const line = pitch.find((l) => l.player_name === r.name)!
              const eaPct = pitcherCalc.ea(line.stats, ea)
              const score = pitcherCalc.score(line.stats, ea)
              return (
                <tr key={r.name}>
                  <td className="py-1.5 font-bold text-slate-900 whitespace-nowrap pr-2">{r.name}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600">{r.bf ?? '–'}</td>
                  <td className="py-1.5 text-center">
                    <input inputMode="numeric" value={r.early} onChange={(e) => set(i, 'early', e.target.value)} aria-label={`${r.name} early`} className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-center font-bold" />
                  </td>
                  <td className="py-1.5 text-center">
                    <input inputMode="numeric" value={r.ahead} onChange={(e) => set(i, 'ahead', e.target.value)} aria-label={`${r.name} ahead`} className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-center font-bold" />
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-bold">{eaPct == null ? '–' : `${eaPct.toFixed(1)}%`}</td>
                  <td className="py-1.5 text-right tabular-nums font-bold text-[#1746b8]">{score == null ? '–' : score.toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={save} disabled={saving} className="w-full py-2.5 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
        {saving ? 'Saving…' : 'Save Early and Ahead'}
      </button>
      {msg && <p className="text-xs font-bold text-slate-600">{msg}</p>}
    </section>
  )
}
