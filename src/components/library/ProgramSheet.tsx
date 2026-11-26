'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Copy, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import { SheetFrame } from '@/components/office/roster/shared'
import type { Group } from '@/lib/training'
import { DOW_SHORT, INTENT_LABEL, INTENT_STYLE, INTENTS, type Intent, type Program, type ProgramAddon, type ProgramDay } from '@/lib/programs'
import ProgramAssign from './ProgramAssign'

type Opt = { id: number; name: string }
const blankDay = (week: number, dow: number, intent: Intent): ProgramDay => ({
  week,
  dow,
  intent,
  pre_progression_id: null,
  throw_progression_id: null,
  post_progression_id: null,
  throw_note: null,
  script_id: null,
})

/** One throwing program: a week-by-week layout of Low / Med / High days, each with pre-throw, throwing and post-throw progressions. */
export default function ProgramSheet({ program, progressions, onClose, onChanged }: { program: Program | null; progressions: Opt[]; onClose: () => void; onChanged: () => void }) {
  const isNew = !program
  const [name, setName] = useState(program?.name || '')
  const [desc, setDesc] = useState(program?.description || '')
  const [weeks, setWeeks] = useState(program?.weeks || 1)
  const [focusIntents, setFocusIntents] = useState<Intent[]>(program?.focus_intents || ['low', 'med'])
  const [days, setDays] = useState<ProgramDay[] | null>(isNew ? [] : null)
  const [addons, setAddons] = useState<ProgramAddon[]>([])
  const [scripts, setScripts] = useState<{ id: number; title: string }[]>([])
  const [focusGroups, setFocusGroups] = useState<(Group & { n: number })[]>([])
  const [week, setWeek] = useState(1)
  const [openDow, setOpenDow] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<number | null>(program?.id ?? null)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('bullpen_scripts').select('id, title').eq('is_active', true).order('sort_order'),
      sb.from('team_groups').select('*, group_members(count)').eq('category', 'Focus').order('name'),
      program ? sb.from('program_days').select('*').eq('program_id', program.id) : Promise.resolve({ data: [] }),
      program ? sb.from('program_addons').select('*').eq('program_id', program.id) : Promise.resolve({ data: [] }),
    ]).then(([s, g, d, a]) => {
      setScripts((s.data as { id: number; title: string }[]) || [])
      setFocusGroups((((g.data as (Group & { group_members: { count: number }[] })[]) || []).map((x) => ({ ...x, n: x.group_members?.[0]?.count ?? 0 }))))
      if (program) setDays((d.data as ProgramDay[]) || [])
      setAddons((a.data as ProgramAddon[]) || [])
    })
  }, [program])

  const progName = useMemo(() => new Map(progressions.map((p) => [p.id, p.name])), [progressions])
  const dayOf = (dow: number) => days?.find((d) => d.week === week && d.dow === dow) || null
  const setIntent = (dow: number, intent: Intent | null) =>
    setDays((ds) => {
      const rest = (ds || []).filter((d) => !(d.week === week && d.dow === dow))
      if (!intent) return rest
      const cur = (ds || []).find((d) => d.week === week && d.dow === dow)
      return [...rest, cur ? { ...cur, intent } : blankDay(week, dow, intent)]
    })
  const patchDay = (dow: number, p: Partial<ProgramDay>) => setDays((ds) => (ds || []).map((d) => (d.week === week && d.dow === dow ? { ...d, ...p } : d)))
  const copyWeekToAll = () => {
    if (!days) return
    const src = days.filter((d) => d.week === week)
    const out: ProgramDay[] = []
    for (let w = 1; w <= weeks; w++) out.push(...src.map((d) => ({ ...d, id: undefined, week: w })))
    setDays(out)
    setMsg(`Week ${week} copied to all ${weeks} weeks.`)
  }
  const setAddon = (groupId: number, p: Partial<ProgramAddon>) =>
    setAddons((as) => {
      const cur = as.find((a) => a.group_id === groupId) || { group_id: groupId, progression_id: null, script_id: null }
      const next = { ...cur, ...p }
      const rest = as.filter((a) => a.group_id !== groupId)
      return next.progression_id || next.script_id ? [...rest, next] : rest
    })

  const save = async () => {
    if (!name.trim()) return setError('Name the program.')
    setBusy(true)
    setError(null)
    const sb = createClient()
    const row = { name: name.trim(), description: desc.trim() || null, weeks, focus_intents: focusIntents, updated_at: new Date().toISOString() }
    let id = savedId
    if (!id) {
      const { data, error: e } = await sb.from('programs').insert(row).select('id').single()
      if (e || !data) {
        setBusy(false)
        return setError(e?.message || 'Could not save')
      }
      id = data.id as number
      setSavedId(id)
    } else {
      const { error: e } = await sb.from('programs').update(row).eq('id', id)
      if (e) {
        setBusy(false)
        return setError(e.message)
      }
    }
    const keep = (days || []).filter((d) => d.week <= weeks)
    await sb.from('program_days').delete().eq('program_id', id)
    if (keep.length) {
      const { error: e } = await sb.from('program_days').insert(keep.map(({ id: _i, ...d }) => ({ ...d, program_id: id, throw_note: d.throw_note?.trim() || null })))
      if (e) {
        setBusy(false)
        return setError(e.message)
      }
    }
    await sb.from('program_addons').delete().eq('program_id', id)
    if (addons.length) await sb.from('program_addons').insert(addons.map(({ id: _i, ...a }) => ({ ...a, program_id: id })))
    setBusy(false)
    setMsg('Saved. Use "Refresh" on an assignment to push changes to upcoming days.')
    onChanged()
  }

  const remove = async () => {
    if (!savedId || !window.confirm(`Delete "${name}"? Days already on players' calendars stay.`)) return
    await createClient().from('programs').delete().eq('id', savedId)
    onChanged()
    onClose()
  }

  const throwDays = (w: number) => (days || []).filter((d) => d.week === w).length
  const sel = (value: number | null, onChange: (v: number | null) => void, placeholder: string) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
      <option value="">{placeholder}</option>
      {progressions.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )

  return (
    <SheetFrame title={name || 'New Program'} subtitle={`${weeks} week${weeks === 1 ? '' : 's'} · ${throwDays(1)} throwing days in week 1`} onClose={onClose}>
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Program name (e.g. Winter Throwing – Phase 1)" className={inputClass} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short note (optional)" className={inputClass} />
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
          Length
          <select value={weeks} onChange={(e) => { const w = Number(e.target.value); setWeeks(w); if (week > w) setWeek(1) }} className={`${inputClass} w-auto`}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>{w} week{w === 1 ? '' : 's'}</option>
            ))}
          </select>
          <span className="font-semibold text-slate-400">{weeks === 1 ? 'Repeats every week' : 'Repeats after the last week'}</span>
        </label>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Week Layout</SectionLabel>
          {weeks > 1 && (
            <button type="button" onClick={copyWeekToAll} className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-[11px] font-extrabold text-slate-700 flex items-center gap-1 cursor-pointer">
              <Copy className="w-3 h-3" /> Copy week {week} to all
            </button>
          )}
        </div>
        {weeks > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
              <button key={w} type="button" onClick={() => setWeek(w)} className={`px-3 py-1.5 rounded-full text-xs font-extrabold shrink-0 cursor-pointer ${week === w ? 'bg-[#1746b8] text-white' : 'bg-slate-100 text-slate-600'}`}>
                Wk {w}
              </button>
            ))}
          </div>
        )}
        {days === null ? (
          <div className="h-40 rounded-2xl bg-slate-50 animate-pulse" />
        ) : (
          <div className="space-y-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
              const d = dayOf(dow)
              const open = openDow === dow && d
              return (
                <div key={dow} className={`rounded-2xl border border-slate-200 border-l-4 ${d ? INTENT_STYLE[d.intent].stripe : 'border-l-slate-200'}`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onClick={() => d && setOpenDow(open ? null : dow)} className="w-10 text-left text-sm font-extrabold text-slate-900 cursor-pointer">{DOW_SHORT[dow]}</button>
                    <div className="flex gap-1">
                      {INTENTS.map((it) => (
                        <button key={it} type="button" onClick={() => { setIntent(dow, d?.intent === it ? null : it); if (d?.intent !== it) setOpenDow(dow) }} className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer ${d?.intent === it ? INTENT_STYLE[it].solid + ' border-transparent' : 'bg-white text-slate-400 border-slate-200'}`}>
                          {INTENT_LABEL[it]}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => d && setOpenDow(open ? null : dow)} className="flex-1 min-w-0 text-right text-[11px] font-semibold text-slate-400 truncate cursor-pointer">
                      {d ? [d.pre_progression_id && 'Pre', d.throw_progression_id && 'Throw', d.post_progression_id && 'Post', d.script_id && 'Bullpen'].filter(Boolean).join(' · ') || 'Tap to set' : 'Off'}
                    </button>
                  </div>
                  {open && d && (
                    <div className="px-3 pb-3 space-y-2">
                      <label className="block text-[11px] font-bold text-slate-500">Pre-throw{sel(d.pre_progression_id, (v) => patchDay(dow, { pre_progression_id: v }), 'None')}</label>
                      <label className="block text-[11px] font-bold text-slate-500">Throwing{sel(d.throw_progression_id, (v) => patchDay(dow, { throw_progression_id: v }), 'None')}</label>
                      <input value={d.throw_note || ''} onChange={(e) => patchDay(dow, { throw_note: e.target.value })} placeholder="Throwing note (e.g. Long toss to 180 ft, 25 throws)" className={inputClass} />
                      <label className="block text-[11px] font-bold text-slate-500">Post-throw{sel(d.post_progression_id, (v) => patchDay(dow, { post_progression_id: v }), 'None')}</label>
                      <label className="block text-[11px] font-bold text-slate-500">
                        Bullpen
                        <select value={d.script_id ?? ''} onChange={(e) => patchDay(dow, { script_id: e.target.value ? Number(e.target.value) : null })} className={inputClass}>
                          <option value="">None</option>
                          {scripts.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Player Plan Work</SectionLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500">Add each player’s plan drills on</span>
          {INTENTS.map((it) => (
            <button key={it} type="button" onClick={() => setFocusIntents((f) => (f.includes(it) ? f.filter((x) => x !== it) : [...f, it]))} className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer ${focusIntents.includes(it) ? INTENT_STYLE[it].solid + ' border-transparent' : 'bg-white text-slate-400 border-slate-200'}`}>
              {INTENT_LABEL[it]}
            </button>
          ))}
        </div>
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Focus Groups</div>
          {focusGroups.length === 0 ? (
            <p className="text-xs font-semibold text-slate-400">Focus groups appear once players have published plans.</p>
          ) : (
            <div className="space-y-1.5">
              {focusGroups.map((g) => {
                const a = addons.find((x) => x.group_id === g.id)
                return (
                  <div key={g.id} className="rounded-2xl border border-violet-200 bg-violet-50/40 p-2.5 space-y-1.5">
                    <div className="text-xs font-extrabold text-violet-800">{g.name.replace('Focus · ', '')} <span className="font-semibold text-violet-500">· {g.n}</span></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {sel(a?.progression_id ?? null, (v) => setAddon(g.id, { progression_id: v }), 'No Extra Drills')}
                      <select value={a?.script_id ?? ''} onChange={(e) => setAddon(g.id, { script_id: e.target.value ? Number(e.target.value) : null })} className={inputClass}>
                        <option value="">No Bullpen</option>
                        {scripts.map((s) => (
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={busy} className="flex-1 py-3 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold disabled:opacity-40 cursor-pointer">
          {busy ? 'Saving…' : 'Save'}
        </button>
        {savedId && (
          <button type="button" onClick={async () => { if (assigning) return setAssigning(false); await save(); setAssigning(true) }} className="px-4 rounded-xl bg-emerald-600 text-white text-sm font-extrabold flex items-center gap-1.5 cursor-pointer">
            <CalendarPlus className="w-4 h-4" /> Assign
          </button>
        )}
        {savedId && (
          <button type="button" onClick={remove} aria-label="Delete Program" className="px-3 rounded-xl bg-red-50 text-red-700 cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {msg && <p className="text-xs font-extrabold text-emerald-700">{msg}</p>}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      {savedId && assigning && <ProgramAssign programId={savedId} programName={name} programWeeks={weeks} />}
      {progName.size === 0 && <p className="text-xs font-semibold text-slate-400">Build progressions first, then pick them here.</p>}
    </SheetFrame>
  )
}
