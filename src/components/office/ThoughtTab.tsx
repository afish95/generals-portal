'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import { addDays, localDate, prettyDate } from '@/lib/training'
import { weekStart } from '@/components/stats/WeeklyRecap'

type Thought = { id: number; week_start: string; body: string; attribution: string | null }

export default function ThoughtTab() {
  const thisWeek = weekStart(localDate())
  const [week, setWeek] = useState(thisWeek)
  const [body, setBody] = useState('')
  const [attribution, setAttribution] = useState('')
  const [history, setHistory] = useState<Thought[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('thoughts_of_week')
      .select('id, week_start, body, attribution')
      .order('week_start', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        const list = (data as Thought[]) || []
        setHistory(list)
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  // Load the selected week's thought into the editor
  useEffect(() => {
    const t = history.find((h) => h.week_start === week)
    setBody(t?.body ?? '')
    setAttribution(t?.attribution ?? '')
  }, [week, history])

  const save = async () => {
    if (!body.trim()) return setMessage('Write the thought first.')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('thoughts_of_week')
      .upsert({ week_start: week, body: body.trim(), attribution: attribution.trim() || null, created_by: user?.id }, { onConflict: 'week_start' })
    setMessage(error ? error.message : 'Saved')
    setReload((n) => n + 1)
  }

  const remove = async (t: Thought) => {
    if (!window.confirm('Delete this thought permanently?')) return
    await createClient().from('thoughts_of_week').delete().eq('id', t.id)
    setReload((n) => n + 1)
  }

  const weeks = [-1, 0, 1, 2, 3].map((n) => addDays(thisWeek, n * 7))

  return (
    <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Week of</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {weeks.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeek(w)}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap cursor-pointer ${week === w ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {w === thisWeek ? 'This Week' : prettyDate(w, { month: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} placeholder="This week’s thought for the team" className={inputClass} />
        <input value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="Who said it (optional)" className={inputClass} />
        <button type="button" onClick={save} className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold cursor-pointer">Save Thought</button>
        {message && <p className="text-xs font-bold text-emerald-700">{message}</p>}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-5 pt-4 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">History</div>
        <ul className="divide-y divide-slate-100">
          {history.map((t) => (
            <li key={t.id} className="px-5 py-3 flex items-start gap-2">
              <button type="button" onClick={() => setWeek(t.week_start)} className="flex-1 text-left cursor-pointer">
                <div className="text-[10px] font-extrabold text-[#1746b8]">Week of {prettyDate(t.week_start)}</div>
                <div className="text-sm font-semibold text-slate-800">{t.body}</div>
                {t.attribution && <div className="text-[11px] text-slate-500">— {t.attribution}</div>}
              </button>
              <button type="button" aria-label="Delete Thought" onClick={() => remove(t)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
