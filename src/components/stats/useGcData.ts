'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { EarlyAhead, GcLine, SeasonType } from '@/lib/gcStats'

export type EarlyAheadRow = EarlyAhead & { season_year: number; season_type: SeasonType }

/** Loads every GameChanger stat line (all seasons) plus coach-entered Early/Ahead counts. */
export function useGcData() {
  const [lines, setLines] = useState<GcLine[] | null>(null)
  const [ea, setEa] = useState<EarlyAheadRow[]>([])
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const load = async () => {
      const all: GcLine[] = []
      // The API returns at most 1000 rows per request, so read in pages
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('gc_season_stats')
          .select('id, player_id, player_name, season_year, season_type, stat_type, stats')
          .order('id')
          .range(from, from + 999)
        if (error || !data) break
        all.push(...(data as GcLine[]))
        if (data.length < 1000) break
      }
      const { data: e } = await supabase.from('pitcher_early_ahead').select('player_name, early, ahead, season_year, season_type')
      if (cancelled) return
      setLines(all)
      setEa((e as EarlyAheadRow[]) || [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])
  return { lines, ea }
}

export const TYPE_ORDER: SeasonType[] = ['Spring', 'Summer', 'JV', 'Fall']
export const TYPE_LABEL: Record<SeasonType, string> = { Spring: 'Spring (Varsity)', Summer: 'Summer', JV: 'JV', Fall: 'Fall' }
