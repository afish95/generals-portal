'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Play, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { timeAgo } from '@/lib/training'

type Script = { id: number; title: string; category: string; pitch_count: number; description: string | null }
type Session = { script_id: number | null; total_pitches: number; strikes_count: number; intended_hits_count: number; created_at: string }
type Resource = { id: number; title: string; category: string; description: string | null; external_url: string | null; embed_url: string | null }

export default function TrainingTools({ athleteId, refreshKey = 0, onStart }: { athleteId: string; refreshKey?: number; onStart: (scriptId: number, title: string) => void }) {
  const [scripts, setScripts] = useState<Script[] | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [resources, setResources] = useState<Resource[]>([])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    Promise.all([
      supabase.from('bullpen_scripts').select('id, title, category, pitch_count, description').eq('is_active', true).order('sort_order'),
      supabase.from('bullpen_sessions').select('script_id, total_pitches, strikes_count, intended_hits_count, created_at').eq('player_id', athleteId).order('created_at', { ascending: false }).limit(500),
      supabase.from('training_tools').select('id, title, category, description, external_url, embed_url').eq('is_active', true).order('sort_order'),
    ]).then(([s, b, r]) => {
      if (cancelled) return
      setScripts((s.data as Script[]) || [])
      setSessions((b.data as Session[]) || [])
      setResources((r.data as Resource[]) || [])
    })
    return () => {
      cancelled = true
    }
  }, [athleteId, refreshKey])

  if (!scripts) return <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Training tools</div>
      <p className="text-xs text-slate-500 -mt-1">Start a bullpen game or command drill on your own. Your coach can also add these to your day plan.</p>
      <ul className="space-y-2.5">
        {scripts.map((t) => {
          const mine = sessions.filter((s) => s.script_id === t.id)
          const bestCommand = mine.reduce((m, s) => Math.max(m, s.total_pitches ? Math.round((100 * s.intended_hits_count) / s.total_pitches) : 0), 0)
          const bestStrike = mine.reduce((m, s) => Math.max(m, s.total_pitches ? Math.round((100 * s.strikes_count) / s.total_pitches) : 0), 0)
          return (
            <li key={t.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3.5">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">{t.category} · {t.pitch_count} pitches</div>
                  <div className="text-sm font-extrabold text-slate-900">{t.title}</div>
                  {t.description && <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{t.description}</p>}
                  <div className="text-[10px] font-bold text-slate-500 mt-1.5">
                    {mine.length
                      ? `${mine.length} session${mine.length === 1 ? '' : 's'} · best ${bestStrike}% strikes · ${bestCommand}% hit zone · last ${timeAgo(mine[0].created_at)}`
                      : 'Not tried yet'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onStart(t.id, t.title)}
                  className="shrink-0 px-3 py-2 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" /> Start
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {resources.length > 0 && (
        <>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pt-1">Videos &amp; resources</div>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {resources.map((r) => {
              const href = r.external_url || r.embed_url
              return (
                <li key={r.id}>
                  <a href={href || '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">{r.title}</div>
                      <div className="text-[10px] font-semibold text-slate-500 truncate">{r.category}</div>
                    </div>
                    {href && <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />}
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
