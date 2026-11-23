'use client'

import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { parseGameChanger, type ImportRow } from '@/lib/gcImport'
import type { Profile } from '@/lib/training'

export default function GameStatsImport({ players }: { players: Profile[] }) {
  const [season, setSeason] = useState(String(new Date().getFullYear()))
  const [rows, setRows] = useState<ImportRow[]>([])
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
    const res = parseGameChanger(text)
    setRows(res.rows)
    setWarnings(res.warnings)
  }

  const doImport = async () => {
    const yr = Number(season)
    if (!Number.isInteger(yr) || yr < 1990 || yr > 2100) return setMessage('Enter a season year like 2027.')
    if (!rows.length) return
    if (!window.confirm(`Import ${rows.length} rows into the ${yr} season? Any earlier GameChanger import for ${yr} will be replaced.`)) return
    setBusy(true)
    const payload = rows.map((r) => ({ ...r, player_id: matched(r.player_name) ?? null }))
    const { data, error } = await createClient().rpc('import_game_stats', { p_season: yr, p_rows: payload })
    setBusy(false)
    if (error) return setMessage(error.message)
    setMessage(`Imported ${data} rows into ${yr}. See Stats → Game.`)
    setRows([])
    setFileName('')
  }

  const removeDemo = async () => {
    if (!window.confirm('Permanently delete all demo game stats?')) return
    const { error } = await createClient().from('historical_game_stats').delete().eq('is_demo', true)
    setMessage(error ? error.message : 'Demo game stats deleted.')
  }

  const batting = rows.filter((r) => r.stat_category === 'batting')
  const pitching = rows.filter((r) => r.stat_category === 'pitching')
  const unmatched = [...new Set(rows.map((r) => r.player_name).filter((n) => !matched(n)))]

  return (
    <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Import from GameChanger</div>
        <ol className="text-xs font-semibold text-slate-600 space-y-1 list-decimal pl-4">
          <li>On web.gc.com (staff account), open your team → Stats.</li>
          <li>Tap Export Stats to download the CSV.</li>
          <li>Choose the season below and upload the file.</li>
        </ol>
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
          <Upload className="w-4 h-4" /> {fileName || 'Choose CSV file'}
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

      {rows.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Preview</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="text-2xl font-black text-slate-900">{batting.length}</div>
              <div className="text-[11px] font-bold text-slate-500">batting lines</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="text-2xl font-black text-slate-900">{pitching.length}</div>
              <div className="text-[11px] font-bold text-slate-500">pitching lines</div>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {rows.slice(0, 60).map((r, i) => (
              <div key={i} className="px-3 py-2 text-xs flex justify-between gap-2">
                <span className={`font-bold ${matched(r.player_name) ? 'text-slate-800' : 'text-amber-700'}`}>{r.player_name}</span>
                <span className="text-slate-500 tabular-nums">
                  {r.stat_category === 'batting'
                    ? `${r.hits ?? 0}-${r.at_bats ?? 0}, ${r.home_runs ?? 0} HR, ${r.rbis ?? 0} RBI`
                    : `${r.innings_pitched} IP, ${r.strikeouts ?? 0} K, ${r.earned_runs ?? 0} ER`}
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
          Delete demo game stats
        </button>
      )}
    </div>
  )
}
