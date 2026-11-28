'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import BenchmarkReport, { useBenchmarkValues, type Kind } from '@/components/benchmark/BenchmarkReport'
import { LEVEL_LABEL, levelFor, type Level } from '@/lib/benchmarks'
import PlayerPhoto from '@/components/PlayerPhoto'

type Who = { id: string; full_name: string; grad_year: number | null; position_group: string | null }
const LEVELS: Level[] = ['hs_under', 'hs_upper', 'college']

/** One-page printable Benchmark Report. /benchmark-print?athlete=ID&kind=hitter|pitcher&vs=college */
export default function BenchmarkPrintPage() {
  const [who, setWho] = useState<Who | null>(null)
  const [kind, setKind] = useState<Kind>('hitter')
  const [vs, setVs] = useState<Level | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const id = q.get('athlete')
    const k = q.get('kind')
    const v = q.get('vs') as Level | null
    if (k === 'pitcher' || k === 'hitter') setKind(k)
    if (v && LEVELS.includes(v)) setVs(v)
    if (!id) return setError('Nothing to print.')
    createClient()
      .from('profiles')
      .select('id, full_name, grad_year, position_group')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => (data ? setWho(data as Who) : setError('Player not found. Make sure you are signed in.')))
  }, [])

  const data = useBenchmarkValues(who?.id || null)
  if (error) return <p className="p-8 text-sm font-bold text-slate-600">{error}</p>
  if (!who) return <p className="p-8 text-sm font-bold text-slate-400">Loading…</p>
  const mine = levelFor(who.grad_year)
  const compare = vs ?? mine
  const today = new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white py-6 print:py-0">
      <style>{`@page { size: letter; margin: 0.4in; } @media print { html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="max-w-[8.5in] mx-auto mb-4 px-4 flex gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="flex-1 py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold cursor-pointer">
          Print / Save as PDF
        </button>
        <button type="button" onClick={() => history.back()} className="px-5 py-3 rounded-2xl bg-white text-slate-700 text-sm font-extrabold border border-slate-300 cursor-pointer">
          Back
        </button>
      </div>
      <article className="bg-white mx-auto w-full max-w-[8.5in] shadow-xl print:shadow-none p-[0.5in] print:p-0 text-slate-900">
        <header className="flex items-center gap-3 border-b-4 border-[#1746b8] pb-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo-512.png?v=2" alt="" className="w-10 h-10 rounded-lg" />
          <PlayerPhoto id={who.id} name={who.full_name} size={64} />
          <div className="flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#1746b8]">Generals Baseball · {kind === 'hitter' ? 'Hitter' : 'Pitcher'} Benchmark Report</div>
            <h1 className="text-xl font-black leading-tight">{who.full_name}</h1>
          </div>
          <div className="text-right text-[11px] font-bold leading-snug">
            {who.grad_year && <div>Class of {who.grad_year}</div>}
            <div>
              {LEVEL_LABEL[mine]}
              {compare !== mine ? ` vs ${LEVEL_LABEL[compare]}` : ''}
            </div>
            <div className="text-slate-500">{today}</div>
          </div>
        </header>
        <BenchmarkReport kind={kind} data={data} mine={mine} vs={compare} print />
      </article>
    </div>
  )
}
