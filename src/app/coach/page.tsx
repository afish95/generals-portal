'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Shield, Users, Send, CheckCircle2, LogOut, Activity, Calendar } from 'lucide-react'

type RosterPlayer = {
  id: string
  full_name: string
  position_group: string
  readiness_score: number | null
  completed_drills: number
  total_drills: number
  latest_velo: number | null
}

export default function CoachDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [today, setToday] = useState('')
  useEffect(() => { setToday(new Date().toISOString().split('T')[0]) }, [])

  const [loading, setLoading] = useState(true)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const [targetType, setTargetType] = useState<'player' | 'group'>('group')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('starter')
  const [scheduledDate, setScheduledDate] = useState('')
  useEffect(() => { if (today && !scheduledDate) setScheduledDate(today) }, [today, scheduledDate])
  const [phase, setPhase] = useState('throwing')
  const [drillName, setDrillName] = useState('')
  const [sets, setSets] = useState(1)
  const [reps, setReps] = useState('20 throws')
  const [targetThrows, setTargetThrows] = useState(20)
  const [youtubeId, setYoutubeId] = useState('')
  const [notes, setNotes] = useState('')

  const loadCoachData = useCallback(async () => {
    if (!today) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: me } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (!me || !me.is_active || me.role !== 'coach') {
      router.push('/')
      return
    }

    const { data: players } = await supabase
      .from('profiles')
      .select('id, full_name, position_group')
      .eq('role', 'player')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    const { data: readinessRows } = await supabase
      .from('arm_readiness')
      .select('player_id, readiness_score')
      .eq('log_date', today)

    const { data: throwingRows } = await supabase
      .from('throwing_program')
      .select('player_id, position_group, is_completed')
      .eq('scheduled_date', today)

    const { data: veloRows } = await supabase
      .from('training_stats')
      .select('player_id, velocity_mph')
      .eq('pitch_type', 'FB')
      .not('velocity_mph', 'is', null)
      .order('session_date', { ascending: false })

    if (players) {
      if (players.length > 0 && !selectedPlayerId) setSelectedPlayerId(players[0].id)

      const enriched: RosterPlayer[] = players.map((p) => {
        const r = readinessRows?.find((row) => row.player_id === p.id)
        const pDrills = throwingRows?.filter(
          (d) => d.player_id === p.id || (!d.player_id && d.position_group === p.position_group)
        ) || []
        const latestV = veloRows?.find((v) => v.player_id === p.id)

        return {
          id: p.id,
          full_name: p.full_name,
          position_group: p.position_group,
          readiness_score: r ? r.readiness_score : null,
          completed_drills: pDrills.filter((d) => d.is_completed).length,
          total_drills: pDrills.length,
          latest_velo: latestV ? Number(latestV.velocity_mph) : null,
        }
      })
      setRoster(enriched)
    }

    setLoading(false)
  }, [router, selectedPlayerId, supabase, today])

  useEffect(() => {
    loadCoachData()
  }, [loadCoachData])

  const handlePushDrill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!drillName.trim()) return
    setSubmitting(true)
    setStatusMsg(null)

    const targetPlayers =
      targetType === 'player'
        ? roster.filter((p) => p.id === selectedPlayerId)
        : roster.filter((p) => p.position_group === selectedGroup)

    if (targetPlayers.length === 0) {
      setStatusMsg('No active players found in that target selection.')
      setSubmitting(false)
      return
    }

    const rowsToInsert = targetPlayers.map((p) => ({
      player_id: p.id,
      position_group: p.position_group,
      scheduled_date: scheduledDate,
      phase,
      sort_order: phase === 'pre_throw' ? 1 : phase === 'throwing' ? 2 : 3,
      drill_name: drillName.trim(),
      sets,
      reps,
      target_throws: targetThrows,
      youtube_embed_id: youtubeId.trim() || null,
      notes: notes.trim() || null,
    }))

    const { error } = await supabase.from('throwing_program').insert(rowsToInsert)

    if (error) {
      setStatusMsg(`Error: ${error.message}`)
    } else {
      setStatusMsg(`Pushed "${drillName}" to ${targetPlayers.length} player(s) for ${scheduledDate}.`)
      setDrillName('')
      setNotes('')
      loadCoachData()
    }
    setSubmitting(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-semibold">
        Loading Coach Command Center...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center border border-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-tight">GENERALS COACHING STAFF</div>
              <div className="text-xs text-slate-400">Roster Training Status &amp; Program Builder</div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-700" />
              Today&apos;s Roster Training Status ({today})
            </h2>
            <span className="text-xs font-bold text-slate-500">{roster.length} Active Players</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pr-4">Player</th>
                  <th className="py-2.5 px-3">Group</th>
                  <th className="py-2.5 px-3">Arm Readiness</th>
                  <th className="py-2.5 px-3">Today&apos;s Drills</th>
                  <th className="py-2.5 pl-3 text-right">Latest FB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {roster.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-4 font-bold text-slate-900">{p.full_name}</td>
                    <td className="py-3 px-3 capitalize text-xs font-semibold text-slate-500">
                      {p.position_group.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-3">
                      {p.readiness_score !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                            p.readiness_score >= 80
                              ? 'bg-emerald-50 text-emerald-700'
                              : p.readiness_score >= 65
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          <Activity className="w-3 h-3" />
                          {p.readiness_score} / 100
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Not checked in</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <CheckCircle2 className={`w-4 h-4 ${p.total_drills > 0 && p.completed_drills === p.total_drills ? 'text-emerald-600' : 'text-slate-300'}`} />
                        {p.completed_drills} / {p.total_drills}
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right font-extrabold text-blue-700">
                      {p.latest_velo ? `${p.latest_velo.toFixed(1)} MPH` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-4">
            <Send className="w-5 h-5 text-blue-700" />
            Push Throwing Drill / Program
          </h2>

          {statusMsg && (
            <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold">
              {statusMsg}
            </div>
          )}

          <form onSubmit={handlePushDrill} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Assign To</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as 'player' | 'group')}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              >
                <option value="group">Position Group</option>
                <option value="player">Individual Player</option>
              </select>
            </div>

            {targetType === 'group' ? (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Position Group</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                >
                  <option value="starter">Starters</option>
                  <option value="reliever">Relievers</option>
                  <option value="catcher">Catchers</option>
                  <option value="position_player">Position Players</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Player</label>
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                >
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Scheduled Date
              </label>
              <input
                type="date"
                required
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Phase</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              >
                <option value="pre_throw">1. Pre-Throw Prep</option>
                <option value="throwing">2. Throwing Progression</option>
                <option value="post_throw">3. Post-Throw Recovery</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Drill / Bullpen Name</label>
              <input
                type="text"
                required
                value={drillName}
                onChange={(e) => setDrillName(e.target.value)}
                placeholder="e.g. PlyoCare Wall Throws + 25-Pitch Mound Bullpen"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Sets</label>
              <input
                type="number"
                min={1}
                value={sets}
                onChange={(e) => setSets(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Reps / Description</label>
              <input
                type="text"
                required
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="e.g. 20 throws @ 85%"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Planned Throw Count</label>
              <input
                type="number"
                min={0}
                value={targetThrows}
                onChange={(e) => setTargetThrows(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">YouTube Video ID (Optional)</label>
              <input
                type="text"
                value={youtubeId}
                onChange={(e) => setYoutubeId(e.target.value)}
                placeholder="e.g. M7lc1UVf-VE"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Coaching Cues / Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional cues shown on player card"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
              />
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl transition cursor-pointer"
              >
                {submitting ? 'Pushing Program...' : 'Push to Player Portal'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
