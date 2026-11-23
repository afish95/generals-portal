// Parses a GameChanger "Export Stats" season CSV into batting and pitching rows.
// GameChanger puts batting, pitching and fielding side by side, and repeats some
// column names (GP, H, BB, SO) in each section, so we track which section each column is in.

export type ImportRow = {
  player_name: string
  stat_category: 'batting' | 'pitching'
  games: number | null
  at_bats?: number | null
  hits?: number | null
  doubles?: number | null
  triples?: number | null
  home_runs?: number | null
  rbis?: number | null
  stolen_bases?: number | null
  innings_pitched?: number | null
  pitches_thrown?: number | null
  strikes_thrown?: number | null
  strikeouts?: number | null
  walks?: number | null
  hits_allowed?: number | null
  earned_runs?: number | null
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim()))
}

const num = (v: string | undefined) => {
  if (v == null) return null
  const s = v.replace(/,/g, '').trim()
  if (!s || s === '-' || s === '—') return null
  const n = Number(s.replace('%', ''))
  return Number.isFinite(n) ? n : null
}

export function parseGameChanger(text: string): { rows: ImportRow[]; warnings: string[] } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c !== ''))
  const warnings: string[] = []
  const lower = (r: string[]) => r.map((c) => c.toLowerCase())

  const headerIdx = grid.findIndex((r) => {
    const l = lower(r)
    return (l.includes('last') && l.includes('first')) || l.includes('player') || l.includes('name')
  })
  if (headerIdx < 0) return { rows: [], warnings: ['Couldn’t find the header row (looking for First/Last or Name columns).'] }
  const header = grid[headerIdx]
  const sectionRow = headerIdx > 0 ? lower(grid[headerIdx - 1]) : []

  // Work out which section (batting / pitching / fielding) each column belongs to.
  const sections: string[] = []
  let current = 'batting'
  const hasSectionRow = sectionRow.some((c) => /batting|pitching|fielding/.test(c))
  header.forEach((h, i) => {
    if (hasSectionRow && sectionRow[i]) {
      if (sectionRow[i].includes('pitching')) current = 'pitching'
      else if (sectionRow[i].includes('fielding') || sectionRow[i].includes('catching')) current = 'fielding'
      else if (sectionRow[i].includes('batting')) current = 'batting'
    } else if (!hasSectionRow) {
      if (h.toUpperCase() === 'IP' && current === 'batting') current = 'pitching'
      if (['TC', 'PO', 'A', 'E', 'FPCT'].includes(h.toUpperCase()) && current === 'pitching') current = 'fielding'
    }
    sections.push(current)
  })
  if (!hasSectionRow) warnings.push('No Batting/Pitching label row found, so sections were guessed from column order. Check the preview.')

  const col = (name: string, section: string) => header.findIndex((h, i) => h.toUpperCase() === name.toUpperCase() && sections[i] === section)
  const any = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h.toLowerCase() === n.toLowerCase())
      if (i >= 0) return i
    }
    return -1
  }
  const iFirst = any('first')
  const iLast = any('last')
  const iName = any('name', 'player')

  const b = { gp: col('GP', 'batting'), ab: col('AB', 'batting'), h: col('H', 'batting'), d: col('2B', 'batting'), t: col('3B', 'batting'), hr: col('HR', 'batting'), rbi: col('RBI', 'batting'), sb: col('SB', 'batting') }
  const p = {
    ip: col('IP', 'pitching'),
    gp: col('GP', 'pitching'),
    np: col('#P', 'pitching'),
    ts: col('TS', 'pitching'),
    sp: col('S%', 'pitching'),
    so: col('SO', 'pitching'),
    bb: col('BB', 'pitching'),
    h: col('H', 'pitching'),
    er: col('ER', 'pitching'),
  }
  if (b.ab < 0) warnings.push('No batting AB column found.')
  if (p.ip < 0) warnings.push('No pitching IP column found.')

  const rows: ImportRow[] = []
  for (const r of grid.slice(headerIdx + 1)) {
    const name = iName >= 0 ? r[iName] : [r[iFirst], r[iLast]].filter(Boolean).join(' ')
    if (!name || /^(totals?|team|glossary)/i.test(name) || /^(totals?|team)/i.test(r[0] || '')) continue
    const ab = num(r[b.ab])
    if (b.ab >= 0 && (ab != null || num(r[b.gp]) != null)) {
      rows.push({
        player_name: name,
        stat_category: 'batting',
        games: num(r[b.gp]),
        at_bats: ab,
        hits: num(r[b.h]),
        doubles: num(r[b.d]),
        triples: num(r[b.t]),
        home_runs: num(r[b.hr]),
        rbis: num(r[b.rbi]),
        stolen_bases: num(r[b.sb]),
      })
    }
    const ip = num(r[p.ip])
    if (p.ip >= 0 && ip != null && ip > 0) {
      const pitches = num(r[p.np])
      const strikePct = num(r[p.sp])
      const strikes = num(r[p.ts]) ?? (pitches != null && strikePct != null ? Math.round((pitches * (strikePct > 1 ? strikePct / 100 : strikePct))) : null)
      rows.push({
        player_name: name,
        stat_category: 'pitching',
        games: num(r[p.gp]),
        innings_pitched: ip,
        pitches_thrown: pitches,
        strikes_thrown: strikes,
        strikeouts: num(r[p.so]),
        walks: num(r[p.bb]),
        hits_allowed: num(r[p.h]),
        earned_runs: num(r[p.er]),
      })
    }
  }
  if (!rows.length) warnings.push('No player rows found.')
  return { rows, warnings }
}

