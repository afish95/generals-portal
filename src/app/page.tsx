'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  Shield, Activity, Calendar, Play, CheckCircle2, Circle,
  ExternalLink, LogOut, TrendingUp, X, Dumbbell, Flame
} from 'lucide-react'

type Profile = {
  id: string
  username: string
  full_name: string
  position_group: string
  is_active: boolean
}

type ThrowingDrill = {
  id: number
  phase: string
  sort_order: number
  drill_name: string
  sets: number
  reps: string
  target_throws: number
  youtube_embed_id: string | null
  notes: string | null
  is_completed: boolean
}

type TeamEvent = {
  id: number
  title: string
  event_type: string
  event_date: string
  start_time: string | null
  location: string | null
  practice_plan: string | null
}

type VeloPoint = {
  session_date: string
  velocity_mph: number
  session_type: string
}

export default function PlayerDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [today, setToday] = useState('')
  useEffect(() => { setToday(new Date().toISOString().split('T')[0]) }, [])

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar'>('dashboard')

  // Readiness State
  const [readinessScore, setReadinessScore] = useState<number>(85)
  const [soreness, setSoreness] = useState<number>(2)
  const [fatigue, setFatigue] = useState<number>(2)
  const [sleepHours, setSleepHours] = useState<number>(8)
  const [readinessSaved, setReadinessSaved] = useState(false)

  // Throwing, Velo & Calendar State
  const [drills, setDrills] = useState<ThrowingDrill[]>([])
  const [veloHistory, setVeloHistory] = useState<VeloPoint[]>([])
  const [teamEvents, setTeamEvents] = useState<TeamEvent[]>([])
  const [calendarFilter, setCalendarFilter] = useState<'all' | 'team' | 'personal'>('all')

  // Quick Velo / Command Logger State
  const [newVelo, setNewVelo] = useState('')
  const [sessionType, setSessionType] = useState('bullpen')
  const [commandPct, setCommandPct] = useState('')
  const [savingVelo, setSavingVelo] = useState(false)

  // Native Video Modal State
  const [activeVideoDrill, setActiveVideoDrill] = useState<ThrowingDrill | null>(null)

  const loadDashboardData = useCallback(async () => {
    if (!today) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!prof || !prof.is_active) {
      await supabase.auth.signOut()
      router.push('/login')
      return
    }
    setProfile(prof)

    // Load today's throwing program
    const { data: throwingRows } = await supabase
      .from('throwing_program')
      .select('*')
      .eq('scheduled_date', today)
      .order('sort_order', { ascending: true })

    if (throwingRows) setDrills(throwingRows)

    // Load today's arm readiness if already logged
    const { data: readinessRow } = await supabase
      .from('arm_readiness')
      .select('*')
      .eq('player_id', user.id)
      .eq('log_date', today)
      .maybeSingle()

    if (readinessRow) {
      setReadinessScore(readinessRow.readiness_score || 85)
      setSoreness(readinessRow.soreness_level || 2)
      setFatigue(readinessRow.fatigue_level || 2)
      setSleepHours(readinessRow.sleep_hours || 8)
      setReadinessSaved(true)
    }

    // Load fastball velo history
    const { data: veloRows } = await supabase
      .from('training_stats')
      .select('session_date, velocity_mph, session_type')
      .eq('player_id', user.id)
      .eq('pitch_type', 'FB')
      .not('velocity_mph', 'is', null)
      .order('session_date', { ascending: true })
      .limit(12)

    if (veloRows) setVeloHistory(veloRows)

    // Load upcoming team schedule
    const { data: scheduleRows } = await supabase
      .from('team_schedule')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(10)

    if (scheduleRows) setTeamEvents(scheduleRows)
    setLoading(false)
  }, [router, supabase, today])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const handleSaveReadiness = async () => {
    if (!profile) return
    const computed = Math.max(
      20,
      Math.min(100, Math.round(100 - (soreness - 1) * 5 - (fatigue - 1) * 4 + (sleepHours - 7) * 3))
    )
    setReadinessScore(computed)

    await supabase.from('arm_readiness').upsert(
      {
        player_id: profile.id,
        log_date: today,
        soreness_level: soreness,
        fatigue_level: fatigue,
        sleep_hours: sleepHours,
        readiness_score: computed,
      },
      { onConflict: 'player_id,log_date' }
    )
    setReadinessSaved(true)
  }

  const toggleDrillComplete = async (drill: ThrowingDrill) => {
    const nextState = !drill.is_completed
    setDrills((prev) =>
      prev.map((d) => (d.id === drill.id ? { ...d, is_completed: nextState } : d))
    )
    await supabase
      .from('throwing_program')
      .update({
        is_completed: nextState,
        completed_at: nextState ? new Date().toISOString() : null,
      })
      .eq('id', drill.id)
  }

  const handleLogVelo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !newVelo) return
    setSavingVelo(true)
    const mph = parseFloat(newVelo)

    await supabase.from('training_stats').insert({
      player_id: profile.id,
      session_date: today,
      session_type: sessionType,
      pitch_type: 'FB',
      velocity_mph: mph,
      notes: commandPct ? `Command: ${commandPct}%` : null,
    })

    setVeloHistory((prev) => [
      ...prev,
      { session_date: today, velocity_mph: mph, session_type: sessionType },
    ])
    setNewVelo('')
    setCommandPct('')
    setSavingVelo(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-semibold">
        Loading Generals Portal...
      </div>
    )
  }

  const baseThrows = drills.reduce((acc, d) => acc + (d.target_throws || 0), 0)
  const scaleFactor = readinessScore >= 80 ? 1 : readinessScore >= 65 ? 0.75 : 0.4
  const recommendedThrows = Math.round(baseThrows * scaleFactor)
  const readinessStatus =
    readinessScore >= 80
      ? { label: 'GO — Full Intent', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' }
      : readinessScore >= 65
      ? { label: 'MODERATE — Cap Volume 75%', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' }
      : { label: 'RECOVERY — Light Flush Only', color: 'text-red-600', bg: 'bg-red-50 border-red-200' }

  const peakVelo =
    veloHistory.length > 0 ? Math.max(...veloHistory.map((v) => Number(v.velocity_mph))) : 0

  const phases = [
    { key: 'pre_throw', label: '1. Pre-Throw Prep' },
    { key: 'throwing', label: '2. Throwing Progression' },
    { key: 'post_throw', label: '3. Post-Throw Recovery' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center border border-slate-300 shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-tight text-slate-900">
                GENERALS BASEBALL
              </div>
              <div className="text-xs text-slate-500 capitalize">
                {profile?.full_name} &bull; {profile?.position_group}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        <div className="max-w-3xl mx-auto px-4 flex gap-6 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTab === 'dashboard'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Today&apos;s Workload
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition cursor-pointer ${
              activeTab === 'calendar'
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Schedule &amp; Calendar
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {activeTab === 'dashboard' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-700" />
                    Arm Readiness
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${readinessStatus.bg} ${readinessStatus.color}`}>
                    {readinessStatus.label}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-black text-slate-900">{readinessScore}</span>
                  <span className="text-sm font-semibold text-slate-400">/ 100</span>
                </div>

                <div className="space-y-2.5 text-xs border-t border-slate-100 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">Arm Soreness (1-10): <b>{soreness}</b></span>
                    <input
                      type="range" min={1} max={10} value={soreness}
                      onChange={(e) => { setSoreness(Number(e.target.value)); setReadinessSaved(false) }}
                      className="w-28 accent-blue-700"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">Body Fatigue (1-10): <b>{fatigue}</b></span>
                    <input
                      type="range" min={1} max={10} value={fatigue}
                      onChange={(e) => { setFatigue(Number(e.target.value)); setReadinessSaved(false) }}
                      className="w-28 accent-blue-700"
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-medium">Sleep Hours: <b>{sleepHours}h</b></span>
                    <input
                      type="range" min={4} max={11} step={0.5} value={sleepHours}
                      onChange={(e) => { setSleepHours(Number(e.target.value)); setReadinessSaved(false) }}
                      className="w-28 accent-blue-700"
                    />
                  </div>
                  <button
                    onClick={handleSaveReadiness}
                    className="w-full mt-2 py-2 bg-slate-900 hover:bg-blue-700 text-white font-bold rounded-xl transition cursor-pointer"
                  >
                    {readinessSaved ? '✓ Check-In Saved' : 'Update Readiness Score'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
                    <Flame className="w-4 h-4 text-blue-700" />
                    Today&apos;s Throwing Workload
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black text-blue-700">{recommendedThrows}</span>
                    <span className="text-sm font-semibold text-slate-500">
                      adjusted throws {baseThrows !== recommendedThrows && `(of ${baseThrows} planned)`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Auto-scaled to your {readinessScore}/100 arm readiness score.
                  </p>
                </div>

                <a
                  href="https://traq.drivelinebaseball.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-slate-900 to-slate-800 hover:from-blue-900 hover:to-slate-900 text-white rounded-2xl p-4 shadow-sm border border-slate-300 flex items-center justify-between transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xs tracking-tighter border border-blue-400">
                      TRAQ
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1">
                        <Dumbbell className="w-3.5 h-3.5" /> Strength &amp; Lifting
                      </div>
                      <div className="font-bold text-sm">Open Driveline TRAQ App</div>
                    </div>
                  </div>
                  <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-white transition" />
                </a>
              </div>
            </div>

            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-extrabold text-slate-900">
                  Today&apos;s Throwing Program
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  {drills.filter((d) => d.is_completed).length}/{drills.length} Completed
                </span>
              </div>

              {drills.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center bg-slate-50 rounded-xl">
                  No throwing drills scheduled for today. Check the Calendar tab for team events.
                </p>
              ) : (
                <div className="space-y-6">
                  {phases.map((phase) => {
                    const phaseDrills = drills.filter((d) => d.phase === phase.key)
                    if (phaseDrills.length === 0) return null
                    return (
                      <div key={phase.key}>
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-700 mb-2.5">
                          {phase.label}
                        </h3>
                        <div className="space-y-2.5">
                          {phaseDrills.map((drill) => (
                            <div
                              key={drill.id}
                              className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                                drill.is_completed
                                  ? 'bg-slate-50 border-slate-200 opacity-75'
                                  : 'bg-white border-slate-200 hover:border-blue-300'
                              }`}
                            >
                              <button
                                onClick={() => toggleDrillComplete(drill)}
                                className="flex items-start gap-3 text-left flex-1 cursor-pointer"
                              >
                                {drill.is_completed ? (
                                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                                ) : (
                                  <Circle className="w-6 h-6 text-slate-300 shrink-0 mt-0.5" />
                                )}
                                <div>
                                  <div className={`font-bold text-sm ${drill.is_completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                    {drill.drill_name}
                                  </div>
                                  <div className="text-xs font-semibold text-slate-500 mt-0.5">
                                    {drill.sets} {drill.sets === 1 ? 'Set' : 'Sets'} &bull; {drill.reps}
                                  </div>
                                  {drill.notes && (
                                    <p className="text-xs text-slate-400 mt-1">{drill.notes}</p>
                                  )}
                                </div>
                              </button>

                              {drill.youtube_embed_id && (
                                <button
                                  onClick={() => setActiveVideoDrill(drill)}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-700 text-blue-700 hover:text-white text-xs font-bold transition shrink-0 cursor-pointer"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Video
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-700" />
                    Fastball Velocity Over Time
                  </h2>
                  <p className="text-xs text-slate-500">Peak logged fastball velocity across sessions</p>
                </div>
                {peakVelo > 0 && (
                  <div className="text-right">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">Season Peak</span>
                    <span className="text-xl font-black text-blue-700">{peakVelo.toFixed(1)} MPH</span>
                  </div>
                )}
              </div>

              {veloHistory.length > 0 ? (
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 items-end h-36 pt-4 pb-2 px-2 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                  {veloHistory.slice(-8).map((pt, idx) => {
                    const mph = Number(pt.velocity_mph)
                    const heightPct = Math.max(25, Math.min(100, ((mph - 75) / 20) * 100))
                    return (
                      <div key={idx} className="flex flex-col items-center h-full justify-end">
                        <span className="text-[11px] font-extrabold text-slate-700 mb-1">{mph}</span>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full max-w-[32px] bg-blue-700 rounded-t-lg transition-all"
                        />
                        <span className="text-[10px] text-slate-400 mt-1">
                          {pt.session_date.slice(5)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl mb-4 text-center">
                  No fastball readings logged yet. Enter today&apos;s top velocity below to start your trend line.
                </p>
              )}

              <form onSubmit={handleLogVelo} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800"
                >
                  <option value="bullpen">Mound Bullpen</option>
                  <option value="pulldown">Pulldowns</option>
                  <option value="live_ab">Live ABs</option>
                  <option value="flat_ground">Flat Ground</option>
                </select>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={newVelo}
                  onChange={(e) => setNewVelo(e.target.value)}
                  placeholder="Top FB (MPH)"
                  className="px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={commandPct}
                  onChange={(e) => setCommandPct(e.target.value)}
                  placeholder="Command % (opt)"
                  className="px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                />
                <button
                  type="submit"
                  disabled={savingVelo}
                  className="py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  {savingVelo ? 'Saving...' : '+ Log Session'}
                </button>
              </form>
            </section>
          </>
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-slate-200">
              <div className="flex gap-1.5">
                {(['all', 'team', 'personal'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setCalendarFilter(filter)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
                      calendarFilter === filter
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filter === 'all' ? 'All Events' : filter === 'team' ? 'Team Schedule' : 'My Throwing'}
                  </button>
                ))}
              </div>
            </div>

            {calendarFilter !== 'personal' && (
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
                  Upcoming Games, Practices &amp; Bullpens
                </h3>
                {teamEvents.map((ev) => (
                  <div key={ev.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {ev.event_type}
                      </span>
                      <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {ev.event_date} {ev.start_time && `• ${ev.start_time}`}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-slate-900 mt-2">{ev.title}</h4>
                    {ev.location && <p className="text-xs text-slate-500 mt-0.5">{ev.location}</p>}
                    {ev.practice_plan && (
                      <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                        <span className="font-bold text-slate-900 block mb-0.5">Plan / Notes:</span>
                        {ev.practice_plan}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {calendarFilter !== 'team' && (
              <div className="space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-1">
                  Today&apos;s Personal Throwing Drills ({today})
                </h3>
                {drills.map((d) => (
                  <div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase text-blue-700">{d.phase.replace('_', ' ')}</span>
                      <div className="font-bold text-sm text-slate-900">{d.drill_name}</div>
                      <div className="text-xs text-slate-500">{d.sets} sets &bull; {d.reps}</div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${d.is_completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {d.is_completed ? 'Done' : 'Scheduled'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {activeVideoDrill && activeVideoDrill.youtube_embed_id && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h3 className="font-extrabold text-sm text-slate-900">{activeVideoDrill.drill_name}</h3>
              <button
                onClick={() => setActiveVideoDrill(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${activeVideoDrill.youtube_embed_id}?rel=0&modestbranding=1`}
                title={activeVideoDrill.drill_name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            {activeVideoDrill.notes && (
              <div className="p-4 bg-slate-50 text-xs text-slate-600">
                <b className="text-slate-900">Coaching Cue:</b> {activeVideoDrill.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
