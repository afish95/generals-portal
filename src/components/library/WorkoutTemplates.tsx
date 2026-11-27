'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Layers, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import { SheetFrame } from '@/components/office/roster/shared'
import { INTENT_LABEL, INTENT_STYLE, INTENTS, type Intent } from '@/lib/programs'

export type TemplateKind = 'throwing' | 'hitting' | 'catching' | 'general'
export type WorkoutTemplate = { id: number; name: string; kind: TemplateKind; intent: Intent | null; notes: string | null; script_id: number | null; is_active: boolean }
export type TemplateItem = { id?: number; template_id?: number; position: number; label: string | null; progression_id: number }
type Opt = { id: number; name: string }

export const TEMPLATE_KINDS: { key: TemplateKind; label: string }[] = [
  { key: 'throwing', label: 'Throwing' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'catching', label: 'Catching' },
  { key: 'general', label: 'General' },
]

/** Arm Health + Gas framework (Coach, Nov 27): Activation before throwing; post-throw by intent. W2 versions when the name says W2. */
export function frameworkItems(progressions: Opt[], intent: Intent, variant: 1 | 2): TemplateItem[] {
  const find = (re: RegExp) => {
    const all = progressions.filter((p) => re.test(p.name))
    return (all.find((p) => new RegExp(`W${variant}\\b`).test(p.name)) || all[0])?.id ?? null
  }
  const pre = find(/pre.?throw activation/i)
  const post = intent === 'low' ? find(/recovery\s*\/\s*mobility/i) : intent === 'med' ? find(/scap emphasis/i) : find(/full armor/i)
  const out: TemplateItem[] = []
  if (pre) out.push({ position: 0, label: 'Pre-Throw', progression_id: pre })
  if (post) out.push({ position: 1, label: 'Post-Throw', progression_id: post })
  return out
}

