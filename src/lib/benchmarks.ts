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
}
export type BenchSection = { title: string; metrics: BenchMetric[] }

const hs = (d: Dist): Partial<Record<Level, Dist>> => ({ hs_under: d, hs_upper: d })

export const HITTER: BenchSection[] = [
  {
    title: 'Power',
    metrics: [
      { key: 'bat_speed', label: 'Bat speed', unit: ' mph', decimals: 1, howTo: 'Log Bat Speed in your workouts.', levels: { hs_under: { mu: 61.73, sigma: 5.1793, n: 436 }, hs_upper: { mu: 65.5516, sigma: 4.3922, n: 386 }, college: { mu: 68.8342, sigma: 3.931, n: 648 } } },
      { key: 'exit_velo', label: 'Max exit velo', unit: ' mph', decimals: 1, howTo: 'Log Exit Velo (tee or front toss).', levels: { hs_under: { mu: 92.2997, sigma: 7.2541, n: 547 }, hs_upper: { mu: 97.3477, sigma: 6.5909, n: 429 }, college: { mu: 109.0759, sigma: 4.4188, n: 1949 } } },
      { key: 'iso', label: 'ISO', unit: '', decimals: 3, howTo: 'Comes from your game stats (SLG − AVG).', levels: { ...hs({ mu: -2.3498, sigma: 0.8356, n: 22732, log: true }), college: { mu: -1.7766, sigma: 0.4917, n: 10651, log: true } } },
    ],
  },
  {
    title: 'Contact',
    metrics: [
      { key: 'avg', label: 'Batting avg', unit: '', decimals: 3, howTo: 'Comes from your game stats.', levels: { ...hs({ mu: 0.3229, sigma: 0.1072, n: 28251 }), college: { mu: 0.312, sigma: 0.0441, n: 10651 } } },
      { key: 'k_pct', label: 'Strikeout %', unit: '%', decimals: 1, lowerIsBetter: true, howTo: 'Comes from your game stats (SO ÷ PA).', levels: { ...hs({ mu: 17.28, sigma: 7.72, n: 207, source: 'generals' }), college: { mu: 16.475, sigma: 5.7361, n: 10651 } } },
    ],
  },
  {
    title: 'Swing decisions',
    metrics: [
      { key: 'obp', label: 'On-base %', unit: '', decimals: 3, howTo: 'Comes from your game stats.', levels: { ...hs({ mu: 0.4457, sigma: 0.1052, n: 28394 }), college: { mu: 0.4095, sigma: 0.0472, n: 10651 } } },
      { key: 'bb_pct', label: 'Walk %', unit: '%', decimals: 1, howTo: 'Comes from your game stats (BB ÷ PA).', levels: { ...hs({ mu: 15.2746, sigma: 7.1397, n: 28394 }), college: { mu: 11.3834, sigma: 3.5808, n: 10651 } } },
    ],
  },
]

export const PITCHER: BenchSection[] = [
  {
    title: 'Stuff',
    metrics: [
      { key: 'fb_max', label: 'Max FB velo', unit: ' mph', decimals: 1, howTo: 'Log Mound Velo or throw a bullpen with velo.', levels: { hs_under: { mu: 79.7424, sigma: 5.6492, n: 411 }, hs_upper: { mu: 83.2489, sigma: 5.3614, n: 489 }, college: { mu: 93.5215, sigma: 2.4637, n: 1664 } } },
      { key: 'fb_avg', label: 'Avg FB velo', unit: ' mph', decimals: 1, howTo: 'Throw bullpens with velo tracked.', levels: { hs_under: { mu: 78.41, sigma: 5.7121, n: 411 }, hs_upper: { mu: 81.835, sigma: 5.5106, n: 489 }, college: { mu: 90.3511, sigma: 2.2853, n: 1664 } } },
    ],
  },
  {
    title: 'Strikeouts',
    metrics: [
      { key: 'p_k_pct', label: 'Strikeout %', unit: '%', decimals: 1, howTo: 'Comes from your game stats (SO ÷ BF).', levels: { ...hs({ mu: 3.051, sigma: 0.4602, n: 25549, log: true }), college: { mu: 19.127, sigma: 6.011, n: 28661 } } },
    ],
  },
  {
    title: 'Command',
    metrics: [
      { key: 'p_bb_pct', label: 'Walk %', unit: '%', decimals: 1, lowerIsBetter: true, howTo: 'Comes from your game stats (BB ÷ BF).', levels: { ...hs({ mu: 11.78, sigma: 6.54, n: 108, source: 'generals' }), college: { mu: 9.682, sigma: 3.683, n: 28661 } } },
      { key: 'strike_pct', label: 'Strike %', unit: '%', decimals: 1, howTo: 'Comes from your game stats (S%).', levels: { ...hs({ mu: 61.13, sigma: 5.71, n: 71, source: 'generals' }), college: { mu: 61, sigma: 4, source: 'coach' } } },
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
  return s === 'generals' ? 'Generals Spring Varsity since 2009' : s === 'coach' ? 'Coach benchmark' : null
}
