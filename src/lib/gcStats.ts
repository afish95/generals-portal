// Shared helpers for GameChanger season stats (gc_season_stats).

export type GcType = 'batting' | 'pitching' | 'fielding'
export type GcStats = Record<string, number | string | null>
export type GcLine = { id: number; player_id: string | null; player_name: string; season_year: number; stat_type: GcType; stats: GcStats }

export const COLS = {
  batting: {
    standard: ['GP', 'PA', 'AB', 'AVG', 'OBP', 'SLG', 'OPS', 'H', '2B', '3B', 'HR', 'RBI', 'R', 'BB', 'SO', 'SB'],
    advanced: ['QAB', 'QAB%', 'C%', 'BB/K', 'PS/PA', '2S+3%', '6+%', 'HHB', 'LD%', 'GB%', 'FB%', 'BABIP', 'BA/RISP', '2OUTRBI'],
  },
  pitching: {
    standard: ['GP', 'GS', 'IP', 'W', 'L', 'SV', 'ERA', 'WHIP', 'H', 'R', 'ER', 'BB', 'SO', 'BAA'],
    advanced: ['#P', 'S%', 'FPS%', 'P/IP', 'P/BF', '<3%', 'K/BF', 'K/BB', 'BB/INN', '123INN', '0BBINN', 'SM%', 'WEAK%', 'HHB%', 'GO/AO', 'FIP'],
  },
  fielding: {
    standard: ['TC', 'PO', 'A', 'E', 'FPCT', 'DP', 'INN', 'PB', 'SB-ATT', 'CS%'],
    advanced: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'Total'],
  },
} as const

/** Plain-English names, shown as hints for players and coaches */
export const LABELS: Record<string, string> = {
  GP: 'Games', PA: 'Plate appearances', AB: 'At-bats', AVG: 'Batting average', OBP: 'On-base %', SLG: 'Slugging', OPS: 'On-base + slugging',
  H: 'Hits', '2B': 'Doubles', '3B': 'Triples', HR: 'Home runs', RBI: 'Runs batted in', R: 'Runs', BB: 'Walks', SO: 'Strikeouts', SB: 'Stolen bases',
  QAB: 'Quality at-bats', 'QAB%': 'Quality at-bat %', 'C%': 'Contact rate', 'BB/K': 'Walks per strikeout', 'PS/PA': 'Pitches seen per PA',
  '2S+3%': '3+ pitches after 2 strikes', '6+%': '6+ pitch at-bats', HHB: 'Hard-hit balls', 'LD%': 'Line drive %', 'GB%': 'Ground ball %', 'FB%': 'Fly ball %',
  BABIP: 'Avg on balls in play', 'BA/RISP': 'Avg with runners in scoring position', '2OUTRBI': '2-out RBI',
  GS: 'Starts', IP: 'Innings pitched', W: 'Wins', L: 'Losses', SV: 'Saves', ERA: 'Earned run average', WHIP: 'Walks + hits per inning', ER: 'Earned runs',
  BAA: 'Opponent batting avg', '#P': 'Pitches', 'S%': 'Strike %', 'FPS%': 'First-pitch strike %', 'P/IP': 'Pitches per inning', 'P/BF': 'Pitches per batter',
  '<3%': 'Batters done in 3 pitches or less', 'K/BF': 'Strikeouts per batter', 'K/BB': 'Strikeouts per walk', 'BB/INN': 'Walks per inning',
  '123INN': '1-2-3 innings', '0BBINN': 'Walk-free innings', 'SM%': 'Swing-and-miss %', 'WEAK%': 'Weak contact %', 'HHB%': 'Hard contact allowed %',
  'GO/AO': 'Ground outs per air out', FIP: 'Fielding-independent pitching',
  TC: 'Total chances', PO: 'Putouts', A: 'Assists', E: 'Errors', FPCT: 'Fielding %', DP: 'Double plays', INN: 'Innings caught', PB: 'Passed balls',
  'SB-ATT': 'Steals allowed - attempts', 'CS%': 'Caught stealing %', P: 'Inn. at P', C: 'Inn. at C', '1B': 'Inn. at 1B', SS: 'Inn. at SS',
  LF: 'Inn. at LF', CF: 'Inn. at CF', RF: 'Inn. at RF', Total: 'Total innings',
}

