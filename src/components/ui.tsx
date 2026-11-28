'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { prettyDate, addDays, localDate } from '@/lib/training'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs ${className}`}>{children}</section>
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">{children}</div>
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
      {subtitle && <p className="text-xs font-semibold text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-xs font-extrabold whitespace-nowrap cursor-pointer ${
        active ? 'bg-[#1746b8] text-white' : 'bg-white text-slate-600 border border-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

export function DateStepper({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const today = localDate()
  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-1.5 mb-4">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => onChange(addDays(value, -1))}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 cursor-pointer"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button type="button" onClick={() => onChange(today)} className="text-center cursor-pointer">
        <div className="text-sm font-extrabold text-slate-900">{prettyDate(value)}</div>
        <div className="text-[10px] font-bold text-[#1746b8]">{value === today ? 'Today' : 'Tap for today'}</div>
      </button>
      <button
        type="button"
        aria-label="Next day"
        onClick={() => onChange(addDays(value, 1))}
        className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 cursor-pointer"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="text-sm font-extrabold text-slate-700">{title}</div>
      {body && <div className="text-xs font-medium text-slate-500 mt-1">{body}</div>}
    </div>
  )
}

export const inputSm =
  'gen-field-sm w-full px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400'

export const inputClass =
  'gen-field w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-base text-slate-900 placeholder:text-slate-400'
