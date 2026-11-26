'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import { addDays, localDate } from '@/lib/training'
import { METRICS } from '@/components/stats/PositionLeaderboard'
import { sundayOf } from '@/lib/trainingMetrics'
import { notifyPlayers } from '@/lib/notify'
import SendNotification from '@/components/SendNotification'

type Opt = { id: number; name: string }
type Pick = { exercise_id: number | null; note: string }

/** Coach Office → Drills → Drill of the Week: a team drill (shows in every player's Baseball Training) plus optional drills per training stat (shown on Training → Overview). */
export default function DrillOfWeekPanel({ drills }: { drills: Opt[] }) {
  const [week, setWeek] = useState(sundayOf(localDate()))
  const [team, setTeam] = useState<Pick>({ exercise_id: null, note: '' })
  const [per, setPer] = useState<Record<string, number | null>>({})
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('drills_of_week')
      .select('metric_key, exercise_id, note')
      .eq('week_start', week)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data as { metric_key: string | null; exercise_id: number; note: string | null }[]) || []
        const t = rows.find((r) => r.metric_key == null)
        setTeam({ exercise_id: t?.exercise_id ?? null, note: t?.note || '' })
        setPer(Object.fromEntries(rows.filter((r) => r.metric_key).map((r) => [r.metric_key as string, r.exercise_id])))
        setMsg(null)
      })
    return () => {
      cancelled = true
    }
  }, [week])

  const save = async () => {
    setBusy(true)
    setError(null)
    const sb = createClient()
    const rows = [
      ...(team.exercise_id ? [{ week_start: week, metric_key: null, exercise_id: team.exercise_id, note: team.note.trim() || null }] : []),
      ...Object.entries(per)
        .filter(([, v]) => v)
        .map(([k, v]) => ({ week_start: week, metric_key: k, exercise_id: v as number, note: null })),
    ]
    const { error: d } = await sb.from('drills_of_week').delete().eq('week_start', week)
    const { error: e } = d ? { error: d } : rows.length ? await sb.from('drills_of_week').insert(rows) : { error: null }
    if (!e && notify && team.exercise_id) {
      const name = drills.find((x) => x.id === team.exercise_id)?.name || 'New drill'
      await notifyPlayers({ title: `Drill of the Week: ${name}`, body: team.note.trim() || 'Find it in your Day Plan under Baseball Training.', url: '/training', everyone: true, kind: 'workout' })
    }
    setBusy(false)
    if (e) return setError(e.message)
    setMsg('Saved.')
  }

  const label = `${new Date(`${week}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(`${addDays(week, 6)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  const thisWeek = sundayOf(localDate())

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-2 py-1.5">
        <button type="button" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" className="p-2 rounded-lg text-slate-500 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
        <div className="text-center">
          <div className="text-sm font-extrabold text-slate-900">{label}</div>
          <div className="text-[10px] font-bold text-slate-400">{week === thisWeek ? 'This week' : week > thisWeek ? 'Upcoming' : 'Past'}</div>
        </div>
        <button type="button" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" className="p-2 rounded-lg text-slate-500 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
      </div>

      <section className="bg-white rounded-3xl border border-violet-200 p-5 space-y-3">
        <div className="flex items-center gap-1.5">
          <Star className="w-4 h-4 fill-violet-500 text-violet-500" />
          <SectionLabel>Team Drill of the Week</SectionLabel>
        </div>
        <DrillPicker drills={drills} value={team.exercise_id} onChange={(v) => setTeam((t) => ({ ...t, exercise_id: v }))} />
        <input value={team.note} onChange={(e) => setTeam((t) => ({ ...t, note: e.target.value }))} placeholder="Coaching note (e.g. 3 sets of 10 before every throw)" className={inputClass} />
        <p className="text-[11px] font-semibold text-slate-400">Shows in every player’s Day Plan under Baseball Training.</p>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>By Training Stat</SectionLabel>
        <p className="text-[11px] font-semibold text-slate-400">Optional. Shows when a player opens that stat on Training → Overview.</p>
        {(['pitchers', 'hitters'] as const).map((g) => (
          <div key={g} className="space-y-2">
            <div className={`text-[10px] font-extrabold uppercase tracking-wider ${g === 'pitchers' ? 'text-sky-700' : 'text-orange-600'}`}>{g === 'pitchers' ? 'Pitching' : 'Hitting'}</div>
            {METRICS[g].map((m) => (
              <div key={m.key} className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <span className="text-xs font-extrabold text-slate-700">{m.short}</span>
                <DrillPicker drills={drills} value={per[m.key] ?? null} onChange={(v) => setPer((p) => ({ ...p, [m.key]: v }))} compact />
              </div>
            ))}
          </div>
        ))}
      </section>

      <SendNotification checked={notify} onChange={setNotify} />
      <button type="button" onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-40 cursor-pointer">
        {busy ? 'Saving…' : 'Save Drills of the Week'}
      </button>
      {msg && <p className="text-xs font-extrabold text-emerald-700">{msg}</p>}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </div>
  )
}

/** Type to filter the drill library, then pick. */
function DrillPicker({ drills, value, onChange, compact = false }: { drills: Opt[]; value: number | null; onChange: (v: number | null) => void; compact?: boolean }) {
  const [q, setQ] = useState('')
  const current = drills.find((d) => d.id === value)
  const matches = q.trim() ? drills.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40) : []
  return (
    <div className="space-y-1">
      {current && !q ? (
        <div className="flex items-center gap-2">
          <span className={`flex-1 min-w-0 truncate font-bold text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}>{current.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-[11px] font-extrabold text-red-600 cursor-pointer">Clear</button>
          <button type="button" onClick={() => setQ(' ')} className="text-[11px] font-extrabold text-[#1746b8] cursor-pointer">Change</button>
        </div>
      ) : (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drills" className={`${inputClass} ${compact ? 'py-1.5 text-xs' : ''}`} />
      )}
      {matches.length > 0 && (
        <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
          {matches.map((d) => (
            <button key={d.id} type="button" onClick={() => { onChange(d.id); setQ('') }} className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
