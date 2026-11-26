'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Megaphone, Send } from 'lucide-react'

const AUDIENCES = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'players', label: 'Players' },
  { key: 'parents', label: 'Parents' },
  { key: 'coaches', label: 'Coaches' },
] as const

export default function AnnouncementComposer({ onSent }: { onSent?: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]['key']>('everyone')
  const [linkUrl, setLinkUrl] = useState('')
  const [sendPush, setSendPush] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSending(true)
    setResult(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ title, body, audience, link_url: linkUrl, send_push: sendPush }),
      })
      const json = await res.json()
      if (!res.ok) {
        setResult({ ok: false, text: json.error || 'Could not send' })
      } else {
        setResult({
          ok: true,
          text: `Sent to ${json.recipients} ${json.recipients === 1 ? 'person' : 'people'}${
            sendPush ? ` · ${json.pushed} phone${json.pushed === 1 ? '' : 's'} notified` : ''
          }`,
        })
        setTitle('')
        setBody('')
        setLinkUrl('')
        onSent?.()
      }
    } catch {
      setResult({ ok: false, text: 'Network error. Try again.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
      <form onSubmit={handleSend} className="space-y-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-[#1746b8]" />
          <h2 className="text-sm font-extrabold text-slate-900">Send an Announcement</h2>
        </div>

        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-100">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAudience(a.key)}
              className={`py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                audience === a.key ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Title (e.g. Practice moved to 4:00)"
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-base font-semibold text-slate-900 placeholder:text-slate-400"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Message (optional)"
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-400"
        />
        <input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          inputMode="url"
          placeholder="Link (optional, https://…)"
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-400"
        />

        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} className="w-4 h-4" />
          Send a push notification
        </label>

        <button
          type="submit"
          disabled={sending || !title.trim()}
          className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          {sending ? 'Sending…' : 'Send'}
        </button>

        {result && (
          <p className={`text-xs font-bold ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>{result.text}</p>
        )}
      </form>
    </section>
  )
}
