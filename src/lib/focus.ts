// Player plans ("My plan"): focus areas, the stat behind each, goals and drills.
import { findMetric, qualifies, type EarlyAhead, type GcLine, type Metric, type SeasonType } from '@/lib/gcStats'

export type FocusDrill = { kind: 'exercise' | 'script'; id: number; name: string; freq?: string }
export type PlayerFocus = {
  id: number
  athlete_id: string
  sort_order: number
  title: string
  why: string | null
  metric_source: 'game' | 'training' | 'none'
  metric_key: string | null
  metric_label: string | null
  lower_is_better: boolean
  baseline: number | null
  goal: number | null
  target_date: string | null
  drills: FocusDrill[]
  status: 'draft' | 'published' | 'done'
  published_at: string | null
  updated_at: string
}
export type DrillOption = { kind: 'exercise' | 'script'; id: number; name: string; group: string; notes?: string | null; video_url?: string | null }
export type TrainingRow = { athlete_id: string; metric: string; value: number; sample: number }
export type EaRow = EarlyAhead & { season_year: number; season_type: SeasonType }

// ---- Which stats a focus can be tied to ----
export type MetricOption = { source: 'game' | 'training'; key: string; label: string; unit: string; lowerIsBetter: boolean; decimals: number; kind: 'pitcher' | 'hitter' }

const GAME_P = ['E+A%', 'FPS%', 'TS%', 'BB%', 'K-BB%', 'K%', 'Score', 'ERA', 'WHIP']
const GAME_H = ['K%', 'BB%', 'QAB%', 'OBP', 'OPS', 'AVG', 'C%', 'HH%']
const gameOpt = (kind: 'pitcher' | 'hitter', key: string): MetricOption => {
  const m = findMetric(kind, key)
  return {
    source: 'game',
    key: `${kind}:${key}`,
    label: `${kind === 'pitcher' ? 'Pitching' : 'Hitting'} · ${m.label}`,
    unit: m.format === 'pct' ? '%' : '',
    lowerIsBetter: !!m.lowerIsBetter,
    decimals: m.format === 'avg' ? 3 : m.format === 'dec2' ? 2 : m.format === 'pct' ? 1 : 0,
    kind,
  }
}
export const TRAINING_OPTIONS: MetricOption[] = [
  { source: 'training', key: 'mound_velo', label: 'Training · Mound velo', unit: ' mph', lowerIsBetter: false, decimals: 1, kind: 'pitcher' },
  { source: 'training', key: 'pulldown_velo', label: 'Training · Pulldown velo', unit: ' mph', lowerIsBetter: false, decimals: 1, kind: 'pitcher' },
  { source: 'training', key: 'long_toss', label: 'Training · Long toss', unit: ' ft', lowerIsBetter: false, decimals: 0, kind: 'pitcher' },
  { source: 'training', key: 'strike_pct', label: 'Training · Bullpen strike %', unit: '%', lowerIsBetter: false, decimals: 1, kind: 'pitcher' },
  { source: 'training', key: 'ahead_pct', label: 'Training · Ahead % (bullpen)', unit: '%', lowerIsBetter: false, decimals: 1, kind: 'pitcher' },
  { source: 'training', key: 'miss_in', label: 'Training · Avg. miss distance', unit: '"', lowerIsBetter: true, decimals: 1, kind: 'pitcher' },
  { source: 'training', key: 'bat_speed', label: 'Training · Bat speed', unit: ' mph', lowerIsBetter: false, decimals: 1, kind: 'hitter' },
  { source: 'training', key: 'exit_velo', label: 'Training · Exit velo', unit: ' mph', lowerIsBetter: false, decimals: 1, kind: 'hitter' },
  { source: 'training', key: 'time_to_first', label: 'Training · Home to 1st', unit: 's', lowerIsBetter: true, decimals: 2, kind: 'hitter' },
  { source: 'training', key: 'pos_velo', label: 'Training · Positional velo', unit: ' mph', lowerIsBetter: false, decimals: 1, kind: 'hitter' },
  { source: 'training', key: 'pop_time', label: 'Training · Pop time', unit: 's', lowerIsBetter: true, decimals: 2, kind: 'hitter' },
]
export const METRIC_OPTIONS: MetricOption[] = [...GAME_P.map((k) => gameOpt('pitcher', k)), ...GAME_H.map((k) => gameOpt('hitter', k)), ...TRAINING_OPTIONS]
export const optionFor = (source: string, key: string | null) => (key ? METRIC_OPTIONS.find((o) => o.source === source && o.key === key) : undefined)

