'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { callApi } from '@/lib/api'

type Msg = { id: number; sender_id: string; body: string; created_at: string }

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
}: {
  conversationId: number
  title: string
  subtitle: string
  myId: string
  isCoach: boolean
  names: Map<string, string>
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(150)
    const list = ((data as Msg[]) || []).reverse()
    setMessages(list)
    await supabase
      .from('message_reads')
      .upsert({ conversation_id: conversationId, profile_id: myId, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,profile_id' })
  }, [conversationId, myId])

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

  const remove = async (m: Msg) => {
    if (!window.confirm('Delete this message for everyone?')) return
    await createClient().from('messages').delete().eq('id', m.id)
    load()
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#f3f5f9] flex flex-col">
      <div className="bg-gradient-to-b from-[#1746b8] to-[#1e54d4] text-white shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Back" className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center cursor-pointer">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-base font-extrabold leading-tight truncate">{title}</div>
            <div className="text-[11px] text-blue-100/90 font-medium truncate">{subtitle}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-4 space-y-2">
          {messages.length === 0 && <p className="text-center text-xs font-semibold text-slate-400 py-10">No messages yet. Say hi.</p>}
          {messages.map((m, i) => {
            const mine = m.sender_id === myId
            const showName = !mine && (i === 0 || messages[i - 1].sender_id !== m.sender_id)
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {showName && <span className="text-[10px] font-bold text-slate-400 px-2 mb-0.5">{names.get(m.sender_id) ?? 'Teammate'}</span>}
                <button
                  type="button"
                  onClick={() => (mine || isCoach) && remove(m)}
                  className={`max-w-[80%] text-left px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    mine ? 'bg-[#1746b8] text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-900 rounded-bl-md'
                  }`}
                >
                  {m.body}
                </button>
                <span className="text-[9px] font-semibold text-slate-400 px-2 mt-0.5">{stamp(m.created_at)}</span>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 bg-white border-t border-slate-200" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-xl mx-auto px-3 py-2.5 flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
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
    </div>
  )
}
