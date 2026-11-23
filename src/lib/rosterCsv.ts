// Roster export / import (CSV). Works with our own export and with the program roster spreadsheet
// (Last Name, First Name, Class, Position Tag, Position Tag - Throwing, …, Team Tag 1, Team Tag 2).

import { parseCsv } from '@/lib/gcImport'
import type { Group, Profile } from '@/lib/training'

export const POSITION_OUT: Record<string, string> = {
  pitcher: 'PO',
  two_way: '2-Way',
  hitter: 'Hitter',
  catcher: 'Catcher',
  infield: 'Infield',
  outfield: 'Outfield',
  coach: 'Coach',
}
const POSITION_IN: Record<string, string> = {
  po: 'pitcher',
  pitcher: 'pitcher',
  '2-way': 'two_way',
  '2 way': 'two_way',
  'two-way': 'two_way',
  'two way': 'two_way',
  hitter: 'hitter',
  catcher: 'catcher',
  infield: 'infield',
  outfield: 'outfield',
}

// Spreadsheet words → our tag names
const ALIASES: Record<string, string[]> = {
  'san diego': ['San Diego Trip'],
  'swing / sd ?': ['Swing', 'SD Bubble'],
  'swing/sd?': ['Swing', 'SD Bubble'],
  'var pitcher': ['Varsity Pitchers'],
  catcher: ['Catchers'],
  hitter: ['Hitters'],
}

export const EXPORT_HEADERS = ['Username', 'First Name', 'Last Name', 'Role', 'Class', 'Position', 'Email', 'Top Size', 'Bottom Size', 'Active', 'Login', 'Tags']

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function splitName(p: Profile) {
  if (p.role === 'coach' && /^coach\s+/i.test(p.full_name)) return { first: 'Coach', last: p.full_name.replace(/^coach\s+/i, '') }
  const parts = p.full_name.trim().split(/\s+/)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') }
}

export function exportCsv(people: Profile[], tagsOf: Map<string, Group[]>) {
  const rows = people.map((p) => {
    const { first, last } = splitName(p)
    return [
      p.username,
      first,
      last,
      p.role === 'coach' ? 'Coach' : 'Player',
      p.grad_year ?? '',
      p.role === 'coach' ? '' : POSITION_OUT[p.position_group || ''] || '',
      p.contact_email || '',
      p.top_size || '',
      p.bottom_size || '',
      p.is_active ? 'Yes' : 'No',
      p.has_login === false ? 'No' : 'Yes',
      (tagsOf.get(p.id) || []).map((g) => g.name).join('; '),
    ]
  })
  return [EXPORT_HEADERS, ...rows].map((r) => r.map(esc).join(',')).join('\n')
}

export type ImportPerson = {
  line: number
  username: string | null
  full_name: string
  role: 'player' | 'coach'
  grad_year: number | null | undefined
  position_group: string | undefined
  contact_email: string | undefined
  top_size: string | undefined
  bottom_size: string | undefined
  is_active: boolean | undefined
  tags: string[] | undefined // undefined = file says nothing about tags
}

