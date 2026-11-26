// Shared helpers for GameChanger season stats (gc_season_stats).

export type GcType = 'batting' | 'pitching' | 'fielding'
export type GcStats = Record<string, number | string | null>
export type SeasonType = 'Spring' | 'Summer' | 'JV'
export type GcLine = { id: number; player_id: string | null; player_name: string; season_year: number; season_type: SeasonType; stat_type: GcType; stats: GcStats }

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
  GP: 'Games', PA: 'Plate Appearances', AB: 'At-bats', AVG: 'Batting Average', OBP: 'On-base %', SLG: 'Slugging', OPS: 'On-base + slugging',
  H: 'Hits', '2B': 'Doubles', '3B': 'Triples', HR: 'Home Runs', RBI: 'Runs Batted In', R: 'Runs', BB: 'Walks', SO: 'Strikeouts', SB: 'Stolen Bases',
  QAB: 'Quality At-Bats', 'QAB%': 'Quality At-Bat %', 'C%': 'Contact Rate', 'BB/K': 'Walks per Strikeout', 'PS/PA': 'Pitches Seen per PA',
  '2S+3%': '3+ pitches after 2 strikes', '6+%': '6+ pitch at-bats', HHB: 'Hard-hit balls', 'LD%': 'Line Drive %', 'GB%': 'Ground Ball %', 'FB%': 'Fly Ball %',
  BABIP: 'Avg on Balls in Play', 'BA/RISP': 'Avg with runners in scoring position', '2OUTRBI': '2-out RBI',
  GS: 'Starts', IP: 'Innings Pitched', W: 'Wins', L: 'Losses', SV: 'Saves', ERA: 'Earned Run Average', WHIP: 'Walks + Hits per Inning', ER: 'Earned Runs',
  BAA: 'Opponent Batting Avg', '#P': 'Pitches', 'S%': 'Strike %', 'FPS%': 'First-Pitch Strike %', 'P/IP': 'Pitches per Inning', 'P/BF': 'Pitches per Batter',
  '<3%': 'Batters done in 3 pitches or less', 'K/BF': 'Strikeouts per Batter', 'K/BB': 'Strikeouts per Walk', 'BB/INN': 'Walks per Inning',
  '123INN': '1-2-3 innings', '0BBINN': 'Walk-free innings', 'SM%': 'Swing-and-miss %', 'WEAK%': 'Weak Contact %', 'HHB%': 'Hard Contact Allowed %',
  'GO/AO': 'Ground Outs per Air Out', FIP: 'Fielding-independent pitching',
  TC: 'Total Chances', PO: 'Putouts', A: 'Assists', E: 'Errors', FPCT: 'Fielding %', DP: 'Double Plays', INN: 'Innings Caught', PB: 'Passed Balls',
  'SB-ATT': 'Steals Allowed - Attempts', 'CS%': 'Caught Stealing %', P: 'Inn. at P', C: 'Inn. at C', '1B': 'Inn. at 1B', SS: 'Inn. at SS',
  LF: 'Inn. at LF', CF: 'Inn. at CF', RF: 'Inn. at RF', Total: 'Total Innings',
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
  const career = s._career === 1
  if (type === 'batting') return (num(s.PA) ?? 0) >= (career ? 50 : 20)
  if (type === 'pitching') return ipOuts(num(s.IP)) >= (career ? 45 : 15)
  return (num(s.TC) ?? 0) >= (career ? 25 : 10)
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
  /** Coach-entered counts win; otherwise use Early/Ahead from the stats file. Career lines use only the BF from seasons that tracked them. */
  ea: (s: GcStats, ea?: EarlyAhead) => {
    const early = ea?.early ?? num(s.Early)
    const ahead = ea?.ahead ?? num(s.Ahead)
    if (early == null || ahead == null) return null
    const bf = num(s._eaBF) ?? num(s.BF)
    return bf ? (100 * (early + ahead)) / bf : null
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
      { key: 'AVG', label: 'Batting Average', type: 'batting', format: 'avg', value: stat('AVG') },
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
      { key: 'PS/PA', label: 'Pitches Seen / PA', type: 'batting', format: 'dec2', value: stat('PS/PA') },
    ],
  },
  {
    group: 'Contact Quality',
    metrics: [
      { key: 'HH%', label: 'Hard-hit %', type: 'batting', format: 'pct', value: (s) => ratio(num(s.HHB), (num(s.AB) ?? 0) - (num(s.SO) ?? 0)) },
      { key: 'LD%', label: 'Line Drive %', type: 'batting', format: 'pct', value: stat('LD%') },
      { key: 'XBH', label: 'Extra-Base Hits', type: 'batting', format: 'int', value: stat('XBH') },
    ],
  },
  {
    group: 'Running',
    metrics: [{ key: 'SB', label: 'Stolen Bases', type: 'batting', format: 'int', value: stat('SB') }],
  },
]