const THREE = new Set(['AVG', 'OBP', 'SLG', 'OPS', 'BABIP', 'BA/RISP', 'BAA', 'FPCT', 'K/BF'])
const TWO = new Set(['ERA', 'WHIP', 'FIP', 'K/BB', 'BB/K', 'BB/INN', 'GO/AO', 'PS/PA', 'P/BF'])
/** Lower is better for these (for sorting and ranks) */
export const LOWER_BETTER: Record<GcType, Set<string>> = {
  batting: new Set(['SO']),
  pitching: new Set(['ERA', 'WHIP', 'FIP', 'BAA', 'BB', 'H', 'R', 'ER', 'BB/INN', 'P/IP', 'P/BF', 'HHB%', 'L']),
  fielding: new Set(['E', 'PB']),
}

export const num = (v: number | string | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function fmt(key: string, v: number | string | null | undefined): string {
  if (v == null) return '–'
  if (typeof v === 'string') return v
  if (key.endsWith('%')) return `${v % 1 === 0 ? v : v.toFixed(1)}%`
  if (THREE.has(key)) return v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, '')
  if (TWO.has(key)) return v.toFixed(2)
  return String(v)
}

/** Innings like 44.1 (= 44⅓) to outs, for qualifying and sorting */
export const ipOuts = (ip: number | null) => (ip == null ? 0 : Math.trunc(ip) * 3 + Math.round((ip % 1) * 10))

/** Enough playing time for rate stats to count on leaderboards */
export function qualifies(type: GcType, s: GcStats) {
  if (type === 'batting') return (num(s.PA) ?? 0) >= 20
  if (type === 'pitching') return ipOuts(num(s.IP)) >= 15
  return (num(s.TC) ?? 0) >= 10
}

const COUNTING = new Set(['GP', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'RBI', 'R', 'BB', 'SO', 'SB', 'QAB', 'HHB', 'XBH', 'TB', '2OUTRBI', 'GS', 'W', 'L', 'SV', '#P', '123INN', '0BBINN', 'TC', 'PO', 'A', 'DP'])
export const isCounting = (key: string) => COUNTING.has(key)

/** Rank (1 = best) and midpoint percentile of a player's value among qualified teammates */
export function rankIn(lines: GcLine[], type: GcType, key: string, playerName: string) {
  const pool = lines.filter((l) => l.stat_type === type && (isCounting(key) || qualifies(type, l.stats)) && num(l.stats[key]) != null)
  const me = pool.find((l) => l.player_name === playerName)
  if (!me) return null
  const v = num(me.stats[key])!
  const lower = LOWER_BETTER[type].has(key)
  const rank = 1 + pool.filter((l) => (lower ? num(l.stats[key])! < v : num(l.stats[key])! > v)).length
  return { rank, n: pool.length, pctl: Math.round((100 * (pool.length - rank + 0.5)) / pool.length) }
}

export function leaders(lines: GcLine[], type: GcType, key: string, top = 3) {
  const lower = LOWER_BETTER[type].has(key)
  return lines
    .filter((l) => l.stat_type === type && (isCounting(key) || qualifies(type, l.stats)) && num(l.stats[key]) != null)
    .sort((a, b) => (lower ? num(a.stats[key])! - num(b.stats[key])! : num(b.stats[key])! - num(a.stats[key])!))
    .slice(0, top)
}

