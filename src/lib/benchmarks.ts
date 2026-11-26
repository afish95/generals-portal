// Benchmark Report: high school and college benchmarks (Driveline Player Benchmark, May 2026,
// plus Generals Spring Varsity history 2009–2026 where Driveline has no HS number).
// Each level is a normal distribution (mu, sigma); a few use a log-normal (compare ln(value)).

export type Level = 'hs_under' | 'hs_upper' | 'college'
export const LEVEL_LABEL: Record<Level, string> = { hs_under: 'HS Underclass', hs_upper: 'HS Upperclass', college: 'College' }
export const LEVEL_SHORT: Record<Level, string> = { hs_under: 'HS 9–10', hs_upper: 'HS 11–12', college: 'College' }
export const NEXT: Record<Level, Level> = { hs_under: 'hs_upper', hs_upper: 'college', college: 'college' }

type Dist = { mu: number; sigma: number; n?: number; log?: boolean; source?: 'generals' | 'coach' }
export type BenchMetric = {
  key: string
  label: string
  unit: string
  decimals: number
  lowerIsBetter?: boolean
  /** Game stats only have HS (all) and College; measurables have HS 9–10, HS 11–12 and College. */
  levels: Partial<Record<Level, Dist>>
  howTo: string
  why?: string
}
export type BenchSection = { title: string; metrics: BenchMetric[] }

const hs = (d: Dist): Partial<Record<Level, Dist>> => ({ hs_under: d, hs_upper: d })

export const HITTER: BenchSection[] = [
  {
    title: 'Power',
    metrics: [
      { key: 'bat_speed', why: 'Bat speed is the engine behind power. More of it means harder contact, more time to recognize pitches, and more extra-base hits.', label: 'Bat Speed', unit: ' mph', decimals: 1, howTo: 'Log Bat Speed in your workouts.', levels: { hs_under: { mu: 61.73, sigma: 5.1793, n: 436 }, hs_upper: { mu: 65.5516, sigma: 4.3922, n: 386 }, college: { mu: 68.8342, sigma: 3.931, n: 648 } } },
      { key: 'exit_velo', why: 'The harder you hit the ball, the more often it falls for a hit. Max exit velo shows the ceiling of your power.', label: 'Max Exit Velo', unit: ' mph', decimals: 1, howTo: 'Log Exit Velo (tee or front toss).', levels: { hs_under: { mu: 92.2997, sigma: 7.2541, n: 547 }, hs_upper: { mu: 97.3477, sigma: 6.5909, n: 429 }, college: { mu: 109.0759, sigma: 4.4188, n: 1949 } } },
      { key: 'iso', why: 'ISO (SLG − AVG) measures power by itself: extra bases per at-bat. It separates hitters who single from hitters who do damage.', label: 'ISO', unit: '', decimals: 3, howTo: 'Comes from your game stats (SLG − AVG).', levels: { ...hs({ mu: -2.3498, sigma: 0.8356, n: 22732, log: true }), college: { mu: -1.7766, sigma: 0.4917, n: 10651, log: true } } },
    ],
  },
  {
    title: 'Contact',
    metrics: [
      { key: 'avg', why: 'Batting average shows how often an at-bat ends in a hit. It swings a lot over a short season, so read it next to OBP and K%.', label: 'Batting Avg', unit: '', decimals: 3, howTo: 'Comes from your game stats.', levels: { ...hs({ mu: 0.3229, sigma: 0.1072, n: 28251 }), college: { mu: 0.312, sigma: 0.0441, n: 10651 } } },
      { key: 'k_pct', why: 'A strikeout gives the defense a free out. Putting the ball in play forces them to make plays and creates chances to score.', label: 'Strikeout %', unit: '%', decimals: 1, lowerIsBetter: true, howTo: 'Comes from your game stats (SO ÷ PA).', levels: { ...hs({ mu: 17.28, sigma: 7.72, n: 207, source: 'generals' }), college: { mu: 16.475, sigma: 5.7361, n: 10651 } } },
    ],
  },
  {
    title: 'Swing Decisions',
    metrics: [
      { key: 'obp', why: 'Getting on base is the biggest driver of scoring runs. OBP counts hits, walks and hit-by-pitches.', label: 'On-base %', unit: '', decimals: 3, howTo: 'Comes from your game stats.', levels: { ...hs({ mu: 0.4457, sigma: 0.1052, n: 28394 }), college: { mu: 0.4095, sigma: 0.0472, n: 10651 } } },
      { key: 'bb_pct', why: "Walks show you control the strike zone. Hitters who don't chase get better pitches to hit.", label: 'Walk %', unit: '%', decimals: 1, howTo: 'Comes from your game stats (BB ÷ PA).', levels: { ...hs({ mu: 15.2746, sigma: 7.1397, n: 28394 }), college: { mu: 11.3834, sigma: 3.5808, n: 10651 } } },
    ],
  },
]

