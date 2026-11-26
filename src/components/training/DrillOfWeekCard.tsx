'use client'

import { Star } from 'lucide-react'
import { DrillHowTo } from '@/components/library/VideoEmbed'
import type { WeekDrill } from './useDrillsOfWeek'

/** Compact Drill of the Week card with an in-place how-to video. */
export default function DrillOfWeekCard({ drill, label = 'Drill of the Week' }: { drill: WeekDrill; label?: string }) {
  if (!drill.exercise) return null
  return (
    <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-violet-700">
        <Star className="w-3 h-3 fill-violet-500 text-violet-500" /> {label}
      </div>
      <div className="text-sm font-extrabold text-slate-900 mt-0.5">{drill.exercise.name}</div>
      {drill.note && <p className="text-xs font-medium text-slate-600 mt-0.5">{drill.note}</p>}
      <DrillHowTo url={drill.exercise.video_url} notes={drill.exercise.notes} name={drill.exercise.name} />
    </div>
  )
}
