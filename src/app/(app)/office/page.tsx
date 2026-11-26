'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile, useSubnav } from '@/components/shell/AppShell'
import { EmptyState, PageTitle } from '@/components/ui'
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
import AssignmentsTab from '@/components/office/AssignmentsTab'
import { SubTabs } from '@/components/office/roster/shared'
import { PROFILE_FIELDS, type Exercise, type Group, type Profile } from '@/lib/training'

const SECTIONS = [
  {
    key: 'schedule',
    label: 'Schedule',
    subs: [
      { key: 'schedule', label: 'Calendar' },
      { key: 'practices', label: 'Practice Plans' },
      { key: 'attendance', label: 'Attendance' },
    ],
  },
  {
    key: 'training',
    label: 'Training',
    subs: [
      { key: 'assignments', label: 'Assignments' },
      { key: 'workouts', label: 'Workouts' },
      { key: 'programs', label: 'Programs' },
      { key: 'progressions', label: 'Progressions' },
      { key: 'drills', label: 'Drills' },
    ],
  },
  {
    key: 'players',
    label: 'Players',
    subs: [
      { key: 'roster', label: 'Roster' },
      { key: 'plans', label: 'Player Plans' },
      { key: 'data', label: 'Player Data' },
      { key: 'gamestats', label: 'Game Stats' },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    subs: [
      { key: 'dow', label: 'Drill of the Week' },
      { key: 'thought', label: 'Thought of the Week' },
      { key: 'import', label: 'Videos & Import' },
    ],
  },
] as const
type TabKey = (typeof SECTIONS)[number]['subs'][number]['key']
const ALL_KEYS = SECTIONS.flatMap((s) => s.subs.map((x) => x.key as string))
const sectionOf = (k: TabKey) => SECTIONS.find((s) => s.subs.some((x) => x.key === k))!
const MAIN = SECTIONS.map((s) => ({ key: s.key, label: s.label }))

export default function CoachOfficePage() {
  const { isCoach } = useProfile()
  const [tab, setTabRaw] = useState<TabKey>('assignments')
  const lastSub = useRef<Record<string, TabKey>>({})
  const setTab = (k: TabKey) => {
    lastSub.current[sectionOf(k).key] = k
    setTabRaw(k)
  }
  const section = sectionOf(tab)
  const goSection = (key: string) => {
    const sec = SECTIONS.find((s) => s.key === key)!
    setTab(lastSub.current[key] || (sec.subs[0].key as TabKey))
  }
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Profile[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const [openEventId, setOpenEventId] = useState<number | null>(null)
  const [planPlayer, setPlanPlayer] = useState<string | null>(null)
  const [deep, setDeep] = useState<{ sub?: string; workout?: number; date?: string }>({})
  const [rosterSub, setRosterSub] = useState<'players' | 'coaches' | 'groups' | 'sandbox' | 'transfer'>('players')
  useSubnav(MAIN, section.key, goSection)

  // Deep links, e.g. /office?tab=practices&event=12 from the Day plan
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('tab')
    if (t === 'groups' || t === 'sandbox' || t === 'coaches' || t === 'transfer') {
      setTab('roster')
      setRosterSub(t)
    } else if (t === 'drills' && ['progressions', 'programs', 'dow', 'import'].includes(q.get('sub') || '')) setTab(q.get('sub') as TabKey)
    else if (t && ALL_KEYS.includes(t)) setTab(t as TabKey)
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
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-white border border-slate-200 mb-3 lg:hidden">
        {MAIN.map((t) => (
          <button key={t.key} type="button" onClick={() => goSection(t.key)} className={`py-2 rounded-xl text-xs font-extrabold cursor-pointer ${section.key === t.key ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <SubTabs<TabKey> tabs={section.subs.map((x) => ({ key: x.key as TabKey, label: x.label }))} active={tab} onChange={setTab} />
      {tab === 'schedule' && <ScheduleTab groups={groups} openEventId={openEventId} />}
      {tab === 'assignments' && (
        <AssignmentsTab
          onOpenWorkout={(date, id) => {
            setDeep({ date, workout: id })
            setTab('workouts')
          }}
          onOpenLibrary={(s) => setTab(s)}
        />
      )}
      {tab === 'workouts' && <WorkoutsTab groups={groups} exercises={exercises} openWorkoutId={deep.workout} openDate={deep.date} key={`w${deep.workout || ''}`} />}
      {tab === 'plans' && <PlayerPlansTab initialPlayer={planPlayer} />}
      {tab === 'practices' && <PracticePlansTab openEventId={openEventId} />}
      {tab === 'attendance' && <AttendanceTab players={players} groups={groups} />}
      {tab === 'roster' && <RosterArea initial={rosterSub} onChanged={refresh} />}
      {tab === 'data' && <PlayerDataTab players={players} initialPlayer={planPlayer} initialSub={deep.sub} key={`p${planPlayer || ''}`} />}
      {(tab === 'drills' || tab === 'progressions' || tab === 'programs' || tab === 'dow' || tab === 'import') && <DrillLibrary onChanged={refresh} only={tab} key={tab} />}
      {tab === 'thought' && <ThoughtTab />}
      {tab === 'gamestats' && <GameStatsImport players={players} />}
    </div>
  )
}
