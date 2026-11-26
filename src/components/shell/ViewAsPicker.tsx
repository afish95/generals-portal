'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { useProfile } from './AppShell'

/** Coach Home: switch to a read-only preview of any player's app. */
export default function ViewAsPicker() {
  const { viewAs } = useProfile()
  const [mode, setMode] = useState<'coach' | 'player'>('coach')
  const pitchers = viewAs.players.filter((p) => p.position_group === 'pitcher')
  const others = viewAs.players.filter((p) => p.position_group !== 'pitcher')

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-4 shadow-xs space-y-3">
      <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-slate-100">
        {(['coach', 'player'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`py-2 rounded-xl text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}
          >
            {m === 'coach' ? 'Coach View' : 'Player View'}
          </button>
        ))}
      </div>
      {mode === 'player' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5">
            <Eye className="w-4 h-4 text-[#1746b8] shrink-0" />
            <select
              value=""
              onChange={(e) => e.target.value && viewAs.start(e.target.value)}
              className="flex-1 bg-transparent text-sm font-extrabold text-slate-900 outline-none cursor-pointer"
              aria-label="Choose a player"
            >
              <option value="">Choose a Player…</option>
              {pitchers.length > 0 && (
                <optgroup label="Pitchers">
                  {pitchers.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}{p.grad_year ? ` · ${p.grad_year}` : ''}</option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Position Players">
                  {others.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}{p.grad_year ? ` · ${p.grad_year}` : ''}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <p className="text-[11px] font-semibold text-slate-500 px-1">
            See the whole app exactly as that player does. It&apos;s read-only: nothing you tap changes their logs or check-ins.
          </p>
        </div>
      )}
    </section>
  )
}
