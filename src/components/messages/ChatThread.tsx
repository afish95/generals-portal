'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Download, FileText, ImagePlus, Send, Trash2, X } from 'lucide-react'
import GifPicker, { type Gif } from './GifPicker'
import { createClient } from '@/lib/supabase'
import { callApi } from '@/lib/api'

type Attachment = { type: 'image' | 'video' | 'file' | 'gif'; path?: string; url?: string; name?: string; mime?: string; w?: number; h?: number }
type Reaction = { profile_id: string; emoji: string }
type Msg = { id: number; sender_id: string; body: string; created_at: string; attachment: Attachment | null; message_reactions?: Reaction[] }
const REACTIONS = ['❤️', '👍', '😂', '‼️', '🔥', '⚾']
/** First emoji in what was typed (handles skin tones, flags and combined emoji) */
function firstEmoji(text: string): string | null {
  const parts = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((x) => x.segment)
    : Array.from(text)
  return parts.find((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g)) || null
}
const MAX_MB = 50
type Read = { profile_id: string; last_read_at: string }

function stamp(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function ChatThread({
  conversationId,
  title,
  subtitle,
  myId,
  isCoach,
  names,
  onClose,
  readOnly = false,
  direct = false,
  members,
  embedded = false,
  headerRight,
}: {
  conversationId: number
  title: string
  subtitle: string
  myId: string
  isCoach: boolean
  names: Map<string, string>
  onClose: () => void
  /** Coach previewing as a player: no sending, no read markers */
  readOnly?: boolean
  /** 1:1 chat: receipts read "Seen 8:04 PM" instead of "Seen by …" */
  direct?: boolean
  /** For 1:1 chats: the two people in it (coaches reading for safeguarding don't count as "Seen") */
  members?: string[]
  /** Desktop Messages: sits in the right-hand pane instead of covering the screen */
  embedded?: boolean
  headerRight?: React.ReactNode
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [reads, setReads] = useState<Read[]>([])
  const [showSeen, setShowSeen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [media, setMedia] = useState<Map<string, string>>(new Map())
  const [uploading, setUploading] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [viewing, setViewing] = useState<Msg | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Press and hold (or right-click) a message: reaction bar + actions, like iMessage
  const [menuFor, setMenuFor] = useState<Msg | null>(null)
  const [picking, setPicking] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  const holdProps = (m: Msg) =>
    readOnly
      ? {}
      : {
          onPointerDown: () => {
            held.current = false
            if (holdTimer.current) clearTimeout(holdTimer.current)
            holdTimer.current = setTimeout(() => {
              held.current = true
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10)
              setMenuFor(m)
            }, 450)
          },
          onPointerUp: () => holdTimer.current && clearTimeout(holdTimer.current),
          onPointerLeave: () => holdTimer.current && clearTimeout(holdTimer.current),
          onPointerCancel: () => holdTimer.current && clearTimeout(holdTimer.current),
          onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault()
            setMenuFor(m)
          },
        }
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at, attachment, message_reactions(profile_id, emoji)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(150)
    const list = ((data as Msg[]) || []).reverse()
    setMessages(list)
    // Private files: short-lived signed links for any we haven't fetched yet
    const paths = list.map((m) => m.attachment?.path).filter((p): p is string => !!p)
    setMedia((have) => {
      const need = paths.filter((p) => !have.has(p))
      if (need.length)
        supabase.storage
          .from('chat-media')
          .createSignedUrls(need, 60 * 60 * 6)
          .then(({ data: urls }) => {
            if (!urls) return
            setMedia((m) => {
              const n = new Map(m)
              urls.forEach((u) => u.path && u.signedUrl && n.set(u.path, u.signedUrl))
              return n
            })
          })
      return have
    })
    const { data: rd } = await supabase.rpc('conversation_reads', { p_conversation: conversationId })
    setReads((rd as Read[]) || [])
    if (readOnly) return
    await supabase
      .from('message_reads')
      .upsert({ conversation_id: conversationId, profile_id: myId, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,profile_id' })
  }, [conversationId, myId, readOnly])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000) // light polling while the chat is open
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setSending(true)
    setError(null)
    const res = await callApi('/api/messages', { body: { conversation_id: conversationId, body } })
    setSending(false)
    if (!res.ok) return setError(res.error)
    setText('')
    load()
  }

  const sendAttachment = async (attachment: Attachment) => {
    setError(null)
    const res = await callApi('/api/messages', { body: { conversation_id: conversationId, body: '', attachment } })
    if (!res.ok) return setError(res.error)
    load()
  }
  const upload = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Files must be under ${MAX_MB} MB.`)
    setUploading(true)
    setError(null)
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
    const path = `${conversationId}/${myId}-${Date.now()}.${ext}`
    const { error: ue } = await createClient().storage.from('chat-media').upload(path, file, { contentType: file.type || undefined })
    setUploading(false)
    if (ue) return setError(ue.message)
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file'
    sendAttachment({ type, path, name: file.name, mime: file.type })
  }
  const pickGif = (g: Gif) => {
    setGifOpen(false)
    sendAttachment({ type: 'gif', url: g.url, w: g.w, h: g.h })
  }

  const remove = async (m: Msg) => {
    if (!window.confirm('Delete this message for everyone?')) return
    if (m.attachment?.path) await createClient().storage.from('chat-media').remove([m.attachment.path])
    await createClient().from('messages').delete().eq('id', m.id)
    setViewing(null)
    load()
  }
  const react = async (m: Msg, emoji: string) => {
    setMenuFor(null)
    setPicking(false)
    const sb = createClient()
    const mineNow = (m.message_reactions || []).find((r) => r.profile_id === myId)
    // Optimistic: show it right away
    setMessages((list) =>
      list.map((x) =>
        x.id !== m.id
          ? x
          : { ...x, message_reactions: [...(x.message_reactions || []).filter((r) => r.profile_id !== myId), ...(mineNow?.emoji === emoji ? [] : [{ profile_id: myId, emoji }])] }
      )
    )
    if (mineNow?.emoji === emoji) await sb.from('message_reactions').delete().eq('message_id', m.id).eq('profile_id', myId)
    else await sb.from('message_reactions').upsert({ message_id: m.id, profile_id: myId, emoji }, { onConflict: 'message_id,profile_id' })
    load()
  }
  const canDelete = (m: Msg) => !readOnly && (m.sender_id === myId || isCoach)

  // Read receipts under my latest message: who has read the chat since it was sent
  const lastMineId = [...messages].reverse().find((m) => m.sender_id === myId)?.id
  const receipt = (m: Msg) => {
    const seen = reads
      .filter((r) => r.profile_id !== myId && (!members || members.includes(r.profile_id)) && new Date(r.last_read_at) >= new Date(m.created_at))
      .sort((a, b) => a.last_read_at.localeCompare(b.last_read_at))
    if (seen.length === 0) return <span className="text-[10px] font-bold text-slate-400 px-2">Delivered</span>
    if (direct) return <span className="text-[10px] font-bold text-[#1746b8] px-2">Seen {stamp(seen[seen.length - 1].last_read_at)}</span>
    return (
      <button type="button" onClick={() => setShowSeen((v) => !v)} className="text-[10px] font-bold text-[#1746b8] px-2 text-right max-w-[80%] cursor-pointer">
        {showSeen ? `Seen by ${seen.map((r) => names.get(r.profile_id) ?? 'Teammate').join(', ')}` : `Seen by ${seen.length} · tap to see who`}
      </button>
    )
  }

  return (
    <div className={embedded ? 'h-full bg-[#f3f5f9] flex flex-col rounded-3xl border border-slate-200 overflow-hidden' : 'fixed inset-0 z-50 bg-[#f3f5f9] flex flex-col lg:left-[220px]'}>
      <div className="bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white shrink-0" style={embedded ? undefined : { paddingTop: 'env(safe-area-inset-top)' }}>
        <div className={`${embedded ? '' : 'max-w-xl mx-auto'} px-4 py-3 flex items-center gap-3`}>
          {!embedded && (
            <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center cursor-pointer">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-base font-extrabold leading-tight truncate">{title}</div>
            <div className="text-[11px] text-blue-100/90 font-medium truncate">{subtitle}</div>
          </div>
          {headerRight}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className={`${embedded ? 'max-w-3xl' : 'max-w-xl'} mx-auto px-4 py-4 space-y-2`}>
          {messages.length === 0 && <p className="text-center text-xs font-semibold text-slate-400 py-10">No messages yet. Say hi.</p>}
          {messages.map((m, i) => {
            const mine = m.sender_id === myId
            const showName = !mine && (i === 0 || messages[i - 1].sender_id !== m.sender_id)
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {showName && <span className="text-[10px] font-bold text-slate-400 px-2 mb-0.5">{names.get(m.sender_id) ?? 'Teammate'}</span>}
                {m.attachment && (() => {
                  const a = m.attachment
                  const src = a.type === 'gif' ? a.url : a.path ? media.get(a.path) : undefined
                  if (a.type === 'file')
                    return (
                      <a href={src} target="_blank" rel="noreferrer" className={`max-w-[80%] flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-sm font-bold ${mine ? 'bg-[#1746b8] border-[#1746b8] text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                        <FileText className="w-5 h-5 shrink-0" /> <span className="truncate">{a.name || 'File'}</span> <Download className="w-4 h-4 shrink-0 opacity-70" />
                      </a>
                    )
                  if (!src) return <div className="w-48 h-36 rounded-2xl bg-slate-200 animate-pulse" />
                  return (
                    <button type="button" {...holdProps(m)} onClick={() => !held.current && setViewing(m)} className="max-w-[70%] rounded-2xl overflow-hidden border border-slate-200 bg-white cursor-pointer select-none [-webkit-touch-callout:none]">
                      {a.type === 'video' ? (
                        <video src={src} className="max-h-72 w-full object-cover" muted playsInline preload="metadata" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={a.type === 'gif' ? 'GIF' : a.name || 'Photo'} className="max-h-72 w-auto object-cover" loading="lazy" />
                      )}
                    </button>
                  )
                })()}
                {m.body && <button
                  type="button"
                  {...holdProps(m)}
                  className={`max-w-[80%] text-left px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words select-none [-webkit-touch-callout:none] ${
                    mine ? 'bg-[#1746b8] text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-900 rounded-bl-md'
                  }`}
                >
                  {m.body}
                </button>}
                {(m.message_reactions || []).length > 0 && (() => {
                  const groups = new Map<string, string[]>()
                  m.message_reactions!.forEach((r) => groups.set(r.emoji, [...(groups.get(r.emoji) || []), r.profile_id]))
                  return (
                    <div className={`-mt-1.5 z-10 flex gap-0.5 ${mine ? 'mr-2' : 'ml-2'}`}>
                      {[...groups].map(([emoji, who]) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => !readOnly && react(m, emoji)}
                          title={who.map((id) => (id === myId ? 'You' : names.get(id) ?? 'Teammate')).join(', ')}
                          className={`h-6 px-1.5 rounded-full border text-xs flex items-center gap-0.5 shadow-sm cursor-pointer ${who.includes(myId) ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}
                        >
                          {emoji}
                          {who.length > 1 && <span className="text-[10px] font-extrabold text-slate-600">{who.length}</span>}
                        </button>
                      ))}
                    </div>
                  )
                })()}
                <span className="text-[9px] font-semibold text-slate-400 px-2 mt-0.5">{stamp(m.created_at)}</span>
                {mine && m.id === lastMineId && receipt(m)}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {readOnly ? (
        <div className="shrink-0 bg-amber-50 border-t border-amber-200 text-center text-xs font-extrabold text-amber-800 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          Player View: Read-Only
        </div>
      ) : (
      <div className="shrink-0 bg-white border-t border-slate-200" style={embedded ? undefined : { paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className={`${embedded ? 'max-w-3xl' : 'max-w-xl'} mx-auto px-3 py-2.5 flex items-end gap-2`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) upload(f)
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Add Photo or File" className="w-11 h-11 shrink-0 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center disabled:opacity-50 cursor-pointer">
            {uploading ? <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-[#1746b8] animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          </button>
          <button type="button" onClick={() => setGifOpen(true)} aria-label="Send a GIF" className="h-11 px-2.5 shrink-0 rounded-2xl bg-slate-100 text-slate-600 text-xs font-black tracking-wide cursor-pointer">
            GIF
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (embedded && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="Message"
            className="flex-1 resize-none max-h-32 px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-base text-slate-900"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="w-11 h-11 shrink-0 rounded-2xl bg-[#1746b8] text-white flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="max-w-xl mx-auto px-4 pb-2 text-xs font-bold text-red-600">{error}</p>}
      </div>
      )}
      {menuFor && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" role="dialog" aria-modal>
          <button type="button" aria-label="Close" onClick={() => { setMenuFor(null); setPicking(false) }} className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm cursor-default" />
          <div className="relative w-full max-w-sm space-y-2">
            <div className="mx-auto w-fit flex gap-1 bg-white rounded-full px-2 py-1.5 shadow-xl">
              {REACTIONS.map((e) => {
                const on = (menuFor.message_reactions || []).some((r) => r.profile_id === myId && r.emoji === e)
                return (
                  <button key={e} type="button" onClick={() => react(menuFor, e)} aria-label={`React ${e}`} className={`w-10 h-10 rounded-full text-2xl flex items-center justify-center cursor-pointer transition-transform active:scale-125 ${on ? 'bg-blue-100' : 'hover:bg-slate-100'}`}>
                    {e}
                  </button>
                )
              })}
              {(() => {
                const mineR = (menuFor.message_reactions || []).find((r) => r.profile_id === myId)
                const custom = mineR && !REACTIONS.includes(mineR.emoji) ? mineR.emoji : null
                return custom ? (
                  <button type="button" onClick={() => react(menuFor, custom)} aria-label={`Remove ${custom}`} className="w-10 h-10 rounded-full text-2xl flex items-center justify-center bg-blue-100 cursor-pointer">{custom}</button>
                ) : null
              })()}
              <button type="button" onClick={() => setPicking(true)} aria-label="Pick Any Emoji" className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 text-xl font-bold flex items-center justify-center cursor-pointer">
                +
              </button>
            </div>
            {picking && (
              <div className="mx-auto w-fit bg-white rounded-2xl shadow-xl px-3 py-2 flex items-center gap-2">
                <input
                  autoFocus
                  inputMode="text"
                  enterKeyHint="done"
                  aria-label="Type or pick an emoji"
                  placeholder="Tap 😀 on your keyboard"
                  onChange={(e) => {
                    const em = firstEmoji(e.target.value)
                    if (em) {
                      setPicking(false)
                      react(menuFor, em)
                    } else e.target.value = ''
                  }}
                  className="w-52 text-center text-2xl outline-none placeholder:text-sm placeholder:text-slate-400"
                />
              </div>
            )}
            <div className={`flex ${menuFor.sender_id === myId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words shadow-xl ${menuFor.sender_id === myId ? 'bg-[#1746b8] text-white' : 'bg-white text-slate-900'}`}>
                {menuFor.body || (menuFor.attachment ? ({ image: '📷 Photo', video: '🎬 Video', gif: 'GIF', file: `📎 ${menuFor.attachment.name || 'File'}` } as Record<string, string>)[menuFor.attachment.type] : '')}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-100">
              {menuFor.body && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(menuFor.body).catch(() => {})
                    setMenuFor(null)
                  }}
                  className="w-full px-4 py-3 text-left text-sm font-bold text-slate-800 cursor-pointer"
                >
                  Copy
                </button>
              )}
              {canDelete(menuFor) && (
                <button type="button" onClick={() => { const m = menuFor; setMenuFor(null); remove(m) }} className="w-full px-4 py-3 text-left text-sm font-bold text-red-600 cursor-pointer">
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {gifOpen && <GifPicker onPick={pickGif} onClose={() => setGifOpen(false)} />}
      {viewing?.attachment && (() => {
        const a = viewing.attachment
        const src = a.type === 'gif' ? a.url : a.path ? media.get(a.path) : undefined
        return (
          <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col" role="dialog" aria-modal>
            <div className="flex items-center gap-2 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
              <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><X className="w-5 h-5" /></button>
              <div className="flex-1 min-w-0 text-white text-xs font-bold truncate">{names.get(viewing.sender_id) ?? (viewing.sender_id === myId ? 'You' : '')} · {stamp(viewing.created_at)}</div>
              {src && a.type !== 'gif' && <a href={src} target="_blank" rel="noreferrer" download aria-label="Download" className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"><Download className="w-5 h-5" /></a>}
              {canDelete(viewing) && <button type="button" onClick={() => remove(viewing)} aria-label="Delete" className="w-10 h-10 rounded-full bg-white/15 text-red-300 flex items-center justify-center cursor-pointer"><Trash2 className="w-5 h-5" /></button>}
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center p-2">
              {a.type === 'video' ? (
                <video src={src} controls autoPlay playsInline className="max-w-full max-h-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="max-w-full max-h-full object-contain" />
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
