'use client'

import { Pencil } from 'lucide-react'
import { useProfile } from '@/components/shell/AppShell'
import { APP_TEXT, saveAppText, useAppText, type TextKey } from '@/lib/appText'

/** Default app wording. Coaches (also in Player View) see a small pencil to change it in place. */
export default function Txt({ k, vars }: { k: TextKey; vars?: Record<string, string | number> }) {
  const t = useAppText()
  const { isCoach, viewAs } = useProfile()
  const text = t(k, vars)
  if (!isCoach && !viewAs.active) return <>{text}</>
  const edit = async (e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const current = t(k)
    const next = window.prompt(`Edit wording (clear it to go back to the original):\n\nOriginal: ${APP_TEXT[k].text}`, current)
    if (next === null || next.trim() === current) return
    const err = await saveAppText(k, next)
    if (err) window.alert(err)
  }
  return (
    <>
      {text}
      <span
        role="button"
        tabIndex={0}
        aria-label="Edit wording"
        title="Edit wording"
        onClick={edit}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && edit(e)}
        className="inline-flex align-middle ml-1 p-0.5 rounded text-slate-300 hover:text-[#1746b8] cursor-pointer"
      >
        <Pencil className="w-3 h-3" />
      </span>
    </>
  )
}
