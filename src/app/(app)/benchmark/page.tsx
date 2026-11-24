'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, FileDown } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { inputClass } from '@/components/ui'
import BenchmarkReport, { useBenchmarkValues, type Kind } from '@/components/benchmark/BenchmarkReport'
import BenchmarkControls from '@/components/benchmark/BenchmarkControls'
import { LEVEL_LABEL, NEXT, levelFor, type Level } from '@/lib/benchmarks'
import type { Profile } from '@/lib/training'
import PlayerPhoto from '@/components/PlayerPhoto'

/** Benchmark Report: how a player's numbers rank at HS and college levels. Players see their own; coaches pick anyone. */
export default function BenchmarkPage() {
  const { profile, isCoach, viewAs } = useProfile()
  const coachPicking = isCoach && !viewAs.active
  const [players, setPlayers] = useState<Profile[]>([])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>(profile.position_group === 'pitcher' ? 'pitcher' : 'hitter')
  const [vs, setVs] = useState<Level | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const k = q.get('kind')
    if (k === 'hitter' || k === 'pitcher') setKind(k)
    if (!coachPicking) return
    createClient()
      .from('profiles')
      .select('id, username, full_name, role, position_group, grad_year, is_active, is_demo')
      .eq('role', 'player')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => {
        const list = ((data as Profile[]) || []).filter((p) => !p.is_demo)
        setPlayers(list)
        const want = q.get('player')
        setPickedId((cur) => cur || (want && list.some((p) => p.id === want) ? want : list[0]?.id) || null)
      })
  }, [coachPicking])

  const athlete = coachPicking ? players.find((p) => p.id === pickedId) || null : profile
  const data = useBenchmarkValues(athlete?.id || null)
  const mine = levelFor(athlete?.grad_year)
  const compare = vs ?? NEXT[mine]

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/other" aria-label="Back to Other" className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center lg:hidden">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </Link>
        {athlete && <PlayerPhoto id={athlete.id} name={athlete.full_name} size={48} />}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Benchmark Report</h1>
          <p className="text-xs font-semibold text-slate-500">
            {athlete ? `${athlete.full_name}${athlete.grad_year ? ` · Class of ${athlete.grad_year}` : ''} · ${LEVEL_LABEL[mine]}` : 'Pick a player'}
          </p>
        </div>
        {athlete && (
          <a
            href={`/benchmark-print?athlete=${athlete.id}&kind=${kind}&vs=${compare}`}
            className="px-3.5 py-2.5 rounded-2xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0"
          >
            <FileDown className="w-4 h-4" /> Export 1-page
          </a>
        )}
      </div>

      {coachPicking && (
        <select value={pickedId || ''} onChange={(e) => setPickedId(e.target.value)} className={inputClass} aria-label="Player">
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {p.grad_year ? ` ’${String(p.grad_year).slice(2)}` : ''}
            </option>
          ))}
        </select>
      )}

      <BenchmarkControls kind={kind} setKind={setKind} vs={compare} setVs={setVs} />
      {athlete && <BenchmarkReport kind={kind} data={data} mine={mine} vs={compare} />}
    </div>
  )
}
