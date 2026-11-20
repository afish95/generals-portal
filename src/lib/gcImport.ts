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