export function fmtValue(o: MetricOption | undefined, v: number | null | undefined) {
  if (v == null || !o) return '–'
  if (o.decimals === 3) return v.toFixed(3).replace(/^0/, '')
  return `${v.toFixed(o.decimals)}${o.unit}`
}

// ---- Suggestion templates: what to work on when a stat is low ----
type Template = { title: string; why: string; delta: number; drills: string[]; theme: string }
const T: Record<string, Template> = {
  'pitcher:E+A%': { title: 'Get ahead in the count', why: 'Win the first three pitches. Hitters hit much worse once you’re ahead.', delta: 8, drills: ['Ahead in the Count (2 of 3)', 'Count-Leverage & 2-Strike Putaway Script'], theme: 'count' },
  'pitcher:FPS%': { title: 'Win the first pitch', why: 'Strike one changes the whole at-bat. Attack the zone early.', delta: 8, drills: ['4-Quadrant Fastball Command Script', 'Ahead in the Count (2 of 3)'], theme: 'count' },
  'pitcher:TS%': { title: 'Throw more strikes', why: 'More strikes means shorter innings and fewer free bases.', delta: 5, drills: ['Free-Form Intended Zones Tracker', 'Bullpen Strikes'], theme: 'strikes' },
  'pitcher:BB%': { title: 'Cut the walks', why: 'Free bases turn into runs. Trust your stuff in the zone.', delta: -3, drills: ['4-Quadrant Fastball Command Script', 'Free-Form Intended Zones Tracker'], theme: 'strikes' },
  'pitcher:K-BB%': { title: 'Miss more bats', why: 'Strikeouts without walks is the best sign of a dominant pitcher.', delta: 5, drills: ['East-West Tunneling & Pitch Mix Script', 'Count-Leverage & 2-Strike Putaway Script'], theme: 'stuff' },
  'hitter:K%': { title: 'Cut the strikeouts', why: 'Put the ball in play with two strikes. Shorten up and battle.', delta: -5, drills: ['Tee Work Swings', 'Exit Velo (Front Toss)'], theme: 'contact' },
  'hitter:BB%': { title: 'Earn more walks', why: 'Know the zone and make pitchers work. A walk is a win.', delta: 3, drills: [], theme: 'approach' },
  'hitter:QAB%': { title: 'More quality at-bats', why: 'Hard contact, walks, long at-bats and moving runners all count.', delta: 8, drills: ['Tee Work Swings'], theme: 'approach' },
  'hitter:OBP': { title: 'Get on base more', why: 'Every time you reach base, we have a chance to score.', delta: 0.04, drills: ['Tee Work Swings'], theme: 'approach' },
  'hitter:OPS': { title: 'Drive the ball', why: 'Hit it harder and in the air to get extra-base hits.', delta: 0.08, drills: ['Exit Velo (Tee)', 'Bat Speed'], theme: 'power' },
  mound_velo: { title: 'Add velo', why: 'More velocity gives you more margin for error in the zone.', delta: 3, drills: ['Pulldown Throws', 'Long Toss', 'Mound Velo'], theme: 'velo' },
  pulldown_velo: { title: 'Add velo', why: 'Pulldowns build the arm speed that shows up on the mound.', delta: 3, drills: ['Pulldown Throws', 'Long Toss'], theme: 'velo' },
  long_toss: { title: 'Build arm strength', why: 'A stronger arm stays healthier and throws harder.', delta: 20, drills: ['Long Toss'], theme: 'arm' },
  strike_pct: { title: 'Throw more strikes', why: 'Own the zone in bullpens so it carries into games.', delta: 5, drills: ['Free-Form Intended Zones Tracker', 'Bullpen Strikes'], theme: 'strikes' },
  ahead_pct: { title: 'Get ahead in the count', why: 'Win 2 of the first 3 pitches in your bullpens.', delta: 10, drills: ['Ahead in the Count (2 of 3)'], theme: 'count' },
  miss_in: { title: 'Tighten your command', why: 'Hit your spots. Smaller misses mean fewer mistakes over the plate.', delta: -2, drills: ['4-Quadrant Fastball Command Script', 'Free-Form Intended Zones Tracker'], theme: 'command' },
  bat_speed: { title: 'Add bat speed', why: 'Bat speed is the engine behind exit velo.', delta: 3, drills: ['Bat Speed', 'Tee Work Swings'], theme: 'power' },
  exit_velo: { title: 'Hit it harder', why: 'Harder-hit balls turn into hits more often.', delta: 4, drills: ['Exit Velo (Tee)', 'Exit Velo (Front Toss)', 'Bat Speed'], theme: 'power' },
  time_to_first: { title: 'Get faster down the line', why: 'Speed puts pressure on the defense and beats out infield hits.', delta: -0.15, drills: ['Home to 1st'], theme: 'speed' },
  pos_velo: { title: 'Add arm strength in the field', why: 'A stronger throw gets more outs.', delta: 3, drills: ['Positional Throw Velo', 'Long Toss'], theme: 'arm' },
  pop_time: { title: 'Quicker pop time', why: 'Faster exchanges and throws shut down the running game.', delta: -0.1, drills: ['Pop Time'], theme: 'speed' },
}

