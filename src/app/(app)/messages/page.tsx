'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Hash, Megaphone, Plus, Search, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { PageTitle, inputClass } from '@/components/ui'
import AnnouncementComposer from '@/components/AnnouncementComposer'
import AnnouncementsFeed from '@/components/AnnouncementsFeed'
import ChatThread from '@/components/messages/ChatThread'
import { timeAgo, type Group } from '@/lib/training'

type Convo = {
  id: number
  kind: 'team' | 'group' | 'direct'
  title: string | null
  group_id: number | null
  member_a: string | null
  member_b: string | null
  last_message_at: string
  last_body: string | null
  last_sender: string | null
  unread: number
}
type Person = { id: string; full_name: string; role: string; is_active: boolean; has_login?: boolean; grad_year?: number | null }
type Member = { group_id: number; athlete_id: string }

function useIsDesktop() {
  const [desk, setDesk] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesk(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desk
}

export default function MessagesPage() {
  const { profile, isCoach, viewAs } = useProfile()
  const desktop = useIsDesktop()
  const [tab, setTab] = useState<'chats' | 'announcements'>('chats')
  const [convos, setConvos] = useState<Convo[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [sheet, setSheet] = useState<'dm' | 'channel' | 'members' | null>(null)
  const [filter, setFilter] = useState('')
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload((n) => n + 1), [])
  const coachTools = isCoach && !viewAs.active
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'announcements') setTab('announcements')
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      viewAs.active ? supabase.rpc('conversations_for', { p_user: profile.id }) : supabase.rpc('my_conversations'),
      supabase.from('profiles').select('id, full_name, role, is_active, has_login, grad_year'),
      supabase.from('team_groups').select('*').order('sort_order'),
      coachTools ? supabase.from('group_members').select('group_id, athlete_id') : Promise.resolve({ data: [] }),
    ]).then(([c, p, g, m]) => {
      if (cancelled) return
      setConvos(((c.data as Convo[]) || []).map((x) => ({ ...x, unread: Number(x.unread) })))
      setPeople((p.data as Person[]) || [])
      setGroups((g.data as Group[]) || [])
      setMembers((m.data as Member[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [reload, viewAs.active, profile.id, coachTools])

  const names = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people])
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  const titleOf = (c: Convo) => {
    if (c.kind === 'direct') {
      const other = c.member_a === profile.id ? c.member_b : c.member_b === profile.id ? c.member_a : null
      if (other) return names.get(other) ?? 'Direct Message'
      return `${names.get(c.member_a || '') ?? '?'} ↔ ${names.get(c.member_b || '') ?? '?'}`
    }
    if (c.kind === 'team') return 'everyone'
    return groupById.get(c.group_id || 0)?.name || c.title || 'channel'
  }
  const memberCount = (c: Convo) => (c.kind === 'group' ? members.filter((m) => m.group_id === c.group_id).length : null)
  const subtitleOf = (c: Convo) => {
    if (c.kind === 'direct') return 'Direct message · coaches can see all DMs'
    if (c.kind === 'team') return 'The whole program'
    const n = memberCount(c)
    return n !== null && coachTools ? `${n} members · coaches can see every channel` : 'Channel'
  }

  const visible = (convos || []).filter((c) => c.kind !== 'group' || groupById.get(c.group_id || 0)?.has_chat !== false)
  const match = (c: Convo) => !filter || titleOf(c).toLowerCase().includes(filter.toLowerCase())
  const channels = visible
    .filter((c) => c.kind !== 'direct' && match(c))
    .sort((a, b) => (a.kind === 'team' ? -1 : b.kind === 'team' ? 1 : (groupById.get(a.group_id || 0)?.sort_order ?? 99) - (groupById.get(b.group_id || 0)?.sort_order ?? 99)))
  const dms = visible.filter((c) => c.kind === 'direct' && match(c))

  // Desktop: always show a conversation in the right pane
  useEffect(() => {
    if (desktop && !openId && channels.length) setOpenId(channels[0].id)
  }, [desktop, openId, channels])

  const open = visible.find((c) => c.id === openId)

  const startDirect = async (otherId: string) => {
    setError(null)
    const { data, error: e } = await createClient().rpc('get_or_create_direct', { p_other: otherId })
    if (e) return setError(e.message)
    setSheet(null)
    setOpenId(Number(data))
    refresh()
  }

  const row = (c: Convo) => {
    const active = open?.id === c.id
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => setOpenId(c.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left cursor-pointer ${active && desktop ? 'bg-[#1746b8] text-white' : 'hover:bg-slate-100'}`}
      >
        {c.kind === 'direct' ? (
          <span className={`w-7 h-7 rounded-lg text-[10px] font-extrabold flex items-center justify-center shrink-0 ${active && desktop ? 'bg-white/20' : 'bg-blue-50 text-[#1746b8]'}`}>
            {titleOf(c).split(' ').map((s) => s[0]).join('').slice(0, 2)}
          </span>
        ) : (
          <Hash className={`w-4 h-4 shrink-0 ${active && desktop ? 'text-white' : 'text-slate-400'}`} />
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-sm truncate ${c.unread ? 'font-black' : 'font-bold'}`}>{titleOf(c)}</div>
          {!desktop && <div className="text-xs text-slate-500 truncate">{c.last_body ? `${c.last_sender === profile.id ? 'You' : (names.get(c.last_sender || '') ?? '').split(' ')[0]}: ${c.last_body}` : 'No messages yet'}</div>}
        </div>
        {c.unread > 0 ? (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">{c.unread}</span>
        ) : (
          !desktop && c.last_body && <span className="text-[10px] font-bold text-slate-400 shrink-0">{timeAgo(c.last_message_at)}</span>
        )}
      </button>
    )
  }

  const sectionHead = (label: string, onAdd?: () => void) => (
    <div className="flex items-center justify-between px-3 pt-3 pb-1">
      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{label}</span>
      {onAdd && (
        <button type="button" onClick={onAdd} aria-label={`Add ${label.toLowerCase()}`} className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )

  const membersBtn =
    coachTools && open?.kind === 'group' ? (
      <button type="button" onClick={() => setSheet('members')} className="px-3 h-9 rounded-xl bg-white/15 border border-white/20 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer">
        <Users className="w-4 h-4" /> {memberCount(open)}
      </button>
    ) : null

  return (
    <div className="space-y-4">
      <div className="lg:hidden">
        <PageTitle title="Messages" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#1746b8] lg:max-w-sm">
        {(['chats', 'announcements'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`py-2.5 rounded-xl text-xs font-extrabold capitalize cursor-pointer ${tab === t ? 'bg-white text-[#1746b8] shadow-sm' : 'text-blue-100'}`}>
            {t === 'announcements' ? (
              <span className="inline-flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5" /> Announcements
              </span>
            ) : (
              'Chats'
            )}
          </button>
        ))}
      </div>

      {tab === 'announcements' ? (
        <>
          {isCoach && <AnnouncementComposer onSent={() => setVersion((v) => v + 1)} />}
          <AnnouncementsFeed limit={30} refreshKey={version} />
        </>
      ) : (
        <div className="lg:grid lg:grid-cols-[290px_1fr] lg:gap-4 lg:h-[calc(100vh-190px)]">
          <aside className="bg-white rounded-3xl border border-slate-200 p-2 lg:overflow-y-auto">
            <div className="relative p-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Jump to…" className="w-full pl-8 pr-2 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm" />
            </div>
            {convos === null ? (
              <div className="h-40 m-2 rounded-2xl bg-slate-100 animate-pulse" />
            ) : (
              <>
                {sectionHead('Channels', coachTools ? () => setSheet('channel') : undefined)}
                <div className="space-y-0.5">{channels.map(row)}</div>
                {channels.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No channels yet.</p>}
                {sectionHead('Direct Messages', viewAs.active ? undefined : () => setSheet('dm'))}
                <div className="space-y-0.5">{dms.map(row)}</div>
                {dms.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">{isCoach ? 'No DMs yet.' : 'Tap + to message a coach.'}</p>}
              </>
            )}
          </aside>

          {desktop && (
            <div className="min-h-0">
              {open ? (
                <ChatThread
                  key={open.id}
                  embedded
                  conversationId={open.id}
                  title={open.kind === 'direct' ? titleOf(open) : `# ${titleOf(open)}`}
                  subtitle={subtitleOf(open)}
                  myId={profile.id}
                  isCoach={isCoach}
                  readOnly={viewAs.active}
                  direct={open.kind === 'direct'}
                  members={open.kind === 'direct' ? [open.member_a, open.member_b].filter((x): x is string => !!x) : undefined}
                  names={names}
                  headerRight={membersBtn}
                  onClose={() => setOpenId(null)}
                />
              ) : (
                <div className="h-full rounded-3xl border border-dashed border-slate-300 flex items-center justify-center text-sm font-semibold text-slate-400">Pick a channel or DM</div>
              )}
            </div>
          )}
        </div>
      )}

      {!desktop && open && tab === 'chats' && (
        <ChatThread
          conversationId={open.id}
          title={open.kind === 'direct' ? titleOf(open) : `# ${titleOf(open)}`}
          subtitle={subtitleOf(open)}
          myId={profile.id}
          isCoach={isCoach}
          readOnly={viewAs.active}
          direct={open.kind === 'direct'}
          members={open.kind === 'direct' ? [open.member_a, open.member_b].filter((x): x is string => !!x) : undefined}
          names={names}
          headerRight={membersBtn}
          onClose={() => {
            setOpenId(null)
            refresh()
          }}
        />
      )}

      {sheet === 'dm' && (
        <PeoplePicker
          title={isCoach ? 'New Direct Message' : 'Message a Coach'}
          people={people.filter((p) => p.is_active && p.has_login !== false && p.id !== profile.id && (isCoach ? true : p.role === 'coach'))}
          onClose={() => setSheet(null)}
          onPick={startDirect}
          error={error}
        />
      )}
      {sheet === 'channel' && (
        <ChannelSheet
          people={people.filter((p) => p.is_active)}
          groups={groups}
          members={members}
          onClose={() => setSheet(null)}
          onCreated={async (gid) => {
            setSheet(null)
            const { data } = await createClient().from('conversations').select('id').eq('group_id', gid).maybeSingle()
            if (data) setOpenId(data.id)
            refresh()
          }}
        />
      )}
      {sheet === 'members' && open?.kind === 'group' && open.group_id && (
        <ChannelSheet
          group={groupById.get(open.group_id)}
          people={people.filter((p) => p.is_active)}
          groups={groups}
          members={members}
          onClose={() => {
            setSheet(null)
            refresh()
          }}
          onCreated={() => {
            setSheet(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0b1f55]/40 flex items-end sm:items-center justify-center lg:left-[220px]" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between shrink-0">
          <div className="text-base font-extrabold text-slate-900">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-xl bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function PeoplePicker({ title, people, onClose, onPick, error }: { title: string; people: Person[]; onClose: () => void; onPick: (id: string) => void; error: string | null }) {
  const [q, setQ] = useState('')
  const list = people.filter((p) => !q || p.full_name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a.role === b.role ? a.full_name.localeCompare(b.full_name) : a.role === 'coach' ? -1 : 1))
  return (
    <Overlay title={title} onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={inputClass} />
      <div className="overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-200 min-h-0">
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} className="w-full text-left px-3 py-2.5 text-sm font-bold text-slate-800 cursor-pointer hover:bg-slate-50">
            {p.full_name} <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{p.role}</span>
          </button>
        ))}
        {list.length === 0 && <p className="px-3 py-2.5 text-xs text-slate-500">No one with a login yet.</p>}
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Overlay>
  )
}

/** Create a channel, or (with `group`) edit an existing channel's members. Members are a roster group. */
function ChannelSheet({
  group,
  people,
  groups,
  members,
  onClose,
  onCreated,
}: {
  group?: Group
  people: Person[]
  groups: Group[]
  members: Member[]
  onClose: () => void
  onCreated: (groupId: number) => void
}) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(group ? members.filter((m) => m.group_id === group.id).map((m) => m.athlete_id) : []))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addGroup = (gid: number) => setPicked((s) => new Set([...s, ...members.filter((m) => m.group_id === gid).map((m) => m.athlete_id)]))
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const save = async () => {
    const supabase = createClient()
    setBusy(true)
    setError(null)
    let gid = group?.id
    if (!gid) {
      if (!name.trim()) {
        setBusy(false)
        return setError('Name the channel.')
      }
      const { data, error: e } = await supabase.from('team_groups').insert({ name: name.trim(), category: 'Custom', has_chat: true, sort_order: 60 + groups.length }).select('id').single()
      if (e || !data) {
        setBusy(false)
        return setError(e?.message.includes('duplicate') ? 'A group or channel with that name already exists.' : e?.message || 'Could not create')
      }
      gid = data.id as number
    }
    const before = new Set(members.filter((m) => m.group_id === gid).map((m) => m.athlete_id))
    const add = [...picked].filter((id) => !before.has(id))
    const remove = [...before].filter((id) => !picked.has(id))
    if (add.length) {
      const { error: e } = await supabase.from('group_members').insert(add.map((athlete_id) => ({ group_id: gid, athlete_id })))
      if (e) setError(e.message)
    }
    if (remove.length) {
      const { error: e } = await supabase.from('group_members').delete().eq('group_id', gid).in('athlete_id', remove)
      if (e) setError(e.message)
    }
    setBusy(false)
    onCreated(gid!)
  }

  const list = people
    .filter((p) => !q || p.full_name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.role === b.role ? (a.grad_year || 0) - (b.grad_year || 0) || a.full_name.localeCompare(b.full_name) : a.role === 'coach' ? -1 : 1))

  return (
    <Overlay title={group ? `# ${group.name} members` : 'New Channel'} onClose={onClose}>
      {!group && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Channel name (e.g. Bullpen crew)" className={inputClass} />}
      <div className="shrink-0">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Add Everyone From</div>
        <div className="flex flex-wrap gap-1.5">
          {groups
            .filter((g) => g.id !== group?.id)
            .filter((g) => !g.name.startsWith('Demo') && g.category !== 'Workout' && g.category !== 'Focus')
            .map((g) => (
              <button key={g.id} type="button" onClick={() => addGroup(g.id)} className="px-2.5 py-1 rounded-full bg-blue-50 text-[#1746b8] text-xs font-extrabold cursor-pointer">
                + {g.name}
              </button>
            ))}
        </div>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" className={inputClass} />
      <div className="overflow-y-auto rounded-2xl border border-slate-200 p-1 min-h-0 flex-1">
        {list.map((p) => (
          <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-[#1746b8]" />
            <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{p.full_name}</span>
            {p.has_login === false && <span className="text-[9px] font-extrabold text-slate-400 uppercase">No Login</span>}
            <span className="text-[10px] font-bold text-slate-400 uppercase">{p.role === 'coach' ? 'coach' : p.grad_year ? `’${String(p.grad_year).slice(2)}` : ''}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-bold text-slate-500">{picked.size} selected</span>
        {group && (
          <Link href="/office?tab=groups" className="text-xs font-extrabold text-[#1746b8]">
            Manage in Roster
          </Link>
        )}
        <button type="button" onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-60 cursor-pointer">
          {busy ? 'Saving…' : group ? 'Save Members' : 'Create Channel'}
        </button>
      </div>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </Overlay>
  )
}
