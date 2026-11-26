'use client'

import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { useProfile } from '@/components/shell/AppShell'

/** Small "Edit" link for coaches (also shown in Player View) that jumps to the Coach Office screen that edits this item. */
export default function CoachEdit({ href, label = 'Edit', className = '' }: { href: string; label?: string; className?: string }) {
  const { isCoach, viewAs } = useProfile()
  const router = useRouter()
  if (!isCoach && !viewAs.active) return null
  const go = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (viewAs.active) {
      viewAs.exit()
      setTimeout(() => router.push(href), 0)
    } else router.push(href)
  }
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && go(e)}
      className={`inline-flex items-center gap-1 text-[11px] font-extrabold text-[#1746b8] cursor-pointer hover:underline ${className}`}
    >
      <Pencil className="w-3 h-3" /> {label}
    </span>
  )
}
