import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    'https://nyttsmwrvnuehqdvtmyj.supabase.co',
    'sb_publishable_oZ2LGTvtC4RT0ThclPshKw_cjTdvwwg'
  )
}
