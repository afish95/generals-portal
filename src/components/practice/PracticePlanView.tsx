'use client'

import { blockTimes, formatClock, parseClock, type PracticePlan } from '@/lib/practicePlan'

/** Compact practice outline: clock time, block, who, details. */
export default function PracticePlanView({ plan, startTime }: { plan: PracticePlan; startTime: string | null }) {
  const start = parseClock(startTime)
  const { times, total } = blockTimes(plan)
  return (
    <div className="space-y-2">
      {(plan.focus || total > 0) && (
        <div className="flex items-start justify-between gap-2">
          {plan.focus ? <p className="text-xs font-bold text-slate-800">Focus: <span className="font-semibold text-slate-600">{plan.focus}</span></p> : <span />}
          <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap">{total} min</span>
        </div>
      )}
      <ol className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {plan.blocks.map((b, i) => (
          <li key={i} className={`flex gap-2.5 px-3 py-2 ${b.with_previous ? 'bg-slate-50/70' : ''}`}>
            <div className="w-11 shrink-0 text-right">
              <div className="text-[11px] font-extrabold text-indigo-700">{start != null ? formatClock(start + times[i].start) : `+${times[i].start}`}</div>
              <div className="text-[10px] font-semibold text-slate-400">{b.minutes}m</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-slate-900">
                {b.with_previous && <span className="text-indigo-600">↳ </span>}
                {b.title || 'Block'}
                {b.who && <span className="ml-1.5 text-[10px] font-bold text-slate-500">{b.who}</span>}
              </div>
              {b.details && <p className="text-[11px] text-slate-600 leading-snug">{b.details}</p>}
            </div>
          </li>
        ))}
      </ol>
      {plan.equipment && <p className="text-[11px] text-slate-500"><span className="font-bold">Equipment:</span> {plan.equipment}</p>}
    </div>
  )
}
