'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { PageTitle } from '@/components/ui'
import NotificationSetup from '@/components/NotificationSetup'
import BullpenScriptRunner from '@/components/BullpenScriptRunner'

export default function OtherPage() {
  const { profile, isCoach } = useProfile()
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
        <div className="text-xs font-semibold text-slate-500">@{profile.username} · {isCoach ? 'Coach' : 'Player'}</div>
      </section>
      <NotificationSetup />
      {!isCoach && (
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Bullpen scripts</div>
          <BullpenScriptRunner playerId={profile.id} />
        </div>
      )}
      <button
        type="button"
        onClick={signOut}
        className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-sm font-extrabold text-red-600 flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  )
}
