'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { inputClass, SectionLabel } from '@/components/ui'
import { SheetFrame } from '@/components/office/roster/shared'
import type { Profile } from '@/lib/training'
import {
  METRIC_OPTIONS,
  STATUS_LABEL,
  currentValue,
  fmtValue,
  optionFor,
  focusKind,
  KIND_LABEL,
  snapshot,
  suggest,
  type DrillOption,
  type EaRow,
  type FocusDrill,
  type PlayerFocus,
  type Suggestion,
  type TrainingRow,
} from '@/lib/focus'
import type { GcLine } from '@/lib/gcStats'
import PlayerPhoto from '@/components/PlayerPhoto'
import KindBadge from '@/components/plan/KindBadge'
import { notifyPlayers } from '@/lib/notify'

type Draft = Omit<PlayerFocus, 'id' | 'updated_at' | 'published_at'> & { id: number | null; key: string; published_at?: string | null }

const POS: Record<string, string> = { pitcher: 'PO', two_way: '2-Way', hitter: 'Hitter', catcher: 'Catcher', infield: 'Infield', outfield: 'Outfield' }
let tmp = 0

export default function FocusPlanSheet({
  player,
  existing,
  lines,
  ea,
  training,
  drills,
  onClose,
  onSaved,
}: {
  player: Profile
  existing: PlayerFocus[]
  lines: GcLine[]
  ea: EaRow[]
  training: TrainingRow[]
  drills: DrillOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [items, setItems] = useState<Draft[]>(() => existing.map((f) => ({ ...f, key: `e${f.id}` })))
  const [removed, setRemoved] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const snap = useMemo(() => snapshot(player.id, player.position_group, lines, ea, training), [player, lines, ea, training])
  const suggestions = useMemo(() => suggest(player.position_group, snap, drills).filter((s) => !items.some((i) => i.title === s.title)), [player, snap, drills, items])

  const change = (key: string, patch: Partial<Draft>) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
    setDirty(true)
  }
  const add = (s?: Suggestion) => {
    const base: Draft = {
      id: null,
      key: `n${++tmp}`,
      athlete_id: player.id,
      sort_order: items.length,
      title: s?.title || 'New Focus',
      why: s?.why || '',
      metric_source: s?.metric_source || 'none',
      metric_key: s?.metric_key || null,
      metric_label: s?.metric_label || null,
      lower_is_better: s?.lower_is_better || false,
      baseline: s?.baseline ?? null,
      goal: s?.goal ?? null,
      target_date: null,
      drills: s?.drills || [],
      status: 'draft',
    }
    setItems((l) => [...l, base])
    setDirty(true)
  }
  const remove = (d: Draft) => {
    setItems((l) => l.filter((i) => i.key !== d.key))
    if (d.id) setRemoved((r) => [...r, d.id!])
    setDirty(true)
  }
  const move = (idx: number, dir: -1 | 1) => {
    setItems((l) => {
      const n = [...l]
      const j = idx + dir
      if (j < 0 || j >= n.length) return l
      ;[n[idx], n[j]] = [n[j], n[idx]]
      return n
    })
    setDirty(true)
  }

  const save = async (publish: boolean) => {
    const supabase = createClient()
    setBusy(true)
    setError(null)
    if (removed.length) {
      const { error: e } = await supabase.from('player_focus').delete().in('id', removed)
      if (e) {
        setBusy(false)
        return setError(e.message)
      }
    }
    const now = new Date().toISOString()
    for (const [i, d] of items.entries()) {
      const status = publish && d.status === 'draft' ? 'published' : d.status
      const row = {
        athlete_id: player.id,
        sort_order: i,
        title: d.title.trim() || 'Focus',
        why: d.why?.trim() || null,
        metric_source: d.metric_key ? d.metric_source : 'none',
        metric_key: d.metric_key,
        metric_label: d.metric_label,
        lower_is_better: d.lower_is_better,
        baseline: d.baseline,
        goal: d.goal,
        target_date: d.target_date || null,
        drills: d.drills,
        status,
        updated_at: now,
        ...(status === 'published' && d.status === 'draft' ? { published_at: now } : {}),
      }
      const { error: e } = d.id ? await supabase.from('player_focus').update(row).eq('id', d.id) : await supabase.from('player_focus').insert(row)
      if (e) {
        setBusy(false)
        return setError(e.message)
      }
    }
    const newlyLive = items.filter((d) => (publish && d.status === 'draft') || (d.status === 'published' && !existing.find((x) => x.id === d.id && x.status === 'published')))
    if (newlyLive.length) {
      await notifyPlayers({
        title: existing.some((x) => x.status === 'published') ? 'Plan updated' : 'Your plan is ready',
        body: newlyLive.map((d) => d.title).join(' · '),
        url: '/training',
        recipientIds: [player.id],
        kind: 'plan',
      })
    }
    setBusy(false)
    onSaved()
    onClose()
  }

  const close = () => {
    if (dirty && !window.confirm('Close without saving your changes?')) return
    onClose()
  }

  const drafts = items.filter((i) => i.status === 'draft').length
  const groups = [...new Set(drills.map((d) => d.group))]

  return (
    <SheetFrame title={`${player.full_name}’s plan`} subtitle={[player.grad_year ? `Class of ${player.grad_year}` : null, POS[player.position_group || '']].filter(Boolean).join(' · ')} onClose={close}>
      <section className="bg-white rounded-3xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-3">
          <PlayerPhoto id={player.id} name={player.full_name} size={56} />
          <div className="min-w-0">
            <div className="text-base font-extrabold text-slate-900 truncate">{player.full_name}</div>
            <div className="text-xs font-semibold text-slate-500">{[player.grad_year ? `Class of ${player.grad_year}` : null, POS[player.position_group || '']].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <SectionLabel>Where They Stand (Team Percentile)</SectionLabel>
        {snap.length === 0 ? (
          <p className="text-xs font-semibold text-slate-500">No game stats or training numbers yet. Start with a baseline focus so they log some.</p>
        ) : (
          <div className="space-y-2">
            {(['pitcher', 'hitter'] as const).map((k) => {
              const list = snap.filter((s) => s.kind === k)
              if (!list.length) return null
              return (
                <div key={k} className="flex items-start gap-2">
                  <span className="w-16 shrink-0 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{KIND_LABEL[k]}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((s) => (
                      <span
                        key={s.key}
                        className={`text-[11px] font-extrabold px-2 py-1 rounded-lg ${s.pctl < 34 ? 'bg-rose-50 text-rose-700' : s.pctl < 67 ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-700'}`}
                        title={s.season ? `${s.season} season` : 'Training'}
                      >
                        {s.label} {s.pctl}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="bg-blue-50 rounded-3xl border border-blue-100 p-4 space-y-2">
          <div className="text-xs font-extrabold text-[#113694] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Suggested Focus Areas
          </div>
          {suggestions.map((s) => (
            <div key={s.title} className="flex items-center gap-2 bg-white rounded-2xl px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <KindBadge kind={focusKind(s)} />
                  {s.title}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 truncate">{s.pctl != null ? `${s.metric_label?.split(' · ')[1]} · ${s.pctl}th %ile` : 'No data yet'}</div>
              </div>
              <button type="button" onClick={() => add(s)} className="px-3 py-1.5 rounded-xl bg-[#1746b8] text-white text-xs font-extrabold cursor-pointer">Add</button>
            </div>
          ))}
        </section>
      )}

      {items.map((d, idx) => {
        const o = optionFor(d.metric_source, d.metric_key)
        const now = d.metric_key ? currentValue(d, player.id, lines, ea, training) : null
        return (
          <section key={d.key} className="bg-white rounded-3xl border border-slate-200 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#1746b8] text-white text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span>
              <KindBadge kind={focusKind(d)} className="shrink-0" />
              <input value={d.title} onChange={(e) => change(d.key, { title: e.target.value })} className={`${inputClass} font-extrabold`} aria-label="Focus Title" />
              <select value={d.status} onChange={(e) => change(d.key, { status: e.target.value as Draft['status'] })} className="px-2 py-2.5 rounded-xl border border-slate-200 text-xs font-extrabold bg-white">
                {(['draft', 'published', 'done'] as const).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <textarea value={d.why || ''} onChange={(e) => change(d.key, { why: e.target.value })} rows={2} placeholder="Why this matters, in a sentence or two" className={inputClass} />

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_150px] gap-2 items-end">
              <label className="text-[11px] font-bold text-slate-500">
                Stat to Track
                <select
                  value={d.metric_key ? `${d.metric_source}|${d.metric_key}` : ''}
                  onChange={(e) => {
                    const [src, key] = e.target.value ? e.target.value.split('|') : ['none', '']
                    const opt = optionFor(src, key)
                    const cur = opt ? currentValue({ metric_source: src, metric_key: key }, player.id, lines, ea, training) : null
                    change(d.key, { metric_source: (opt ? src : 'none') as Draft['metric_source'], metric_key: opt ? key : null, metric_label: opt?.label || null, lower_is_better: opt?.lowerIsBetter || false, baseline: cur, goal: null })
                  }}
                  className={inputClass}
                >
                  <option value="">No Stat (Habit or Skill)</option>
                  {(['pitcher', 'hitter'] as const).map((k) => (
                    <optgroup key={k} label={KIND_LABEL[k]}>
                      {METRIC_OPTIONS.filter((m) => m.kind === k).map((m) => (
                        <option key={`${m.source}|${m.key}`} value={`${m.source}|${m.key}`}>
                          {m.source === 'game' ? 'Game' : 'Training'} · {m.label.split(' · ')[1]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {o && (
                <>
                  <label className="text-[11px] font-bold text-slate-500">
                    Start
                    <input type="number" step="any" value={d.baseline ?? ''} onChange={(e) => change(d.key, { baseline: e.target.value === '' ? null : Number(e.target.value) })} className={inputClass} />
                  </label>
                  <label className="text-[11px] font-bold text-slate-500">
                    Goal{o.lowerIsBetter ? ' (lower)' : ''}
                    <input type="number" step="any" value={d.goal ?? ''} onChange={(e) => change(d.key, { goal: e.target.value === '' ? null : Number(e.target.value) })} className={inputClass} />
                  </label>
                </>
              )}
              <label className="text-[11px] font-bold text-slate-500">
                Goal Date
                <input type="date" value={d.target_date || ''} onChange={(e) => change(d.key, { target_date: e.target.value || null })} className={inputClass} />
              </label>
            </div>
            {o && <p className="text-[11px] font-semibold text-slate-500">Now: <b className="text-slate-800">{fmtValue(o, now)}</b>{o.unit.trim() ? ` (${o.unit.trim()})` : ''}</p>}

            <div>
              <div className="text-[11px] font-bold text-slate-500 mb-1">Drills</div>
              <div className="space-y-1.5">
                {d.drills.map((dr, i) => (
                  <div key={`${dr.kind}-${dr.id}`} className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-bold text-slate-800 truncate">{dr.name}</span>
                    <input
                      value={dr.freq || ''}
                      onChange={(e) => change(d.key, { drills: d.drills.map((x, j) => (j === i ? { ...x, freq: e.target.value } : x)) })}
                      placeholder="2x/week"
                      className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-xs"
                    />
                    <button type="button" onClick={() => change(d.key, { drills: d.drills.filter((_, j) => j !== i) })} aria-label="Remove Drill" className="p-1.5 rounded-lg bg-slate-100 text-slate-500 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <select
                  value=""
                  onChange={(e) => {
                    const [kind, id] = e.target.value.split('|')
                    const opt = drills.find((x) => x.kind === kind && x.id === Number(id))
                    if (opt && !d.drills.some((x) => x.kind === opt.kind && x.id === opt.id))
                      change(d.key, { drills: [...d.drills, { kind: opt.kind, id: opt.id, name: opt.name, freq: '' } as FocusDrill] })
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-[#1746b8] bg-white"
                >
                  <option value="">+ Add a drill or bullpen tool</option>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {drills
                        .filter((x) => x.group === g)
                        .map((x) => (
                          <option key={`${x.kind}|${x.id}`} value={`${x.kind}|${x.id}`}>{x.name}</option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-1.5 justify-end">
              <button type="button" onClick={() => move(idx, -1)} aria-label="Move Up" className="p-2 rounded-xl bg-slate-100 text-slate-500 cursor-pointer">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => move(idx, 1)} aria-label="Move Down" className="p-2 rounded-xl bg-slate-100 text-slate-500 cursor-pointer">
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => remove(d)} className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-extrabold flex items-center gap-1 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          </section>
        )
      })}

      <button type="button" onClick={() => add()} className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-extrabold text-[#1746b8] flex items-center justify-center gap-1.5 cursor-pointer">
        <Plus className="w-4 h-4" /> Add a Focus Area
      </button>

      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      <div className="sticky bottom-4 flex gap-2 bg-[#f3f5f9]/90 backdrop-blur rounded-2xl p-1">
        <button type="button" onClick={() => save(false)} disabled={busy} className="flex-1 py-3 rounded-xl bg-white border border-slate-200 text-sm font-extrabold text-slate-700 disabled:opacity-50 cursor-pointer">
          Save
        </button>
        <button type="button" onClick={() => save(true)} disabled={busy || !items.length} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-extrabold disabled:opacity-50 cursor-pointer">
          {busy ? 'Saving…' : drafts ? `Save & publish ${drafts}` : 'Save'}
        </button>
      </div>
      <p className="text-[11px] font-semibold text-slate-500 text-center">Players only see focus areas marked Live or Done.</p>
    </SheetFrame>
  )
}
