'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { addDays, localDate, prettyDate } from '@/lib/training'
import { blockTimes, normalizePlan, type PracticeTemplate } from '@/lib/practicePlan'
import PlanEditorSheet, { type EventDraft } from './PlanEditorSheet'

type Practice = { id: number; title: string; event_date: string; start_time: string | null; location: string | null; plan: unknown }
type Editing = { mode: 'event'; event: EventDraft } | { mode: 'template'; template: PracticeTemplate | null } | null

export default function PracticePlansTab({ openEventId }: { openEventId?: number | null }) {
  const [practices, setPractices] = useState<Practice[] | null>(null)
  const [templates, setTemplates] = useState<PracticeTemplate[]>([])
  const [editing, setEditing] = useState<Editing>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [openedFor, setOpenedFor] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    const today = localDate()
    Promise.all([
      supabase
        .from('team_schedule')
        .select('id, title, event_date, start_time, location, plan')
        .ilike('event_type', '%practice%')
        .gte('event_date', addDays(today, -7))
        .lte('event_date', addDays(today, 60))
        .order('event_date'),
      supabase.from('practice_templates').select('id, name, plan, sort_order').order('sort_order').order('name'),
    ]).then(([p, t]) => {
      if (cancelled) return
      setPractices((p.data as Practice[]) || [])
      setTemplates(((t.data as PracticeTemplate[]) || []).map((x) => ({ ...x, plan: normalizePlan(x.plan) ?? { focus: '', equipment: '', blocks: [] } })))
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const toDraft = useCallback(
    (p: Practice): EventDraft => ({ id: p.id, title: p.title, event_date: p.event_date, start_time: p.start_time ?? '', location: p.location ?? '', plan: normalizePlan(p.plan) }),
    []
  )

  // Deep link from the Day plan's "Edit plan"
  useEffect(() => {
    if (!openEventId || !practices || openedFor === openEventId) return
    const p = practices.find((x) => x.id === openEventId)
    if (p) {
      setEditing({ mode: 'event', event: toDraft(p) })
      setOpenedFor(openEventId)
    }
  }, [openEventId, practices, openedFor, toDraft])

  const done = (msg: string) => {
    setEditing(null)
    setMessage(msg)
    setReload((n) => n + 1)
    setTimeout(() => setMessage(null), 2500)
  }

  const deleteTemplate = async (t: PracticeTemplate) => {
    if (!window.confirm(`Delete the "${t.name}" template? Practices already planned from it keep their plans.`)) return
    const { error } = await createClient().from('practice_templates').delete().eq('id', t.id)
    done(error ? error.message : 'Template deleted')
  }

  const today = localDate()

  return (
    <div className="space-y-4">
      {message && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{message}</p>}

      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Practices</div>
          <button
            type="button"
            onClick={() => setEditing({ mode: 'event', event: { title: 'Team Practice', event_date: today, start_time: '3:45 PM', location: '', plan: null } })}
            className="px-3 py-1.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add practice
          </button>
        </div>
        {practices === null ? (
          <div className="h-24 rounded-2xl bg-slate-50 animate-pulse" />
        ) : practices.length === 0 ? (
          <p className="text-xs text-slate-500">No practices on the calendar in the next 60 days.</p>
        ) : (
          <ul className="space-y-2">
            {practices.map((p) => {
              const plan = normalizePlan(p.plan)
              const has = !!plan && plan.blocks.length > 0
              return (
                <li key={p.id} className={`rounded-2xl border p-3 flex items-center gap-3 ${p.event_date === today ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                      {p.event_date === today ? 'Today' : prettyDate(p.event_date)}{p.start_time ? ` · ${p.start_time}` : ''}
                    </div>
                    <div className="text-sm font-extrabold text-slate-900 truncate">{p.title}</div>
                    <div className="text-[11px] font-semibold text-slate-500">{has ? `${plan!.blocks.length} blocks · ${blockTimes(plan!).total} min` : 'No plan yet'}</div>
                  </div>
                  {has && (
                    <a href={`/practice-print?event=${p.id}`} aria-label="Export 1-page" className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                      <FileDown className="w-4 h-4" />
                    </a>
                  )}
                  <button type="button" onClick={() => setEditing({ mode: 'event', event: toDraft(p) })} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-[#1746b8] flex items-center gap-1 cursor-pointer">
                    <Pencil className="w-3.5 h-3.5" /> {has ? 'Edit' : 'Plan'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Templates</div>
          <button type="button" onClick={() => setEditing({ mode: 'template', template: null })} className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[#1746b8] text-xs font-extrabold flex items-center gap-1 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> New template
          </button>
        </div>
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-extrabold text-slate-900 truncate">{t.name}</div>
                <div className="text-[11px] font-semibold text-slate-500">{t.plan.blocks.length} blocks · {blockTimes(t.plan).total} min</div>
              </div>
              <a href={`/practice-print?template=${t.id}`} aria-label="Export 1-page" className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                <FileDown className="w-4 h-4" />
              </a>
              <button type="button" aria-label="Delete template" onClick={() => deleteTemplate(t)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setEditing({ mode: 'template', template: t })} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-[#1746b8] flex items-center gap-1 cursor-pointer">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-500">Templates are starting points. Editing one doesn&apos;t change practices already planned from it.</p>
      </section>

      {editing?.mode === 'event' && <PlanEditorSheet mode="event" event={editing.event} templates={templates} onClose={() => setEditing(null)} onSaved={done} />}
      {editing?.mode === 'template' && <PlanEditorSheet mode="template" template={editing.template} templates={templates} onClose={() => setEditing(null)} onSaved={done} />}
    </div>
  )
}
