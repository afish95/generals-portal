'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile, useSubnav } from '@/components/shell/AppShell'
import { EmptyState, PageTitle, Pill } from '@/components/ui'
import WorkoutsTab from '@/components/office/WorkoutsTab'
import RosterArea from '@/components/office/roster/RosterArea'
import PlayerPlansTab from '@/components/office/plans/PlayerPlansTab'
import DrillLibrary from '@/components/library/DrillLibrary'
import AttendanceTab from '@/components/office/AttendanceTab'
import ThoughtTab from '@/components/office/ThoughtTab'
import GameStatsImport from '@/components/office/GameStatsImport'
import PracticePlansTab from '@/components/office/PracticePlansTab'
import ScheduleTab from '@/components/office/ScheduleTab'
import PlayerDataTab from '@/components/office/PlayerDataTab'
import { PROFILE_FIELDS, type Exercise, type Group, type Profile } from '@/lib/training'

const TABS = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'workouts', label: 'Workouts' },
  { key: 'plans', label: 'Player Plans' },
  { key: 'practices', label: 'Practice Plans' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'roster', label: 'Roster' },
  { key: 'data', label: 'Player Data' },
  { key: 'drills', label: 'Drills' },
  { key: 'thought', label: 'Thought of the Week' },
  { key: 'gamestats', label: 'Game Stats' },
] as const
type TabKey = (typeof TABS)[number]['key']

export default function CoachOfficePage() {
  const { isCoach } = useProfile()
  const [tab, setTab] = useState<TabKey>('workouts')
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const [openEventId, setOpenEventId] = useState<number | null>(null)
  const [planPlayer, setPlanPlayer] = useState<string | null>(null)
  const [deep, setDeep] = useState<{ sub?: string; workout?: number; date?: string }>({})
  const [rosterSub, setRosterSub] = useState<'players' | 'coaches' | 'groups' | 'sandbox' | 'transfer'>('players')
  useSubnav(TABS as unknown as { key: string; label: string }[], tab, (k) => setTab(k as TabKey))

  // Deep links, e.g. /office?tab=practices&event=12 from the Day plan
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('tab')
    if (t === 'groups' || t === 'sandbox' || t === 'coaches' || t === 'transfer') {
      setTab('roster')
      setRosterSub(t)
    } else if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey)
    const pl = q.get('player')
    if (pl) setPlanPlayer(pl)
    const ev = Number(q.get('event'))
    if (ev) setOpenEventId(ev)
    setDeep({ sub: q.get('sub') || undefined, workout: Number(q.get('workout')) || undefined, date: q.get('date') || undefined })
  }, [])

  useEffect(() => {
    if (!isCoach) return
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('team_groups').select('*').order('sort_order').order('name'),
      supabase.from('profiles').select(PROFILE_FIELDS).eq('role', 'player').order('full_name'),
      supabase.from('exercises').select('*').order('name'),
    ]).then(([g, p, e]) => {
      if (cancelled) return
      setGroups((g.data as Group[]) || [])
      setPlayers((p.data as Profile[]) || [])
      setExercises((e.data as Exercise[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [isCoach, reload])

  if (!isCoach) return <EmptyState title="Coaches only" />

  return (
    <div>
      <div className="lg:hidden">
        <PageTitle title="Coach Office" subtitle="Build the program. You’re in control." />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-3 mb-1 lg:hidden">
        {TABS.map((t) => (
          <Pill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</Pill>
        ))}
      </div>
      {tab === 'schedule' && <ScheduleTab groups={groups} openEventId={openEventId} />}
      {tab === 'workouts' && <WorkoutsTab groups={groups} exercises={exercises} openWorkoutId={deep.workout} openDate={deep.date} key={`w${deep.workout || ''}`} />}
      {tab === 'plans' && <PlayerPlansTab initialPlayer={planPlayer} />}
      {tab === 'practices' && <PracticePlansTab openEventId={openEventId} />}
      {tab === 'attendance' && <AttendanceTab players={players} groups={groups} />}
      {tab === 'roster' && <RosterArea initial={rosterSub} onChanged={refresh} />}
      {tab === 'data' && <PlayerDataTab players={players} initialPlayer={planPlayer} initialSub={deep.sub} key={`p${planPlayer || ''}`} />}
      {tab === 'drills' && <DrillLibrary onChanged={refresh} initialSub={deep.sub} key={`d${deep.sub || ''}`} />}
      {tab === 'thought' && <ThoughtTab />}
      {tab === 'gamestats' && <GameStatsImport players={players} />}
    </div>
  )
}
