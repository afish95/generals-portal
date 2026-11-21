'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Target, CheckCircle2, RotateCcw, Save, Play, ChevronRight, Award } from 'lucide-react'

type ScriptStep = {
  pitch: string
  target: string
  zone: number
  reps: number
}

type BullpenScript = {
  id: number
  title: string
  category: string
  pitch_count: number
  description: string | null
  steps: ScriptStep[]
}

type LoggedPitch = {
  pitch_number: number
  pitch_type: string
  prompt_label: string
  intended_zone: number
  actual_zone: number
  is_strike: boolean
  is_intended_hit: boolean
  velocity_mph: number | null
}

type SavedSession = {
  id: number
  session_title: string
  session_date: string
  total_pitches: number
  strikes_count: number
  intended_hits_count: number
  avg_velo: number | null
  max_velo: number | null
}

const INNER_ZONES = [
  { id: 1, label: '1', sub: 'High-In' },
  { id: 2, label: '2', sub: 'High-Mid' },
  { id: 3, label: '3', sub: 'High-Out' },
  { id: 4, label: '4', sub: 'Mid-In' },
  { id: 5, label: '5', sub: 'Heart' },
  { id: 6, label: '6', sub: 'Mid-Out' },
  { id: 7, label: '7', sub: 'Low-In' },
  { id: 8, label: '8', sub: 'Low-Mid' },
  { id: 9, label: '9', sub: 'Low-Out' },
]

const CHASE_ZONES = [
  { id: 10, label: '10 • High Chase / Above Zone' },
  { id: 11, label: '11 • Low Chase / Dirt' },
  { id: 12, label: '12 • Glove-Side Chase' },
  { id: 13, label: '13 • Arm-Side Chase' },
]

const PITCH_TYPES = ['FB', 'SNK', 'SL', 'CB', 'CH', 'SPL']

