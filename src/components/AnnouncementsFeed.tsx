'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Megaphone, Pin, ExternalLink } from 'lucide-react'

type Announcement = {
  id: number
  title: string
  body: string | null
  link_url: string | null
  is_pinned: boolean
  created_at: string
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function AnnouncementsFeed({ limit = 5, refreshKey = 0, topSlot }: { limit?: number; refreshKey?: number; topSlot?: React.ReactNode }) {
  const [items, setItems] = useState<Announcement[] | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    supabase
      .from('announcements')
      .select('id, title, body, link_url, is_pinned, created_at')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (!cancelled) setItems((data as Announcement[]) || [])
      })
    return () => {
      cancelled = true
    }
  }, [limit, refreshKey])

  if (items === null) return null

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-[#1746b8]" />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Announcements</span>
      </div>
      {topSlot}
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 font-medium">No announcements yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  {a.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                  {a.title}
                </h3>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{timeAgo(a.created_at)}</span>
              </div>
              {a.body && <p className="text-xs text-slate-600 font-medium whitespace-pre-line">{a.body}</p>}
              {a.link_url && (
                <a href={a.link_url} className="inline-flex items-center gap-1 text-xs font-bold text-[#1746b8]">
                  Open link <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