// ---------------------------------------------------------------------------
// Percentile rankings and spider charts
// ---------------------------------------------------------------------------
export type EarlyAhead = { player_name: string; early: number | null; ahead: number | null }
export type Metric = {
  key: string
  label: string
  type: GcType
  lowerIsBetter?: boolean
  format: 'avg' | 'pct' | 'dec2' | 'int'
  value: (s: GcStats, ea?: EarlyAhead) => number | null
}

const ratio = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : (100 * a) / b)
const stat = (k: string) => (s: GcStats) => num(s[k])

/** Pitcher helpers. E% = Early ÷ BF, A% = Ahead ÷ BF (Early/Ahead are entered by the coach). */
export const pitcherCalc = {
  ts: (s: GcStats) => num(s['S%']),
  fps: (s: GcStats) => num(s['FPS%']),
  k: (s: GcStats) => ratio(num(s.SO), num(s.BF)),
  bb: (s: GcStats) => ratio(num(s.BB), num(s.BF)),
  kbb: (s: GcStats) => {
    const k = ratio(num(s.SO), num(s.BF))
    const b = ratio(num(s.BB), num(s.BF))
    return k == null || b == null ? null : k - b
  },
  ea: (s: GcStats, ea?: EarlyAhead) => {
    if (!ea || ea.early == null || ea.ahead == null) return null
    const bf = num(s.BF)
    return bf ? (100 * (ea.early + ea.ahead)) / bf : null
  },
  /** Coach's Pitcher Score = (FPS% + TS% + E+A% + K-BB%) ÷ 2 */
  score: (s: GcStats, ea?: EarlyAhead) => {
    const parts = [pitcherCalc.fps(s), pitcherCalc.ts(s), pitcherCalc.ea(s, ea), pitcherCalc.kbb(s)]
    return parts.some((p) => p == null) ? null : (parts as number[]).reduce((a, b) => a + b, 0) / 2
  },
}

export const HITTER_METRICS: { group: string; metrics: Metric[] }[] = [
  {
    group: 'Results',
    metrics: [
      { key: 'AVG', label: 'Batting average', type: 'batting', format: 'avg', value: stat('AVG') },
      { key: 'OBP', label: 'On-base %', type: 'batting', format: 'avg', value: stat('OBP') },
      { key: 'SLG', label: 'Slugging', type: 'batting', format: 'avg', value: stat('SLG') },
      { key: 'OPS', label: 'OPS', type: 'batting', format: 'avg', value: stat('OPS') },
      { key: 'BA/RISP', label: 'Avg w/ RISP', type: 'batting', format: 'avg', value: stat('BA/RISP') },
    ],
  },
  {
    group: 'Approach',
    metrics: [
      { key: 'K%', label: 'K %', type: 'batting', lowerIsBetter: true, format: 'pct', value: (s) => ratio(num(s.SO), num(s.PA)) },
      { key: 'BB%', label: 'BB %', type: 'batting', format: 'pct', value: (s) => ratio(num(s.BB), num(s.PA)) },
      { key: 'QAB%', label: 'Quality AB %', type: 'batting', format: 'pct', value: stat('QAB%') },
      { key: 'C%', label: 'Contact %', type: 'batting', format: 'pct', value: stat('C%') },
      { key: 'PS/PA', label: 'Pitches seen / PA', type: 'batting', format: 'dec2', value: stat('PS/PA') },
    ],
  },
  {
    group: 'Contact quality',
    metrics: [
      { key: 'HH%', label: 'Hard-hit %', type: 'batting', format: 'pct', value: (s) => ratio(num(s.HHB), (num(s.AB) ?? 0) - (num(s.SO) ?? 0)) },
      { key: 'LD%', label: 'Line drive %', type: 'batting', format: 'pct', value: stat('LD%') },
      { key: 'XBH', label: 'Extra-base hits', type: 'batting', format: 'int', value: stat('XBH') },
    ],
  },
  {
    group: 'Running',
    metrics: [{ key: 'SB', label: 'Stolen bases', type: 'batting', format: 'int', value: stat('SB') }],
  },
]

