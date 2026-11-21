'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { EmptyState, PageTitle, Pill } from '@/components/ui'
import WorkoutsTab from '@/components/office/WorkoutsTab'
import GroupsTab from '@/components/office/GroupsTab'
import RosterTab from '@/components/office/RosterTab'
import DrillsTab from '@/components/office/DrillsTab'
import AttendanceTab from '@/components/office/AttendanceTab'
import ThoughtTab from '@/components/office/ThoughtTab'
import GameStatsImport from '@/components/office/GameStatsImport'
import PracticePlansTab from '@/components/office/PracticePlansTab'
import type { Exercise, Group, Profile } from '@/lib/training'

const TABS = [
  { key: 'workouts', label: 'Workouts' },
  { key: 'practices', label: 'Practice plans' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'groups', label: 'Groups' },
  { key: 'roster', label: 'Roster' },
  { key: 'drills', label: 'Drills' },
  { key: 'thought', label: 'Thought of the Week' },
  { key: 'gamestats', label: 'Game stats' },
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

  // Deep links, e.g. /office?tab=practices&event=12 from the Day plan
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('tab')
    if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey)
    const ev = Number(q.get('event'))
    if (ev) setOpenEventId(ev)
  }, [])

  useEffect(() => {
    if (!isCoach) return
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('team_groups').select('*').order('sort_order').order('name'),
      supabase.from('profiles').select('id, username, full_name, role, position_group, grad_year, is_active, is_demo').eq('role', 'player').order('full_name'),
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
      <PageTitle title="Coach Office" subtitle="Build the program. You’re in control." />
      <div className="flex gap-2 overflow-x-auto pb-3 mb-1">
        {TABS.map((t) => (
          <Pill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</Pill>
        ))}
      </div>
      {tab === 'workouts' && <WorkoutsTab groups={groups} exercises={exercises} />}
      {tab === 'practices' && <PracticePlansTab openEventId={openEventId} />}
      {tab === 'attendance' && <AttendanceTab players={players} groups={groups} />}
      {tab === 'groups' && <GroupsTab groups={groups} players={players} onChanged={refresh} />}
      {tab === 'roster' && <RosterTab players={players} groups={groups} onChanged={refresh} />}
      {tab === 'drills' && <DrillsTab exercises={exercises} onChanged={refresh} />}
      {tab === 'thought' && <ThoughtTab />}
      {tab === 'gamestats' && <GameStatsImport players={players} />}
    </div>
  )
}