/** Reads either format. Fields a file doesn't have stay undefined, so they're left alone. */
export function parseRosterCsv(text: string): { people: ImportPerson[]; warnings: string[]; tagSource: 'tags' | 'columns' | null } {
  const grid = parseCsv(text).filter((r) => r.some((c) => c.trim()))
  const warnings: string[] = []
  if (grid.length < 2) return { people: [], warnings: ['The file has no rows.'], tagSource: null }
  const head = grid[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const c = {
    username: col('username', 'user'),
    first: col('first name', 'first', 'firstname'),
    last: col('last name', 'last', 'lastname'),
    name: col('name', 'full name', 'player', 'player name'),
    role: col('role'),
    grad: col('class', 'grad year', 'grad_year', 'class of', 'graduation year'),
    pos: col('position', 'position tag', 'pos'),
    throwing: col('position tag - throwing'),
    email: col('email', 'contact email', 'e-mail'),
    top: col('top size', 'top', 'shirt size'),
    bottom: col('bottom size', 'bottom', 'pant size'),
    active: col('active', 'status'),
    tags: col('tags', 'groups'),
  }
  const teamCols = head.map((h, i) => (h.startsWith('team tag') ? i : -1)).filter((i) => i >= 0)
  const spreadsheetStyle = head.includes('position tag')
  if (c.first < 0 && c.name < 0) return { people: [], warnings: ['Couldn’t find a name column (First Name / Last Name, or Name).'], tagSource: null }
  const tagSource = c.tags >= 0 ? 'tags' : teamCols.length || spreadsheetStyle ? 'columns' : null

  const people: ImportPerson[] = []
  grid.slice(1).forEach((r, i) => {
    const get = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '')
    const first = get(c.first)
    const last = get(c.last)
    const role: 'player' | 'coach' = /coach/i.test(get(c.role)) || /^coach$/i.test(first) ? 'coach' : 'player'
    let full_name = c.name >= 0 && get(c.name) ? get(c.name) : [first, last].filter(Boolean).join(' ')
    full_name = full_name.replace(/\s+/g, ' ').trim()
    if (!full_name) return
    if (role === 'coach' && !/^coach\s/i.test(full_name) && c.role < 0) full_name = `Coach ${full_name}`

    const gradRaw = get(c.grad)
    const grad = gradRaw ? Number(gradRaw) : null
    if (gradRaw && !(Number.isInteger(grad) && (grad as number) > 2000)) warnings.push(`Line ${i + 2}: class "${gradRaw}" isn’t a year, so it was skipped.`)
    const posRaw = get(c.pos).toLowerCase()
    let position_group = posRaw ? POSITION_IN[posRaw] : undefined
    if (posRaw && posRaw !== 'coach' && !position_group) warnings.push(`Line ${i + 2}: position "${get(c.pos)}" isn’t one we know (PO, 2-Way, Hitter, Catcher, Infield, Outfield).`)
    const throwing = get(c.throwing).toLowerCase()
    if (position_group === 'hitter' && throwing === 'catcher') position_group = 'catcher'

    let tags: string[] | undefined
    if (tagSource === 'tags') {
      tags = get(c.tags).split(/[;|]/).map((t) => t.trim()).filter(Boolean)
    } else if (tagSource === 'columns') {
      const words = [...teamCols.map(get), ...(spreadsheetStyle ? [get(c.pos), get(c.throwing)] : [])].filter(Boolean)
      tags = words.flatMap((w) => {
        const key = w.toLowerCase()
        if (ALIASES[key]) return ALIASES[key]
        if (key === 'po' || key === '2-way') return [w.toUpperCase() === 'PO' ? 'PO' : '2-Way']
        if (key === 'coach') return ['Coaching Staff']
        return [w]
      })
      if (role === 'coach' && !tags.includes('Coaching Staff')) tags.push('Coaching Staff')
    }

    const act = get(c.active).toLowerCase()
    people.push({
      line: i + 2,
      username: get(c.username) || null,
      full_name,
      role,
      grad_year: c.grad < 0 || role === 'coach' ? undefined : Number.isInteger(grad) && (grad as number) > 2000 ? grad : null,
      position_group: role === 'coach' ? undefined : position_group,
      contact_email: c.email >= 0 ? get(c.email).toLowerCase() : undefined,
      top_size: c.top >= 0 ? get(c.top).toUpperCase() : undefined,
      bottom_size: c.bottom >= 0 ? get(c.bottom).toUpperCase() : undefined,
      is_active: c.active < 0 || !act ? undefined : ['yes', 'y', 'active', 'true', '1'].includes(act),
      tags: tags ? [...new Set(tags)] : undefined,
    })
  })
  return { people, warnings, tagSource }
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
