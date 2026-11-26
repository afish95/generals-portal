'use client'

import { Bell } from 'lucide-react'

/** Coach checkbox: send players a push notification and an in-app announcement for what's being published. */
export default function SendNotification({ checked, onChange, className = '' }: { checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer ${checked ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'} ${className}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#1746b8]" />
      <Bell className={`w-4 h-4 ${checked ? 'text-[#1746b8]' : 'text-slate-400'}`} />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-extrabold text-slate-900">Send Notification</span>
        <span className="block text-[10px] font-semibold text-slate-500">Push to phones + announcement in the app</span>
      </span>
    </label>
  )
}