export const PITCHER_METRICS: { group: string; metrics: Metric[] }[] = [
  {
    group: 'Run Prevention',
    metrics: [
      { key: 'ERA', label: 'ERA', type: 'pitching', lowerIsBetter: true, format: 'dec2', value: stat('ERA') },
      { key: 'WHIP', label: 'WHIP', type: 'pitching', lowerIsBetter: true, format: 'dec2', value: stat('WHIP') },
      { key: 'FIP', label: 'FIP', type: 'pitching', lowerIsBetter: true, format: 'dec2', value: stat('FIP') },
      { key: 'BAA', label: 'Opponent Avg', type: 'pitching', lowerIsBetter: true, format: 'avg', value: stat('BAA') },
    ],
  },
  {
    group: 'Command',
    metrics: [
      { key: 'TS%', label: 'Total Strike %', type: 'pitching', format: 'pct', value: pitcherCalc.ts },
      { key: 'FPS%', label: 'First-Pitch Strike %', type: 'pitching', format: 'pct', value: pitcherCalc.fps },
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
      { key: 'SM%', label: 'Swing & Miss %', type: 'pitching', format: 'pct', value: stat('SM%') },
      { key: 'WEAK%', label: 'Weak Contact %', type: 'pitching', format: 'pct', value: stat('WEAK%') },
      { key: 'GB%', label: 'Ground Ball %', type: 'pitching', format: 'pct', value: stat('GB%') },
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

// ---------------------------------------------------------------------------
// All-time (career) lines: add up counting stats across seasons and recompute rates.
// Rates that can't be rebuilt from counts are averaged, weighted by PA / BF, over seasons that tracked them.
// ---------------------------------------------------------------------------
const SUMS: Record<GcType, string[]> = {
  batting: ['GP', 'PA', 'AB', 'H', '1B', '2B', '3B', 'HR', 'RBI', 'R', 'BB', 'SO', 'K-L', 'HBP', 'SAC', 'SF', 'ROE', 'FC', 'SB', 'CS', 'PIK', 'QAB', 'HHB', 'LOB', '2OUTRBI', 'XBH', 'TB', 'PS', '2S+3', '6+', 'GIDP'],
  pitching: ['GP', 'GS', 'BF', '#P', 'W', 'L', 'SV', 'SVO', 'BS', 'H', 'R', 'ER', 'BB', 'SO', 'K-L', 'HBP', 'WP', 'BK', 'HR', 'LOO', '123INN', '0BBINN', '<13', 'Early', 'Ahead'],
  fielding: ['TC', 'A', 'PO', 'E', 'DP', 'TP', 'PB', 'SB', 'CS', 'PIK', 'CI', 'INN', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SF', 'Total'],
}
const WEIGHTED: Record<GcType, string[]> = {
  batting: ['LD%', 'FB%', 'GB%', 'BABIP', 'BA/RISP'],
  pitching: ['S%', 'FPS%', '<3%', 'FPSO%', 'SM%', 'WEAK%', 'HHB%', 'LD%', 'FB%', 'GB%', 'BABIP', 'BA/RISP', 'FIP'],
  fielding: [],
}
const INNING_KEYS = new Set(['INN', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SF', 'Total'])
const outsToIp = (outs: number) => Number(`${Math.floor(outs / 3)}.${outs % 3}`)
const r3 = (x: number) => Math.round(x * 1000) / 1000
const r2 = (x: number) => Math.round(x * 100) / 100

export function careerLines(lines: GcLine[]): GcLine[] {
  const by = new Map<string, GcLine[]>()
  for (const l of lines) {
    const k = `${l.stat_type}|${l.player_name.toLowerCase()}`
    by.set(k, [...(by.get(k) || []), l])
  }
  const out: GcLine[] = []
  let id = -1
  for (const group of by.values()) {
    const type = group[0].stat_type
    const s: GcStats = { _career: 1, seasons: group.length }
    const add = (k: string, v: number | null) => {
      if (v == null) return
      s[k] = (num(s[k]) ?? 0) + v
    }
    for (const g of group) {
      for (const k of SUMS[type]) add(k, INNING_KEYS.has(k) ? ipOuts(num(g.stats[k])) : num(g.stats[k]))
      if (type === 'pitching') {
        add('_outs', ipOuts(num(g.stats.IP)))
        if (num(g.stats.Early) != null && num(g.stats.Ahead) != null) add('_eaBF', num(g.stats.BF))
      }
      const w = num(type === 'batting' ? g.stats.PA : g.stats.BF) ?? 0
      for (const k of WEIGHTED[type]) {
        const v = num(g.stats[k])
        if (v == null || !w) continue
        add(`_w${k}`, v * w)
        add(`_n${k}`, w)
      }
      for (const k of ['QAB', 'PS', 'HHB', '2S+3', '6+']) if (num(g.stats[k]) != null) add(`_pa${k}`, num(g.stats.PA))
      if (g.stats.photo) s.photo = g.stats.photo
    }
    for (const k of WEIGHTED[type]) {
      const n = num(s[`_n${k}`])
      if (n) s[k] = r2((num(s[`_w${k}`]) ?? 0) / n)
    }
    const n = (k: string) => num(s[k]) ?? 0
    if (type === 'batting') {
      if (s.TB == null) s.TB = n('1B') + 2 * n('2B') + 3 * n('3B') + 4 * n('HR')
      if (n('AB')) {
        s.AVG = r3(n('H') / n('AB'))
        s.SLG = r3(n('TB') / n('AB'))
        s['C%'] = r2((100 * (n('AB') - n('SO'))) / n('AB'))
      }
      const obpDen = n('AB') + n('BB') + n('HBP') + n('SF')
      if (obpDen) s.OBP = r3((n('H') + n('BB') + n('HBP')) / obpDen)
      if (s.OBP != null && s.SLG != null) s.OPS = r3(n('OBP') + n('SLG'))
      if (n('_paQAB')) s['QAB%'] = r2((100 * n('QAB')) / n('_paQAB'))
      if (n('_paPS')) s['PS/PA'] = r3(n('PS') / n('_paPS'))
      if (n('_pa2S+3')) s['2S+3%'] = r2((100 * n('2S+3')) / n('_pa2S+3'))
      if (n('_pa6+')) s['6+%'] = r2((100 * n('6+')) / n('_pa6+'))
      if (n('SO')) s['BB/K'] = r3(n('BB') / n('SO'))
      if (n('SB') + n('CS')) s['SB%'] = r2((100 * n('SB')) / (n('SB') + n('CS')))
    } else if (type === 'pitching') {
      const outs = n('_outs')
      const ip = outs / 3
      s.IP = outsToIp(outs)
      if (ip) {
        s.ERA = r3((7 * n('ER')) / ip)
        s.WHIP = r3((n('BB') + n('H')) / ip)
        s['BB/INN'] = r3(n('BB') / ip)
        if (n('#P')) s['P/IP'] = Math.round((10 * n('#P')) / ip) / 10
      }
      if (n('BF')) {
        s['K/BF'] = r3(n('SO') / n('BF'))
        if (n('#P')) s['P/BF'] = r3(n('#P') / n('BF'))
        const ab = n('BF') - n('BB') - n('HBP')
        if (ab > 0) s.BAA = r3(n('H') / ab)
      }
      if (n('BB')) s['K/BB'] = r3(n('SO') / n('BB'))
    } else {
      for (const k of SUMS.fielding) if (INNING_KEYS.has(k) && s[k] != null) s[k] = outsToIp(n(k))
      if (n('TC')) s.FPCT = r3((n('PO') + n('A')) / n('TC'))
    }
    for (const k of Object.keys(s)) if (k.startsWith('_w') || k.startsWith('_n') || k.startsWith('_pa')) delete s[k]
    const first = group.find((g) => g.player_id) ?? group[0]
    out.push({ id: id--, player_id: first.player_id, player_name: group[0].player_name, season_year: 0, season_type: group[0].season_type, stat_type: type, stats: s })
  }
  return out
}

/** The lines for a filter: one season, or all-time career lines for that season type. */
export function linesFor(all: GcLine[], type: SeasonType, period: 'all' | number) {
  const same = all.filter((l) => l.season_type === type)
  return period === 'all' ? careerLines(same) : same.filter((l) => l.season_year === period)
}

/** Put coach-entered Early/Ahead counts into the pitching lines (they override the file's numbers). */
export function applyEarlyAhead(lines: GcLine[], ea: (EarlyAhead & { season_year: number; season_type: SeasonType })[]) {
  if (!ea.length) return lines
  return lines.map((l) => {
    if (l.stat_type !== 'pitching') return l
    const e = ea.find((x) => x.season_year === l.season_year && x.season_type === l.season_type && x.player_name === l.player_name)
    if (!e || (e.early == null && e.ahead == null)) return l
    return { ...l, stats: { ...l.stats, Early: e.early ?? l.stats.Early ?? null, Ahead: e.ahead ?? l.stats.Ahead ?? null } }
  })
}
