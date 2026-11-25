'use client'

import { useMemo, useState } from 'react'
import { Download, FileUp, GraduationCap, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { callApi } from '@/lib/api'
import { SectionLabel } from '@/components/ui'
import type { Group, Profile } from '@/lib/training'
import { EXPORT_HEADERS, POSITION_OUT, downloadText, exportCsv, parseRosterCsv, type ImportPerson } from '@/lib/rosterCsv'
import { catOf, type Member } from './shared'

type Change = { label: string }
type PlanRow = {
  row: ImportPerson
  person: Profile | null
  changes: Change[]
  patch: Record<string, unknown>
  addTags: string[]
  removeTags: string[]
}
type Plan = {
  rows: PlanRow[]
  newTags: string[]
  owned: string[]
  missing: Profile[]
  warnings: string[]
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export default function ImportExportPanel({ people, groups, members, onChanged }: { people: Profile[]; groups: Group[]; members: Member[]; onChanged: () => void }) {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [fileName, setFileName] = useState('')
  const [deactivateMissing, setDeactivateMissing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const real = useMemo(() => people.filter((p) => !p.is_demo), [people])
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const groupByName = useMemo(() => new Map(groups.map((g) => [g.name.toLowerCase(), g])), [groups])
  const tagsOf = useMemo(() => {
    const m = new Map<string, Group[]>()
    members.forEach((x) => {
      const g = groupById.get(x.group_id)
      if (!g || g.name.startsWith('Demo') || catOf(g) === 'Workout' || catOf(g) === 'Focus') return
      if (!m.has(x.athlete_id)) m.set(x.athlete_id, [])
      m.get(x.athlete_id)!.push(g)
    })
    m.forEach((l) => l.sort((a, b) => a.sort_order - b.sort_order))
    return m
  }, [members, groupById])

  // ---------- Export ----------
  const doExport = () => {
    const list = real
      .filter((p) => includeInactive || p.is_active)
      .sort((a, b) => (a.role === b.role ? (a.grad_year || 0) - (b.grad_year || 0) || a.full_name.localeCompare(b.full_name) : a.role === 'player' ? -1 : 1))
    downloadText(`generals-roster-${new Date().toISOString().slice(0, 10)}.csv`, exportCsv(list, tagsOf))
  }
  const template = () =>
    downloadText(
      'generals-roster-template.csv',
      [EXPORT_HEADERS.join(','), ',Sam,Example,Player,2030,2-Way,sam@example.com,M,,Yes,No,JV2; 2-Way', ',Coach,Example,Coach,,,,,,Yes,No,JV2'].join('\n')
    )

  // ---------- Graduate a class ----------
  const classes = [...new Set(real.filter((p) => p.role === 'player' && p.is_active && p.grad_year).map((p) => p.grad_year as number))].sort()
  const [gradYear, setGradYear] = useState<number | null>(null)
  const year = gradYear ?? classes[0] ?? null
  const seniors = real.filter((p) => p.role === 'player' && p.is_active && p.grad_year === year)
  const [offTeams, setOffTeams] = useState(true)

  const graduate = async () => {
    if (!year || !seniors.length) return
    if (!window.confirm(`Mark the Class of ${year} (${seniors.length} players) as graduated? They can’t sign in anymore, but all their stats and history are kept.${offTeams ? ' They’ll also come off teams, trips and chat channels.' : ''}`)) return
    setBusy('Graduating…')
    setError(null)
    const res = await callApi<{ errors: string[] }>('/api/players', { body: { action: 'bulk', creates: [], updates: seniors.map((p) => ({ id: p.id, is_active: false })) } })
    if (!res.ok) {
      setBusy(null)
      return setError(res.error)
    }
    if (offTeams) {
      const gids = groups.filter((g) => ['Team', 'Trip', 'Status', 'Position', 'Custom'].includes(catOf(g))).map((g) => g.id)
      await createClient().from('group_members').delete().in('athlete_id', seniors.map((p) => p.id)).in('group_id', gids)
    }
    setBusy(null)
    setResult(`Class of ${year} graduated (${seniors.length} players).${res.data.errors.length ? ' Problems: ' + res.data.errors.join('; ') : ''}`)
    onChanged()
  }

  // ---------- Import ----------
  const readFile = async (f: File) => {
    setResult(null)
    setError(null)
    setFileName(f.name)
    const text = await f.text()
    const { people: rows, warnings, tagSource } = parseRosterCsv(text)
    if (!rows.length) {
      setPlan(null)
      return setError(warnings[0] || 'No people found in that file.')
    }
    const byUser = new Map(real.map((p) => [p.username.toLowerCase(), p]))
    const byName = new Map<string, Profile[]>()
    real.forEach((p) => {
      const k = norm(p.full_name)
      byName.set(k, [...(byName.get(k) || []), p])
    })
    const byEmail = new Map<string, Profile[]>()
    real.forEach((p) => p.contact_email && byEmail.set(p.contact_email, [...(byEmail.get(p.contact_email) || []), p]))

    const owned = tagSource ? [...new Set(rows.flatMap((r) => r.tags || []).map((t) => t.toLowerCase()))] : []
    const newTags = [...new Set(rows.flatMap((r) => r.tags || []))].filter((t) => !groupByName.has(t.toLowerCase()))
    const seen = new Set<string>()
    const planRows: PlanRow[] = rows.map((row) => {
      let person: Profile | null = (row.username && byUser.get(row.username.toLowerCase())) || null
      if (!person) {
        const n = byName.get(norm(row.full_name)) || []
        if (n.length === 1) person = n[0]
      }
      if (!person && row.contact_email) {
        const e = (byEmail.get(row.contact_email) || []).filter((p) => p.role === row.role)
        if (e.length === 1) person = e[0]
      }
      if (person && seen.has(person.id)) {
        warnings.push(`Line ${row.line}: ${row.full_name} appears twice; only the first row is used.`)
        return { row, person, changes: [], patch: {}, addTags: [], removeTags: [], dup: true } as PlanRow
      }
      if (person) seen.add(person.id)

      const changes: Change[] = []
      const patch: Record<string, unknown> = {}
      if (person) {
        if (row.full_name !== person.full_name && norm(row.full_name) !== norm(person.full_name)) {
          patch.full_name = row.full_name
          changes.push({ label: `name → ${row.full_name}` })
        }
        if (row.grad_year !== undefined && row.grad_year !== person.grad_year) {
          patch.grad_year = row.grad_year
          changes.push({ label: `class ${person.grad_year ?? '—'} → ${row.grad_year ?? '—'}` })
        }
        if (row.position_group && row.position_group !== person.position_group) {
          patch.position_group = row.position_group
          changes.push({ label: `${POSITION_OUT[person.position_group || ''] || '—'} → ${POSITION_OUT[row.position_group]}` })
        }
        for (const [k, label] of [
          ['contact_email', 'email'],
          ['top_size', 'top'],
          ['bottom_size', 'bottom'],
        ] as const) {
          const v = row[k]
          if (v !== undefined && (v || null) !== (person[k] || null)) {
            patch[k] = v
            changes.push({ label: `${label} → ${v || 'blank'}` })
          }
        }
        const wantActive = row.is_active ?? true
        if (wantActive !== person.is_active) {
          patch.is_active = wantActive
          changes.push({ label: wantActive ? 'reactivate' : 'make inactive' })
        }
      }
      const current = new Set((person ? tagsOf.get(person.id) || [] : []).map((g) => g.name.toLowerCase()))
      const want = new Set((row.tags || []).map((t) => t.toLowerCase()))
      const addTags = row.tags ? row.tags.filter((t) => !current.has(t.toLowerCase())) : []
      const removeTags = row.tags ? [...current].filter((t) => owned.includes(t) && !want.has(t)).map((t) => groupByName.get(t)?.name || t) : []
      addTags.forEach((t) => changes.push({ label: `+ ${t}` }))
      removeTags.forEach((t) => changes.push({ label: `− ${t}` }))
      return { row, person, changes, patch, addTags, removeTags }
    })
    const rowsClean = planRows.filter((r) => !(r as PlanRow & { dup?: boolean }).dup)
    const missing = real.filter((p) => p.role === 'player' && p.is_active && !seen.has(p.id))
    setPlan({ rows: rowsClean, newTags, owned, missing, warnings })
    setDeactivateMissing(false)
  }

  const apply = async () => {
    if (!plan) return
    const supabase = createClient()
    setError(null)
    setBusy('Creating new tags…')
    const nameToId = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]))
    for (const t of plan.newTags) {
      const { data, error: e } = await supabase.from('team_groups').insert({ name: t, category: 'Custom', has_chat: false, sort_order: 70 }).select('id').single()
      if (e || !data) {
        setBusy(null)
        return setError(`Couldn’t create tag "${t}": ${e?.message}`)
      }
      nameToId.set(t.toLowerCase(), data.id)
    }

    setBusy('Saving people…')
    const creates = plan.rows
      .filter((r) => !r.person)
      .map((r) => ({
        key: String(r.row.line),
        full_name: r.row.full_name,
        username: r.row.username,
        role: r.row.role,
        grad_year: r.row.grad_year,
        position_group: r.row.position_group,
        contact_email: r.row.contact_email,
        top_size: r.row.top_size,
        bottom_size: r.row.bottom_size,
      }))
    const updates = [
      ...plan.rows.filter((r) => r.person && Object.keys(r.patch).length).map((r) => ({ id: r.person!.id, ...r.patch })),
      ...(deactivateMissing ? plan.missing.map((p) => ({ id: p.id, is_active: false })) : []),
    ]
    const res = await callApi<{ created: Record<string, string>; errors: string[] }>('/api/players', { body: { action: 'bulk', creates, updates } })
    if (!res.ok) {
      setBusy(null)
      return setError(res.error)
    }

    setBusy('Updating tags and channels…')
    const adds: Member[] = []
    const removes: Member[] = []
    plan.rows.forEach((r) => {
      const id = r.person?.id || res.data.created[String(r.row.line)]
      if (!id) return
      r.addTags.forEach((t) => {
        const gid = nameToId.get(t.toLowerCase())
        if (gid) adds.push({ group_id: gid, athlete_id: id })
      })
      r.removeTags.forEach((t) => {
        const gid = nameToId.get(t.toLowerCase())
        if (gid) removes.push({ group_id: gid, athlete_id: id })
      })
    })
    const errs = [...res.data.errors]
    if (adds.length) {
      const { error: e } = await supabase.from('group_members').upsert(adds, { onConflict: 'group_id,athlete_id', ignoreDuplicates: true })
      if (e) errs.push(e.message)
    }
    for (const gid of [...new Set(removes.map((m) => m.group_id))]) {
      const ids = removes.filter((m) => m.group_id === gid).map((m) => m.athlete_id)
      const { error: e } = await supabase.from('group_members').delete().eq('group_id', gid).in('athlete_id', ids)
      if (e) errs.push(e.message)
    }
    setBusy(null)
    const made = Object.keys(res.data.created).length
    setResult(
      `Done: ${made} added, ${updates.length} updated, ${adds.length + removes.length} tag changes.${errs.length ? ` Problems: ${errs.join('; ')}` : ''}`
    )
    setPlan(null)
    onChanged()
  }

  const newRows = plan?.rows.filter((r) => !r.person) || []
  const changed = plan?.rows.filter((r) => r.person && r.changes.length) || []
  const same = plan?.rows.filter((r) => r.person && !r.changes.length) || []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>Export</SectionLabel>
        <p className="text-xs font-semibold text-slate-600">Download everyone as a spreadsheet. Edit it in Excel or Google Sheets, then import it back below to update in bulk. Keep the Username column so each row matches the right person.</p>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="accent-[#1746b8]" /> Include inactive and graduated
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={doExport} className="px-4 py-2.5 rounded-xl bg-[#1746b8] text-white text-sm font-extrabold flex items-center gap-1.5 cursor-pointer">
            <Download className="w-4 h-4" /> Download roster
          </button>
          <button type="button" onClick={template} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-extrabold cursor-pointer">Blank template</button>
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3">
        <SectionLabel>New season: graduate a class</SectionLabel>
        {classes.length === 0 ? (
          <p className="text-xs font-semibold text-slate-500">No active players with a class year.</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-[#1746b8]" />
              <select value={year ?? ''} onChange={(e) => setGradYear(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold bg-white">
                {classes.map((c) => (
                  <option key={c} value={c}>Class of {c}</option>
                ))}
              </select>
              <span className="text-xs font-bold text-slate-500">{seniors.length} players</span>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={offTeams} onChange={(e) => setOffTeams(e.target.checked)} className="accent-[#1746b8]" /> Also take them off teams, trips and channels
            </label>
            <button type="button" onClick={graduate} disabled={!!busy} className="px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-extrabold disabled:opacity-50 cursor-pointer">
              Graduate Class of {year}
            </button>
            <p className="text-[11px] font-semibold text-slate-500">Graduated players can’t sign in, but their stats stay in the program history. You can reactivate anyone from Players → Show inactive.</p>
          </>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 space-y-3 lg:col-span-2">
        <SectionLabel>Import (add new players, update many at once)</SectionLabel>
        <p className="text-xs font-semibold text-slate-600">
          Upload our exported file or the program roster spreadsheet (Last Name, First Name, Class, Position Tag, Team Tag 1…). Rows match by username, then by name. New names are added without a login. You’ll see every change before anything is saved.
        </p>
        <label className="flex items-center justify-center gap-2 py-6 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-extrabold text-[#1746b8] cursor-pointer hover:bg-blue-50/50">
          <FileUp className="w-5 h-5" /> {fileName ? `Choose a different file (${fileName})` : 'Choose a CSV file'}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) readFile(f)
              e.target.value = ''
            }}
          />
        </label>

        {plan && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['New', newRows.length, 'text-emerald-700 bg-emerald-50'],
                ['Changed', changed.length, 'text-amber-800 bg-amber-50'],
                ['No change', same.length, 'text-slate-600 bg-slate-100'],
                ['Not in file', plan.missing.length, 'text-rose-700 bg-rose-50'],
              ].map(([l, n, cls]) => (
                <div key={String(l)} className={`rounded-2xl px-3 py-2 ${cls}`}>
                  <div className="text-xl font-black">{n}</div>
                  <div className="text-[11px] font-extrabold">{l}</div>
                </div>
              ))}
            </div>

            {plan.warnings.length > 0 && (
              <ul className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-[11px] font-semibold text-amber-800 space-y-0.5 max-h-32 overflow-y-auto">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {plan.newTags.length > 0 && (
              <p className="text-xs font-semibold text-slate-600">
                New tags that will be created: <b>{plan.newTags.join(', ')}</b> (you can set their type and chat later in Groups & tags).
              </p>
            )}
            {plan.owned.length > 0 && (
              <p className="text-[11px] font-semibold text-slate-500">Tags this file mentions are set to match the file for everyone in it. Tags it doesn’t mention aren’t touched.</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {newRows.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 p-3">
                  <div className="text-xs font-extrabold text-emerald-700 mb-1.5">New people</div>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {newRows.map((r) => (
                      <div key={r.row.line} className="text-sm">
                        <b className="text-slate-900">{r.row.full_name}</b>{' '}
                        <span className="text-[11px] text-slate-500">
                          {[r.row.role === 'coach' ? 'Coach' : r.row.grad_year ? `’${String(r.row.grad_year).slice(2)}` : '', r.row.position_group ? POSITION_OUT[r.row.position_group] : '', (r.row.tags || []).join(', ')].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {changed.length > 0 && (
                <div className="rounded-2xl border border-amber-200 p-3">
                  <div className="text-xs font-extrabold text-amber-800 mb-1.5">Changes</div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {changed.map((r) => (
                      <div key={r.row.line} className="text-sm">
                        <b className="text-slate-900">{r.person!.full_name}</b>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {r.changes.map((c, i) => (
                            <span key={i} className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${c.label.startsWith('−') || c.label === 'make inactive' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
                              {c.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {plan.missing.length > 0 && (
              <div className="rounded-2xl border border-rose-200 p-3 space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-extrabold text-rose-700 cursor-pointer">
                  <input type="checkbox" checked={deactivateMissing} onChange={(e) => setDeactivateMissing(e.target.checked)} className="accent-rose-600" />
                  Mark the {plan.missing.length} active players who aren’t in this file as inactive (graduated or left)
                </label>
                <p className="text-[11px] font-semibold text-slate-500">{plan.missing.map((p) => p.full_name).join(', ')}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setPlan(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-sm font-extrabold text-slate-600 cursor-pointer">Cancel</button>
              <button
                type="button"
                onClick={apply}
                disabled={!!busy || (!newRows.length && !changed.length && !deactivateMissing)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Upload className="w-4 h-4" /> {busy || `Apply ${newRows.length + changed.length + (deactivateMissing ? plan.missing.length : 0)} updates`}
              </button>
            </div>
          </div>
        )}
      </section>

      {(busy || result || error) && (
        <div className="lg:col-span-2">
          {busy && !plan && <p className="text-xs font-extrabold text-[#1746b8]">{busy}</p>}
          {result && <p className="text-sm font-extrabold text-emerald-700">{result}</p>}
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
