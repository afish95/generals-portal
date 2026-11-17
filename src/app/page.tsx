'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import BullpenScriptRunner from '@/components/BullpenScriptRunner'
import ScheduleCalendarView from '@/components/ScheduleCalendarView'
import {
  Shield, Activity, Calendar, Play, CheckCircle2, Circle,
  ExternalLink, LogOut, TrendingUp, X, Zap
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

type TrainingTool = {
  id: number
  title: string
  category: string
  description: string | null
  embed_url: string | null
  external_url: string | null
  is_featured: boolean
}

export default function PlayerDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [today, setToday] = useState('')
  useEffect(() => {
    setToday(new Date().toISOString().split('T')[0])
  }, [])

  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'tools'>('dashboard')
  const [drills, setDrills] = useState<ThrowingDrill[]>([])
  const [teamEvents, setTeamEvents] = useState<TeamEvent[]>([])
  const [veloHistory, setVeloHistory] = useState<VeloPoint[]>([])
  const [trainingTools, setTrainingTools] = useState<TrainingTool[]>([])
  const [loading, setLoading] = useState(true)

  // Arm Readiness State
  const [readinessScore, setReadinessScore] = useState(88)
  const [soreness, setSoreness] = useState(2)
  const [fatigue, setFatigue] = useState(2)
  const [sleepHours, setSleepHours] = useState(8)
  const [readinessSaved, setReadinessSaved] = useState(false)

  // Velo Input State
  const [newVelo, setNewVelo] = useState('')
  const [veloType, setVeloType] = useState('Bullpen')
  const [activeVideo, setActiveVideo] = useState<{ title: string; id: string } | null>(null)

  const loadDashboardData = useCallback(async () => {
    if (!today) return
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (prof) setProfile(prof)

    const { data: throwingRows } = await supabase
      .from('throwing_program')
      .select('*')
      .eq('scheduled_date', today)
      .order('sort_order', { ascending: true })
    if (throwingRows) setDrills(throwingRows)

    const { data: readinessRow } = await supabase
      .from('arm_readiness')
      .select('*')
      .eq('player_id', user.id)
      .eq('log_date', today)
      .maybeSingle()

    if (readinessRow) {
      setReadinessScore(readinessRow.readiness_score || 88)
      setSoreness(readinessRow.soreness_level || 2)
      setFatigue(readinessRow.fatigue_level || 2)
      setSleepHours(readinessRow.sleep_hours || 8)
    }

    const { data: eventsData } = await supabase
      .from('team_schedule')
      .select('*')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
    if (eventsData) setTeamEvents(eventsData)

    const { data: veloData } = await supabase
      .from('velocity_logs')
      .select('session_date, velocity_mph, session_type')
      .eq('player_id', user.id)
      .order('session_date', { ascending: true })
      .limit(10)
    if (veloData) setVeloHistory(veloData)

    const { data: toolsData } = await supabase
      .from('training_tools')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (toolsData) setTrainingTools(toolsData)

    setLoading(false)
  }, [today, router, supabase])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const handleSaveReadiness = async (overrideScore?: number) => {
    if (!profile || !today) return
    const computed =
      typeof overrideScore === 'number'
        ? overrideScore
        : Math.max(
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
    setTimeout(() => setReadinessSaved(false), 2500)
  }

  const handleToggleDrill = async (drill: ThrowingDrill) => {
    const nextVal = !drill.is_completed
    setDrills((prev) => prev.map((d) => (d.id === drill.id ? { ...d, is_completed: nextVal } : d)))
    await supabase.from('throwing_program').update({ is_completed: nextVal }).eq('id', drill.id)
  }

  const handleLogVelo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !newVelo || !today) return
    const mph = parseFloat(newVelo)
    if (isNaN(mph) || mph < 40 || mph > 110) return

    await supabase.from('velocity_logs').insert({
      player_id: profile.id,
      session_date: today,
      velocity_mph: mph,
      session_type: veloType,
    })
    setNewVelo('')
    loadDashboardData()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-sm font-bold text-slate-500 animate-pulse">Loading Generals Portal...</div>
      </div>
    )
  }

  // Readiness visual status
  const readinessMeta =
    readinessScore >= 80
      ? {
          pill: 'GREEN • HIGH INTENT',
          pillClass: 'bg-emerald-100 text-emerald-800',
          ringColor: '#10b981',
          headline: 'Ready for High Intent',
          sub: 'Full pulldown & bullpen volume cleared.',
          intentLabel: 'High Intent (90-100%)',
        }
      : readinessScore >= 65
      ? {
          pill: 'YELLOW • MODERATE',
          pillClass: 'bg-amber-100 text-amber-800',
          ringColor: '#f59e0b',
          headline: 'Moderate Intent Day',
          sub: 'Cap total throw volume at 75% & focus on mechanics.',
          intentLabel: 'Moderate Intent (75-85%)',
        }
      : {
          pill: 'RED • RECOVERY',
          pillClass: 'bg-red-100 text-red-800',
          ringColor: '#ef4444',
          headline: 'Recovery & Flush Only',
          sub: 'Skip high-intent throws; complete mobility & arm care.',
          intentLabel: 'Light Flush (< 70%)',
        }

  const totalTargetThrows = drills.reduce((acc, d) => acc + (Number(d.target_throws) || 0), 0) || 42
  const completedDrillsCount = drills.filter((d) => d.is_completed).length
  const progressPct = drills.length > 0 ? Math.round((completedDrillsCount / drills.length) * 100) : 0
  const peakVelo = veloHistory.length > 0 ? Math.max(...veloHistory.map((v) => Number(v.velocity_mph))) : 0

  const drivelineTool = trainingTools.find((t) => t.title.toLowerCase().includes('driveline'))
  const drivelineUrl =
    drivelineTool?.external_url || 'itms-apps://apps.apple.com/us/app/driveline-baseball/id1563699527'

  const phases = [
    { key: 'pre_throw', label: '1. Pre-Throw Prep' },
    { key: 'throwing', label: '2. Throwing Progression' },
    { key: 'post_throw', label: '3. Post-Throw Recovery' },
  ]

  // SVG Ring Gauge Math
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, readinessScore)) / 100) * circumference

  return (
    <div className="min-h-screen bg-[#f3f5f9] text-slate-900 pb-20">
      {/* Royal Blue Hero Header */}
      <header className="bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white shadow-md">
        <div className="max-w-xl mx-auto px-4 pt-5 pb-5 space-y-4">
          {/* Top Profile Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">
                    GENERALS BASEBALL
                  </span>
                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-400/25 text-blue-100">
                    {profile?.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <h1 className="text-lg font-extrabold leading-tight tracking-tight">
                  {profile?.full_name || 'Generals Player'}
                </h1>
                <p className="text-xs text-blue-100/90 font-medium">
                  {profile?.position_group || 'Pitcher'} &bull; #{profile?.username || 'Player'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-[11px] font-bold text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Synced
              </span>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 3-Tab Segmented Navigation Pill */}
          <nav className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#113694]/70 border border-white/15">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white text-[#1746b8] shadow-sm'
                  : 'text-blue-100 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('calendar')}
              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-white text-[#1746b8] shadow-sm'
                  : 'text-blue-100 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Team Calendar
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`py-2.5 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'tools'
                  ? 'bg-white text-[#1746b8] shadow-sm'
                  : 'text-blue-100 hover:text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Training Tools
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-xl mx-auto px-4 pt-5 space-y-4">
        {activeTab === 'dashboard' ? (
          <>
            {/* 1. Arm Readiness Card with Circular SVG Ring */}
            <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  ARM READINESS
                </span>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${readinessMeta.pillClass}`}>
                  {readinessMeta.pill}
                </span>
              </div>

              <div className="flex items-center gap-4">
                {/* Circular Gauge */}
                <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      fill="transparent"
                      stroke="#e2e8f0"
                      strokeWidth="7"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r={radius}
                      fill="transparent"
                      stroke={readinessMeta.ringColor}
                      strokeWidth="7"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                    <span className="text-xl font-black text-slate-900">{readinessScore}</span>
                    <span className="text-[10px] font-bold text-slate-400 mt-0.5">/100</span>
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-extrabold text-slate-900">{readinessMeta.headline}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{readinessMeta.sub}</p>
                </div>
              </div>

              {/* Quick Check-In Controls */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500">Quick Check-In:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSaveReadiness(88)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-extrabold transition cursor-pointer"
                    >
                      Green 88
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveReadiness(72)}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-extrabold transition cursor-pointer"
                    >
                      Yellow 72
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveReadiness(54)}
                      className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-extrabold transition cursor-pointer"
                    >
                      Red 54
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={30}
                  max={100}
                  value={readinessScore}
                  onChange={(e) => setReadinessScore(Number(e.target.value))}
                  onMouseUp={() => handleSaveReadiness()}
                  onTouchEnd={() => handleSaveReadiness()}
                  className="w-full accent-[#1746b8] cursor-pointer"
                />
                {readinessSaved && (
                  <p className="text-[11px] font-bold text-emerald-600 text-right">
                    Readiness saved to profile!
                  </p>
                )}
              </div>
            </section>

            {/* 2. Throwing Workload Card */}
            <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  THROWING WORKLOAD
                </span>
                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-blue-50 text-[#1746b8]">
                  ACWR 1.08 &bull; Optimal
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-3xl font-black text-slate-900">{totalTargetThrows}</span>
                  <span className="text-xs font-bold text-slate-500 ml-1.5">Target Throws</span>
                </div>
                <span className="text-xs font-extrabold text-[#1746b8]">{readinessMeta.intentLabel}</span>
              </div>

              <p className="text-xs font-medium text-slate-500 -mt-2">
                {profile?.position_group || 'Pitcher'} Track &bull; Daily Arm Care + Throwing
              </p>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600">Today&apos;s Progress</span>
                  <span className="text-[#1746b8]">
                    {completedDrillsCount}/{drills.length} Drills ({progressPct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1746b8] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </section>

            {/* 3. Driveline TRAQ App Card */}
            <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#0f172a] text-white flex items-center justify-center font-black text-lg shrink-0">
                  T
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold text-slate-900">Driveline TRAQ</h2>
                    <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      SYNCED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">Today&apos;s Strength &amp; Conditioning</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="text-xs font-extrabold text-slate-900">
                  {drivelineTool?.title || 'Assigned Driveline Program & Velocity Logs'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {drivelineTool?.description || 'Tap below to launch the native Driveline Baseball iPhone app.'}
                </div>
              </div>

              <a
                href={drivelineUrl}
                className="w-full py-3.5 px-4 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-xs"
              >
                Open Driveline TRAQ
                <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-500 text-white">
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </a>
            </section>

            {/* 4. Today's Throwing Drills Checklist */}
            <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Today&apos;s Throwing Workload</h2>
                  <p className="text-[11px] text-slate-500">
                    Auto-calibrated to Readiness ({readinessScore}/100)
                  </p>
                </div>
                <span className="text-xs font-extrabold text-[#1746b8]">
                  {completedDrillsCount}/{drills.length} Done
                </span>
              </div>

              {drills.length === 0 ? (
                <div className="p-5 rounded-2xl bg-slate-50 text-center text-xs font-semibold text-slate-500">
                  No throwing drills scheduled for today. Check Team Calendar for upcoming dates.
                </div>
              ) : (
                <div className="space-y-4">
                  {phases.map((phase) => {
                    const phaseDrills = drills.filter((d) => d.phase === phase.key)
                    if (phaseDrills.length === 0) return null
                    return (
                      <div key={phase.key} className="space-y-2">
                        <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                          {phase.label}
                        </h3>
                        {phaseDrills.map((drill) => (
                          <div
                            key={drill.id}
                            className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                              drill.is_completed
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : 'bg-slate-50/80 border-slate-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleDrill(drill)}
                              className="flex items-start gap-3 text-left flex-1 cursor-pointer"
                            >
                              {drill.is_completed ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                              ) : (
                                <Circle className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <div
                                  className={`text-xs font-extrabold ${
                                    drill.is_completed ? 'line-through text-slate-400' : 'text-slate-900'
                                  }`}
                                >
                                  {drill.drill_name}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  {drill.sets} sets &bull; {drill.reps}
                                  {drill.target_throws ? ` • ${drill.target_throws} throws` : ''}
                                </div>
                              </div>
                            </button>

                            {drill.youtube_embed_id && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveVideo({ title: drill.drill_name, id: drill.youtube_embed_id! })
                                }
                                className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1746b8] text-[11px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <Play className="w-3 h-3" /> Demo
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* 5. Velocity Tracking Card */}
            <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#1746b8]" />
                  <h2 className="text-sm font-extrabold text-slate-900">Velocity Log</h2>
                </div>
                {peakVelo > 0 && (
                  <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-blue-50 text-[#1746b8]">
                    Peak: {peakVelo} MPH
                  </span>
                )}
              </div>

              <form onSubmit={handleLogVelo} className="flex flex-wrap sm:flex-nowrap gap-2">
                <input
                  type="number"
                  step="0.1"
                  placeholder="MPH (e.g. 86.5)"
                  value={newVelo}
                  onChange={(e) => setNewVelo(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                />
                <select
                  value={veloType}
                  onChange={(e) => setVeloType(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white"
                >
                  <option value="Bullpen">Bullpen</option>
                  <option value="Pulldown">Pulldown</option>
                  <option value="Game">Game</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-[#1746b8] hover:bg-blue-800 text-white text-xs font-extrabold cursor-pointer"
                >
                  Log
                </button>
              </form>

              {veloHistory.length > 0 && (
                <div className="flex items-end gap-2 h-24 pt-2 px-1">
                  {veloHistory.map((pt, idx) => {
                    const heightPct = Math.max(25, Math.min(100, ((Number(pt.velocity_mph) - 65) / 35) * 100))
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-extrabold text-slate-700">{pt.velocity_mph}</span>
                        <div className="w-full bg-slate-100 rounded-t-lg h-14 flex items-end overflow-hidden">
                          <div
                            className="w-full bg-[#1746b8] rounded-t-lg"
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400">{pt.session_date.slice(5)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        ) : activeTab === 'tools' ? (
          <section className="space-y-4">
            {profile && <BullpenScriptRunner playerId={profile.id} />}
            {trainingTools.map((tool) => (
              <div
                key={tool.id}
                className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1746b8]">
                      {tool.category}
                    </span>
                    <h3 className="text-sm font-extrabold text-slate-900 mt-2">{tool.title}</h3>
                    {tool.description && (
                      <p className="text-xs text-slate-500 mt-1">{tool.description}</p>
                    )}
                  </div>
                  {tool.external_url && (
                    <a
                      href={tool.external_url}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-extrabold shrink-0"
                    >
                      Open <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <ScheduleCalendarView today={today} initialEvents={teamEvents} />
        )}
      </main>

      {/* Video Demo Modal */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-900">{activeVideo.title}</h3>
              <button
                onClick={() => setActiveVideo(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${activeVideo.id}?autoplay=1`}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
