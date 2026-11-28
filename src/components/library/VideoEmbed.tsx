'use client'

import { useState } from 'react'
import { ChevronDown, ExternalLink, PlayCircle } from 'lucide-react'
import { parseVideo } from '@/lib/video'

/** Plays a drill video inside the app (YouTube, Vimeo, Drive, uploaded files); other sites get an Open button. */
export default function VideoEmbed({ url, title }: { url: string | null | undefined; title?: string }) {
  const v = parseVideo(url)
  if (!v) return null
  if (v.kind === 'link')
    return (
      <a href={v.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-[#1746b8] text-xs font-extrabold">
        Open video on {v.host} <ExternalLink className="w-3.5 h-3.5" />
      </a>
    )
  return (
    <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black">
      {v.kind === 'file' ? (
        <video src={v.src} controls playsInline preload="metadata" className="w-full h-full" aria-label={title} />
      ) : (
        <iframe
          src={v.src}
          title={title || 'Drill Video'}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          loading="lazy"
        />
      )}
    </div>
  )
}

/** A drill name that expands to show its video and how-to right where it is. */
export function DrillReveal({
  name,
  videoUrl,
  notes,
  meta,
  className = '',
  compact = false,
}: {
  name: string
  videoUrl?: string | null
  notes?: string | null
  meta?: string | null
  className?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const has = !!(videoUrl || notes)
  return (
    <div className={className}>
      <button type="button" onClick={() => has && setOpen((o) => !o)} className={`${compact ? 'w-full' : ''} flex items-center gap-1.5 text-left ${has ? 'cursor-pointer' : 'cursor-default'}`}>
        <span className={`${compact ? 'text-[13px] truncate' : 'text-sm'} font-extrabold text-slate-900`}>{name}</span>
        {videoUrl && <PlayCircle className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-[#1746b8] shrink-0`} aria-label="Has video" />}
        {has && !compact && <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition ${open ? 'rotate-180' : ''}`} />}
        {compact && meta && <span className="ml-auto pl-2 shrink-0 text-[11px] font-semibold text-slate-500">{meta}</span>}
      </button>
      {meta && !compact && <div className="text-xs font-semibold text-slate-500">{meta}</div>}
      {open && (
        <div className="mt-2 space-y-2">
          <VideoEmbed url={videoUrl} title={name} />
          {notes && <p className="text-xs font-medium text-slate-600 whitespace-pre-line">{notes.replace(/; (?=\d\)|Heat Zone|\*\*)/g, '\n')}</p>}
        </div>
      )}
    </div>
  )
}

/** "Watch How-To" toggle under a drill in a workout: expands the video and instructions in place. */
export function DrillHowTo({ url, notes, name }: { url?: string | null; notes?: string | null; name: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-bold text-[#1746b8] cursor-pointer">
        <PlayCircle className="w-3.5 h-3.5" /> {open ? 'Hide How-To' : url ? 'Watch How-To' : 'How-to'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <VideoEmbed url={url} title={name} />
          {notes && <p className="text-xs font-medium text-slate-600 whitespace-pre-line">{notes.replace(/; (?=\d\)|Heat Zone|\*\*)/g, '\n')}</p>}
        </div>
      )}
    </div>
  )
}
