'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'

/** One-line reminder on the player Home of their top focus, linking to My plan on Training. */
export default function FocusLine({ athleteId }: { athleteId: string }) {
  const [title, setTitle] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    createClient()
      .from('player_focus')
      .select('title')
      .eq('athlete_id', athleteId)
      .eq('status', 'published')
      .order('sort_order')
      .then(({ data }) => {
        if (cancelled || !data?.length) return
        setTitle(data[0].title as string)
        setCount(data.length)
      })
    return () => {
      cancelled = true
    }
  }, [athleteId])
  if (!title) return null
  return (
    <Link href="/training" className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200 px-4 py-3 shadow-xs">
      <Target className="w-5 h-5 text-[#1746b8] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">My focus</div>
        <div className="text-sm font-extrabold text-slate-900 truncate">
          {title}
          {count > 1 && <span className="text-slate-400 font-bold"> +{count - 1} more</span>}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400" />
    </Link>
  )
}