export default function BullpenScriptRunner({
  playerId,
  startScriptId,
  workoutId,
  onSaved,
}: {
  playerId: string
  /** Open straight into this script (Training tools / prescribed bullpen) */
  startScriptId?: number
  /** The prescribed workout this session completes */
  workoutId?: number
  onSaved?: (sessionId: number) => void
}) {
  const supabase = createClient()
  const [scripts, setScripts] = useState<BullpenScript[]>([])
  const [recentSessions, setRecentSessions] = useState<SavedSession[]>([])
  const [selectedScript, setSelectedScript] = useState<BullpenScript | null>(null)

  const [pitchType, setPitchType] = useState('FB')
  const [intendedZone, setIntendedZone] = useState<number>(5)
  const [actualZone, setActualZone] = useState<number | null>(null)
  const [veloInput, setVeloInput] = useState('')
  const [pitches, setPitches] = useState<LoggedPitch[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedBanner, setSavedBanner] = useState(false)

  const loadScriptsAndHistory = useCallback(async () => {
    const { data: scriptRows } = await supabase
      .from('bullpen_scripts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (scriptRows) setScripts(scriptRows)

    const { data: sessionRows } = await supabase
      .from('bullpen_sessions')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (sessionRows) setRecentSessions(sessionRows)
  }, [playerId, supabase])

  useEffect(() => {
    loadScriptsAndHistory()
  }, [loadScriptsAndHistory])

  // Auto-start the requested script once scripts load
  const [autoStarted, setAutoStarted] = useState(false)
  useEffect(() => {
    if (!startScriptId || autoStarted || scripts.length === 0) return
    const s = scripts.find((x) => x.id === startScriptId)
    if (s) {
      startScript(s)
      setAutoStarted(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startScriptId, scripts, autoStarted])

  const expandedPrompts: { pitch: string; target: string; zone: number }[] = []
  if (selectedScript && Array.isArray(selectedScript.steps)) {
    for (const step of selectedScript.steps) {
      for (let i = 0; i < (step.reps || 1); i++) {
        expandedPrompts.push({ pitch: step.pitch, target: step.target, zone: step.zone })
      }
    }
  }

  const currentPrompt = expandedPrompts[pitches.length] || null

  const startScript = (script: BullpenScript) => {
    setSelectedScript(script)
    setPitches([])
    setActualZone(null)
    setVeloInput('')
    setNotes('')
    setSavedBanner(false)
    if (Array.isArray(script.steps) && script.steps.length > 0) {
      setPitchType(script.steps[0].pitch)
      setIntendedZone(script.steps[0].zone)
    } else {
      setPitchType('FB')
      setIntendedZone(5)
    }
  }

  const recordPitch = () => {
    if (actualZone === null) return
    const nextNum = pitches.length + 1
    const isStrike = actualZone >= 1 && actualZone <= 9
    const isIntendedHit = actualZone === intendedZone
    const parsedVelo = veloInput ? parseFloat(veloInput) : null

    const newPitch: LoggedPitch = {
      pitch_number: nextNum,
      pitch_type: pitchType,
      prompt_label: currentPrompt ? currentPrompt.target : `Free-Form Zone ${intendedZone}`,
      intended_zone: intendedZone,
      actual_zone: actualZone,
      is_strike: isStrike,
      is_intended_hit: isIntendedHit,
      velocity_mph: parsedVelo && !isNaN(parsedVelo) ? parsedVelo : null,
    }

    const updated = [...pitches, newPitch]
    setPitches(updated)
    setActualZone(null)
    setVeloInput('')

    const nextPrompt = expandedPrompts[updated.length]
    if (nextPrompt) {
      setPitchType(nextPrompt.pitch)
      setIntendedZone(nextPrompt.zone)
    }
  }

  const undoLastPitch = () => {
    if (pitches.length === 0) return
    const updated = pitches.slice(0, -1)
    setPitches(updated)
    const prevPrompt = expandedPrompts[updated.length]
    if (prevPrompt) {
      setPitchType(prevPrompt.pitch)
      setIntendedZone(prevPrompt.zone)
    }
  }

  const saveSessionToSupabase = async () => {
    if (!selectedScript || pitches.length === 0) return
    setSaving(true)

    const strikesCount = pitches.filter((p) => p.is_strike).length
    const intendedHitsCount = pitches.filter((p) => p.is_intended_hit).length
    const velos = pitches.map((p) => p.velocity_mph).filter((v): v is number => v !== null)
    const avgVelo = velos.length ? Number((velos.reduce((a, b) => a + b, 0) / velos.length).toFixed(1)) : null
    const maxVelo = velos.length ? Math.max(...velos) : null

    const { data: sessionRow, error } = await supabase
      .from('bullpen_sessions')
      .insert({
        player_id: playerId,
        script_id: selectedScript.id,
        workout_id: workoutId ?? null,
        session_title: selectedScript.title,
        total_pitches: pitches.length,
        strikes_count: strikesCount,
        intended_hits_count: intendedHitsCount,
        avg_velo: avgVelo,
        max_velo: maxVelo,
        notes: notes || null,
      })
      .select()
      .single()

    if (!error && sessionRow) {
      await supabase.from('bullpen_pitches').insert(
        pitches.map((p) => ({
          session_id: sessionRow.id,
          pitch_number: p.pitch_number,
          pitch_type: p.pitch_type,
          prompt_label: p.prompt_label,
          intended_zone: p.intended_zone,
          actual_zone: p.actual_zone,
          is_strike: p.is_strike,
          is_intended_hit: p.is_intended_hit,
          velocity_mph: p.velocity_mph,
        }))
      )
      setSavedBanner(true)
      setSelectedScript(null)
      setPitches([])
      await loadScriptsAndHistory()
      onSaved?.(sessionRow.id)
    }
    setSaving(false)
  }

  const strikesCount = pitches.filter((p) => p.is_strike).length
  const intendedCount = pitches.filter((p) => p.is_intended_hit).length
  const strikePct = pitches.length ? Math.round((strikesCount / pitches.length) * 100) : 0
  const commandPct = pitches.length ? Math.round((intendedCount / pitches.length) * 100) : 0

  return (
    <div className="space-y-5">
      {savedBanner && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          Bullpen session &amp; intended zone data saved to your player profile!
        </div>
      )}

      {!selectedScript ? (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-700" />
              <h2 className="text-base font-extrabold text-slate-900">
                Intended Zones &amp; Bullpen Script Tools
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Select a bullpen script below to track intended vs. actual pitch locations, strike %, and velocity.
            </p>

            <div className="grid grid-cols-1 gap-3 mt-4">
              {scripts.map((script) => (
                <div
                  key={script.id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {script.category}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {script.pitch_count} Pitches
                      </span>
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-900 mt-1.5">{script.title}</h3>
                    {script.description && (
                      <p className="text-xs text-slate-600 mt-0.5">{script.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => startScript(script)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition cursor-pointer shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" /> Start Tool
                  </button>
                </div>
              ))}
            </div>
          </div>

          {recentSessions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                <Award className="w-4 h-4 text-blue-700" />
                Recent Bullpen &amp; Command Logs
              </h3>
              <div className="space-y-2.5">
                {recentSessions.map((s) => {
                  const sPct = s.total_pitches ? Math.round((s.strikes_count / s.total_pitches) * 100) : 0
                  const cPct = s.total_pitches ? Math.round((s.intended_hits_count / s.total_pitches) * 100) : 0
                  return (
                    <div key={s.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-extrabold text-slate-900">{s.session_title}</div>
                        <div className="text-[11px] text-slate-500">{s.session_date} &bull; {s.total_pitches} pitches</div>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                          Strike: {sPct}%
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Intended Hit: {cPct}%
                        </span>
                        {s.max_velo && (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-200/70 text-slate-800">
                            Max: {s.max_velo} mph
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                Active Bullpen Tool
              </span>
              <h2 className="text-base font-extrabold text-slate-900">{selectedScript.title}</h2>
            </div>
            <button
              onClick={() => setSelectedScript(null)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg bg-slate-100 cursor-pointer"
            >
              Exit Tool
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Pitches</div>
              <div className="text-lg font-black text-slate-900">
                {pitches.length}
                {expandedPrompts.length > 0 && <span className="text-xs font-semibold text-slate-400">/{expandedPrompts.length}</span>}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-[10px] font-bold uppercase text-blue-700">Strike %</div>
              <div className="text-lg font-black text-blue-900">{strikePct}%</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] font-bold uppercase text-emerald-700">Intended Hit %</div>
              <div className="text-lg font-black text-emerald-900">{commandPct}%</div>
            </div>
          </div>

          {currentPrompt ? (
            <div className="p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-300">
                  Pitch #{pitches.length + 1} Script Prompt
                </div>
                <div className="text-sm font-extrabold mt-0.5">{currentPrompt.target}</div>
              </div>
              <span className="px-3 py-1 rounded-lg bg-blue-600 text-xs font-black">
                {currentPrompt.pitch}
              </span>
            </div>
          ) : expandedPrompts.length > 0 ? (
            <div className="p-4 rounded-xl bg-emerald-600 text-white text-xs font-extrabold text-center">
              All {expandedPrompts.length} scripted pitches completed! Save your session below or keep throwing bonus pitches.
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                1. Pitch Type
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PITCH_TYPES.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setPitchType(pt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                      pitchType === pt
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {pt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                Velocity (MPH - Optional)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 84.5"
                value={veloInput}
                onChange={(e) => setVeloInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-blue-700 mb-2">
                2. Tap Intended Zone (Target: #{intendedZone})
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-2.5 rounded-xl bg-slate-900 border-2 border-slate-700">
                {INNER_ZONES.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setIntendedZone(z.id)}
                    className={`py-3 rounded-lg text-center transition cursor-pointer ${
                      intendedZone === z.id
                        ? 'bg-blue-500 text-white ring-2 ring-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <div className="text-sm font-black">{z.label}</div>
                    <div className="text-[9px] opacity-80">{z.sub}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {CHASE_ZONES.map((cz) => (
                  <button
                    key={cz.id}
                    type="button"
                    onClick={() => setIntendedZone(cz.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left transition cursor-pointer ${
                      intendedZone === cz.id
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cz.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 mb-2">
                3. Tap Actual Pitch Location {actualZone ? `(Selected: #${actualZone})` : ''}
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-2.5 rounded-xl bg-slate-100 border-2 border-slate-300">
                {INNER_ZONES.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setActualZone(z.id)}
                    className={`py-3 rounded-lg text-center transition cursor-pointer ${
                      actualZone === z.id
                        ? 'bg-emerald-600 text-white ring-2 ring-slate-900'
                        : 'bg-white text-slate-800 hover:bg-emerald-50 border border-slate-200'
                    }`}
                  >
                    <div className="text-sm font-black">{z.label}</div>
                    <div className="text-[9px] text-slate-500">{z.sub}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {CHASE_ZONES.map((cz) => (
                  <button
                    key={cz.id}
                    type="button"
                    onClick={() => setActualZone(cz.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left transition cursor-pointer ${
                      actualZone === cz.id
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cz.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={recordPitch}
              disabled={actualZone === null}
              className="flex-1 py-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              Log Pitch #{pitches.length + 1} <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={undoLastPitch}
              disabled={pitches.length === 0}
              className="py-3 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo
            </button>
          </div>

          {pitches.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <input
                type="text"
                placeholder="Optional bullpen notes (e.g., slider felt sharp, stayed tall on backside)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900"
              />
              <button
                type="button"
                onClick={saveSessionToSupabase}
                disabled={saving}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving Bullpen Session...' : `Finish & Save Session (${pitches.length} Pitches)`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
