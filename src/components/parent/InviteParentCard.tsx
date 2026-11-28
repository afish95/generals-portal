'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useProfile } from '@/components/shell/AppShell'
import { shareInvite } from '@/lib/parent'

/** Player's Other tab: send a parent an invite link (up to 2 parents). */
export default function InviteParentCard() {
  const { profile } = useProfile()
  const [count, setCount] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    createClient()
      .rpc('parent_count', { p_player: profile.id })
      .then(({ data }) => setCount(Number(data) || 0))
  }, [profile.id])

  const send = async () => {
    const { data, error } = await createClient().rpc('parent_invite_link', { p_player: profile.id })
    if (error || !data) return setNote('Could not make a link. Try again.')
    const r = await shareInvite(`${window.location.origin}/invite/${data}`, profile.full_name.split(' ')[0])
    setNote(r === 'copied' ? 'Link copied. Text it to your parent. It works for 7 days.' : r === 'shared' ? 'Invite sent.' : null)
  }

  if (count === null) return null
  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1746b8] flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-slate-900">Invite a Parent</div>
          <div className="text-xs font-medium text-slate-500">
            {count >= 2 ? 'Both parent spots are filled.' : `Parents see the schedule, game stats and progress. ${count} of 2 connected.`}
          </div>
        </div>
      </div>
      {count < 2 && (
        <button type="button" onClick={send} className="w-full py-2.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold cursor-pointer">
          Send Invite Link
        </button>
      )}
      {note && <p className="text-xs font-bold text-emerald-700">{note}</p>}
    </section>
  )
}
