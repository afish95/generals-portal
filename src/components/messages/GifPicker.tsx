'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { callApi } from '@/lib/api'

export type Gif = { id: string; title: string; url: string; thumb: string; w: number; h: number }

/** GIPHY search sheet (PG-rated). Shows trending until you type. */
export default function GifPicker({ onPick, onClose }: { onPick: (g: Gif) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState<Gif[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const res = await callApi<{ gifs: Gif[] }>(`/api/gifs?q=${encodeURIComponent(q)}`, { method: 'GET' })
      if (!res.ok) return setError(res.error)
      setError(null)
      setGifs(res.data.gifs)
    }, q ? 350 : 0)
  }, [q])

  return (
    <div className="fixed inset-0 z-[70] flex items-end lg:items-center justify-center" role="dialog" aria-modal>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/40 cursor-default" />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl lg:rounded-3xl p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2 h-[70vh]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIPHY" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-100 text-base outline-none" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <p className="text-center text-xs font-semibold text-slate-500 py-10">{error}</p>
          ) : gifs === null ? (
            <div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 9 }, (_, i) => <div key={i} className="aspect-square rounded-lg bg-slate-100 animate-pulse" />)}</div>
          ) : gifs.length === 0 ? (
            <p className="text-center text-xs font-semibold text-slate-500 py-10">No GIFs found.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {gifs.map((g) => (
                <button key={g.id} type="button" onClick={() => onPick(g)} className="aspect-square rounded-lg overflow-hidden bg-slate-100 cursor-pointer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.thumb} alt={g.title} loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Powered by GIPHY</div>
      </div>
    </div>
  )
}