/** Coach Office → Training → Workouts: reusable workouts made of progressions (e.g. Pre-Throw → Throwing → Post-Throw). Programs place these on days. */
export default function WorkoutTemplates({ progressions }: { progressions: Opt[] }) {
  const [list, setList] = useState<WorkoutTemplate[] | null>(null)
  const [items, setItems] = useState<TemplateItem[]>([])
  const [usedIn, setUsedIn] = useState<Record<number, number>>({})
  const [kind, setKind] = useState<TemplateKind | 'all'>('all')
  const [open, setOpen] = useState<WorkoutTemplate | 'new' | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('workout_templates').select('*').eq('is_active', true).order('kind').order('name'),
      sb.from('workout_template_items').select('*').order('position'),
      sb.from('program_days').select('program_id, template_id').not('template_id', 'is', null),
    ]).then(([t, i, d]) => {
      setList((t.data as WorkoutTemplate[]) || [])
      setItems((i.data as TemplateItem[]) || [])
      const m: Record<number, Set<number>> = {}
      for (const x of (d.data as { program_id: number; template_id: number }[]) || []) (m[x.template_id] ||= new Set()).add(x.program_id)
      setUsedIn(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.size])))
    })
  }, [version])

  const shown = (list || []).filter((t) => kind === 'all' || t.kind === kind)
  const progName = useMemo(() => new Map(progressions.map((p) => [p.id, p.name])), [progressions])

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen('new')} className="w-full py-3 rounded-2xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer">
        <Plus className="w-4 h-4" /> New Workout
      </button>
      <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-white border border-slate-200">
        {(['all', ...TEMPLATE_KINDS.map((k) => k.key)] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer ${kind === k ? 'bg-[#1746b8] text-white' : 'text-slate-500'}`}>
            {k === 'all' ? 'All' : TEMPLATE_KINDS.find((x) => x.key === k)!.label}
          </button>
        ))}
      </div>
      <section className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {list === null && <div className="h-24 animate-pulse" />}
        {list && shown.length === 0 && <p className="p-5 text-sm text-slate-500">No workouts yet. A workout is a stack of progressions, like Pre-Throw → Throwing → Post-Throw.</p>}
        {shown.map((t) => {
          const its = items.filter((i) => i.template_id === t.id)
          return (
            <button key={t.id} type="button" onClick={() => setOpen(t)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer">
              <span className={`w-1.5 self-stretch rounded-full ${t.intent ? INTENT_STYLE[t.intent].dot : 'bg-amber-400'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-slate-900 truncate">{t.name}</div>
                <div className="text-[11px] font-semibold text-slate-500 truncate">
                  {[TEMPLATE_KINDS.find((k) => k.key === t.kind)?.label, t.intent && `${INTENT_LABEL[t.intent]} intent`, usedIn[t.id] ? `in ${usedIn[t.id]} program${usedIn[t.id] === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
                </div>
                <div className="text-[11px] font-semibold text-slate-400 truncate">{its.length ? its.map((i) => progName.get(i.progression_id) || 'Progression').join(' → ') : t.notes || 'No progressions'}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          )
        })}
      </section>
      {open && (
        <TemplateSheet
          template={open === 'new' ? null : open}
          initialItems={open === 'new' ? [] : items.filter((i) => i.template_id === open.id)}
          progressions={progressions}
          onClose={(changed) => {
            setOpen(null)
            if (changed) setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

export function TemplateSheet({
  template,
  initialItems,
  progressions,
  defaultKind = 'throwing',
  onClose,
}: {
  template: WorkoutTemplate | null
  initialItems: TemplateItem[]
  progressions: Opt[]
  defaultKind?: TemplateKind
  onClose: (changed: boolean, id?: number) => void
}) {
  const [name, setName] = useState(template?.name || '')
  const [kind, setKind] = useState<TemplateKind>(template?.kind || defaultKind)
  const [intent, setIntent] = useState<Intent | null>(template?.intent ?? null)
  const [notes, setNotes] = useState(template?.notes || '')
  const [scriptId, setScriptId] = useState<number | null>(template?.script_id ?? null)
  const [rows, setRows] = useState<TemplateItem[]>([...initialItems].sort((a, b) => a.position - b.position))
  const [scripts, setScripts] = useState<Opt[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    createClient()
      .from('bullpen_scripts')
      .select('id, title')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setScripts(((data as { id: number; title: string }[]) || []).map((s) => ({ id: s.id, name: s.title }))))
  }, [])

  const pickIntent = (it: Intent) => {
    const next = intent === it ? null : it
    setIntent(next)
    // Throwing workouts follow the framework: Activation first, post-throw by intent (keeps any middle progressions).
    if (next && kind === 'throwing') {
      const fw = frameworkItems(progressions, next, /W2\b/.test(name) ? 2 : 1)
      const pre = fw.find((f) => f.label === 'Pre-Throw')
      const post = fw.find((f) => f.label === 'Post-Throw')
      setRows((r) => {
        const middle = r.filter((x) => x.label !== 'Pre-Throw' && x.label !== 'Post-Throw')
        if (!middle.length) middle.push({ position: 0, label: 'Throwing', progression_id: 0 })
        return [...(pre ? [pre] : []), ...middle, ...(post ? [post] : [])].map((x, i) => ({ ...x, position: i }))
      })
    }
  }

  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d
      if (j < 0 || j >= r.length) return r
      const n = [...r]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n.map((x, k) => ({ ...x, position: k }))
    })

  const save = async () => {
    if (!name.trim()) return setError('Name the workout.')
    const clean = rows.filter((r) => r.progression_id)
    setBusy(true)
    setError(null)
    const sb = createClient()
    const row = { name: name.trim(), kind, intent, notes: notes.trim() || null, script_id: kind === 'throwing' ? scriptId : null }
    let id = template?.id
    if (id) {
      const { error: e } = await sb.from('workout_templates').update(row).eq('id', id)
      if (e) return (setBusy(false), setError(e.message))
    } else {
      const { data, error: e } = await sb.from('workout_templates').insert(row).select('id').single()
      if (e || !data) return (setBusy(false), setError(e?.message || 'Could not save'))
      id = data.id as number
    }
    await sb.from('workout_template_items').delete().eq('template_id', id)
    if (clean.length) {
      const { error: e } = await sb.from('workout_template_items').insert(clean.map((r, i) => ({ template_id: id, position: i, label: r.label?.trim() || null, progression_id: r.progression_id })))
      if (e) return (setBusy(false), setError(e.message))
    }
    // Push the change to upcoming days of every active assignment whose program uses this workout.
    if (template) {
      const { data: pds } = await sb.from('program_days').select('program_id').eq('template_id', id)
      const progIds = [...new Set(((pds as { program_id: number }[]) || []).map((p) => p.program_id))]
      if (progIds.length) {
        const { data: as } = await sb.from('program_assignments').select('id').in('program_id', progIds).eq('status', 'active')
        for (const a of (as as { id: number }[]) || []) await sb.rpc('refresh_program_assignment', { p_assignment: a.id })
      }
    }
    setBusy(false)
    onClose(true, id)
  }

  const remove = async () => {
    if (!template || !window.confirm(`Delete "${template.name}"? Programs using it will need a new workout on those days. Days already on players' calendars stay.`)) return
    await createClient().from('workout_templates').delete().eq('id', template.id)
    onClose(true)
  }

  return (
    <SheetFrame title={template ? template.name : 'New Workout'} subtitle="A stack of progressions, done in order" onClose={() => onClose(false)}>
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name (e.g. Throwing Day – Medium (W1))" className={inputClass} />
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100">
          {TEMPLATE_KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} className={`py-2 rounded-lg text-[11px] font-extrabold cursor-pointer ${kind === k.key ? 'bg-white text-[#1746b8] shadow-sm' : 'text-slate-500'}`}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 w-14">Intent</span>
          {INTENTS.map((it) => (
            <button key={it} type="button" onClick={() => pickIntent(it)} className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold border cursor-pointer ${intent === it ? INTENT_STYLE[it].solid + ' border-transparent' : 'bg-white text-slate-400 border-slate-200'}`}>
              {INTENT_LABEL[it]}
            </button>
          ))}
        </div>
        {kind === 'throwing' && <p className="text-[11px] text-slate-400">Picking an intent fills Activation before and the matching post-throw (Low → Recovery/Mobility, Med → Scap Emphasis, High → Full Armor). Put W2 in the name to use the week 2 versions.</p>}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
        <SectionLabel>Progressions</SectionLabel>
        {rows.length === 0 && <p className="text-xs text-slate-400">Add progressions in the order players do them.</p>}
        {rows.map((r, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-extrabold flex items-center justify-center shrink-0">{i + 1}</span>
              <input
                value={r.label || ''}
                onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))}
                placeholder="Section (e.g. Pre-Throw)"
                className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold"
              />
              <button type="button" onClick={() => move(i, -1)} className="p-1 text-slate-400 cursor-pointer" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={() => move(i, 1)} className="p-1 text-slate-400 cursor-pointer" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i).map((x, k) => ({ ...x, position: k })))} className="p-1 text-red-400 cursor-pointer" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
            </div>
            <select value={r.progression_id || ''} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, progression_id: Number(e.target.value) } : x)))} className={inputClass}>
              <option value="">Pick a progression…</option>
              {progressions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ))}
        <button type="button" onClick={() => setRows((rs) => [...rs, { position: rs.length, label: '', progression_id: 0 }])} className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-extrabold text-[#1746b8] flex items-center justify-center gap-1.5 cursor-pointer">
          <Layers className="w-4 h-4" /> Add Progression
        </button>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
        <SectionLabel>Extras</SectionLabel>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note for players (optional)" className={inputClass} />
        {kind === 'throwing' && (
          <select value={scriptId ?? ''} onChange={(e) => setScriptId(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
            <option value="">No Bullpen</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </section>

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold disabled:opacity-40 cursor-pointer">
        {busy ? 'Saving…' : 'Save Workout'}
      </button>
      {template && (
        <button type="button" onClick={remove} className="w-full py-3 rounded-xl bg-red-50 text-red-700 text-sm font-extrabold cursor-pointer">Delete Workout</button>
      )}
    </SheetFrame>
  )
}