export const PITCHER: BenchSection[] = [
  {
    title: 'Stuff',
    metrics: [
      { key: 'fb_max', why: "Top velo shows your arm's ceiling. More velo gives hitters less time and gives you more room for error in the zone.", label: 'Max FB Velo', unit: ' mph', decimals: 1, howTo: 'Log Mound Velo or throw a bullpen with velo.', levels: { hs_under: { mu: 79.7424, sigma: 5.6492, n: 411 }, hs_upper: { mu: 83.2489, sigma: 5.3614, n: 489 }, college: { mu: 93.5215, sigma: 2.4637, n: 1664 } } },
      { key: 'fb_avg', why: 'Average velo is what hitters actually see. Holding your velo through an outing matters as much as your peak.', label: 'Avg FB Velo', unit: ' mph', decimals: 1, howTo: 'Throw bullpens with velo tracked.', levels: { hs_under: { mu: 78.41, sigma: 5.7121, n: 411 }, hs_upper: { mu: 81.835, sigma: 5.5106, n: 489 }, college: { mu: 90.3511, sigma: 2.2853, n: 1664 } } },
    ],
  },
  {
    title: 'Strikeouts',
    metrics: [
      { key: 'p_k_pct', why: 'A strikeout is the best outcome for a pitcher: no ball in play, no chance for a hit or an error.', label: 'Strikeout %', unit: '%', decimals: 1, howTo: 'Comes from your game stats (SO ÷ BF).', levels: { ...hs({ mu: 3.051, sigma: 0.4602, n: 25549, log: true }), college: { mu: 19.127, sigma: 6.011, n: 28661 } } },
    ],
  },
  {
    title: 'Command',
    metrics: [
      { key: 'p_bb_pct', why: 'Walks are free baserunners, and they score. A low BB% keeps innings short and pitch counts down.', label: 'Walk %', unit: '%', decimals: 1, lowerIsBetter: true, howTo: 'Comes from your game stats (BB ÷ BF).', levels: { ...hs({ mu: 11.78, sigma: 6.54, n: 108, source: 'generals' }), college: { mu: 9.682, sigma: 3.683, n: 28661 } } },
      { key: 'strike_pct', why: 'Strikes keep you in control of the count. Pitchers who live in the zone get ahead and stay ahead.', label: 'Strike %', unit: '%', decimals: 1, howTo: 'Comes from your game stats (S%).', levels: { ...hs({ mu: 61.13, sigma: 5.71, n: 71, source: 'generals' }), college: { mu: 61, sigma: 4, source: 'coach' } } },
    ],
  },
]

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
function phi(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

export function percentile(m: BenchMetric, level: Level, value: number | null | undefined): number | null {
  const d = m.levels[level]
  if (!d || value == null || !Number.isFinite(value)) return null
  if (d.log && value <= 0) return 1
  const x = d.log ? Math.log(value) : value
  let p = phi((x - d.mu) / d.sigma) * 100
  if (m.lowerIsBetter) p = 100 - p
  return Math.max(1, Math.min(99, Math.round(p)))
}

export function fmtBench(m: BenchMetric, v: number | null | undefined) {
  if (v == null) return '–'
  if (m.decimals === 3) return v.toFixed(3).replace(/^0/, '')
  return `${v.toFixed(m.decimals)}${m.unit}`
}

/** Level from the player's class year: grades 9–10 → HS Underclass, 11–12 → HS Upperclass, graduated → College. */
export function levelFor(gradYear: number | null | undefined, today = new Date()): Level {
  if (!gradYear) return 'hs_upper'
  const schoolYearEnd = today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear()
  const grade = 12 - (gradYear - schoolYearEnd)
  if (grade > 12) return 'college'
  return grade >= 11 ? 'hs_upper' : 'hs_under'
}

export const sourceNote = (m: BenchMetric, level: Level) => {
  const s = m.levels[level]?.source
  return s === 'generals' ? 'Generals Spring Varsity since 2009' : s === 'coach' ? 'Coach Benchmark' : null
}


/** Inverse standard normal CDF (Acklam). */
export function invPhi(p: number) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const lo = 0.02425
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** The stat value at a given percentile (1–99) of a level. */
export function valueAt(m: BenchMetric, level: Level, pctl: number) {
  const d = m.levels[level]
  if (!d) return null
  const p = (m.lowerIsBetter ? 100 - pctl : pctl) / 100
  const x = d.mu + d.sigma * invPhi(p)
  return d.log ? Math.exp(x) : x
}

/** Typical (median) value of a level. */
export const typical = (m: BenchMetric, level: Level) => valueAt(m, level, 50)

/** Density curve points for a level, for drawing. */
export function curve(m: BenchMetric, level: Level, xMin: number, xMax: number, steps = 90) {
  const d = m.levels[level]
  if (!d) return []
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / steps
    let y: number
    if (d.log) y = x <= 0 ? 0 : Math.exp(-((Math.log(x) - d.mu) ** 2) / (2 * d.sigma ** 2)) / (x * d.sigma)
    else y = Math.exp(-((x - d.mu) ** 2) / (2 * d.sigma ** 2)) / d.sigma
    pts.push([x, y])
  }
  return pts
}

/** A sensible x-range covering both levels (≈ 0.5th to 99.5th percentile). */
export function xRange(m: BenchMetric, levels: Level[], extra: (number | null)[] = []) {
  const vals: number[] = []
  for (const l of levels) {
    const d = m.levels[l]
    if (!d) continue
    const at = (z: number) => (d.log ? Math.exp(d.mu + z * d.sigma) : d.mu + z * d.sigma)
    vals.push(at(-2.6), at(2.6))
  }
  extra.forEach((v) => v != null && vals.push(v))
  let lo = Math.min(...vals)
  const hi = Math.max(...vals)
  if (m.levels[levels[0]]?.log) lo = 0
  return [Math.max(0, lo), hi] as const
}
