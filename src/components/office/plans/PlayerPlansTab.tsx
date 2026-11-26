'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Send, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import { PROFILE_FIELDS, type Group, type Profile } from '@/lib/training'
import { focusKind, snapshot, suggest, type PlayerFocus } from '@/lib/focus'
import KindBadge from '@/components/plan/KindBadge'
import { useFocusData } from '@/components/plan/useFocusData'
import { Avatar, NoLoginBadge, TagChip } from '@/components/office/roster/shared'
import FocusPlanSheet from './FocusPlanSheet'
import { notifyPlayers } from '@/lib/notify'

type Status = 'all' | 'none' | 'draft' | 'live'
const POS: Record<string, string> = { pitcher: 'PO', two_way: '2-Way', hitter: 'Hitter', catcher: 'Catcher', infield: 'Infield', outfield: 'Outfield' }

/** Coach Office → Player plans: every player's focus areas, with suggestions to approve and publish. */
export default function PlayerPlansTab({ initialPlayer = null }: { initialPlayer?: string | null }) {
  const { lines, ea, training, drills, ready } = useFocusData()
  const [players, setPlayers] = useState<Profile[]>([])
  const [focus, setFocus] = useState<PlayerFocus[]>([])
  const [teams, setTeams] = useState<Group[]>([])
  const [members, setMembers] = useState<{ group_id: number; athlete_id: string }[]>([])
  const [team, setTeam] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(initialPlayer)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select(PROFILE_FIELDS).eq('role', 'player').eq('is_active', true).eq('is_demo', false).order('grad_year').order('full_name'),
      supabase.from('player_focus').select('*').order('sort_order'),
      supabase.from('team_groups').select('*').eq('category', 'Team').order('sort_order'),
      supabase.from('group_members').select('group_id, athlete_id'),
    ]).then(([p, f, g, m]) => {
      if (cancelled) return
      setPlayers((p.data as Profile[]) || [])
      setFocus((f.data as PlayerFocus[]) || [])
      setTeams((g.data as Group[]) || [])
      setMembers(m.data || [])
    })
    return () => {
      cancelled = true
    }
  }, [version])

  const byPlayer = useMemo(() => {
    const m = new Map<string, PlayerFocus[]>()
    focus.forEach((f) => m.set(f.athlete_id, [...(m.get(f.athlete_id) || []), f]))
    return m
  }, [focus])
  const teamOf = (id: string) => teams.filter((t) => members.some((m) => m.group_id === t.id && m.athlete_id === id))
  const stateOf = (id: string): Exclude<Status, 'all'> => {
    const list = byPlayer.get(id) || []
    if (!list.length) return 'none'
    return list.some((f) => f.status === 'draft') ? 'draft' : 'live'
  }

  const list = players.filter((p) => {
    if (team && !members.some((m) => m.group_id === team && m.athlete_id === p.id)) return false
    if (status !== 'all' && stateOf(p.id) !== status) return false
    return !query || p.full_name.toLowerCase().includes(query.toLowerCase())
  })
  const noPlan = list.filter((p) => stateOf(p.id) === 'none')
  const draftCount = focus.filter((f) => f.status === 'draft' && list.some((p) => p.id === f.athlete_id)).length

  const suggestAll = async () => {
    if (!ready || !lines || !training) return
    if (!window.confirm(`Create suggested draft plans for ${noPlan.length} players? Nothing is shown to players until you publish.`)) return
    setBusy('Suggesting…')
    const rows = noPlan.flatMap((p) =>
      suggest(p.position_group, snapshot(p.id, p.position_group, lines, ea, training), drills).map((s, i) => ({
        athlete_id: p.id,
        sort_order: i,
        title: s.title,
        why: s.why,
        metric_source: s.metric_source,
        metric_key: s.metric_key,
        metric_label: s.metric_label,
        lower_is_better: s.lower_is_better,
        baseline: s.baseline,
        goal: s.goal,
        drills: s.drills,
        status: 'draft',
      }))
    )
    const { error } = rows.length ? await createClient().from('player_focus').insert(rows) : { error: null }
    setBusy(null)
    setNotice(error ? error.message : `Drafted ${rows.length} focus areas for ${noPlan.length} players. Review, then publish.`)
    setVersion((v) => v + 1)
  }

  const publishAll = async () => {
    const ids = focus.filter((f) => f.status === 'draft' && list.some((p) => p.id === f.athlete_id)).map((f) => f.id)
    if (!ids.length || !window.confirm(`Publish ${ids.length} draft focus areas? Players will see them on their Training tab.`)) return
    setBusy('Publishing…')
    const now = new Date().toISOString()
    const { error } = await createClient().from('player_focus').update({ status: 'published', published_at: now, updated_at: now }).in('id', ids)
    if (!error) {
      const who = [...new Set(focus.filter((f) => ids.includes(f.id)).map((f) => f.athlete_id))]
      await notifyPlayers({ title: 'Your plan is ready', body: 'Focus areas and drills are in Training', url: '/training', recipientIds: who, kind: 'plan' })
    }
    setBusy(null)
    setNotice(error ? error.message : `Published ${ids.length} focus areas.`)
    setVersion((v) => v + 1)
  }

  const open = players.find((p) => p.id === openId)
  const counts = { none: players.filter((p) => stateOf(p.id) === 'none').length, draft: players.filter((p) => stateOf(p.id) === 'draft').length, live: players.filter((p) => stateOf(p.id) === 'live').length }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-2.5 text-[11px] font-semibold text-[#113694]">
        Each player gets 2–3 focus areas with a goal and drills. The app suggests them from game stats and training numbers; you edit and publish. Players see them at the top of Training.
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" className={`${inputClass} pl-9`} />
        </div>
        <button type="button" onClick={suggestAll} disabled={!ready || !noPlan.length || !!busy} className="px-4 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer">
          <Sparkles className="w-4 h-4" /> {ready ? `Suggest plans (${noPlan.length})` : 'Loading stats…'}
        </button>
        <button type="button" onClick={publishAll} disabled={!draftCount || !!busy} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer">
          <Send className="w-4 h-4" /> Publish drafts ({draftCount})
        </button>
      </div>
      {(busy || notice) && <p className="text-xs font-extrabold text-[#1746b8]">{busy || notice}</p>}

      <div className="flex flex-wrap gap-1.5 items-center">
        {teams.map((t) => (
          <TagChip key={t.id} group={t} small active={team === t.id} onClick={() => setTeam(team === t.id ? null : t.id)} />
        ))}
        <span className="w-px h-4 bg-slate-200 mx-1" />
        {(
          [
            ['all', `All ${players.length}`],
            ['none', `No plan ${counts.none}`],
            ['draft', `Drafts ${counts.draft}`],
            ['live', `Live ${counts.live}`],
          ] as [Status, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold cursor-pointer ${status === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden lg:grid lg:grid-cols-2 lg:divide-y-0 lg:gap-px lg:bg-slate-100">
        {list.map((p) => {
          const st = stateOf(p.id)
          const mine = byPlayer.get(p.id) || []
          return (
            <button key={p.id} type="button" onClick={() => setOpenId(p.id)} className="w-full flex items-start gap-3 px-4 py-3 text-left bg-white cursor-pointer hover:bg-slate-50">
              <Avatar person={p} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                  <span className="truncate">{p.full_name}</span>
                  {p.has_login === false && <NoLoginBadge />}
                </div>
                <div className="text-[11px] font-semibold text-slate-500">
                  {[p.grad_year ? `’${String(p.grad_year).slice(2)}` : null, POS[p.position_group || ''], ...teamOf(p.id).map((t) => t.name)].filter(Boolean).join(' · ')}
                </div>
                {mine.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    {mine
                      .filter((f) => f.status !== 'done')
                      .map((f) => (
                        <span key={f.id} className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                          <KindBadge kind={focusKind(f)} />
                          {f.title}
                        </span>
                      ))}
                  </div>
                )}
              </div>
              <span
                className={`text-[10px] font-extrabold px-2 py-1 rounded-lg shrink-0 ${st === 'none' ? 'bg-slate-100 text-slate-500' : st === 'draft' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}
              >
                {st === 'none' ? 'No Plan' : st === 'draft' ? 'Draft' : 'Live'}
              </span>
            </button>
          )
        })}
        {list.length === 0 && <p className="px-4 py-6 text-center text-xs font-semibold text-slate-500 bg-white">No players match.</p>}
      </div>

      {open && ready && lines && training && (
        <FocusPlanSheet
          player={open}
          existing={byPlayer.get(open.id) || []}
          lines={lines}
          ea={ea}
          training={training}
          drills={drills}
          onClose={() => setOpenId(null)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}
