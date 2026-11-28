'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { useProfile } from './AppShell'

/** Coach Home: switch to a read-only preview of any player's app, or their parent's app. */
export default function ViewAsPicker() {
  const { viewAs } = useProfile()
  const [mode, setMode] = useState<'coach' | 'player' | 'parent'>('coach')
  const pitchers = viewAs.players.filter((p) => p.position_group === 'pitcher')
  const others = viewAs.players.filter((p) => p.position_group !== 'pitcher')

  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-2 shadow-xs space-y-2">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100">
        {(['coach', 'player', 'parent'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`py-1.5 rounded-xl text-xs font-extrabold cursor-pointer ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}
          >
            {m === 'coach' ? 'Coach View' : m === 'player' ? 'Player View' : 'Parent View'}
          </button>
        ))}
      </div>
      {mode !== 'coach' && (
        <div className="space-y-1.5 px-1 pb-1">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Eye className="w-4 h-4 text-[#1746b8] shrink-0" />
            <select
              value=""
              onChange={(e) => e.target.value && viewAs.start(e.target.value, mode === 'parent' ? 'parent' : 'player')}
              className="flex-1 bg-transparent text-sm font-extrabold text-slate-900 outline-none cursor-pointer"
              aria-label={mode === 'parent' ? "Choose a player's parent" : "Choose a player"}
            >
              <option value="">{mode === 'parent' ? 'Parent of…' : 'Choose a Player…'}</option>
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
          <p className="text-[11px] font-semibold text-slate-500">
            {mode === 'parent' ? 'See what that player’s parents see. Read-only.' : 'See the app exactly as that player does. Read-only.'}
          </p>
        </div>
      )}
    </section>
  )
}
