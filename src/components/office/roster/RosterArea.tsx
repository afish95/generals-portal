'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PROFILE_FIELDS, type Group, type Profile } from '@/lib/training'
import { SubTabs, type Member } from './shared'
import PeoplePanel from './PeoplePanel'
import GroupsPanel from './GroupsPanel'
import SandboxPanel from './SandboxPanel'

type Sub = 'players' | 'coaches' | 'groups' | 'sandbox'

/** Coach Office → Roster: players, coaches, groups & tags, and the sandbox roster builder. */
export default function RosterArea({ initial = 'players', onChanged }: { initial?: Sub; onChanged: () => void }) {
  const [sub, setSub] = useState<Sub>(initial)
  const [people, setPeople] = useState<Profile[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => setSub(initial), [initial])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select(PROFILE_FIELDS).in('role', ['player', 'coach']).order('full_name'),
      supabase.from('team_groups').select('*').order('sort_order').order('name'),
      supabase.from('group_members').select('group_id, athlete_id'),
    ]).then(([p, g, m]) => {
      if (cancelled) return
      setPeople((p.data as Profile[]) || [])
      setGroups((g.data as Group[]) || [])
      setMembers((m.data as Member[]) || [])
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const reload = useCallback(() => {
    setVersion((v) => v + 1)
    onChanged()
  }, [onChanged])

  const players = people.filter((p) => p.role === 'player')
  const coaches = people.filter((p) => p.role === 'coach')

  return (
    <div>
      <SubTabs<Sub>
        tabs={[
          { key: 'players', label: 'Players', count: players.filter((p) => p.is_active && !p.is_demo).length },
          { key: 'coaches', label: 'Coaches', count: coaches.length },
          { key: 'groups', label: 'Groups & tags', count: groups.length },
          { key: 'sandbox', label: 'Sandbox' },
        ]}
        active={sub}
        onChange={setSub}
      />
      {!loaded ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : sub === 'players' ? (
        <PeoplePanel role="player" people={players} groups={groups} members={members} onChanged={reload} />
      ) : sub === 'coaches' ? (
        <PeoplePanel role="coach" people={coaches} groups={groups} members={members} onChanged={reload} />
      ) : sub === 'groups' ? (
        <GroupsPanel people={people} groups={groups} members={members} onChanged={reload} />
      ) : (
        <SandboxPanel people={players} groups={groups} members={members} onChanged={reload} />
      )}
    </div>
  )
}
