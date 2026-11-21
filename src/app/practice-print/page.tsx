'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { blockTimes, formatClock, normalizePlan, parseClock, type PracticePlan } from '@/lib/practicePlan'
import { prettyDate } from '@/lib/training'

type Sheet = { title: string; date: string | null; start: string | null; location: string | null; plan: PracticePlan }

/** One-page printable practice plan. /practice-print?event=ID or ?template=ID. Print → Save as PDF. */
export default function PracticePrintPage() {
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const eventId = q.get('event')
    const templateId = q.get('template')
    const supabase = createClient()
    const load = async () => {
      if (eventId) {
        const { data } = await supabase.from('team_schedule').select('title, event_date, start_time, location, plan').eq('id', Number(eventId)).maybeSingle()
        const plan = normalizePlan(data?.plan)
        if (!data || !plan) return setError('No practice plan found. Make sure you are signed in.')
        setSheet({ title: data.title, date: data.event_date, start: data.start_time, location: data.location, plan })
      } else if (templateId) {
        const { data } = await supabase.from('practice_templates').select('name, plan').eq('id', Number(templateId)).maybeSingle()
        const plan = normalizePlan(data?.plan)
        if (!data || !plan) return setError('Template not found.')
        setSheet({ title: data.name, date: null, start: null, location: null, plan })
      } else setError('Nothing to print.')
    }
    load()
  }, [])

  if (error) return <p className="p-8 text-sm font-bold text-slate-600">{error}</p>
  if (!sheet) return <p className="p-8 text-sm font-bold text-slate-400">Loading…</p>

  const start = parseClock(sheet.start)
  const { times, total } = blockTimes(sheet.plan)
  const end = start != null ? formatClock(start + total) : null
  const dense = sheet.plan.blocks.length > 12

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white py-6 print:py-0">
      <style>{`@page { size: letter; margin: 0.4in; } @media print { html, body { background: #fff; } }`}</style>
      <div className="max-w-[8.5in] mx-auto mb-4 px-4 flex gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="flex-1 py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold cursor-pointer">
          Print / Save as PDF
        </button>
        <button type="button" onClick={() => history.back()} className="px-5 py-3 rounded-2xl bg-white text-slate-700 text-sm font-extrabold border border-slate-300 cursor-pointer">
          Back
        </button>
      </div>

      <article className={`bg-white mx-auto w-full max-w-[8.5in] shadow-xl print:shadow-none p-[0.5in] print:p-0 text-slate-900 ${dense ? 'text-[10px]' : 'text-[11.5px]'}`}>
        <header className="flex items-center gap-3 border-b-4 border-[#1746b8] pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-lg" />
          <div className="flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#1746b8]">Generals Baseball · Practice Plan</div>
            <h1 className="text-xl font-black leading-tight">{sheet.title}</h1>
          </div>
          <div className="text-right text-[11px] font-bold leading-snug">
            {sheet.date && <div>{prettyDate(sheet.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>}
            {start != null && <div>{formatClock(start)} – {end}</div>}
            {sheet.location && <div className="text-slate-500">{sheet.location}</div>}
            <div className="text-slate-500">{total} minutes</div>
          </div>
        </header>

        {sheet.plan.focus && (
          <p className="mt-3 px-3 py-2 rounded-md bg-blue-50 border border-blue-100"><span className="font-extrabold text-[#1746b8]">Focus: </span>{sheet.plan.focus}</p>
        )}

        <table className="w-full mt-3 border-collapse">
          <thead>
            <tr className="bg-[#1746b8] text-white text-left text-[10px] uppercase tracking-wider">
              <th className="py-1.5 px-2 w-[64px]">Time</th>
              <th className="py-1.5 px-2 w-[40px]">Min</th>
              <th className="py-1.5 px-2">Block</th>
              <th className="py-1.5 px-2 w-[110px]">Who</th>
              <th className="py-1.5 px-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {sheet.plan.blocks.map((b, i) => (
              <tr key={i} className="border-b border-slate-200 align-top" style={{ breakInside: 'avoid' }}>
                <td className="py-1.5 px-2 font-extrabold text-[#1746b8] whitespace-nowrap">{start != null ? formatClock(start + times[i].start) : `+${times[i].start}`}</td>
                <td className="py-1.5 px-2 font-bold">{b.minutes}</td>
                <td className="py-1.5 px-2 font-extrabold">{b.with_previous ? '↳ ' : ''}{b.title}</td>
                <td className="py-1.5 px-2 font-semibold text-slate-600">{b.who}</td>
                <td className="py-1.5 px-2 text-slate-700">{b.details}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Equipment</div>
            <p className="min-h-[2.5em]">{sheet.plan.equipment || '—'}</p>
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">Coach notes</div>
            <div className="space-y-4 pt-2">
              <div className="border-b border-slate-300" />
              <div className="border-b border-slate-300" />
              <div className="border-b border-slate-300" />
            </div>
          </div>
        </div>
        <p className="mt-4 text-[9px] text-slate-400 text-center">app.generalsbaseball.org</p>
      </article>
    </div>
  )
}
