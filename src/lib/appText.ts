'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/** Default wording coaches can change in Coach Office → App Text. Grouped by where it shows. */
export const APP_TEXT = {
  'dayplan.sleep.sub': { screen: 'Day Plan', label: '8+ Hours Sleep · line under the title', text: 'How many hours did you sleep?' },
  'dayplan.class.sub': { screen: 'Day Plan', label: 'Class Attendance · line under the title', text: 'Attended all my classes' },
  'dayplan.class.help': { screen: 'Day Plan', label: 'Class Attendance · when opened', text: 'Check this off when your school day is done. Coaches can change it.' },
  'dayplan.lift.sub': { screen: 'Day Plan', label: 'Lift / Workout · line under the title', text: 'Driveline Baseball strength & conditioning' },
  'dayplan.lift.help': { screen: 'Day Plan', label: 'Lift / Workout · when opened', text: 'Today’s lift and mobility are in the Driveline Baseball app. When you finish, tap the circle to mark it complete.' },
  'dayplan.teamlift.note': { screen: 'Day Plan', label: 'Team Lift card · when the event has no details', text: 'Driveline Baseball workout' },
  'dayplan.training.sub': { screen: 'Day Plan', label: 'Baseball Training · line under the title', text: 'Throwing or hitting' },
  'dayplan.training.help': { screen: 'Day Plan', label: 'Baseball Training · when opened (nothing assigned)', text: 'Nothing assigned today. Check it off when you’ve done your throwing or hitting.' },
  'dayplan.readiness.sub': { screen: 'Day Plan', label: 'Readiness Check-In · line under the title', text: 'Sleep, soreness, arm and stress' },
  'training.ranks.footer': { screen: 'Training', label: 'Training Ranks · footer', text: 'Team percentile · all time · tap a stat for tips' },
  'training.dev.empty': { screen: 'Training', label: 'Personal Development · no goals yet', text: 'Your plan is on the way' },
  'streak.start': { screen: 'Home', label: 'Streak card · before a streak starts ({n} = points today)', text: 'Earn all {n} points today to start your streak.' },
} as const
export type TextKey = keyof typeof APP_TEXT

let cache: Map<string, string> | null = null
let pending: Promise<Map<string, string>> | null = null
const listeners = new Set<(m: Map<string, string>) => void>()
function load() {
  if (!pending)
    pending = Promise.resolve(createClient().from('app_text').select('key, value')).then(({ data }) => {
      cache = new Map(((data as { key: string; value: string }[]) || []).map((r) => [r.key, r.value]))
      listeners.forEach((l) => l(cache!))
      return cache
    })
  return pending
}
export function refreshAppText() {
  pending = null
  return load()
}

/** t('dayplan.sleep.sub') → the coach's wording, or the default. */
export function useAppText() {
  const [map, setMap] = useState<Map<string, string>>(cache || new Map())
  useEffect(() => {
    listeners.add(setMap)
    if (cache) setMap(cache)
    else load()
    return () => {
      listeners.delete(setMap)
    }
  }, [])
  return (key: TextKey, vars?: Record<string, string | number>) => {
    let v = map.get(key) ?? APP_TEXT[key].text
    if (vars) for (const [k, x] of Object.entries(vars)) v = v.split(`{${k}}`).join(String(x))
    return v
  }
}
