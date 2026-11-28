'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Gauge, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { PageTitle } from '@/components/ui'
import NotificationSetup from '@/components/NotificationSetup'
import ThoughtOfWeek from '@/components/ThoughtOfWeek'
import SocialLinks from '@/components/SocialLinks'
import InviteParentCard from '@/components/parent/InviteParentCard'

export default function OtherPage() {
  const { profile, isCoach, isParent, viewAs } = useProfile()
  const router = useRouter()

  const signOut = async () => {
    await createClient().auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Other" />
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs">
        <div className="text-sm font-extrabold text-slate-900">{profile.full_name}</div>
        <div className="text-xs font-semibold text-slate-500">@{profile.username} · {isCoach ? 'Coach' : isParent ? 'Parent' : 'Player'}</div>
      </section>
      {!isCoach && !isParent && !viewAs.active && <InviteParentCard />}
      {!isParent && (
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1746b8] flex items-center justify-center shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-900">Benchmark Report</div>
            <div className="text-xs font-medium text-slate-500">See how your numbers stack up against high school and college players.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['hitter', 'pitcher'] as const).map((k) => (
            <Link key={k} href={`/benchmark?kind=${k}`} className="py-2.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center justify-center gap-1">
              {k === 'hitter' ? 'Hitter Report' : 'Pitcher Report'} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          ))}
        </div>
      </section>
      )}
      <ThoughtOfWeek />
      <SocialLinks />
      {viewAs.active ? (
        <button type="button" onClick={viewAs.exit} className="w-full py-3 rounded-2xl bg-amber-400 text-amber-950 text-sm font-extrabold cursor-pointer">
          Exit Player View
        </button>
      ) : (
      <>
      <NotificationSetup />
      <button
        type="button"
        onClick={signOut}
        className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-sm font-extrabold text-red-600 flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
      </>
      )}
    </div>
  )
}
