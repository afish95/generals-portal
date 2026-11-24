'use client'

import { LEVEL_LABEL, type Level } from '@/lib/benchmarks'
import type { Kind } from './BenchmarkReport'

const LEVELS: Level[] = ['hs_under', 'hs_upper', 'college']

/** Hitter | Pitcher switch and the "compare to" level picker. */
export default function BenchmarkControls({ kind, setKind, vs, setVs }: { kind: Kind; setKind: (k: Kind) => void; vs: Level; setVs: (l: Level) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#1746b8]">
        {(['hitter', 'pitcher'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`py-2.5 rounded-xl text-xs font-extrabold cursor-pointer ${kind === k ? 'bg-white text-[#1746b8] shadow-sm' : 'text-blue-100'}`}>
            {k === 'hitter' ? 'Hitter report' : 'Pitcher report'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Compare to</span>
        {LEVELS.map((l) => (
          <button key={l} type="button" onClick={() => setVs(l)} className={`px-3 py-1.5 rounded-full text-xs font-extrabold cursor-pointer ${vs === l ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {LEVEL_LABEL[l]}
          </button>
        ))}
      </div>
    </div>
  )
}
