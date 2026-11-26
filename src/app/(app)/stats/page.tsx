'use client'

import { useState } from 'react'
import { useProfile, useSubnav } from '@/components/shell/AppShell'
import { PageTitle } from '@/components/ui'
import GameStatsHub from '@/components/stats/GameStatsHub'
import PercentileRankings from '@/components/stats/PercentileRankings'

/** Stats = game stats only (GameChanger history and game percentiles). Training numbers live on the Training tab. */
export default function StatsPage() {
  const { profile, isCoach } = useProfile()
  const [mode, setMode] = useState<'game' | 'percentiles'>('game')
  useSubnav(
    [
      { key: 'game', label: 'Game Stats' },
      { key: 'percentiles', label: 'Percentiles' },
    ],
    mode,
    (k) => setMode(k as 'game' | 'percentiles')
  )

  return (
    <div className="space-y-4">
      <div className={isCoach ? 'lg:hidden' : ''}>
        <PageTitle title="Stats" subtitle={mode === 'game' ? 'Program game stat history' : 'How you rank against teammates'} />
      </div>
      <div className={`grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#1746b8] ${isCoach ? 'lg:hidden' : ''}`}>
        {(['game', 'percentiles'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition ${mode === m ? 'bg-white text-[#1746b8] shadow-sm' : 'text-blue-100'}`}
          >
            {m === 'game' ? 'Game Stats' : 'Percentiles'}
          </button>
        ))}
      </div>
      {mode === 'percentiles' ? <PercentileRankings myId={profile.id} isCoach={isCoach} /> : <GameStatsHub myId={profile.id} isCoach={isCoach} />}
    </div>
  )
}