export const PITCHER_METRICS: { group: string; metrics: Metric[] }[] = [
  {
    group: 'Run prevention',
    metrics: [
      { key: 'ERA', label: 'ERA', type: 'pitching', lowerIsBetter: true, format: 'dec2', value: stat('ERA') },
      { key: 'WHIP', label: 'WHIP', type: 'pitching', lowerIsBetter: true, format: 'dec2', value: stat('WHIP') },
      { key: 'FIP', label: 'FIP', type: 'pitching', lowerIsBetter: true, format: 'dec2', value: stat('FIP') },
      { key: 'BAA', label: 'Opponent avg', type: 'pitching', lowerIsBetter: true, format: 'avg', value: stat('BAA') },
    ],
  },
  {
    group: 'Command',
    metrics: [
      { key: 'TS%', label: 'Total strike %', type: 'pitching', format: 'pct', value: pitcherCalc.ts },
      { key: 'FPS%', label: 'First-pitch strike %', type: 'pitching', format: 'pct', value: pitcherCalc.fps },
      { key: 'E+A%', label: 'Early + Ahead %', type: 'pitching', format: 'pct', value: pitcherCalc.ea },
      { key: 'BB%', label: 'BB %', type: 'pitching', lowerIsBetter: true, format: 'pct', value: pitcherCalc.bb },
      { key: 'Score', label: 'Pitcher Score', type: 'pitching', format: 'dec2', value: pitcherCalc.score },
    ],
  },
  {
    group: 'Stuff',
    metrics: [
      { key: 'K%', label: 'K %', type: 'pitching', format: 'pct', value: pitcherCalc.k },
      { key: 'K-BB%', label: 'K-BB %', type: 'pitching', format: 'pct', value: pitcherCalc.kbb },
      { key: 'SM%', label: 'Swing & miss %', type: 'pitching', format: 'pct', value: stat('SM%') },
      { key: 'WEAK%', label: 'Weak contact %', type: 'pitching', format: 'pct', value: stat('WEAK%') },
      { key: 'GB%', label: 'Ground ball %', type: 'pitching', format: 'pct', value: stat('GB%') },
    ],
  },
]

export function formatMetric(m: Metric, v: number | null) {
  if (v == null) return '–'
  if (m.format === 'avg') return v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, '')
  if (m.format === 'pct') return `${v.toFixed(1)}%`
  if (m.format === 'dec2') return v.toFixed(2)
  return String(Math.round(v))
}

/** Percentile (1–99) of a player's metric among qualified teammates (the player is always included). */
export function metricPercentile(m: Metric, lines: GcLine[], player: GcLine, eaFor: (name: string) => EarlyAhead | undefined) {
  const mine = m.value(player.stats, eaFor(player.player_name))
  if (mine == null) return { value: null, pctl: null, n: 0 }
  const pool = lines.filter((l) => l.stat_type === m.type && (l.id === player.id || qualifies(m.type, l.stats)))
  const vals = pool.map((l) => m.value(l.stats, eaFor(l.player_name))).filter((v): v is number => v != null)
  const better = vals.filter((v) => (m.lowerIsBetter ? v < mine : v > mine)).length
  const ties = vals.filter((v) => v === mine).length
  const below = vals.length - better - ties
  const pctl = vals.length <= 1 ? 50 : Math.round((100 * (below + ties / 2)) / vals.length)
  return { value: mine, pctl: Math.max(1, Math.min(99, pctl)), n: vals.length }
}

export const SPIDER: Record<'hitter' | 'pitcher', string[]> = {
  hitter: ['K%', 'BB%', 'QAB%', 'OPS', 'OBP'],
  pitcher: ['TS%', 'FPS%', 'K-BB%', 'E+A%', 'Score'],
}
export const findMetric = (kind: 'hitter' | 'pitcher', key: string) =>
  (kind === 'hitter' ? HITTER_METRICS : PITCHER_METRICS).flatMap((g) => g.metrics).find((m) => m.key === key)!
