/** Midpoint percentile rank (same formula as the database): 1st of 20 ≈ 98th, last of 20 ≈ 3rd. */
export function percentileRank(rank: number, n: number) {
  if (n <= 0) return 0
  return Math.round((100 * (n - rank + 0.5)) / n)
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** Rank of `mine` among `values` (1 = best). Ties share a rank. */
export function rankOf(values: number[], mine: number, higherIsBetter = true) {
  return 1 + values.filter((v) => (higherIsBetter ? v > mine : v < mine)).length
}
