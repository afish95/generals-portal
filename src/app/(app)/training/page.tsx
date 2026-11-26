'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { DateStepper, EmptyState, PageTitle } from '@/components/ui'
import DayPlan from '@/components/DayPlan'
import LoggedWorkout from '@/components/training/LoggedWorkout'
import ProgressTrends from '@/components/training/ProgressTrends'
import PositionLeaderboard from '@/components/stats/PositionLeaderboard'
import TrainingTools from '@/components/training/TrainingTools'
import ToolRunnerSheet from '@/components/training/ToolRunnerSheet'
import MyPlan from '@/components/plan/MyPlan'
import TrainingOverview from '@/components/training/TrainingOverview'
import WeekAtAGlance from '@/components/training/WeekAtAGlance'
import PercentileRankings from '@/components/stats/PercentileRankings'
import PrCelebration from '@/components/training/PrCelebration'
import { PointBubble, buzz } from '@/components/points/PointBurst'
import type { PrHit } from '@/components/training/WorkoutLogger'
import { withPointsDelta } from '@/lib/pointsDelta'
import { localDate } from '@/lib/training'

type Running = { scriptId: number; title: string; workoutId?: number }

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'mine', label: 'My Training' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'tools', label: 'Tools' },
] as const
type Tab = (typeof TABS)[number]['key']

export default function TrainingPage() {
  const { profile, isCoach } = useProfile()
  const [date, setDate] = useState(localDate())
  const [tab, setTab] = useState<Tab>('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const [pr, setPr] = useState<PrHit | null>(null)
  const [running, setRunning] = useState<Running | null>(null)
  const [toast, setToast] = useState<number>(0)
  const clearPr = useCallback(() => setPr(null), [])
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), [])

  // A finished prescribed bullpen checks off its workout (today only), which can earn the throwing point.
  const onBullpenSaved = async (workoutId?: number) => {
    if (workoutId && date === localDate()) {
      const supabase = createClient()
      const today = localDate()
      const { data: existing } = await supabase
        .from('plan_checks')
        .select('id')
        .eq('athlete_id', profile.id)
        .eq('check_date', today)
        .eq('item_type', 'workout')
        .eq('item_id', workoutId)
        .maybeSingle()
      if (!existing) {
        const gained = await withPointsDelta(profile.id, today, async () => {
          await supabase.from('plan_checks').insert({ athlete_id: profile.id, check_date: today, item_type: 'workout', item_id: workoutId })
        })
        if (gained > 0) {
          buzz()
          setToast(gained)
          setTimeout(() => setToast(0), 2200)
        }
      }
    }
    refresh()
  }

  if (isCoach) {
    return <EmptyState title="Training is the player view" body="Build workouts and prescribe tools in Coach Office." />
  }

  return (
    <div className="space-y-4">
      <PrCelebration hit={pr} onDone={clearPr} />
      {toast > 0 && (
        <div className="fixed inset-x-0 z-50 flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top) + 100px)' }}>
          <div className="relative rounded-2xl bg-emerald-500 text-white px-4 py-3 text-sm font-extrabold shadow-xl animate-gen-pop">
            Bullpen complete. Workout checked off!
            <PointBubble amount={toast} className="-top-4" />
          </div>
        </div>
      )}

      <PageTitle title="Training" />
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-white border border-slate-200 shadow-xs sticky top-2 z-20">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`py-2 rounded-xl text-[11px] font-extrabold cursor-pointer ${tab === t.key ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <TrainingOverview athleteId={profile.id} position={profile.position_group} />
          <MyPlan athleteId={profile.id} title={`${profile.full_name.split(' ')[0]}’s Personal Development`} onStartTool={(scriptId, title) => setRunning({ scriptId, title })} />
        </>
      )}

      {tab === 'mine' && (
        <>
          <WeekAtAGlance athleteId={profile.id} date={date} onPick={setDate} refreshKey={refreshKey} position={profile.position_group} />
          <div>
            <DateStepper value={date} onChange={setDate} />
            <DayPlan
              athleteId={profile.id}
              date={date}
              refreshKey={refreshKey}
              onChange={refresh}
              onStartTool={(scriptId, workoutId, title) => setRunning({ scriptId, workoutId, title })}
              renderWorkout={(w, items) => <LoggedWorkout workout={w} items={items} athleteId={profile.id} onPr={setPr} onChanged={refresh} />}
            />
          </div>
          <ProgressTrends athleteId={profile.id} key={`trends-${refreshKey}`} />
        </>
      )}

      {tab === 'leaderboard' && (
        <>
          <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Training Leaderboards</div>
            <PositionLeaderboard myId={profile.id} myPosition={profile.position_group} key={`lb-${refreshKey}`} />
          </section>
          <PercentileRankings myId={profile.id} isCoach={false} />
        </>
      )}

      {tab === 'tools' && <TrainingTools athleteId={profile.id} refreshKey={refreshKey} onStart={(scriptId, title) => setRunning({ scriptId, title })} />}

      {running && (
        <ToolRunnerSheet
          playerId={profile.id}
          scriptId={running.scriptId}
          workoutId={running.workoutId}
          title={running.title}
          onClose={() => setRunning(null)}
          onSaved={() => onBullpenSaved(running.workoutId)}
        />
      )}
    </div>
  )
}