const TYPE_RANK: Record<SeasonType, number> = { Spring: 0, Summer: 1, JV: 2 }

/** The player's most recent game line of a type (Spring Varsity first within a year). */
export function latestLine(lines: GcLine[], playerId: string, type: 'batting' | 'pitching') {
  return lines
    .filter((l) => l.player_id === playerId && l.stat_type === type)
    .sort((a, b) => b.season_year - a.season_year || TYPE_RANK[a.season_type] - TYPE_RANK[b.season_type])[0]
}

const eaFinder = (ea: EaRow[], l: GcLine) => (name: string) => ea.find((e) => e.player_name === name && e.season_year === l.season_year && e.season_type === l.season_type)

/** Current value of the stat behind a focus. */
export function currentValue(f: { metric_source: string; metric_key: string | null }, playerId: string, lines: GcLine[], ea: EaRow[], training: TrainingRow[]) {
  if (!f.metric_key) return null
  if (f.metric_source === 'training') return training.find((r) => r.athlete_id === playerId && r.metric === f.metric_key)?.value ?? null
  const [kind, key] = f.metric_key.split(/:(.+)/)
  const m: Metric | undefined = findMetric(kind as 'pitcher' | 'hitter', key)
  if (!m) return null
  const line = latestLine(lines, playerId, m.type as 'batting' | 'pitching')
  if (!line) return null
  return m.value(line.stats, eaFinder(ea, line)(line.player_name))
}

export type Snapshot = { key: string; source: 'game' | 'training'; label: string; value: number; pctl: number; season?: string }

