import type { PrHit } from '@/components/training/WorkoutLogger'

export const PR_EVENT = 'generals-new-pr'

/** Fire the full-screen PR celebration from anywhere in the app. */
export function celebratePr(hit: PrHit) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<PrHit>(PR_EVENT, { detail: hit }))
}
