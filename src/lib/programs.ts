export type Intent = 'low' | 'med' | 'high'

export type Program = {
  id: number
  name: string
  description: string | null
  weeks: number
  focus_intents: Intent[]
  is_active: boolean
  phase?: string | null
  weekly_goals?: string[]
}

export type ProgramDay = {
  id?: number
  program_id?: number
  week: number
  dow: number // 1 = Mon … 7 = Sun
  intent: Intent
  pre_progression_id: number | null
  throw_progression_id: number | null
  post_progression_id: number | null
  throw_note: string | null
  script_id: number | null
}

export type ProgramAddon = { id?: number; program_id?: number; group_id: number; progression_id: number | null; script_id: number | null }

export type ProgramAssignment = { id: number; program_id: number; group_id: number | null; target_label: string | null; start_date: string; weeks: number; status: 'active' | 'stopped' }

export const INTENTS: Intent[] = ['low', 'med', 'high']
export const INTENT_LABEL: Record<Intent, string> = { low: 'Low', med: 'Med', high: 'High' }
export const INTENT_LONG: Record<Intent, string> = { low: 'Low / Recovery', med: 'Medium', high: 'High' }
/** High = green, Med = yellow, Low / Recovery = red (Coach, Nov 25) */
export const INTENT_STYLE: Record<Intent, { chip: string; solid: string; dot: string; stripe: string }> = {
  low: { chip: 'bg-red-50 text-red-700 border-red-200', solid: 'bg-red-500 text-white', dot: 'bg-red-500', stripe: 'border-l-red-500' },
  med: { chip: 'bg-yellow-50 text-yellow-800 border-yellow-200', solid: 'bg-yellow-400 text-yellow-950', dot: 'bg-yellow-400', stripe: 'border-l-yellow-400' },
  high: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', solid: 'bg-emerald-500 text-white', dot: 'bg-emerald-500', stripe: 'border-l-emerald-500' },
}
export const DOW_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Workout item notes start with the section ("Pre-throw · PlyoCare"); returns just the section name. */
export const sectionOf = (notes: string | null | undefined) => {
  const s = (notes || '').split(' · ')[0]
  return ['Pre-throw', 'Throwing', 'Post-throw', 'Focus'].includes(s) ? s : null
}