/** Every stat we can rank this player on, with team percentiles (game: their latest season; training: all logged). */
export function snapshot(playerId: string, position: string | null | undefined, lines: GcLine[], ea: EaRow[], training: TrainingRow[]): Snapshot[] {
  const out: Snapshot[] = []
  for (const kind of ['pitcher', 'hitter'] as const) {
    const type = kind === 'pitcher' ? 'pitching' : 'batting'
    const mine = latestLine(lines, playerId, type)
    if (!mine) continue
    const pool = lines.filter((l) => l.stat_type === type && l.season_year === mine.season_year && l.season_type === mine.season_type && (l.id === mine.id || qualifies(type, l.stats)))
    const finder = eaFinder(ea, mine)
    for (const key of kind === 'pitcher' ? GAME_P : GAME_H) {
      const m = findMetric(kind, key)
      const v = m.value(mine.stats, finder(mine.player_name))
      if (v == null) continue
      const vals = pool.map((l) => m.value(l.stats, finder(l.player_name))).filter((x): x is number => x != null)
      if (vals.length < 3) continue
      const better = vals.filter((x) => (m.lowerIsBetter ? x < v : x > v)).length
      const ties = vals.filter((x) => x === v).length
      const pctl = Math.max(1, Math.min(99, Math.round((100 * (vals.length - better - ties + ties / 2)) / vals.length)))
      out.push({ key: `${kind}:${key}`, source: 'game', label: m.label, value: v, pctl, season: `${mine.season_year}` })
    }
  }
  for (const o of TRAINING_OPTIONS) {
    if (o.key === 'pop_time' && position !== 'catcher') continue
    const mine = training.find((r) => r.athlete_id === playerId && r.metric === o.key)
    if (!mine) continue
    const vals = training.filter((r) => r.metric === o.key).map((r) => r.value)
    if (vals.length < 3) continue
    const better = vals.filter((x) => (o.lowerIsBetter ? x < mine.value : x > mine.value)).length
    const ties = vals.filter((x) => x === mine.value).length
    const pctl = Math.max(1, Math.min(99, Math.round((100 * (vals.length - better - ties + ties / 2)) / vals.length)))
    out.push({ key: o.key, source: 'training', label: o.label.replace('Training · ', ''), value: mine.value, pctl })
  }
  return out.sort((a, b) => a.pctl - b.pctl)
}

export type Suggestion = Omit<PlayerFocus, 'id' | 'athlete_id' | 'status' | 'published_at' | 'updated_at' | 'sort_order'> & { pctl: number | null }

const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

/** 2–3 suggested focus areas from the player's weakest stats; a "baseline" focus when we have no data. */
export function suggest(position: string | null | undefined, snap: Snapshot[], drills: DrillOption[], max = 3): Suggestion[] {
  const pick = (names: string[]) =>
    names
      .map((n) => drills.find((d) => d.name.toLowerCase() === n.toLowerCase()))
      .filter((d): d is DrillOption => !!d)
      .map((d) => ({ kind: d.kind, id: d.id, name: d.name, freq: d.kind === 'script' ? '1x/week' : '2x/week' }))
  const isPitcher = position === 'pitcher' || position === 'two_way'
  const isHitter = position !== 'pitcher'
  const out: Suggestion[] = []
  const themes = new Set<string>()
  for (const s of snap) {
    if (out.length >= max || s.pctl >= 50) break
    const tpl = T[s.key]
    if (!tpl || themes.has(tpl.theme)) continue
    const kind = s.source === 'game' ? s.key.split(':')[0] : TRAINING_OPTIONS.find((o) => o.key === s.key)?.kind
    if ((kind === 'pitcher' && !isPitcher) || (kind === 'hitter' && !isHitter)) continue
    const o = optionFor(s.source, s.key)!
    themes.add(tpl.theme)
    const d = o.decimals === 3 ? 3 : o.decimals
    out.push({
      title: tpl.title,
      why: `${tpl.why} You’re in the ${s.pctl}th percentile on the team for ${s.label}.`,
      metric_source: s.source,
      metric_key: s.key,
      metric_label: o.label,
      lower_is_better: o.lowerIsBetter,
      baseline: roundTo(s.value, d),
      goal: roundTo(Math.max(0, s.value + tpl.delta), d),
      target_date: null,
      drills: pick(tpl.drills),
      pctl: s.pctl,
    })
  }
  if (out.length < 2) {
    const baseline = (title: string, why: string, names: string[]): Suggestion => ({ title, why, metric_source: 'none', metric_key: null, metric_label: null, lower_is_better: false, baseline: null, goal: null, target_date: null, drills: pick(names), pctl: null })
    if (isPitcher)
      out.push(baseline('Set your pitching baseline', 'Log your mound velo and throw a tracked bullpen so we can set real goals together.', ['Mound Velo', 'Free-Form Intended Zones Tracker', 'Long Toss']))
    if (isHitter && out.length < 2)
      out.push(baseline('Set your hitting baseline', 'Log bat speed, exit velo and home to 1st so we can set real goals together.', ['Bat Speed', 'Exit Velo (Tee)', 'Home to 1st']))
  }
  return out.slice(0, max)
}

export const STATUS_LABEL: Record<PlayerFocus['status'], string> = { draft: 'Draft', published: 'Live', done: 'Done' }
