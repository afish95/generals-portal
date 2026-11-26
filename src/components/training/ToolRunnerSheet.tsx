'use client'

import { X } from 'lucide-react'
import BullpenScriptRunner from '@/components/BullpenScriptRunner'

/** Full-screen runner for a training tool (bullpen script), optionally tied to a prescribed workout. */
export default function ToolRunnerSheet({
  playerId,
  scriptId,
  workoutId,
  title,
  onClose,
  onSaved,
}: {
  playerId: string
  scriptId: number
  workoutId?: number
  title: string
  onClose: () => void
  onSaved?: (sessionId: number) => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#f3f5f9] overflow-y-auto">
      <div className="bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">{workoutId ? 'Prescribed by Coach' : 'Training Tool'}</div>
            <div className="text-base font-extrabold leading-tight truncate">{title}</div>
          </div>
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <BullpenScriptRunner
          playerId={playerId}
          startScriptId={scriptId}
          workoutId={workoutId}
          onSaved={(id) => {
            onSaved?.(id)
            setTimeout(onClose, 900)
          }}
        />
      </div>
    </div>
  )
}
