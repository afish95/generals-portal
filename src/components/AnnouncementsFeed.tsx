'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { Megaphone, Pin, ExternalLink } from 'lucide-react'
import { SwipeRow, useDismissals } from '@/components/Dismissible'

type Announcement = {
  id: number
  title: string
  body: string | null
  link_url: string | null
  is_pinned: boolean
  created_at: string
  kind?: string
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Announcements. On Home (`dismissible`) each one can be swiped away or marked read and then stays out of Home;
 * the full history always lives in Messages → Announcements.
 */
export default function AnnouncementsFeed({ limit = 5, refreshKey = 0, topSlot, dismissible = false }: { limit?: number; refreshKey?: number; topSlot?: React.ReactNode; dismissible?: boolean }) {
  const [items, setItems] = useState<Announcement[] | null>(null)
  const { isCoach, profile, viewAs } = useProfile()
  const { dismissed, dismiss } = useDismissals('announcement', dismissible ? profile.id : null)
  const asCoach = isCoach && !viewAs.active

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let q = supabase.from('announcements').select('id, title, body, link_url, is_pinned, created_at, kind')
    if (!asCoach) q = q.in('audience', ['everyone', 'players']).or(`recipient_ids.is.null,recipient_ids.cs.{${profile.id}}`)
    else if (dismissible) q = q.is('recipient_ids', null)
    q.order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(dismissible ? 40 : limit)
      .then(({ data }) => {
        if (!cancelled) setItems((data as Announcement[]) || [])
      })
    return () => {
      cancelled = true
    }
  }, [limit, refreshKey, asCoach, profile.id, dismissible])

  if (items === null || (dismissible && dismissed === null)) return null
  const shown = dismissible ? items.filter((a) => !dismissed!.has(a.id)).slice(0, limit) : items
  const hiddenNew = dismissible ? items.filter((a) => !dismissed!.has(a.id)).length - shown.length : 0
  if (dismissible && shown.length === 0) return null

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-[#1746b8]" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex-1">Announcements</span>
        {dismissible && shown.length > 1 && (
          <button type="button" onClick={() => dismiss(shown.map((a) => a.id))} className="text-[11px] font-extrabold text-[#1746b8] cursor-pointer">
            Clear all
          </button>
        )}
        {dismissible && (
          <Link href="/messages?tab=announcements" className="text-[11px] font-extrabold text-slate-400">
            All{hiddenNew > 0 ? ` (${hiddenNew + shown.length})` : ''}
          </Link>
        )}
      </div>
      {topSlot}
      {shown.length === 0 ? (
        <p className="text-xs text-slate-500 font-medium">No announcements yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((a) => {
            const body = (
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    {a.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                    {a.title}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">{timeAgo(a.created_at)}</span>
                </div>
                {a.body && <p className={`text-xs text-slate-500 font-medium whitespace-pre-line ${dismissible ? 'line-clamp-2' : ''}`}>{a.body}</p>}
                {a.link_url && a.link_url !== '/' && (
                  <a href={a.link_url} className="inline-flex items-center gap-1 text-xs font-bold text-[#1746b8]">
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )
            return (
              <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                {dismissible ? <SwipeRow onDismiss={() => dismiss([a.id])}>{body}</SwipeRow> : body}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
