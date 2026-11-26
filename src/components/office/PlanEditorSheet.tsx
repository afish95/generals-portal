'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass } from '@/components/ui'
import SendNotification from '@/components/SendNotification'
import { notifyPlayers } from '@/lib/notify'
import {
  blockTimes,
  emptyBlock,
  emptyPlan,
  formatClock,
  parseClock,
  planSummary,
  plansEqual,
  type PlanBlock,
  type PracticePlan,
  type PracticeTemplate,
} from '@/lib/practicePlan'

export type EventDraft = { id?: number; title: string; event_date: string; start_time: string; location: string; plan: PracticePlan | null }

/** Edit a practice's plan (mode "event") or a reusable template (mode "template"). */
export default function PlanEditorSheet({
  mode,
  event,
  template,
  templates,
  onClose,
  onSaved,
}: {
  mode: 'event' | 'template'
  event?: EventDraft
  template?: PracticeTemplate | null
  templates: PracticeTemplate[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const original = mode === 'event' ? event?.plan ?? null : template?.plan ?? null
  const [plan, setPlan] = useState<PracticePlan>(() => structuredClone(original ?? emptyPlan()))
  const [name, setName] = useState(template?.name ?? '')
  const [ev, setEv] = useState<EventDraft>(() => event ?? { title: 'Team Practice', event_date: '', start_time: '3:45 PM', location: '', plan: null })
  const [saving, setSaving] = useState(false)
  const [notify, setNotify] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const start = mode === 'event' ? parseClock(ev.start_time) : null
  const { times, total } = blockTimes(plan)

  const setBlock = (i: number, patch: Partial<PlanBlock>) => setPlan((p) => ({ ...p, blocks: p.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }))
  const move = (i: number, dir: -1 | 1) =>
    setPlan((p) => {
      const t = i + dir
      if (t < 0 || t >= p.blocks.length) return p
      const blocks = [...p.blocks]
      ;[blocks[i], blocks[t]] = [blocks[t], blocks[i]]
      return { ...p, blocks }
    })

  const loadTemplate = (id: number) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    if (plan.blocks.length && !window.confirm(`Replace this plan with "${t.name}"?`)) return
    setPlan(structuredClone(t.plan))
  }

  const cleanPlan = (): PracticePlan => ({
    focus: plan.focus.trim(),
    equipment: plan.equipment.trim(),
    blocks: plan.blocks
      .filter((b) => b.title.trim())
      .map((b, i) => ({
        minutes: Math.max(1, Math.min(240, Math.round(Number(b.minutes) || 0))),
        title: b.title.trim(),
        who: b.who.trim(),
        details: b.details.trim(),
        ...(b.with_previous && i > 0 ? { with_previous: true } : {}),
      })),
  })

  const save = async () => {
    setError(null)
    const clean = cleanPlan()
    const supabase = createClient()
    setSaving(true)
    try {
      if (mode === 'template') {
        if (!name.trim()) throw new Error('Give the template a name.')
        if (template) {
          const changes: Record<string, unknown> = {}
          if (name.trim() !== template.name) changes.name = name.trim()
          if (!plansEqual(clean, template.plan)) changes.plan = clean
          if (Object.keys(changes).length) {
            const { error: e } = await supabase.from('practice_templates').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', template.id)
            if (e) throw e
          }
        } else {
          const { data: { user } } = await supabase.auth.getUser()
          const { error: e } = await supabase.from('practice_templates').insert({ name: name.trim(), plan: clean, sort_order: templates.length + 1, created_by: user?.id })
          if (e) throw e
        }
        onSaved('Template saved')
      } else {
        if (!ev.event_date) throw new Error('Pick a date.')
        const fields = {
          title: ev.title.trim() || 'Team Practice',
          event_date: ev.event_date,
          start_time: ev.start_time.trim() || null,
          location: ev.location.trim() || null,
          plan: clean,
          practice_plan: planSummary(clean, ev.start_time),
        }
        if (ev.id && event) {
          // Only write what changed
          const changes: Record<string, unknown> = {}
          if (fields.title !== event.title) changes.title = fields.title
          if (fields.event_date !== event.event_date) changes.event_date = fields.event_date
          if (fields.start_time !== (event.start_time || null)) changes.start_time = fields.start_time
          if (fields.location !== (event.location || null)) changes.location = fields.location
          if (!plansEqual(clean, event.plan) || changes.start_time !== undefined) {
            changes.plan = clean
            changes.practice_plan = fields.practice_plan
          }
          if (Object.keys(changes).length) {
            const { error: e } = await supabase.from('team_schedule').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', ev.id)
            if (e) throw e
          }
        } else {
          const { error: e } = await supabase.from('team_schedule').insert({ ...fields, event_type: 'practice', source: 'manual' })
          if (e) throw e
        }
        if (notify) {
          const when = new Date(`${fields.event_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          await notifyPlayers({ title: `${ev.id ? 'Updated: ' : ''}${fields.title}`, body: [when, fields.start_time, fields.location].filter(Boolean).join(' · '), url: '/calendar', everyone: true, kind: 'workout' })
        }
        onSaved('Practice plan saved')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const saveAsTemplate = async () => {
    if (!templateName?.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error: e } = await supabase.from('practice_templates').insert({ name: templateName.trim(), plan: cleanPlan(), sort_order: templates.length + 1, created_by: user?.id })
    if (e) setError(e.message)
    else {
      setNote(`Saved "${templateName.trim()}" as a template`)
      setTemplateName(null)
    }
  }

  return (
    <div className="fixed inset-0 lg:left-[220px] z-50 bg-[#f3f5f9] overflow-y-auto">
      <div className="max-w-xl lg:max-w-3xl mx-auto px-4 space-y-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 'calc(max(env(safe-area-inset-bottom), 12px) + 90px)' }}>
        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
          <div className="text-sm font-extrabold text-slate-900">{mode === 'template' ? (template ? 'Edit Template' : 'New Template') : ev.id ? 'Edit Practice Plan' : 'New Practice'}</div>
          <div className="w-10" />
        </div>

        <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          {mode === 'template' ? (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. Standard Practice)" className={`${inputClass} font-bold`} />
          ) : (
            <>
              <input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="Title" className={`${inputClass} font-bold`} />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-extrabold uppercase text-slate-400">
                  Date
                  <input type="date" value={ev.event_date} onChange={(e) => setEv({ ...ev, event_date: e.target.value })} className={`${inputClass} mt-1`} />
                </label>
                <label className="text-[10px] font-extrabold uppercase text-slate-400">
                  Start Time
                  <input value={ev.start_time} onChange={(e) => setEv({ ...ev, start_time: e.target.value })} placeholder="3:45 PM" className={`${inputClass} mt-1`} />
                </label>
              </div>
              <input value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} placeholder="Location" className={inputClass} />
              {templates.length > 0 && (
                <select value="" onChange={(e) => e.target.value && loadTemplate(Number(e.target.value))} className={`${inputClass} text-[#1746b8] font-bold`}>
                  <option value="">Start from a Template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({blockTimes(t.plan).total} min)</option>
                  ))}
                </select>
              )}
            </>
          )}
          <input value={plan.focus} onChange={(e) => setPlan({ ...plan, focus: e.target.value })} placeholder="Focus of the day (optional)" className={inputClass} />
          <input value={plan.equipment} onChange={(e) => setPlan({ ...plan, equipment: e.target.value })} placeholder="Equipment (optional)" className={inputClass} />
        </section>

        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Outline</div>
          <div className="text-xs font-extrabold text-indigo-700">
            {total} min{start != null && total > 0 ? ` · ${formatClock(start)}–${formatClock(start + total)}` : ''}
          </div>
        </div>

        {plan.blocks.map((b, i) => (
          <section key={i} className={`bg-white rounded-3xl border p-4 shadow-xs space-y-2 ${b.with_previous ? 'border-indigo-200 ml-4' : 'border-slate-200/90'}`}>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs font-extrabold text-indigo-700">{start != null ? formatClock(start + times[i].start) : `+${times[i].start}m`}</span>
              <input value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} placeholder="Block (e.g. Hitting rotation)" className={`${inputClass} font-bold flex-1`} />
            </div>
            <div className="grid grid-cols-[72px_1fr] gap-2">
              <label className="text-[10px] font-extrabold uppercase text-slate-400">
                Minutes
                <input inputMode="numeric" value={b.minutes || ''} onChange={(e) => setBlock(i, { minutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-[10px] font-extrabold uppercase text-slate-400">
                Who
                <input value={b.who} onChange={(e) => setBlock(i, { who: e.target.value })} placeholder="Team, Pitchers, IF…" className={`${inputClass} mt-1`} />
              </label>
            </div>
            <textarea value={b.details} onChange={(e) => setBlock(i, { details: e.target.value })} rows={2} placeholder="Details, stations, coaching points" className={inputClass} />
            <div className="flex items-center justify-between">
              {i > 0 ? (
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={!!b.with_previous} onChange={(e) => setBlock(i, { with_previous: e.target.checked })} className="w-4 h-4 accent-[#1746b8]" />
                  Same time as the block above
                </label>
              ) : (
                <span />
              )}
              <div className="flex gap-1">
                <IconBtn label="Move Up" onClick={() => move(i, -1)}><ArrowUp className="w-4 h-4" /></IconBtn>
                <IconBtn label="Move Down" onClick={() => move(i, 1)}><ArrowDown className="w-4 h-4" /></IconBtn>
                <IconBtn label="Delete Block" onClick={() => setPlan((p) => ({ ...p, blocks: p.blocks.filter((_, j) => j !== i) }))}><Trash2 className="w-4 h-4" /></IconBtn>
              </div>
            </div>
          </section>
        ))}

        <button
          type="button"
          onClick={() => setPlan((p) => ({ ...p, blocks: [...p.blocks, emptyBlock()] }))}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-extrabold text-slate-500 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add Block
        </button>

        {mode === 'event' &&
          (templateName === null ? (
            <button type="button" onClick={() => setTemplateName(ev.title)} className="w-full text-xs font-extrabold text-[#1746b8] py-2 cursor-pointer">
              Save this outline as a new template
            </button>
          ) : (
            <div className="flex gap-2">
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" className={`${inputClass} flex-1`} />
              <button type="button" onClick={saveAsTemplate} className="px-4 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold cursor-pointer">Save</button>
            </div>
          ))}

        {mode !== 'template' && <SendNotification checked={notify} onChange={setNotify} />}
        {note && <p className="text-xs font-bold text-emerald-700">{note}</p>}
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      </div>

      <div className="fixed bottom-0 inset-x-0 lg:left-[220px] px-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div className="max-w-xl lg:max-w-3xl mx-auto">
          <button type="button" onClick={save} disabled={saving} className="w-full py-3.5 rounded-2xl bg-[#1746b8] text-white text-base font-extrabold shadow-lg disabled:opacity-60 cursor-pointer">
            {saving ? 'Saving…' : mode === 'template' ? 'Save Template' : 'Save Practice Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer">
      {children}
    </button>
  )
}
