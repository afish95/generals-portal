'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { INTENT_STYLE, KIND_INFO, PROGRAM_KINDS, type Program, type ProgramDay, type ProgramKind } from '@/lib/programs'
import ProgramSheet from './ProgramSheet'

/** Coach Office → Training → Programs: throwing, hitting and catching programs built from progressions. */
export default function ProgramsPanel({ progressions, onChanged, openProgramId }: { progressions: { id: number; name: string }[]; onChanged: () => void; openProgramId?: number }) {
  const [autoOpened, setAutoOpened] = useState(false)
  const [programs, setPrograms] = useState<Program[] | null>(null)
  const [kindFilter, setKindFilter] = useState<ProgramKind | 'all'>('all')
  const [days, setDays] = useState<ProgramDay[]>([])
  const [active, setActive] = useState<Record<number, number>>({})
  const [open, setOpen] = useState<Program | 'new' | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('programs').select('*').order('name'),
      sb.from('program_days').select('program_id, week, dow, intent').eq('week', 1),
      sb.from('program_assignments').select('program_id').eq('status', 'active'),
    ]).then(([p, d, a]) => {
      const list = (p.data as Program[]) || []
      setPrograms(list)
      if (openProgramId && !autoOpened) {
        const hit = list.find((x) => x.id === openProgramId)
        if (hit) setOpen(hit)
        setAutoOpened(true)
      }
      setDays((d.data as ProgramDay[]) || [])
      const m: Record<number, number> = {}
      for (const x of (a.data as { program_id: number }[]) || []) m[x.program_id] = (m[x.program_id] || 0) + 1
      setActive(m)
    })
  }, [version])

  const refresh = () => {
    setVersion((v) => v + 1)
    onChanged()
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen('new')} className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer">
        <Plus className="w-4 h-4" /> New Program
      </button>
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white border border-slate-200">
        {(['all', ...PROGRAM_KINDS] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKindFilter(k)} className={`py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${kindFilter === k ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
            {k === 'all' ? 'All' : KIND_INFO[k].label}
          </button>
        ))}
      </div>
      {programs === null ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : programs.length === 0 ? (
        <p className="text-center text-xs font-semibold text-slate-500 py-6">No programs yet.</p>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {programs.filter((p) => kindFilter === 'all' || (p.kind || 'throwing') === kindFilter).map((p) => {
            const wk = days.filter((d) => d.program_id === p.id)
            return (
              <button key={p.id} type="button" onClick={() => setOpen(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 cursor-pointer">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{p.name}</div>
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
                      const d = wk.find((x) => x.dow === dow)
                      return <span key={dow} className={`w-5 h-1.5 rounded-full ${d ? INTENT_STYLE[d.intent].dot : 'bg-slate-200'}`} />
                    })}
                    <span className="ml-2 text-[11px] font-semibold text-slate-400">
                      {KIND_INFO[p.kind || 'throwing'].label} · {p.weeks} wk{active[p.id] ? ` · ${active[p.id]} active` : ''}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            )
          })}
        </div>
      )}
      {open && <ProgramSheet program={open === 'new' ? null : open} progressions={progressions} onClose={() => { setOpen(null); refresh() }} onChanged={refresh} />}
    </div>
  )
}
