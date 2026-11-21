'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageCirclePlus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { PageTitle } from '@/components/ui'
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
type Person = { id: string; full_name: string; role: string; is_active: boolean }

export default function MessagesPage() {
  const { profile, isCoach, viewAs } = useProfile()
  const [tab, setTab] = useState<'chats' | 'announcements'>('chats')
  const [convos, setConvos] = useState<Convo[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      viewAs.active ? supabase.rpc('conversations_for', { p_user: profile.id }) : supabase.rpc('my_conversations'),
      supabase.from('profiles').select('id, full_name, role, is_active'),
      supabase.from('team_groups').select('*').order('sort_order'),
    ]).then(([c, p, g]) => {
      if (cancelled) return
      setConvos(((c.data as Convo[]) || []).map((x) => ({ ...x, unread: Number(x.unread) })))
      setPeople((p.data as Person[]) || [])
      setGroups((g.data as Group[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [reload, viewAs.active, profile.id])

  const names = new Map(people.map((p) => [p.id, p.full_name]))
  const titleOf = (c: Convo) => {
    if (c.kind === 'direct') {
      const other = c.member_a === profile.id ? c.member_b : c.member_b === profile.id ? c.member_a : null
      if (other) return names.get(other) ?? 'Direct message'
      // A coach viewing a DM between two other people
      return `${names.get(c.member_a || '') ?? '?'} ↔ ${names.get(c.member_b || '') ?? '?'}`
    }
    return c.title || (c.kind === 'team' ? 'Team chat' : 'Group chat')
  }
  const subtitleOf = (c: Convo) => (c.kind === 'direct' ? 'Direct message · coaches can see all DMs' : c.kind === 'team' ? 'Whole team' : 'Group chat')

  const startDirect = async (otherId: string) => {
    setError(null)
    const { data, error: e } = await createClient().rpc('get_or_create_direct', { p_other: otherId })
    if (e) return setError(e.message)
    setPicking(false)
    setOpenId(Number(data))
    refresh()
  }

  const startGroupChat = async (g: Group | null) => {
    const supabase = createClient()
    const existing = (convos || []).find((c) => (g ? c.kind === 'group' && c.group_id === g.id : c.kind === 'team'))
    if (existing) {
      setPicking(false)
      setOpenId(existing.id)
      return
    }
    const { data, error: e } = await supabase
      .from('conversations')
      .insert(g ? { kind: 'group', title: g.name, group_id: g.id, created_by: profile.id } : { kind: 'team', title: 'Team chat', created_by: profile.id })
      .select('id')
      .single()
    if (e || !data) return setError(e?.message || 'Could not start chat')
    setPicking(false)
    setOpenId(data.id)
    refresh()
  }

  const open = (convos || []).find((c) => c.id === openId)
  const candidates = people.filter((p) => p.is_active && p.id !== profile.id && (isCoach ? true : p.role === 'coach'))

  return (
    <div className="space-y-4">
      <PageTitle title="Messages" />
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#1746b8]">
        {(['chats', 'announcements'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`py-2.5 rounded-xl text-xs font-extrabold capitalize cursor-pointer ${tab === t ? 'bg-white text-[#1746b8] shadow-sm' : 'text-blue-100'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'announcements' ? (
        <>
          {isCoach && <AnnouncementComposer onSent={() => setVersion((v) => v + 1)} />}
          <AnnouncementsFeed limit={30} refreshKey={version} />
        </>
      ) : (
        <>
          {!viewAs.active && <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-sm font-extrabold text-[#1746b8] flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCirclePlus className="w-4 h-4" /> {isCoach ? 'New message' : 'Message a coach'}
          </button>}

          {picking && (
            <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
              {isCoach && (
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Group chats</div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => startGroupChat(null)} className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-blue-50 text-[#1746b8] cursor-pointer">Whole team</button>
                    {groups.map((g) => (
                      <button key={g.id} type="button" onClick={() => startGroupChat(g)} className="px-3 py-1.5 rounded-full text-xs font-extrabold bg-blue-50 text-[#1746b8] cursor-pointer">
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">{isCoach ? 'Direct message' : 'Coaches'}</div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {candidates.map((p) => (
                    <button key={p.id} type="button" onClick={() => startDirect(p.id)} className="w-full text-left px-3 py-2.5 text-sm font-bold text-slate-800 cursor-pointer">
                      {p.full_name} <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{p.role}</span>
                    </button>
                  ))}
                  {candidates.length === 0 && <p className="px-3 py-2.5 text-xs text-slate-500">No one to message yet.</p>}
                </div>
              </div>
              {error && <p className="text-xs font-bold text-red-600">{error}</p>}
            </section>
          )}

          {convos === null ? (
            <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
          ) : convos.length === 0 ? (
            <p className="text-center text-xs font-semibold text-slate-500 py-8">No conversations yet.</p>
          ) : (
            <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {convos.map((c) => (
                <button key={c.id} type="button" onClick={() => setOpenId(c.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-sm font-extrabold ${c.kind === 'direct' ? 'bg-blue-50 text-[#1746b8]' : 'bg-amber-100 text-amber-700'}`}>
                    {c.kind === 'direct' ? titleOf(c).split(' ').map((s) => s[0]).join('').slice(0, 2) : <Users className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${c.unread ? 'font-black text-slate-900' : 'font-extrabold text-slate-800'}`}>{titleOf(c)}</span>
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">{c.last_body ? timeAgo(c.last_message_at) : ''}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500 truncate">
                        {c.last_body ? `${c.last_sender === profile.id ? 'You' : (names.get(c.last_sender || '') ?? '').split(' ')[0]}: ${c.last_body}` : 'No messages yet'}
                      </span>
                      {c.unread > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">{c.unread}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </section>
          )}
        </>
      )}

      {open && (
        <ChatThread
          conversationId={open.id}
          title={titleOf(open)}
          subtitle={subtitleOf(open)}
          myId={profile.id}
          isCoach={isCoach}
          readOnly={viewAs.active}
          direct={open.kind === 'direct'}
          members={open.kind === 'direct' ? [open.member_a, open.member_b].filter((x): x is string => !!x) : undefined}
          names={names}
          onClose={() => {
            setOpenId(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