// ---------------------------------------------------------------------------
// Full season import: every GameChanger column, kept per section.
// Stored in gc_season_stats.stats as { "AVG": 0.31, "QAB%": 48.05, ... } (numbers; blanks/N/A become null).
// ---------------------------------------------------------------------------
export type GcSection = 'batting' | 'pitching' | 'fielding'
export type GcRow = { player_name: string; stat_type: GcSection; stats: Record<string, number | string | null> }

export function parseGameChangerFull(text: string): { rows: GcRow[]; warnings: string[] } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c !== ''))
  const warnings: string[] = []
  const headerIdx = grid.findIndex((r) => {
    const l = r.map((c) => c.toLowerCase())
    return l.includes('last') && l.includes('first')
  })
  if (headerIdx < 0) return { rows: [], warnings: ['Couldn’t find the header row (looking for First and Last columns).'] }
  const header = grid[headerIdx]
  const sectionRow = headerIdx > 0 ? grid[headerIdx - 1].map((c) => c.toLowerCase()) : []
  if (!sectionRow.some((c) => /batting|pitching|fielding/.test(c))) {
    return { rows: [], warnings: ['This doesn’t look like a GameChanger season export (no Batting / Pitching / Fielding row above the headers).'] }
  }
  const sections: (GcSection | null)[] = []
  let current: GcSection | null = null
  header.forEach((_, i) => {
    const s = sectionRow[i] || ''
    if (s.includes('batting')) current = 'batting'
    else if (s.includes('pitching')) current = 'pitching'
    else if (s.includes('fielding') || s.includes('catching')) current = 'fielding'
    sections.push(current)
  })
  const iNum = header.findIndex((h) => h.toLowerCase() === 'number')
  const iFirst = header.findIndex((h) => h.toLowerCase() === 'first')
  const iLast = header.findIndex((h) => h.toLowerCase() === 'last')

  const value = (v: string | undefined): number | string | null => {
    if (v == null) return null
    const t = v.trim()
    if (!t || t === '-' || t === '—' || t.toUpperCase() === 'N/A') return null
    if (/^-?\d*\.?\d+$/.test(t)) return Number(t)
    return t // e.g. "18-18" (SB-ATT)
  }
  const seen = new Set<string>()
  const rows: GcRow[] = []
  for (const r of grid.slice(headerIdx + 1)) {
    const first = r[iFirst] || ''
    const last = r[iLast] || ''
    if (/^(totals?|glossary)$/i.test((r[0] || '').trim()) || (!first && !last)) continue
    const name = [first, last].filter(Boolean).join(' ').trim()
    // GameChanger sometimes lists a player twice (a second line without a number); keep the first.
    if (seen.has(name.toLowerCase())) {
      warnings.push(`${name} appears twice; kept the first line.`)
      continue
    }
    seen.add(name.toLowerCase())
    const bySection: Record<GcSection, Record<string, number | string | null>> = { batting: {}, pitching: {}, fielding: {} }
    header.forEach((h, i) => {
      const sec = sections[i]
      if (sec && h) bySection[sec][h] = value(r[i])
    })
    const number = iNum >= 0 ? value(r[iNum]) : null
    const n = (o: Record<string, number | string | null>, k: string) => (typeof o[k] === 'number' ? (o[k] as number) : 0)
    if (n(bySection.batting, 'PA') > 0) rows.push({ player_name: name, stat_type: 'batting', stats: { number, ...bySection.batting } })
    if (n(bySection.pitching, 'BF') > 0 || n(bySection.pitching, 'IP') > 0) rows.push({ player_name: name, stat_type: 'pitching', stats: { number, ...bySection.pitching } })
    if (n(bySection.fielding, 'TC') > 0 || n(bySection.fielding, 'Total') > 0) rows.push({ player_name: name, stat_type: 'fielding', stats: { number, ...bySection.fielding } })
  }
  if (!rows.length) warnings.push('No player rows found.')
  return { rows, warnings }
}

