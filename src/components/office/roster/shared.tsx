'use client'

import { MessageSquare } from 'lucide-react'
import type { Group, GroupCategory, Profile } from '@/lib/training'

export type Member = { group_id: number; athlete_id: string }

export const CAT_STYLE: Record<GroupCategory, string> = {
  Team: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Trip: 'bg-amber-50 text-amber-800 border-amber-200',
  Position: 'bg-sky-50 text-sky-700 border-sky-200',
  Status: 'bg-rose-50 text-rose-700 border-rose-200',
  Workout: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Focus: 'bg-violet-50 text-violet-700 border-violet-200',
  Custom: 'bg-slate-100 text-slate-700 border-slate-200',
}

export const catOf = (g: Group): GroupCategory => (g.category as GroupCategory) || 'Custom'

export function TagChip({ group, active = true, onClick, small = false }: { group: Group; active?: boolean; onClick?: () => void; small?: boolean }) {
  const cls = active ? CAT_STYLE[catOf(group)] : 'bg-white text-slate-400 border-slate-200 border-dashed'
  const size = small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
  const inner = (
    <>
      {group.name}
      {group.has_chat && <MessageSquare className={small ? 'w-2.5 h-2.5' : 'w-3 h-3'} aria-label="Has a chat channel" />}
    </>
  )
  if (!onClick) return <span className={`inline-flex items-center gap-1 rounded-full border font-extrabold whitespace-nowrap ${size} ${cls}`}>{inner}</span>
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-full border font-extrabold whitespace-nowrap cursor-pointer ${size} ${cls}`}>
      {inner}
    </button>
  )
}

export const POSITION_LABEL: Record<string, string> = {
  pitcher: 'PO',
  two_way: '2-Way',
  hitter: 'Hitter',
  catcher: 'Catcher',
  infield: 'Infield',
  outfield: 'Outfield',
  coach: 'Coach',
}

export function initials(name: string) {
  return name
    .replace(/^Coach\s+/, '')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function Avatar({ person, size = 'md' }: { person: Profile; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm'
  const color = person.role === 'coach' ? 'bg-[#113694] text-white' : 'bg-blue-50 text-[#1746b8]'
  return <div className={`${dim} ${color} rounded-full font-extrabold flex items-center justify-center shrink-0`}>{initials(person.full_name)}</div>
}

export function NoLoginBadge() {
  return <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-extrabold uppercase tracking-wide align-middle">No login</span>
}

/** Secondary navigation inside one Coach Office area. */
export function SubTabs<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string; count?: number }[]; active: T; onChange: (k: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-4 -mx-1 px-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-3 py-2.5 text-sm font-extrabold whitespace-nowrap border-b-2 -mb-px cursor-pointer ${
            active === t.key ? 'border-[#1746b8] text-[#1746b8]' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SheetFrame({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 lg:left-[220px] z-50 bg-[#f3f5f9] overflow-y-auto">
      <div className="bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} className="px-3 h-10 rounded-2xl bg-white/15 border border-white/20 text-sm font-extrabold cursor-pointer">Done</button>
          <div className="min-w-0">
            <div className="text-base font-extrabold leading-tight truncate">{title}</div>
            {subtitle && <div className="text-[11px] text-blue-100/90 font-medium truncate">{subtitle}</div>}
          </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-28">{children}</div>
    </div>
  )
}
