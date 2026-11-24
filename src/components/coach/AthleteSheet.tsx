'use client'

import PlayerPhoto from '@/components/PlayerPhoto'
import { useEffect, useState } from 'react'
import { Flag, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import TeamPrFeed from '@/components/TeamPrFeed'
import ReadinessRing from '@/components/wellness/ReadinessRing'
import { WeightSparkline } from '@/components/wellness/BodyWeightCard'
import { addDays, localDate, prettyDate, round1, timeAgo, type Profile } from '@/lib/training'
import { ATTENDANCE, readinessMeta, type AttendanceStatus, type Checkin } from '@/lib/wellness'

type Note = { id: number; body: string; created_at: string }
type Flagged = { reason: string | null; flagged_at: string } | null

export default function AthleteSheet({ athlete, onClose, onChanged }: { athlete: Profile; onClose: () => void; onChanged?: () => void }) {
  const [flag, setFlag] = useState<Flagged | undefined>(undefined)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [newNote, setNewNote] = useState('')
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [weights, setWeights] = useState<{ id: number; measured_on: string; weight_lb: number }[]>([])
  const [attendance, setAttendance] = useState<{ status: AttendanceStatus }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const since = addDays(localDate(), -30)
    Promise.all([
      supabase.from('athlete_flags').select('reason, flagged_at').eq('athlete_id', athlete.id).maybeSingle(),
      supabase.from('coach_notes').select('id, body, created_at').eq('athlete_id', athlete.id).order('created_at', { ascending: false }),
      supabase.from('daily_checkins').select('*').eq('athlete_id', athlete.id).gte('check_date', addDays(localDate(), -13)).order('check_date'),
      supabase.from('body_weights').select('id, measured_on, weight_lb').eq('athlete_id', athlete.id).order('measured_on', { ascending: false }).limit(12),
      supabase.from('attendance').select('status').eq('athlete_id', athlete.id).gte('attend_date', since),
    ]).then(([f, n, c, w, a]) => {
      if (cancelled) return
      const fl = (f.data as Flagged) ?? null
      setFlag(fl)
      setReason(fl?.reason ?? '')
      setNotes((n.data as Note[]) || [])
      setCheckins((c.data as Checkin[]) || [])
      setWeights(((w.data as { id: number; measured_on: string; weight_lb: number }[]) || []).reverse())
      setAttendance((a.data as { status: AttendanceStatus }[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [athlete.id, reload])

  const supabase = createClient()
  const toggleFlag = async () => {
    setError(null)
    if (flag) {
      const { error: e } = await supabase.from('athlete_flags').delete().eq('athlete_id', athlete.id)
      if (e) return setError(e.message)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: e } = await supabase.from('athlete_flags').insert({ athlete_id: athlete.id, reason: reason.trim() || null, flagged_by: user?.id })
      if (e) return setError(e.message)
    }
    setReload((n) => n + 1)
    onChanged?.()
  }
  const saveReason = async () => {
    if (!flag || (reason.trim() || null) === flag.reason) return
    await supabase.from('athlete_flags').update({ reason: reason.trim() || null }).eq('athlete_id', athlete.id)
    setReload((n) => n + 1)
  }
  const addNote = async () => {
    const body = newNote.trim()
    if (!body) return
    const { data: { user } } = await supabase.auth.getUser()
    const { error: e } = await supabase.from('coach_notes').insert({ athlete_id: athlete.id, body, author_id: user?.id })
    if (e) return setError(e.message)
    setNewNote('')
    setReload((n) => n + 1)
  }
  const deleteNote = async (id: number) => {
    if (!window.confirm('Delete this note permanently?')) return
    await supabase.from('coach_notes').delete().eq('id', id)
    setReload((n) => n + 1)
  }

  const latest = checkins[checkins.length - 1]
  const meta = readinessMeta(latest?.check_date === localDate() ? latest.readiness : null)
  const counts = Object.fromEntries(ATTENDANCE.map((s) => [s.key, attendance.filter((a) => a.status === s.key).length]))

  return (
    <div className="fixed inset-0 lg:left-[220px] z-50 bg-[#f3f5f9] overflow-y-auto">
      <div className="bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <PlayerPhoto id={athlete.id} name={athlete.full_name} size={44} className="border-2 border-white/40" />
          <div className="min-w-0">
            <div className="text-lg font-extrabold leading-tight truncate">
              {athlete.full_name} {flag && <span aria-label="Flagged">🚩</span>}
            </div>
            <div className="text-xs text-blue-100/90 font-medium">{athlete.position_group} · #{athlete.username}</div>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-5 space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <section className={`rounded-3xl border p-5 shadow-xs space-y-3 ${flag ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200/90'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Coach flag · private</span>
            <button
              type="button"
              onClick={toggleFlag}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${flag ? 'bg-white text-red-700 border border-red-200' : 'bg-red-600 text-white'}`}
            >
              <Flag className="w-3.5 h-3.5" /> {flag ? 'Remove flag' : 'Flag athlete'}
            </button>
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} onBlur={saveReason} placeholder="Why? (e.g. elbow tightness, missed 3 days)" className={inputClass} />
          {flag && <p className="text-[11px] font-semibold text-red-700">Flagged {timeAgo(flag.flagged_at)}</p>}
        </section>

        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Readiness · last 14 days</div>
          <div className="flex items-center gap-4">
            <ReadinessRing score={latest?.check_date === localDate() ? latest.readiness : null} color={meta.ring} size={64} />
            <div className="flex-1 flex items-end gap-1 h-16">
              {Array.from({ length: 14 }, (_, i) => addDays(localDate(), i - 13)).map((d) => {
                const c = checkins.find((x) => x.check_date === d)
                const m = readinessMeta(c?.readiness)
                return (
                  <div key={d} className="flex-1 flex flex-col justify-end h-full" title={`${prettyDate(d)}: ${c ? c.readiness : 'no check-in'}`}>
                    <div className="rounded-sm" style={{ height: c ? `${Math.max(8, c.readiness)}%` : '4px', background: c ? m.ring : '#e2e8f0' }} />
                  </div>
                )
              })}
            </div>
          </div>
          {latest && (
            <p className="text-xs font-semibold text-slate-500">
              Last check-in {prettyDate(latest.check_date)}: sleep {latest.sleep_quality}/5, soreness {latest.soreness}/5, stress {latest.stress}/5
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Body weight</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {weights.length ? round1(Number(weights[weights.length - 1].weight_lb)) : '–'}
              <span className="text-xs font-bold text-slate-400 ml-1">lb</span>
            </div>
            <WeightSparkline entries={weights} height={32} />
          </section>
          <section className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Attendance · 30 days</div>
            <ul className="mt-1.5 space-y-0.5 text-xs font-bold text-slate-700">
              {ATTENDANCE.map((s) => (
                <li key={s.key} className="flex justify-between">
                  <span>{s.label}</span>
                  <span>{counts[s.key]}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Private coach notes</div>
          <div className="flex gap-2">
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note only coaches can see" className={inputClass} />
            <button type="button" onClick={addNote} className="px-4 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold cursor-pointer">Add</button>
          </div>
          {notes.length === 0 ? (
            <p className="text-xs text-slate-500 font-medium">No notes yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notes.map((n) => (
                <li key={n.id} className="py-2.5 flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-slate-800 whitespace-pre-line">{n.body}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  <button type="button" aria-label="Delete note" onClick={() => deleteNote(n.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <TeamPrFeed limit={6} athleteId={athlete.id} />
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      </div>
    </div>
  )
}