// ---------------------------------------------------------------------------
// Program history file: one row per player per season, with columns
// Season ("2025 Summer"), Year, Last, First, Batting-…, Pitching-…, Fielding-…, Image URL.
// ---------------------------------------------------------------------------
export type SeasonType = 'Spring' | 'Summer' | 'JV' | 'Fall'
export type HistoryRow = GcRow & { season_year: number; season_type: SeasonType }

export function isProgramHistory(text: string) {
  const first = parseCsv(text.slice(0, 5000))[0] || []
  const l = first.map((c) => c.replace(/^﻿/, '').toLowerCase())
  return l.includes('season') && l.includes('year') && first.some((c) => c.startsWith('Batting-'))
}

export function parseProgramHistory(text: string): { rows: HistoryRow[]; warnings: string[] } {
  const grid = parseCsv(text.replace(/^﻿/, ''))
  const header = grid[0] || []
  const warnings: string[] = []
  const at = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const iSeason = at('season')
  const iYear = at('year')
  const iFirst = at('first')
  const iLast = at('last')
  const iPhoto = at('image url')
  const value = (v: string | undefined): number | string | null => {
    const t = (v ?? '').trim()
    if (!t || t === '-' || t === '—' || t.toUpperCase() === 'N/A') return null
    if (/^-?\d*\.?\d+$/.test(t)) return Number(t)
    return t
  }
  const PREFIX: [string, GcSection][] = [['Batting-', 'batting'], ['Pitching-', 'pitching'], ['Fielding-', 'fielding']]
  const types: Record<string, SeasonType> = { spring: 'Spring', summer: 'Summer', jv: 'JV', fall: 'Fall' }
  const seen = new Set<string>()
  const rows: HistoryRow[] = []
  for (const r of grid.slice(1)) {
    const season = (r[iSeason] || '').trim()
    if (!season) continue
    const year = Number(r[iYear]) || Number(season.slice(0, 4))
    const type = types[(season.split(/\s+/)[1] || 'spring').toLowerCase()]
    if (!year || !type) {
      warnings.push(`Skipped a row with season "${season}".`)
      continue
    }
    const name = `${(r[iFirst] || '').trim()} ${(r[iLast] || '').trim()}`.trim()
    if (!name) continue
    const key = `${year}|${type}|${name.toLowerCase()}`
    if (seen.has(key)) {
      warnings.push(`${name} appears twice in ${season}; kept the first line.`)
      continue
    }
    seen.add(key)
    const sec: Record<GcSection, Record<string, number | string | null>> = { batting: {}, pitching: {}, fielding: {} }
    header.forEach((h, i) => {
      for (const [p, s] of PREFIX) if (h.startsWith(p)) sec[s][h.slice(p.length)] = value(r[i])
    })
    let photo = iPhoto >= 0 ? (r[iPhoto] || '').trim() : ''
    if (!photo.startsWith('https://') || photo.includes('generic-profile')) photo = ''
    const n = (o: Record<string, number | string | null>, k: string) => (typeof o[k] === 'number' ? (o[k] as number) : 0)
    const active: Record<GcSection, boolean> = {
      batting: n(sec.batting, 'PA') > 0 || n(sec.batting, 'AB') > 0,
      pitching: n(sec.pitching, 'BF') > 0 || n(sec.pitching, 'IP') > 0,
      fielding: n(sec.fielding, 'TC') > 0 || n(sec.fielding, 'Total') > 0,
    }
    for (const s of ['batting', 'pitching', 'fielding'] as GcSection[]) {
      if (!active[s]) continue
      rows.push({ player_name: name, season_year: year, season_type: type, stat_type: s, stats: photo ? { ...sec[s], photo } : sec[s] })
    }
  }
  // Stats nobody had in a season weren't tracked that year: drop them instead of counting zeros.
  const groups = new Map<string, HistoryRow[]>()
  for (const r of rows) {
    const k = `${r.season_year}|${r.season_type}|${r.stat_type}`
    groups.set(k, [...(groups.get(k) || []), r])
  }
  const mix = /^(FB|CT|CB|SL|CH|OS)(S|S%|SW%|SM%)?$|^MPH/
  for (const list of groups.values()) {
    const keys = new Set(list.flatMap((r) => Object.keys(r.stats)))
    for (const k of keys) {
      if (k === 'photo') continue
      const tracked = list.some((r) => {
        const v = r.stats[k]
        return typeof v === 'number' ? v !== 0 : typeof v === 'string' && v !== '0-0'
      })
      if (!tracked) list.forEach((r) => delete r.stats[k])
    }
    for (const r of list) {
      const s = r.stats
      if (r.stat_type === 'batting' && !s.OPS && typeof s.OBP === 'number' && typeof s.SLG === 'number') s.OPS = Math.round((s.OBP + s.SLG) * 1000) / 1000
      for (const k of Object.keys(s)) if (s[k] == null || (r.stat_type === 'pitching' && mix.test(k) && !s[k])) delete s[k]
    }
  }
  if (!rows.length) warnings.push('No player rows found.')
  return { rows, warnings }
}
