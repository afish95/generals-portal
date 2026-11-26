'use client'

import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { isProgramHistory, parseGameChangerFull, parseProgramHistory, type GcRow, type HistoryRow, type SeasonType } from '@/lib/gcImport'
import type { Profile } from '@/lib/training'
import EarlyAheadEditor from './EarlyAheadEditor'

export default function GameStatsImport({ players }: { players: Profile[] }) {
  const [season, setSeason] = useState(String(new Date().getFullYear()))
  const [rows, setRows] = useState<GcRow[]>([])
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [seasonType, setSeasonType] = useState<SeasonType>('Spring')
  const [progress, setProgress] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hasDemo, setHasDemo] = useState(false)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('historical_game_stats')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', true)
      .then(({ count }) => {
        if (!cancelled) setHasDemo((count || 0) > 0)
      })
    return () => {
      cancelled = true
    }
  }, [message])

  const byName = new Map(players.map((p) => [p.full_name.trim().toLowerCase(), p.id]))
  const matched = (n: string) => byName.get(n.trim().toLowerCase())

  const onFile = async (file: File | undefined) => {
    setMessage(null)
    if (!file) return
    setFileName(file.name)
    const text = await file.text()
    if (isProgramHistory(text)) {
      const res = parseProgramHistory(text)
      setHistory(res.rows)
      setRows([])
      setWarnings(res.warnings)
      return
    }
    setHistory(null)
    const res = parseGameChangerFull(text)
    setRows(res.rows)
    setWarnings(res.warnings)
  }

  const doImport = async () => {
    const yr = Number(season)
    if (!Number.isInteger(yr) || yr < 1990 || yr > 2100) return setMessage('Enter a season year like 2027.')
    if (!rows.length) return
    if (!window.confirm(`Import ${rows.length} stat lines into ${yr} ${seasonType}? Any earlier import for ${yr} ${seasonType} will be replaced.`)) return
    setBusy(true)
    const { data, error } = await createClient().rpc('import_gc_season', { p_season: yr, p_rows: rows, p_type: seasonType })
    setBusy(false)
    if (error) return setMessage(error.message)
    setMessage(`Imported ${data} stat lines into ${yr} ${seasonType}. See Stats → Game stats.`)
    setRows([])
    setFileName('')
  }

  // Program history file: import every season in it, one at a time
  const historySeasons = (() => {
    const m = new Map<string, HistoryRow[]>()
    for (const r of history || []) {
      const k = `${r.season_year} ${r.season_type}`
      m.set(k, [...(m.get(k) || []), r])
    }
    return [...m.entries()].sort((x, y) => y[0].localeCompare(x[0]))
  })()
  const importHistory = async () => {
    if (!history?.length) return
    if (!window.confirm(`Import ${historySeasons.length} seasons (${history.length} stat lines)? Each of these seasons is replaced with the file's numbers. Seasons not in the file are left alone.`)) return
    setBusy(true)
    let total = 0
    for (const [i, [label, list]] of historySeasons.entries()) {
      setProgress(`Importing ${label} (${i + 1} of ${historySeasons.length})…`)
      const { data, error } = await createClient().rpc('import_gc_season', {
        p_season: list[0].season_year,
        p_type: list[0].season_type,
        p_rows: list.map((r) => ({ player_name: r.player_name, stat_type: r.stat_type, stats: r.stats })),
      })
      if (error) {
        setBusy(false)
        setProgress(null)
        return setMessage(`Stopped at ${label}: ${error.message}`)
      }
      total += Number(data) || 0
    }
    setBusy(false)
    setProgress(null)
    setHistory(null)
    setFileName('')
    setMessage(`Imported ${historySeasons.length} seasons (${total} stat lines). See Stats → Game stats and Percentiles.`)
  }

  const removeDemo = async () => {
    if (!window.confirm('Permanently delete all demo game stats?')) return
    const { error } = await createClient().from('historical_game_stats').delete().eq('is_demo', true)
    setMessage(error ? error.message : 'Demo game stats deleted.')
  }

  const batting = rows.filter((r) => r.stat_type === 'batting')
  const pitching = rows.filter((r) => r.stat_type === 'pitching')
  const fielding = rows.filter((r) => r.stat_type === 'fielding')
  const unmatched = [...new Set(rows.map((r) => r.player_name).filter((n) => !matched(n)))]

  return (
    <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Import from GameChanger</div>
        <ol className="text-xs font-semibold text-slate-600 space-y-1 list-decimal pl-4">
          <li>On web.gc.com (staff account), open your team → Stats.</li>
          <li>Tap Export Stats to download the CSV.</li>
          <li>Choose the season and team below and upload the file.</li>
        </ol>
        <p className="text-[11px] font-semibold text-slate-500">A program history file (with a Season column like “2025 Summer”) imports every season at once.</p>
        <label className="flex items-center justify-between gap-3 text-xs font-extrabold text-slate-700">
          Team
          <select value={seasonType} onChange={(e) => setSeasonType(e.target.value as SeasonType)} className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold">
            <option value="Spring">Spring Varsity</option>
            <option value="JV">Spring JV</option>
            <option value="Summer">Summer</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-xs font-extrabold text-slate-700">
          Season
          <input
            inputMode="numeric"
            value={season}
            onChange={(e) => setSeason(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-24 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-center"
          />
        </label>
        <label className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-extrabold text-[#1746b8] flex items-center justify-center gap-2 cursor-pointer">
          <Upload className="w-4 h-4" /> {fileName || 'Choose CSV File'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </section>

      {warnings.length > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4 space-y-1">
          {warnings.map((w) => (
            <p key={w} className="text-xs font-bold text-amber-800">{w}</p>
          ))}
        </section>
      )}

      {history && history.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Program History File</div>
          <p className="text-xs font-semibold text-slate-600">
            {historySeasons.length} seasons, {new Set(history.map((r) => r.player_name)).size} players. Spring Varsity, Spring JV and Summer are kept separate.
          </p>
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {historySeasons.map(([label, list]) => (
              <div key={label} className="px-3 py-2 text-xs flex justify-between gap-2">
                <span className="font-bold text-slate-800">{label}</span>
                <span className="text-slate-500 tabular-nums">
                  {list.filter((r) => r.stat_type === 'batting').length} hitters · {list.filter((r) => r.stat_type === 'pitching').length} pitchers
                </span>
              </div>
            ))}
          </div>
          <button type="button" onClick={importHistory} disabled={busy} className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
            {busy ? progress ?? 'Importing…' : `Import all ${historySeasons.length} seasons`}
          </button>
        </section>
      )}

      {rows.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Preview</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: batting.length, label: 'hitters' },
              { n: pitching.length, label: 'pitchers' },
              { n: fielding.length, label: 'fielders' },
            ].map((x) => (
              <div key={x.label} className="rounded-2xl bg-slate-50 p-3">
                <div className="text-2xl font-black text-slate-900">{x.n}</div>
                <div className="text-[11px] font-bold text-slate-500">{x.label}</div>
              </div>
            ))}
          </div>
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {rows.slice(0, 60).map((r, i) => (
              <div key={i} className="px-3 py-2 text-xs flex justify-between gap-2">
                <span className={`font-bold ${matched(r.player_name) ? 'text-slate-800' : 'text-amber-700'}`}>{r.player_name}</span>
                <span className="text-slate-500 tabular-nums">
                  {r.stat_type === 'batting'
                    ? `${r.stats.H ?? 0}-${r.stats.AB ?? 0}, ${r.stats.AVG ?? '–'} AVG, ${r.stats.RBI ?? 0} RBI`
                    : r.stat_type === 'pitching'
                      ? `${r.stats.IP ?? 0} IP, ${r.stats.SO ?? 0} K, ${r.stats.ERA ?? '–'} ERA`
                      : `${r.stats.Total ?? 0} inn, ${r.stats.E ?? 0} E`}
                </span>
              </div>
            ))}
          </div>
          {unmatched.length > 0 && (
            <p className="text-[11px] font-semibold text-amber-700">
              Not on the roster yet (saved by name, linked later): {unmatched.join(', ')}
            </p>
          )}
          <button type="button" onClick={doImport} disabled={busy} className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
            {busy ? 'Importing…' : `Import into ${season}`}
          </button>
        </section>
      )}

      {message && <p className="text-xs font-bold text-emerald-700 px-1">{message}</p>}

      {hasDemo && (
        <button type="button" onClick={removeDemo} className="w-full py-2.5 rounded-2xl bg-white border border-slate-200 text-xs font-extrabold text-red-600 cursor-pointer">
          Delete Demo Game Stats
        </button>
      )}

      <div className="lg:col-span-2">
        <EarlyAheadEditor key={message ?? 'ea'} />
      </div>
    </div>
  )
}
