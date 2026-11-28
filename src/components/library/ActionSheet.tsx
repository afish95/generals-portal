'use client'

import { X } from 'lucide-react'

export type Action = { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; danger?: boolean }

/** iOS-style bottom sheet of actions (VeloBeam style): title, grouped rows, destructive rows in their own group. */
export default function ActionSheet({ title, actions, onClose, children }: { title: string; actions?: Action[]; onClose: () => void; children?: React.ReactNode }) {
  const normal = (actions || []).filter((a) => !a.danger)
  const danger = (actions || []).filter((a) => a.danger)
  const group = (list: Action[]) => (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200 overflow-hidden">
      {list.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => {
            onClose()
            a.onClick()
          }}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-bold cursor-pointer hover:bg-white ${a.danger ? 'text-red-600' : 'text-slate-800'}`}
        >
          <a.icon className={`w-5 h-5 shrink-0 ${a.danger ? 'text-red-500' : 'text-slate-500'}`} />
          {a.label}
        </button>
      ))}
    </div>
  )
  return (
    <div className="fixed inset-0 z-[70] flex items-end lg:items-center justify-center" role="dialog" aria-modal>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/40 cursor-default" />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl lg:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="mx-auto w-10 h-1 rounded-full bg-slate-200 lg:hidden" />
        <div className="flex items-center gap-2">
          <h3 className="flex-1 min-w-0 text-base font-extrabold text-slate-900 truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        {normal.length > 0 && group(normal)}
        {danger.length > 0 && group(danger)}
        {children}
      </div>
    </div>
  )
}
